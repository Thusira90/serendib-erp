"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { SHIPMENT_STATUSES } from "@/lib/enums";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);
const dec = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

const createSchema = z.object({
  salesOrderId: z.string().min(1),
  courier: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  destination: z.string().nullable(),
  destCountry: z.string().nullable(),
  shippingCost: z.number().nullable(),
  insuranceCost: z.number().nullable(),
  declaredValue: z.number().nullable(),
  currency: z.string(),
  notes: z.string().nullable(),
});

/**
 * Create a shipment for a sales order.
 * Invariants:
 *  - Sales order must exist and not be CANCELLED.
 *  - There can only be one Shipment per SalesOrder (enforced by @unique).
 */
export async function createShipment(fd: FormData) {
  const session = await requireCapability("shipment:write");
  const parsed = createSchema.parse({
    salesOrderId: str(fd.get("salesOrderId")),
    courier: str(fd.get("courier")),
    trackingNumber: str(fd.get("trackingNumber")),
    destination: str(fd.get("destination")),
    destCountry: str(fd.get("destCountry")),
    shippingCost: dec(fd.get("shippingCost")),
    insuranceCost: dec(fd.get("insuranceCost")),
    declaredValue: dec(fd.get("declaredValue")),
    currency: str(fd.get("currency")) ?? "USD",
    notes: str(fd.get("notes")),
  });

  const year = new Date().getUTCFullYear();
  const shipment = await prisma.$transaction(async (tx) => {
    const so = await tx.salesOrder.findUniqueOrThrow({ where: { id: parsed.salesOrderId } });
    if (so.status === "CANCELLED") {
      throw new Error(`Sales order ${so.code} is cancelled.`);
    }
    const existing = await tx.shipment.findUnique({ where: { salesOrderId: so.id } });
    if (existing) throw new Error(`Shipment ${existing.code} already exists for this sales order.`);

    const code = await nextCode(codePrefix.shipment, year, tx, { pad: 4 });
    const created = await tx.shipment.create({
      data: {
        code,
        salesOrderId: so.id,
        courier: parsed.courier,
        trackingNumber: parsed.trackingNumber,
        destination: parsed.destination,
        destCountry: parsed.destCountry,
        shippingCost: parsed.shippingCost ?? undefined,
        insuranceCost: parsed.insuranceCost ?? undefined,
        declaredValue: parsed.declaredValue ?? undefined,
        currency: parsed.currency,
        notes: parsed.notes,
        status: "PREPARING",
        preparedAt: new Date(),
      },
    });
    await writeAudit({
      entity: "Shipment", entityId: created.id, entityCode: created.code,
      action: "CREATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Preparing shipment for ${so.code}${parsed.destination ? ` to ${parsed.destination}` : ""}.`,
      metadata: { salesOrderId: so.id, salesOrderCode: so.code },
    }, tx);
    await notify({
      type: "SHIPMENT_CREATED",
      title: `Shipment ${created.code} prepared`,
      body: `Sales order ${so.code}${parsed.destination ? ` → ${parsed.destination}` : ""}`,
      entity: "Shipment", entityId: created.id, entityCode: created.code,
      url: `/shipments/${created.id}`,
      excludeUserIds: [session.user.id],
    }, tx);
    return created;
  });

  revalidatePath(`/sales/${parsed.salesOrderId}`);
  revalidatePath("/shipments");
  redirect(`/shipments/${shipment.id}`);
}

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(SHIPMENT_STATUSES),
});

/**
 * Advance a shipment through its status flow.
 * Side effects:
 *  - status SHIPPED sets shippedAt (if empty) and flips SalesOrder → SHIPPED.
 *  - status DELIVERED sets deliveredAt (if empty) and flips SalesOrder → DELIVERED.
 *  - PACKED sets packedAt (if empty).
 * We never regress the SalesOrder past PAID unless it's already ahead;
 * SalesOrder.status may legitimately be PAID, PARTIAL, or INVOICED here.
 */
const trackingSchema = z.object({
  id: z.string().min(1),
  courier: z.string().nullable(),
  trackingNumber: z.string().nullable(),
});

/**
 * Update the carrier and tracking number on an existing shipment. Both
 * fields are optional (either can be cleared by submitting empty) so users
 * can correct a mis-typed AWB without having to also re-enter the courier.
 */
export async function updateShipmentTracking(fd: FormData) {
  const session = await requireCapability("shipment:write");
  const parsed = trackingSchema.parse({
    id: str(fd.get("id")),
    courier: str(fd.get("courier")),
    trackingNumber: str(fd.get("trackingNumber")),
  });
  await prisma.$transaction(async (tx) => {
    const before = await tx.shipment.findUniqueOrThrow({ where: { id: parsed.id } });
    await tx.shipment.update({
      where: { id: parsed.id },
      data: { courier: parsed.courier, trackingNumber: parsed.trackingNumber },
    });
    const changes: string[] = [];
    if (before.courier !== parsed.courier) changes.push(`courier: ${before.courier ?? "∅"} → ${parsed.courier ?? "∅"}`);
    if (before.trackingNumber !== parsed.trackingNumber) changes.push(`tracking: ${before.trackingNumber ?? "∅"} → ${parsed.trackingNumber ?? "∅"}`);
    if (changes.length > 0) {
      await writeAudit({
        entity: "Shipment", entityId: parsed.id, entityCode: before.code,
        action: "TRACKING_UPDATE",
        newValue: changes.join("; "),
        userId: session.user.id, userName: session.user.name ?? null,
      }, tx);
    }
  });
  revalidatePath(`/shipments/${parsed.id}`);
  revalidatePath("/shipments");
}

export async function updateShipmentStatus(fd: FormData) {
  const session = await requireCapability("shipment:write");
  const parsed = statusSchema.parse({
    id: str(fd.get("id")),
    status: str(fd.get("status")),
  });
  await prisma.$transaction(async (tx) => {
    const before = await tx.shipment.findUniqueOrThrow({ where: { id: parsed.id }, include: { salesOrder: true } });
    const now = new Date();
    const patches: {
      packedAt?: Date;
      shippedAt?: Date;
      deliveredAt?: Date;
    } = {};
    if (parsed.status === "PACKED" && !before.packedAt) patches.packedAt = now;
    if (parsed.status === "SHIPPED" && !before.shippedAt) patches.shippedAt = now;
    if (parsed.status === "DELIVERED" && !before.deliveredAt) patches.deliveredAt = now;

    await tx.shipment.update({
      where: { id: parsed.id },
      data: { status: parsed.status, ...patches },
    });

    if (parsed.status === "SHIPPED") {
      await tx.salesOrder.update({
        where: { id: before.salesOrderId },
        data: { status: "SHIPPED" },
      });
    } else if (parsed.status === "DELIVERED") {
      await tx.salesOrder.update({
        where: { id: before.salesOrderId },
        data: { status: "DELIVERED" },
      });
    }

    await writeAudit({
      entity: "Shipment", entityId: parsed.id, entityCode: before.code,
      action: "STATUS_CHANGE", field: "status",
      oldValue: before.status, newValue: parsed.status,
      userId: session.user.id, userName: session.user.name ?? null,
      metadata: { salesOrderId: before.salesOrderId, salesOrderCode: before.salesOrder.code },
    }, tx);
    if (parsed.status === "DELIVERED") {
      await notify({
        type: "SHIPMENT_DELIVERED",
        title: `Shipment ${before.code} delivered`,
        body: `Sales order ${before.salesOrder.code} closed.`,
        entity: "Shipment", entityId: parsed.id, entityCode: before.code,
        url: `/shipments/${parsed.id}`,
        excludeUserIds: [session.user.id],
      }, tx);
    }
  });
  revalidatePath(`/shipments/${parsed.id}`);
  revalidatePath("/shipments");
}
