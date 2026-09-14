"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);
const dec = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

const roughRowSchema = z.object({
  gemType: z.string().min(1),
  variety: z.string().nullable(),
  weightCt: z.number().positive(),
  color: z.string().nullable(),
  clarity: z.string().nullable(),
  shape: z.string().nullable(),
  purchasePrice: z.number().nullable(),
});

const parcelSchema = z.object({
  supplierId: z.string().min(1),
  purchaseDate: z.string().min(1),
  origin: z.string().nullable(),
  totalCost: z.number().nonnegative(),
  currency: z.string(),
  notes: z.string().nullable(),
  locationId: z.string().nullable(),
});

/**
 * Create a parcel plus N rough stones in a single transaction.
 * If the individual rows don't carry a `purchasePrice`, we auto-allocate the
 * parcel's totalCost proportionally by weight, so every stone has a real cost
 * to propagate into finished-gemstone COGS later.
 */
export async function createParcelWithRoughs(fd: FormData) {
  const session = await requireCapability("rough:write");

  const header = parcelSchema.parse({
    supplierId: str(fd.get("supplierId")),
    purchaseDate: str(fd.get("purchaseDate")) ?? "",
    origin: str(fd.get("origin")),
    totalCost: dec(fd.get("totalCost")) ?? 0,
    currency: str(fd.get("currency")) ?? "USD",
    notes: str(fd.get("notes")),
    locationId: str(fd.get("locationId")),
  });

  const rowCount = parseInt(String(fd.get("rowCount") ?? "0"), 10);
  const rows: z.infer<typeof roughRowSchema>[] = [];
  for (let i = 0; i < rowCount; i++) {
    const w = dec(fd.get(`row.${i}.weightCt`));
    const gemType = str(fd.get(`row.${i}.gemType`));
    if (w == null || w <= 0 || !gemType) continue;
    rows.push(roughRowSchema.parse({
      gemType,
      variety: str(fd.get(`row.${i}.variety`)),
      weightCt: w,
      color: str(fd.get(`row.${i}.color`)),
      clarity: str(fd.get(`row.${i}.clarity`)),
      shape: str(fd.get(`row.${i}.shape`)),
      purchasePrice: dec(fd.get(`row.${i}.purchasePrice`)),
    }));
  }
  if (rows.length === 0) throw new Error("At least one rough stone is required.");

  const totalWeight = rows.reduce((s, r) => s + r.weightCt, 0);
  const totalRowSpec = rows.reduce((s, r) => s + (r.purchasePrice ?? 0), 0);
  const unpricedRows = rows.filter((r) => r.purchasePrice == null);
  const remainingBudget = Math.max(0, header.totalCost - totalRowSpec);
  const unpricedTotalWeight = unpricedRows.reduce((s, r) => s + r.weightCt, 0);
  const purchaseDate = new Date(header.purchaseDate);
  const year = purchaseDate.getUTCFullYear();

  const parcel = await prisma.$transaction(async (tx) => {
    const parcelCode = await nextCode(codePrefix.parcel, year, tx, { pad: 4 });
    const createdParcel = await tx.parcel.create({
      data: {
        code: parcelCode,
        supplierId: header.supplierId,
        purchaseDate,
        origin: header.origin,
        totalWeightCt: totalWeight,
        totalCost: header.totalCost,
        currency: header.currency,
        notes: header.notes,
      },
    });

    for (const r of rows) {
      const roughCode = await nextCode(codePrefix.rough, year, tx);
      const price = r.purchasePrice ?? (unpricedTotalWeight > 0
        ? (r.weightCt / unpricedTotalWeight) * remainingBudget
        : 0);
      await tx.roughStone.create({
        data: {
          code: roughCode,
          supplierId: header.supplierId,
          parcelId: createdParcel.id,
          locationId: header.locationId,
          purchaseDate,
          gemType: r.gemType,
          variety: r.variety,
          origin: header.origin,
          weightCt: r.weightCt,
          color: r.color,
          clarity: r.clarity,
          shape: r.shape,
          purchasePrice: price,
          currency: header.currency,
          pricePerCt: r.weightCt > 0 ? price / r.weightCt : null,
          status: "RECEIVED",
        },
      });
    }

    await writeAudit({
      entity: "Parcel", entityId: createdParcel.id, entityCode: createdParcel.code,
      action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Parcel ${createdParcel.code} received — ${rows.length} rough stone${rows.length === 1 ? "" : "s"}, ${totalWeight.toFixed(2)}ct total.`,
      metadata: { supplierId: header.supplierId, rows: rows.length },
    }, tx);

    return createdParcel;
  });

  revalidatePath("/parcels");
  revalidatePath("/rough");
  revalidatePath("/");
  redirect("/parcels");
}
