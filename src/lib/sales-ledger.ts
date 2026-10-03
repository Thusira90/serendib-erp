import "server-only";
import type { Payment, Prisma, SalesOrder, Shipment } from "@prisma/client";
import { captureRate, convertStrict, paymentInOrderCurrency, round2, toBaseAt, type Rates } from "@/lib/money";
import { codePrefix, nextCode } from "@/lib/ids";
import type { PaymentMethod, SalesOrderStatus } from "@/lib/enums";

type Tx = Prisma.TransactionClient;

/** Amounts are compared to the cent; anything inside this is treated as equal. */
export const MONEY_TOLERANCE = 0.01;
const DAY_MS = 24 * 60 * 60 * 1000;
const SHIPPED_ORDER_STATUSES: readonly string[] = ["SHIPPED", "DELIVERED"];
const SHIPPED_SHIPMENT_STATUSES = ["SHIPPED", "IN_TRANSIT", "DELIVERED"];
const OPEN_SHIPMENT_STATUSES = ["PREPARING", "PACKED"];

/** A business-rule refusal whose message is safe and useful to show the user. */
export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

/** convertStrict, with the missing-rate failure surfaced as a user-facing refusal. */
function toOrderCurrency(rates: Rates, amount: number, from: string, to: string): number {
  try {
    return round2(convertStrict(rates, amount, from, to));
  } catch (e) {
    throw new LedgerError((e as Error).message);
  }
}

type PaymentLike ={ amount: unknown; currency: string; orderCurrencyAmount?: unknown };

/** Net paid (payments minus refunds) in the order's currency; legacy rows convert at today's rate. */
export function netPaidInOrderCurrency(rates: Rates, payments: PaymentLike[], orderCurrency: string): number {
  let total = 0;
  for (const p of payments) total += paymentInOrderCurrency(rates, p, orderCurrency);
  return round2(total);
}

/**
 * What the order status should be after its net paid amount changed.
 * Shipped / delivered / cancelled orders keep their status; a fully refunded
 * order drops back to INVOICED.
 */
export function settledStatus(current: string, netPaid: number, total: number): SalesOrderStatus {
  if (current === "CANCELLED" || SHIPPED_ORDER_STATUSES.includes(current)) return current as SalesOrderStatus;
  if (netPaid >= total - MONEY_TOLERANCE) return "PAID";
  if (netPaid > MONEY_TOLERANCE) return "PARTIAL";
  return current === "PAID" || current === "PARTIAL" ? "INVOICED" : (current as SalesOrderStatus);
}

/** Serialises concurrent payments / refunds / cancels on the same order. */
async function lockSale(tx: Tx, salesOrderId: string): Promise<SalesOrder> {
  await tx.$queryRaw`SELECT "id" FROM "SalesOrder" WHERE "id" = ${salesOrderId} FOR UPDATE`;
  return tx.salesOrder.findUniqueOrThrow({ where: { id: salesOrderId } });
}

type HeldPayment = { amount: unknown; currency: string; orderCurrencyAmount?: unknown; fxRateLkr?: { toString(): string } | null };

async function loadPayments(tx: Tx, salesOrderId: string): Promise<HeldPayment[]> {
  return tx.payment.findMany({
    where: { salesOrderId },
    select: { amount: true, currency: true, orderCurrencyAmount: true, fxRateLkr: true },
  });
}

async function loadNetPaid(tx: Tx, rates: Rates, so: Pick<SalesOrder, "id" | "currency">): Promise<number> {
  return netPaidInOrderCurrency(rates, await loadPayments(tx, so.id), so.currency);
}

/**
 * Value of a refund in the order currency and its LKR rate. Cash still held in
 * the refund currency is returned at the rate it came in at (pro rata), so
 * refunding exactly what was received always nets to zero whatever the rate
 * does; only cash not held in that currency is converted at today's rate.
 */
export function refundValue(
  rates: Rates,
  payments: HeldPayment[],
  amount: number,
  currency: string,
  orderCurrency: string,
): { orderCurrencyAmount: number; fxRateLkr: number | null } {
  let heldCash = 0;
  let heldOrder = 0;
  let heldLkr = 0;
  for (const p of payments) {
    if (p.currency !== currency) continue;
    const cash = Number(p.amount);
    heldCash += cash;
    heldOrder += paymentInOrderCurrency(rates, p, orderCurrency);
    heldLkr += toBaseStored(rates, cash, p.currency, p.fxRateLkr);
  }
  const fromHeld = heldCash > MONEY_TOLERANCE ? Math.min(amount, heldCash) : 0;
  const rest = amount - fromHeld;
  const restValue = rest > MONEY_TOLERANCE ? toOrderCurrency(rates, rest, currency, orderCurrency) : 0;
  const orderCurrencyAmount = round2((fromHeld > 0 ? (heldOrder * fromHeld) / heldCash : 0) + restValue);
  if (currency === rates.base) return { orderCurrencyAmount, fxRateLkr: null };
  const lkr = (fromHeld > 0 ? (heldLkr * fromHeld) / heldCash : 0) + (rest > MONEY_TOLERANCE ? toBaseStored(rates, rest, currency, null) : 0);
  return { orderCurrencyAmount, fxRateLkr: lkr > 0 ? lkr / amount : captureRate(rates, currency) };
}

async function settle(tx: Tx, so: SalesOrder, netPaid: number): Promise<SalesOrderStatus> {
  const next = settledStatus(so.status, netPaid, Number(so.totalAmount));
  if (next !== so.status) {
    // Guarded so a shipment status change made a moment ago is never overwritten.
    await tx.salesOrder.updateMany({ where: { id: so.id, status: so.status }, data: { status: next } });
  }
  return next;
}

export type PaymentInput = {
  salesOrderId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference?: string | null;
  receivedAt?: Date | null;
  notes?: string | null;
  recordedBy?: string | null;
};

export type LedgerResult = {
  payment: Payment;
  so: SalesOrder;
  orderCurrencyAmount: number;
  netPaid: number;
  previousStatus: string;
  status: SalesOrderStatus;
};

/** Record money received: stores the order-currency value and the day's rate, then settles the order status. */
export async function applyPayment(tx: Tx, rates: Rates, input: PaymentInput, now = new Date()): Promise<LedgerResult> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new LedgerError("Payment amount must be greater than zero.");
  const receivedAt = input.receivedAt ?? now;
  if (receivedAt.getTime() > now.getTime() + DAY_MS) throw new LedgerError("The received date cannot be in the future.");

  const so = await lockSale(tx, input.salesOrderId);
  if (so.status === "CANCELLED") throw new LedgerError(`Sales order ${so.code} is cancelled.`);

  const orderCurrencyAmount = toOrderCurrency(rates, input.amount, input.currency, so.currency);
  const before = await loadNetPaid(tx, rates, so);
  const total = Number(so.totalAmount);
  if (before + orderCurrencyAmount > total + MONEY_TOLERANCE) {
    const balance = Math.max(0, round2(total - before));
    throw new LedgerError(
      `This payment would exceed the invoice total: ${balance.toFixed(2)} ${so.currency} is still outstanding on ${so.code}.`,
    );
  }

  const payment = await tx.payment.create({
    data: {
      code: await nextCode(codePrefix.payment, now.getUTCFullYear(), tx, { pad: 4 }),
      salesOrderId: so.id,
      customerId: so.customerId,
      amount: input.amount,
      currency: input.currency,
      fxRateLkr: captureRate(rates, input.currency),
      orderCurrencyAmount,
      method: input.method,
      reference: input.reference ?? null,
      receivedAt,
      notes: input.notes ?? null,
      recordedBy: input.recordedBy ?? null,
    },
  });
  const netPaid = round2(before + orderCurrencyAmount);
  const status = await settle(tx, so, netPaid);
  return { payment, so, orderCurrencyAmount, netPaid, previousStatus: so.status, status };
}

/** Pay money back: a negative Payment row (amount is passed positive); never more than the net paid. */
export async function applyRefund(tx: Tx, rates: Rates, input: PaymentInput, now = new Date()): Promise<LedgerResult> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new LedgerError("Refund amount must be greater than zero.");
  const receivedAt = input.receivedAt ?? now;
  if (receivedAt.getTime() > now.getTime() + DAY_MS) throw new LedgerError("The refund date cannot be in the future.");

  const so = await lockSale(tx, input.salesOrderId);
  if (so.status === "CANCELLED") throw new LedgerError(`Sales order ${so.code} is cancelled.`);

  const payments = await loadPayments(tx, so.id);
  const before = netPaidInOrderCurrency(rates, payments, so.currency);
  const { orderCurrencyAmount, fxRateLkr } = refundValue(rates, payments, input.amount, input.currency, so.currency);
  if (orderCurrencyAmount > before + MONEY_TOLERANCE) {
    throw new LedgerError(
      `Cannot refund more than has been paid: ${Math.max(0, before).toFixed(2)} ${so.currency} is held on ${so.code}.`,
    );
  }

  const payment = await tx.payment.create({
    data: {
      code: await nextCode(codePrefix.payment, now.getUTCFullYear(), tx, { pad: 4 }),
      salesOrderId: so.id,
      customerId: so.customerId,
      amount: -input.amount,
      currency: input.currency,
      fxRateLkr,
      orderCurrencyAmount: -orderCurrencyAmount,
      method: input.method,
      reference: input.reference ?? null,
      receivedAt,
      notes: input.notes ?? null,
      recordedBy: input.recordedBy ?? null,
    },
  });
  const netPaid = round2(before - orderCurrencyAmount);
  const status = await settle(tx, so, netPaid);
  return { payment, so, orderCurrencyAmount: -orderCurrencyAmount, netPaid, previousStatus: so.status, status };
}

export type CancelResult = {
  so: SalesOrder;
  gemCode: string;
  gemReleased: boolean;
  shipmentCancelled: boolean;
};

/** Cancel a sale that holds no money and has not left the building; the stone goes back on the shelf. */
export async function applyCancelSale(
  tx: Tx,
  rates: Rates,
  input: { salesOrderId: string; reason: string },
): Promise<CancelResult> {
  const reason = input.reason.trim();
  if (!reason) throw new LedgerError("A reason is required to cancel a sale.");

  const so = await lockSale(tx, input.salesOrderId);
  if (so.status === "CANCELLED") throw new LedgerError(`Sales order ${so.code} is already cancelled.`);

  const netPaid = await loadNetPaid(tx, rates, so);
  if (Math.abs(netPaid) > MONEY_TOLERANCE) {
    throw new LedgerError(
      `${so.code} still holds ${netPaid.toFixed(2)} ${so.currency} in payments. Refund the customer first, then cancel the sale.`,
    );
  }

  const shipment = await tx.shipment.findUnique({ where: { salesOrderId: so.id }, select: { id: true, code: true, status: true } });
  if (shipment && SHIPPED_SHIPMENT_STATUSES.includes(shipment.status)) {
    throw new LedgerError(`Shipment ${shipment.code} is ${shipment.status.toLowerCase().replaceAll("_", " ")}; the sale can no longer be cancelled.`);
  }
  let shipmentCancelled = false;
  if (shipment && OPEN_SHIPMENT_STATUSES.includes(shipment.status)) {
    const res = await tx.shipment.updateMany({
      where: { id: shipment.id, status: { in: OPEN_SHIPMENT_STATUSES } },
      data: { status: "CANCELLED" },
    });
    if (res.count !== 1) throw new LedgerError(`Shipment ${shipment.code} was just changed by someone else.`);
    shipmentCancelled = true;
  }

  const claim = await tx.salesOrder.updateMany({
    where: { id: so.id, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED" },
  });
  if (claim.count !== 1) throw new LedgerError(`Sales order ${so.code} was just changed by someone else.`);

  const gem = await tx.gemstone.findUniqueOrThrow({ where: { id: so.gemstoneId }, select: { code: true } });
  const release = await tx.gemstone.updateMany({
    where: { id: so.gemstoneId, status: "SOLD" },
    data: { status: "AVAILABLE" },
  });
  return { so, gemCode: gem.code, gemReleased: release.count === 1, shipmentCancelled };
}

/**
 * Moves a shipment to a new status and, for SHIPPED / DELIVERED, the sales
 * order with it. Takes the same sales-order lock as cancelSale, so a cancelled
 * sale (or its cancelled shipment) can never be revived by a status click.
 * Returns the shipment as it was before the change.
 */
export async function applyShipmentStatus(
  tx: Tx,
  shipmentId: string,
  status: string,
  now = new Date(),
): Promise<Shipment & { salesOrder: SalesOrder }> {
  if (status === "CANCELLED") throw new LedgerError("A shipment is cancelled by cancelling its sale.");
  const found = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, select: { salesOrderId: true } });
  await lockSale(tx, found.salesOrderId);
  const before = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { salesOrder: true } });
  if (before.status === "CANCELLED" || before.salesOrder.status === "CANCELLED") {
    throw new LedgerError(`Sales order ${before.salesOrder.code} is cancelled; shipment ${before.code} can no longer change status.`);
  }
  await tx.shipment.update({
    where: { id: shipmentId },
    data: {
      status,
      ...(status === "PACKED" && !before.packedAt ? { packedAt: now } : {}),
      ...(status === "SHIPPED" && !before.shippedAt ? { shippedAt: now } : {}),
      ...(status === "DELIVERED" && !before.deliveredAt ? { deliveredAt: now } : {}),
    },
  });
  if (status === "SHIPPED" || status === "DELIVERED") {
    const res = await tx.salesOrder.updateMany({
      where: { id: before.salesOrderId, status: { not: "CANCELLED" } },
      data: { status },
    });
    if (res.count !== 1) throw new LedgerError(`Sales order ${before.salesOrder.code} was just changed by someone else.`);
  }
  return before;
}

/** toBaseAt for Prisma rows, whose stored rate is a Decimal: LKR value at the rate stored on the record, else today's. */
export function toBaseStored(
  rates: Rates,
  amount: number,
  currency: string,
  storedRate: { toString(): string } | null | undefined,
): number {
  return toBaseAt(rates, amount, currency, storedRate == null ? null : storedRate.toString());
}
