"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
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
    currency: str(fd.get("currency")) ?? "USD",
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
    currency: str(fd.get("currency")) ?? "USD",
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
 * Both checks run inside a single serializable transaction.
 */
export async function reserveGemstone(fd: FormData) {
  const session = await requireCapability("reservation:write");
  const parsed = reservationSchema.parse({
    customerId: str(fd.get("customerId")),
    gemstoneId: str(fd.get("gemstoneId")),
    quotationId: str(fd.get("quotationId")),
    price: dec(fd.get("price")),
    deposit: dec(fd.get("deposit")),
    currency: str(fd.get("currency")) ?? "USD",
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
    await tx.gemstone.update({
      where: { id: parsed.gemstoneId },
      data: { status: "RESERVED" },
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
    await tx.reservation.update({
      where: { id },
      data: { status: "RELEASED", releasedAt: new Date(), releasedReason: reason },
    });
    if (res.gemstone.status === "RESERVED") {
      await tx.gemstone.update({
        where: { id: res.gemstoneId },
        data: { status: "AVAILABLE" },
      });
    }
    await writeAudit({
      entity: "Gemstone", entityId: res.gemstoneId, entityCode: res.gemstone.code,
      action: "RESERVATION_RELEASED", field: "status",
      oldValue: "RESERVED", newValue: "AVAILABLE",
      userId: session.user.id, userName: session.user.name ?? null,
      metadata: { reservationCode: res.code, reason },
    }, tx);
  });
  revalidatePath("/reservations");
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
    currency: str(fd.get("currency")) ?? "USD",
    saleDate: date(fd.get("saleDate")),
    notes: str(fd.get("notes")),
  });

  const year = new Date().getUTCFullYear();
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
        saleDate: parsed.saleDate ?? new Date(),
        salespersonId: session.user.id,
        notes: parsed.notes,
        status: "INVOICED",
      },
    });

    await tx.gemstone.update({
      where: { id: gem.id },
      data: { status: "SOLD" },
    });

    if (reservation) {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: "CONVERTED" },
      });
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
  });

  revalidatePath(`/gemstones/${parsed.gemstoneId}`);
  revalidatePath("/sales");
  revalidatePath(`/customers/${parsed.customerId}`);
  redirect(`/sales/${sale.id}`);
}

// ─── Payments ────────────────────────────────────────────────────────────────

const paymentSchema = z.object({
  salesOrderId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().nullable(),
  receivedAt: z.date().nullable(),
  notes: z.string().nullable(),
});

/**
 * Record a payment against a sales order.
 * Recalculates SalesOrder.status → PARTIAL or PAID based on aggregate.
 */
export async function recordPayment(fd: FormData) {
  const session = await requireCapability("payment:write");
  const parsed = paymentSchema.parse({
    salesOrderId: str(fd.get("salesOrderId")),
    amount: dec(fd.get("amount")),
    currency: str(fd.get("currency")) ?? "USD",
    method: (str(fd.get("method")) ?? "BANK_TRANSFER") as PaymentMethod,
    reference: str(fd.get("reference")),
    receivedAt: date(fd.get("receivedAt")),
    notes: str(fd.get("notes")),
  });

  const year = new Date().getUTCFullYear();
  await prisma.$transaction(async (tx) => {
    const so = await tx.salesOrder.findUniqueOrThrow({ where: { id: parsed.salesOrderId } });
    if (so.status === "CANCELLED") {
      throw new Error(`Sales order ${so.code} is cancelled.`);
    }
    const code = await nextCode(codePrefix.payment, year, tx, { pad: 4 });
    await tx.payment.create({
      data: {
        code,
        salesOrderId: so.id,
        customerId: so.customerId,
        amount: parsed.amount,
        currency: parsed.currency,
        method: parsed.method,
        reference: parsed.reference,
        receivedAt: parsed.receivedAt ?? new Date(),
        notes: parsed.notes,
        recordedBy: session.user.name ?? null,
      },
    });
    const paid = await tx.payment.aggregate({
      where: { salesOrderId: so.id },
      _sum: { amount: true },
    });
    const paidTotal = Number(paid._sum.amount ?? 0);
    const target = Number(so.totalAmount);
    const nextStatus: SalesOrderStatus =
      paidTotal >= target ? "PAID"
      : paidTotal > 0 ? "PARTIAL"
      : (so.status as SalesOrderStatus);
    if (nextStatus !== so.status) {
      await tx.salesOrder.update({ where: { id: so.id }, data: { status: nextStatus } });
    }
    await writeAudit({
      entity: "SalesOrder", entityId: so.id, entityCode: so.code,
      action: "PAYMENT_RECORDED",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `${parsed.amount.toFixed(2)} ${parsed.currency} (${parsed.method})`,
      metadata: { paidTotal, totalAmount: target, newStatus: nextStatus },
    }, tx);
    await notify({
      type: "PAYMENT_RECORDED",
      title: `Payment received — ${so.code}`,
      body: `${parsed.amount.toFixed(2)} ${parsed.currency} · ${nextStatus === "PAID" ? "fully paid" : "partial"}`,
      entity: "SalesOrder", entityId: so.id, entityCode: so.code,
      url: `/sales/${so.id}`,
      excludeUserIds: [session.user.id],
    }, tx);
  });

  revalidatePath(`/sales/${parsed.salesOrderId}`);
  revalidatePath("/sales");
}
