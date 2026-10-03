"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { captureRate, getExchangeRates } from "@/lib/money";
import { LedgerError, applyCancelSale, applyPayment, applyRefund } from "@/lib/sales-ledger";
import type { EnquiryStatus, PaymentMethod, QuotationStatus, SalesOrderStatus } from "@/lib/enums";
import { PAYMENT_METHODS } from "@/lib/enums";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);
const dec = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};
const date = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const int = (v: FormDataEntryValue | null, fallback: number) => {
  if (typeof v !== "string" || v === "") return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

// ─── Enquiries ───────────────────────────────────────────────────────────────

const enquirySchema = z.object({
  customerId: z.string().min(1),
  gemstoneId: z.string().nullable(),
  requirement: z.string().min(1),
  preferredOrigin: z.string().nullable(),
  preferredTreatment: z.string().nullable(),
  preferredShape: z.string().nullable(),
  minWeightCt: z.number().nullable(),
  maxWeightCt: z.number().nullable(),
  budgetMin: z.number().nullable(),
  budgetMax: z.number().nullable(),
  currency: z.string(),
  quantity: z.number().int().positive(),
  followUpDate: z.date().nullable(),
  notes: z.string().nullable(),
});

export async function createEnquiry(fd: FormData) {
  const session = await requireCapability("enquiry:write");
  const parsed = enquirySchema.parse({
    customerId: str(fd.get("customerId")),
    gemstoneId: str(fd.get("gemstoneId")),
    requirement: str(fd.get("requirement")) ?? "",
    preferredOrigin: str(fd.get("preferredOrigin")),
    preferredTreatment: str(fd.get("preferredTreatment")),
    preferredShape: str(fd.get("preferredShape")),
    minWeightCt: dec(fd.get("minWeightCt")),
    maxWeightCt: dec(fd.get("maxWeightCt")),
    budgetMin: dec(fd.get("budgetMin")),
    budgetMax: dec(fd.get("budgetMax")),
    currency: str(fd.get("currency")) ?? "LKR",
    quantity: int(fd.get("quantity"), 1),
    followUpDate: date(fd.get("followUpDate")),
    notes: str(fd.get("notes")),
  });

  const year = new Date().getUTCFullYear();
  const enquiry = await prisma.$transaction(async (tx) => {
    const code = await nextCode(codePrefix.enquiry, year, tx, { pad: 4 });
    const created = await tx.enquiry.create({
      data: {
        code,
        customerId: parsed.customerId,
        gemstoneId: parsed.gemstoneId,
        requirement: parsed.requirement,
        preferredOrigin: parsed.preferredOrigin,
        preferredTreatment: parsed.preferredTreatment,
        preferredShape: parsed.preferredShape,
        minWeightCt: parsed.minWeightCt ?? undefined,
        maxWeightCt: parsed.maxWeightCt ?? undefined,
        budgetMin: parsed.budgetMin ?? undefined,
        budgetMax: parsed.budgetMax ?? undefined,
        currency: parsed.currency,
        quantity: parsed.quantity,
        followUpDate: parsed.followUpDate,
        notes: parsed.notes,
        salespersonId: session.user.id,
        status: "NEW",
      },
    });
    await writeAudit({
      entity: "Enquiry", entityId: created.id, entityCode: created.code,
      action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Enquiry raised${parsed.gemstoneId ? " for a specific gemstone" : ""}.`,
    }, tx);
    await notify({
      type: "ENQUIRY_NEW",
      title: `New enquiry ${created.code}`,
      body: parsed.requirement.slice(0, 200),
      entity: "Enquiry", entityId: created.id, entityCode: created.code,
      url: "/enquiries",
      excludeUserIds: [session.user.id],
    }, tx);
    return created;
  });

  revalidatePath("/enquiries");
  revalidatePath(`/customers/${parsed.customerId}`);
  revalidatePath("/"); // dashboard: last-enquiry tile + due-enquiries alert
  redirect(`/enquiries`);
}

export async function updateEnquiryStatus(fd: FormData) {
  const session = await requireCapability("enquiry:write");
  const id = str(fd.get("id"));
  const status = str(fd.get("status")) as EnquiryStatus | null;
  if (!id || !status) throw new Error("id and status required");
  const before = await prisma.enquiry.findUniqueOrThrow({ where: { id } });
  await prisma.enquiry.update({ where: { id }, data: { status } });
  await writeAudit({
    entity: "Enquiry", entityId: id, entityCode: before.code,
    action: "STATUS_CHANGE", field: "status",
    oldValue: before.status, newValue: status,
    userId: session.user.id, userName: session.user.name ?? null,
  });
  revalidatePath("/enquiries");
  revalidatePath("/"); // dashboard: due-enquiries alert count
}

// ─── Quotations ──────────────────────────────────────────────────────────────

const quotationSchema = z.object({
  customerId: z.string().min(1),
  gemstoneId: z.string().min(1),
  enquiryId: z.string().nullable(),
  price: z.number().positive(),
  currency: z.string(),
  validUntil: z.date().nullable(),
  paymentTerms: z.string().nullable(),
  deliveryTerms: z.string().nullable(),
  shippingTerms: z.string().nullable(),
  notes: z.string().nullable(),
});

export async function createQuotation(fd: FormData) {
  const session = await requireCapability("quotation:write");
  const parsed = quotationSchema.parse({
    customerId: str(fd.get("customerId")),
    gemstoneId: str(fd.get("gemstoneId")),
    enquiryId: str(fd.get("enquiryId")),
    price: dec(fd.get("price")),
    currency: str(fd.get("currency")) ?? "LKR",
    validUntil: date(fd.get("validUntil")),
    paymentTerms: str(fd.get("paymentTerms")),
    deliveryTerms: str(fd.get("deliveryTerms")),
    shippingTerms: str(fd.get("shippingTerms")),
    notes: str(fd.get("notes")),
  });
  const year = new Date().getUTCFullYear();
  const quotation = await prisma.$transaction(async (tx) => {
    const code = await nextCode(codePrefix.quotation, year, tx, { pad: 4 });
    const created = await tx.quotation.create({
      data: {
        code,
        customerId: parsed.customerId,
        gemstoneId: parsed.gemstoneId,
        enquiryId: parsed.enquiryId,
        price: parsed.price,
        currency: parsed.currency,
        validUntil: parsed.validUntil,
        paymentTerms: parsed.paymentTerms,
        deliveryTerms: parsed.deliveryTerms,
        shippingTerms: parsed.shippingTerms,
        notes: parsed.notes,
        salespersonId: session.user.id,
        status: "DRAFT",
      },
    });
    if (parsed.enquiryId) {
      await tx.enquiry.update({
        where: { id: parsed.enquiryId },
        data: { status: "QUOTED" },
      });
    }
    await writeAudit({
      entity: "Quotation", entityId: created.id, entityCode: created.code,
      action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Quotation ${created.code} drafted.`,
    }, tx);
    return created;
  });

  revalidatePath("/quotations");
  revalidatePath(`/customers/${parsed.customerId}`);
  revalidatePath("/"); // dashboard: expiring-quotations alert
  redirect(`/quotations/${quotation.id}`);
}

export async function updateQuotationStatus(fd: FormData) {
  const session = await requireCapability("quotation:write");
  const id = str(fd.get("id"));
  const status = str(fd.get("status")) as QuotationStatus | null;
  if (!id || !status) throw new Error("id and status required");
  const before = await prisma.quotation.findUniqueOrThrow({ where: { id } });
  await prisma.quotation.update({
    where: { id },
    data: {
      status,
      sentAt: status === "SENT" && !before.sentAt ? new Date() : before.sentAt,
      respondedAt: (status === "ACCEPTED" || status === "DECLINED") && !before.respondedAt ? new Date() : before.respondedAt,
    },
  });
  await writeAudit({
    entity: "Quotation", entityId: id, entityCode: before.code,
    action: "STATUS_CHANGE", field: "status",
    oldValue: before.status, newValue: status,
    userId: session.user.id, userName: session.user.name ?? null,
  });
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  revalidatePath("/"); // dashboard: expiring-quotations alert
}

// ─── Reservations (transactional invariants) ─────────────────────────────────

const reservationSchema = z.object({
  customerId: z.string().min(1),
  gemstoneId: z.string().min(1),
  quotationId: z.string().nullable(),
  price: z.number().positive(),
  deposit: z.number().nullable(),
  currency: z.string(),
  expiresAt: z.date().nullable(),
  notes: z.string().nullable(),
});

/**
 * Reserve a gemstone for a customer.
 * Invariants:
 *  - The gemstone must be AVAILABLE at the moment of reservation.
 *  - There must be no other ACTIVE reservation on the same gemstone.
 * The checks give friendly errors, but the real guard is the atomic claim
 * below (UPDATE ... WHERE status = 'AVAILABLE'): of two simultaneous
 * requests only one updates the row, the other sees zero rows and fails.
 */
export async function reserveGemstone(fd: FormData) {
  const session = await requireCapability("reservation:write");
  const parsed = reservationSchema.parse({
    customerId: str(fd.get("customerId")),
    gemstoneId: str(fd.get("gemstoneId")),
    quotationId: str(fd.get("quotationId")),
    price: dec(fd.get("price")),
    deposit: dec(fd.get("deposit")),
    currency: str(fd.get("currency")) ?? "LKR",
    expiresAt: date(fd.get("expiresAt")),
    notes: str(fd.get("notes")),
  });

  const year = new Date().getUTCFullYear();
  const reservation = await prisma.$transaction(async (tx) => {
    const gem = await tx.gemstone.findUniqueOrThrow({ where: { id: parsed.gemstoneId } });
    if (gem.status !== "AVAILABLE") {
      throw new Error(`Cannot reserve ${gem.code}: current status is ${gem.status}.`);
    }
    const existing = await tx.reservation.findFirst({
      where: { gemstoneId: parsed.gemstoneId, status: "ACTIVE" },
    });
    if (existing) {
      throw new Error(`Cannot reserve ${gem.code}: an active reservation (${existing.code}) already exists.`);
    }
    const claim = await tx.gemstone.updateMany({
      where: { id: parsed.gemstoneId, status: "AVAILABLE" },
      data: { status: "RESERVED" },
    });
    if (claim.count !== 1) {
      throw new Error(`Cannot reserve ${gem.code}: someone else just reserved or sold it.`);
    }
    const code = await nextCode(codePrefix.reservation, year, tx, { pad: 4 });
    const created = await tx.reservation.create({
      data: {
        code,
        customerId: parsed.customerId,
        gemstoneId: parsed.gemstoneId,
        quotationId: parsed.quotationId,
        price: parsed.price,
        deposit: parsed.deposit ?? undefined,
        currency: parsed.currency,
        expiresAt: parsed.expiresAt,
        salespersonId: session.user.id,
        notes: parsed.notes,
        status: "ACTIVE",
      },
    });
    if (parsed.quotationId) {
      await tx.quotation.update({
        where: { id: parsed.quotationId },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });
    }
    await writeAudit({
      entity: "Gemstone", entityId: gem.id, entityCode: gem.code,
      action: "RESERVED", field: "status",
      oldValue: gem.status, newValue: "RESERVED",
      userId: session.user.id, userName: session.user.name ?? null,
      metadata: { reservationId: created.id, reservationCode: created.code, customerId: parsed.customerId },
    }, tx);
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: parsed.customerId } });
    await notify({
      type: "RESERVATION_CREATED",
      title: `Reserved ${gem.code} for ${customer.displayName}`,
      body: `Agreed price ${parsed.price.toFixed(2)} ${parsed.currency}.`,
      entity: "Reservation", entityId: created.id, entityCode: created.code,
      url: `/gemstones/${gem.id}`,
      excludeUserIds: [session.user.id],
    }, tx);
    return created;
  });

  revalidatePath(`/gemstones/${parsed.gemstoneId}`);
  revalidatePath("/reservations");
  revalidatePath(`/customers/${parsed.customerId}`);
  revalidatePath("/"); // dashboard: AVAILABLE count + expiring-reservations alert
  return reservation.id;
}

export async function releaseReservation(fd: FormData) {
  const session = await requireCapability("reservation:write");
  const id = str(fd.get("id"));
  const reason = str(fd.get("reason"));
  if (!id) throw new Error("id required");

  await prisma.$transaction(async (tx) => {
    const res = await tx.reservation.findUniqueOrThrow({
      where: { id }, include: { gemstone: true },
    });
    if (res.status !== "ACTIVE") {
      throw new Error(`Reservation ${res.code} is already ${res.status}.`);
    }
    // Guarded so a release can never undo a sale that converted this
    // reservation a moment earlier.
    const released = await tx.reservation.updateMany({
      where: { id, status: "ACTIVE" },
      data: { status: "RELEASED", releasedAt: new Date(), releasedReason: reason },
    });
    if (released.count !== 1) {
      throw new Error(`Reservation ${res.code} was just changed by someone else.`);
    }
    await tx.gemstone.updateMany({
      where: { id: res.gemstoneId, status: "RESERVED" },
      data: { status: "AVAILABLE" },
    });
    await writeAudit({
      entity: "Gemstone", entityId: res.gemstoneId, entityCode: res.gemstone.code,
      action: "RESERVATION_RELEASED", field: "status",
      oldValue: "RESERVED", newValue: "AVAILABLE",
      userId: session.user.id, userName: session.user.name ?? null,
      metadata: { reservationCode: res.code, reason },
    }, tx);
  });
  revalidatePath("/reservations");
  revalidatePath("/"); // dashboard: AVAILABLE count rises when reservation released
}

/**
 * Extend an active reservation by pushing its expiresAt forward by N days
 * (default 7). No-op if the reservation is not ACTIVE — surfaces an error
 * so the caller can inform the user rather than silently succeeding.
 */
export async function extendReservation(fd: FormData) {
  const session = await requireCapability("reservation:write");
  const id = str(fd.get("id"));
  const days = int(fd.get("days"), 7);
  if (!id) throw new Error("id required");
  if (days <= 0) throw new Error("days must be positive");

  await prisma.$transaction(async (tx) => {
    const res = await tx.reservation.findUniqueOrThrow({
      where: { id }, include: { gemstone: true },
    });
    if (res.status !== "ACTIVE") {
      throw new Error(`Reservation ${res.code} is ${res.status.toLowerCase()} and cannot be extended.`);
    }
    const base = res.expiresAt && res.expiresAt > new Date() ? res.expiresAt : new Date();
    const nextExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    await tx.reservation.update({
      where: { id },
      data: { expiresAt: nextExpiry },
    });
    await writeAudit({
      entity: "Gemstone", entityId: res.gemstoneId, entityCode: res.gemstone.code,
      action: "RESERVATION_EXTENDED", field: "expiresAt",
      oldValue: res.expiresAt?.toISOString() ?? null,
      newValue: nextExpiry.toISOString(),
      userId: session.user.id, userName: session.user.name ?? null,
      metadata: { reservationCode: res.code, extendedByDays: days },
    }, tx);
  });
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${id}`);
  revalidatePath("/"); // dashboard: expiring-reservations alert
}

// ─── Sales orders (transactional invariants) ─────────────────────────────────

const saleSchema = z.object({
  customerId: z.string().min(1),
  gemstoneId: z.string().min(1),
  reservationId: z.string().nullable(),
  quotationId: z.string().nullable(),
  agreedPrice: z.number().positive(),
  taxAmount: z.number().nonnegative(),
  currency: z.string(),
  saleDate: z.date().nullable(),
  notes: z.string().nullable(),
});

/**
 * Create a sales order.
 * Invariants:
 *  - Gemstone must be AVAILABLE, or RESERVED for THIS SAME customer.
 *  - A SOLD gemstone can never be sold again.
 *  - Reservation, if provided, must belong to the same customer + gemstone.
 * All state transitions happen inside one transaction.
 */
export async function createSale(fd: FormData) {
  const session = await requireCapability("sale:write");
  const parsed = saleSchema.parse({
    customerId: str(fd.get("customerId")),
    gemstoneId: str(fd.get("gemstoneId")),
    reservationId: str(fd.get("reservationId")),
    quotationId: str(fd.get("quotationId")),
    agreedPrice: dec(fd.get("agreedPrice")),
    taxAmount: dec(fd.get("taxAmount")) ?? 0,
    currency: str(fd.get("currency")) ?? "LKR",
    saleDate: date(fd.get("saleDate")),
    notes: str(fd.get("notes")),
  });

  const year = new Date().getUTCFullYear();
  const rates = await getExchangeRates();
  const sale = await prisma.$transaction(async (tx) => {
    const gem = await tx.gemstone.findUniqueOrThrow({ where: { id: parsed.gemstoneId } });
    if (gem.status === "SOLD") {
      throw new Error(`Cannot sell ${gem.code}: already SOLD.`);
    }

    let reservation = null;
    if (parsed.reservationId) {
      reservation = await tx.reservation.findUniqueOrThrow({ where: { id: parsed.reservationId } });
      if (reservation.gemstoneId !== parsed.gemstoneId) {
        throw new Error("Reservation does not match this gemstone.");
      }
      if (reservation.customerId !== parsed.customerId) {
        throw new Error("Reservation belongs to a different customer.");
      }
      if (reservation.status !== "ACTIVE") {
        throw new Error(`Reservation ${reservation.code} is ${reservation.status}, not ACTIVE.`);
      }
    } else {
      if (gem.status === "RESERVED") {
        // Direct sale on a reserved stone is forbidden — someone else holds it.
        const other = await tx.reservation.findFirst({
          where: { gemstoneId: gem.id, status: "ACTIVE" },
        });
        if (other && other.customerId !== parsed.customerId) {
          throw new Error(`Cannot sell ${gem.code}: reserved for another customer (${other.code}).`);
        }
      }
      if (gem.status !== "AVAILABLE") {
        throw new Error(`Cannot sell ${gem.code}: current status is ${gem.status}.`);
      }
    }

    // Atomic claims: only one of two simultaneous sales can flip the stone
    // (and the reservation) — the loser updates zero rows and fails here.
    const gemClaim = await tx.gemstone.updateMany({
      where: { id: gem.id, status: { in: reservation ? ["AVAILABLE", "RESERVED"] : ["AVAILABLE"] } },
      data: { status: "SOLD" },
    });
    if (gemClaim.count !== 1) {
      throw new Error(`Cannot sell ${gem.code}: it was just sold or is no longer available.`);
    }
    if (reservation) {
      const resClaim = await tx.reservation.updateMany({
        where: { id: reservation.id, status: "ACTIVE" },
        data: { status: "CONVERTED" },
      });
      if (resClaim.count !== 1) {
        throw new Error(`Reservation ${reservation.code} was just changed by someone else.`);
      }
    }

    const code = await nextCode(codePrefix.salesOrder, year, tx, { pad: 4 });
    const invoiceNumber = `INV-${year}-${code.split("-").pop()}`;
    const total = parsed.agreedPrice + parsed.taxAmount;
    const so = await tx.salesOrder.create({
      data: {
        code,
        invoiceNumber,
        customerId: parsed.customerId,
        gemstoneId: parsed.gemstoneId,
        quotationId: parsed.quotationId ?? reservation?.quotationId ?? null,
        reservationId: parsed.reservationId,
        agreedPrice: parsed.agreedPrice,
        taxAmount: parsed.taxAmount,
        totalAmount: total,
        currency: parsed.currency,
        fxRateLkr: captureRate(rates, parsed.currency),
        saleDate: parsed.saleDate ?? new Date(),
        salespersonId: session.user.id,
        notes: parsed.notes,
        status: "INVOICED",
      },
    });

    // The reservation deposit is money already received: book it as a payment so the invoice balance is right.
    const deposit = reservation?.deposit != null ? Number(reservation.deposit) : 0;
    if (reservation && deposit > 0) {
      let settled;
      try {
        settled = await applyPayment(tx, rates, {
          salesOrderId: so.id,
          amount: deposit,
          currency: reservation.currency,
          method: "OTHER",
          reference: `Deposit from ${reservation.code}`,
          receivedAt: reservation.reservedAt,
          recordedBy: session.user.name ?? null,
        });
      } catch (e) {
        if (e instanceof LedgerError) throw new Error(`Cannot convert reservation ${reservation.code}: its deposit ${e.message}`);
        throw e;
      }
      await writeAudit({
        entity: "SalesOrder", entityId: so.id, entityCode: so.code,
        action: "PAYMENT_RECORDED",
        userId: session.user.id, userName: session.user.name ?? null,
        newValue: `${deposit.toFixed(2)} ${reservation.currency} (deposit from ${reservation.code})`,
        metadata: { netPaid: settled.netPaid, totalAmount: total, newStatus: settled.status },
      }, tx);
    }

    await writeAudit({
      entity: "Gemstone", entityId: gem.id, entityCode: gem.code,
      action: "SOLD", field: "status",
      oldValue: gem.status, newValue: "SOLD",
      userId: session.user.id, userName: session.user.name ?? null,
      metadata: { salesOrderId: so.id, salesOrderCode: so.code, invoiceNumber: so.invoiceNumber, customerId: parsed.customerId, agreedPrice: parsed.agreedPrice, currency: parsed.currency },
    }, tx);
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: parsed.customerId } });
    await notify({
      type: "SALE_CREATED",
      title: `${gem.code} sold to ${customer.displayName}`,
      body: `${parsed.agreedPrice.toFixed(2)} ${parsed.currency} · invoice ${so.invoiceNumber}`,
      entity: "SalesOrder", entityId: so.id, entityCode: so.code,
      url: `/sales/${so.id}`,
      excludeUserIds: [session.user.id],
    }, tx);

    return so;
  }, { timeout: 20_000 });

  revalidatePath(`/gemstones/${parsed.gemstoneId}`);
  revalidatePath("/sales");
  revalidatePath(`/customers/${parsed.customerId}`);
  revalidatePath("/"); // dashboard: revenue tiles + last-sale + AVAILABLE count
  redirect(`/sales/${sale.id}`);
}

// ─── Payments, refunds, cancellation ─────────────────────────────────────────

export type LedgerActionResult = { ok: true } | { ok: false; error: string };

/** Business-rule refusals become a message the dialog can show; anything else is a real failure. */
function refusal(e: unknown): LedgerActionResult {
  if (e instanceof LedgerError) return { ok: false, error: e.message };
  throw e;
}

const paymentSchema = z.object({
  salesOrderId: z.string().min(1),
  amount: z.number().positive("Enter an amount greater than zero."),
  currency: z.string().min(1),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().nullable(),
  receivedAt: z.date().nullable(),
  notes: z.string().nullable(),
});

function parsePaymentForm(fd: FormData) {
  return paymentSchema.safeParse({
    salesOrderId: str(fd.get("salesOrderId")),
    amount: dec(fd.get("amount")),
    currency: str(fd.get("currency")) ?? "LKR",
    method: (str(fd.get("method")) ?? "BANK_TRANSFER") as PaymentMethod,
    reference: str(fd.get("reference")),
    receivedAt: date(fd.get("receivedAt")),
    notes: str(fd.get("notes")),
  });
}

function revalidateSale(salesOrderId: string) {
  revalidatePath(`/sales/${salesOrderId}`);
  revalidatePath("/sales");
  revalidatePath("/"); // dashboard: paid vs outstanding tiles
  revalidatePath("/reports/sales");
}

/**
 * Record a payment against a sales order. The amount is converted into the
 * order's currency at receipt and the order moves to PARTIAL or PAID from the
 * net paid total (never from raw amounts in mixed currencies).
 */
export async function recordPayment(fd: FormData): Promise<LedgerActionResult> {
  const session = await requireCapability("payment:write");
  const parsed = parsePaymentForm(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payment." };
  const input = parsed.data;

  const rates = await getExchangeRates();
  try {
    await prisma.$transaction(async (tx) => {
      const r = await applyPayment(tx, rates, { ...input, recordedBy: session.user.name ?? null });
      await writeAudit({
        entity: "SalesOrder", entityId: r.so.id, entityCode: r.so.code,
        action: "PAYMENT_RECORDED",
        userId: session.user.id, userName: session.user.name ?? null,
        newValue: `${input.amount.toFixed(2)} ${input.currency} (${input.method})`,
        metadata: { paymentCode: r.payment.code, orderCurrencyAmount: r.orderCurrencyAmount, netPaid: r.netPaid, totalAmount: Number(r.so.totalAmount), newStatus: r.status },
      }, tx);
      await notify({
        type: "PAYMENT_RECORDED",
        title: `Payment received — ${r.so.code}`,
        body: `${input.amount.toFixed(2)} ${input.currency} · ${r.status === "PAID" ? "fully paid" : "partial"}`,
        entity: "SalesOrder", entityId: r.so.id, entityCode: r.so.code,
        url: `/sales/${r.so.id}`,
        excludeUserIds: [session.user.id],
      }, tx);
    }, { timeout: 20_000 });
  } catch (e) {
    return refusal(e);
  }
  revalidateSale(input.salesOrderId);
  return { ok: true };
}

/** Pay money back to the customer. The amount is entered positive and stored negative. */
export async function recordRefund(fd: FormData): Promise<LedgerActionResult> {
  const session = await requireCapability("payment:write");
  const parsed = parsePaymentForm(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid refund." };
  const input = parsed.data;

  const rates = await getExchangeRates();
  try {
    await prisma.$transaction(async (tx) => {
      const r = await applyRefund(tx, rates, { ...input, recordedBy: session.user.name ?? null });
      await writeAudit({
        entity: "SalesOrder", entityId: r.so.id, entityCode: r.so.code,
        action: "PAYMENT_REFUNDED",
        userId: session.user.id, userName: session.user.name ?? null,
        newValue: `-${input.amount.toFixed(2)} ${input.currency} (${input.method})`,
        metadata: { paymentCode: r.payment.code, orderCurrencyAmount: r.orderCurrencyAmount, netPaid: r.netPaid, totalAmount: Number(r.so.totalAmount), newStatus: r.status },
      }, tx);
      await notify({
        type: "PAYMENT_RECORDED",
        title: `Refund issued — ${r.so.code}`,
        body: `${input.amount.toFixed(2)} ${input.currency} refunded · now ${r.status.toLowerCase()}`,
        entity: "SalesOrder", entityId: r.so.id, entityCode: r.so.code,
        url: `/sales/${r.so.id}`,
        excludeUserIds: [session.user.id],
      }, tx);
    }, { timeout: 20_000 });
  } catch (e) {
    return refusal(e);
  }
  revalidateSale(input.salesOrderId);
  return { ok: true };
}

/**
 * Cancel a sale: only with nothing held (refund first) and nothing shipped.
 * The stone returns to AVAILABLE so it can be sold again.
 */
export async function cancelSale(fd: FormData): Promise<LedgerActionResult> {
  const session = await requireCapability("sale:write");
  const id = str(fd.get("id"));
  const reason = str(fd.get("reason"))?.trim();
  if (!id) return { ok: false, error: "Sales order is required." };
  if (!reason) return { ok: false, error: "A reason is required to cancel a sale." };

  const rates = await getExchangeRates();
  let gemstoneId = "";
  let customerId = "";
  try {
    await prisma.$transaction(async (tx) => {
      const r = await applyCancelSale(tx, rates, { salesOrderId: id, reason });
      gemstoneId = r.so.gemstoneId;
      customerId = r.so.customerId;
      await writeAudit({
        entity: "SalesOrder", entityId: r.so.id, entityCode: r.so.code,
        action: "CANCELLED", field: "status",
        oldValue: r.so.status, newValue: "CANCELLED",
        userId: session.user.id, userName: session.user.name ?? null,
        metadata: { reason, gemstoneCode: r.gemCode, gemReleased: r.gemReleased, shipmentCancelled: r.shipmentCancelled },
      }, tx);
      if (r.gemReleased) {
        await writeAudit({
          entity: "Gemstone", entityId: r.so.gemstoneId, entityCode: r.gemCode,
          action: "SALE_CANCELLED", field: "status",
          oldValue: "SOLD", newValue: "AVAILABLE",
          userId: session.user.id, userName: session.user.name ?? null,
          metadata: { salesOrderId: r.so.id, salesOrderCode: r.so.code, reason },
        }, tx);
      }
      await notify({
        type: "ALERT",
        title: `Sale ${r.so.code} cancelled`,
        body: `${r.gemCode} is back in stock. Reason: ${reason.slice(0, 160)}`,
        entity: "SalesOrder", entityId: r.so.id, entityCode: r.so.code,
        url: `/sales/${r.so.id}`,
        excludeUserIds: [session.user.id],
      }, tx);
    }, { timeout: 20_000 });
  } catch (e) {
    return refusal(e);
  }
  revalidatePath("/");
  revalidatePath("/sales");
  revalidatePath(`/sales/${id}`);
  revalidatePath(`/gemstones/${gemstoneId}`);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/reports/pnl");
  return { ok: true };
}
