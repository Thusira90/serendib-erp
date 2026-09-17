"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode } from "@/lib/ids";
import { auditDiff, writeAudit } from "@/lib/audit";
import { ROUGH_STATUSES } from "@/lib/enums";

const decimalString = z.union([z.string().min(1), z.number()]).transform((v) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  if (Number.isNaN(n)) throw new Error("Invalid number");
  return n;
});

const optionalDecimal = z.union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isNaN(n) ? null : n;
  });

const createSchema = z.object({
  gemType: z.string().min(1),
  variety: z.string().optional().nullable(),
  species: z.string().optional().nullable(),
  origin: z.string().optional().nullable(),
  mineSource: z.string().optional().nullable(),
  weightCt: decimalString,
  lengthMm: optionalDecimal,
  widthMm: optionalDecimal,
  heightMm: optionalDecimal,
  shape: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  transparency: z.string().optional().nullable(),
  clarity: z.string().optional().nullable(),
  inclusions: z.string().optional().nullable(),
  observations: z.string().optional().nullable(),
  purchasePrice: decimalString,
  currency: z.string().default("LKR"),
  supplierId: z.string().optional().nullable(),
  parcelId: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
  purchaseDate: z.string().min(1),
  initialValuation: optionalDecimal,
  valuationBy: z.string().optional().nullable(),
  valuationNotes: z.string().optional().nullable(),
});

function fdToObj(fd: FormData) {
  const o: Record<string, string | null> = {};
  fd.forEach((v, k) => { o[k] = typeof v === "string" ? v : null; });
  return o;
}

const nullIfBlank = (v: string | null | undefined) => (v == null || v === "" ? null : v);

export async function createRoughStone(fd: FormData) {
  const session = await requireCapability("rough:write");
  const parsed = createSchema.parse(fdToObj(fd));
  const year = new Date(parsed.purchaseDate).getUTCFullYear();

  const rough = await prisma.$transaction(async (tx) => {
    const code = await nextCode(codePrefix.rough, year, tx);
    const created = await tx.roughStone.create({
      data: {
        code,
        supplierId: nullIfBlank(parsed.supplierId ?? null),
        parcelId: nullIfBlank(parsed.parcelId ?? null),
        locationId: nullIfBlank(parsed.locationId ?? null),
        purchaseDate: new Date(parsed.purchaseDate),
        gemType: parsed.gemType,
        variety: parsed.variety ?? null,
        species: parsed.species ?? null,
        origin: parsed.origin ?? null,
        mineSource: parsed.mineSource ?? null,
        weightCt: parsed.weightCt,
        lengthMm: parsed.lengthMm ?? null,
        widthMm: parsed.widthMm ?? null,
        heightMm: parsed.heightMm ?? null,
        shape: parsed.shape ?? null,
        color: parsed.color ?? null,
        transparency: parsed.transparency ?? null,
        clarity: parsed.clarity ?? null,
        inclusions: parsed.inclusions ?? null,
        observations: parsed.observations ?? null,
        purchasePrice: parsed.purchasePrice,
        currency: parsed.currency ?? "LKR",
        pricePerCt: parsed.weightCt > 0 ? parsed.purchasePrice / parsed.weightCt : null,
        initialValuation: parsed.initialValuation ?? null,
        valuationBy: parsed.valuationBy ?? null,
        valuationNotes: parsed.valuationNotes ?? null,
        valuationDate: parsed.initialValuation != null ? new Date() : null,
        status: "PURCHASED",
      },
    });
    await writeAudit({
      userId: session.user.id, userName: session.user.name ?? undefined,
      entity: "RoughStone", entityId: created.id, entityCode: created.code,
      action: "CREATE", newValue: `Rough registered: ${created.gemType} ${Number(created.weightCt).toFixed(2)}ct`,
    }, tx);
    return created;
  });

  revalidatePath("/rough");
  redirect(`/rough/${rough.id}`);
}

const updateSchema = createSchema.extend({
  status: z.enum(ROUGH_STATUSES).optional(),
}).partial().extend({ id: z.string() });

export async function updateRoughStone(fd: FormData) {
  const session = await requireCapability("rough:write");
  const raw = fdToObj(fd);
  const parsed = updateSchema.parse(raw);
  const id = parsed.id;
  const before = await prisma.roughStone.findUniqueOrThrow({ where: { id } });

  const dataUpdate = {
    gemType: parsed.gemType ?? before.gemType,
    variety: parsed.variety ?? before.variety,
    species: parsed.species ?? before.species,
    origin: parsed.origin ?? before.origin,
    weightCt: parsed.weightCt ?? Number(before.weightCt),
    color: parsed.color ?? before.color,
    clarity: parsed.clarity ?? before.clarity,
    observations: parsed.observations ?? before.observations,
    purchasePrice: parsed.purchasePrice ?? Number(before.purchasePrice),
    currency: parsed.currency ?? before.currency,
    pricePerCt: (parsed.purchasePrice ?? Number(before.purchasePrice)) > 0 && (parsed.weightCt ?? Number(before.weightCt)) > 0
      ? (parsed.purchasePrice ?? Number(before.purchasePrice)) / (parsed.weightCt ?? Number(before.weightCt))
      : before.pricePerCt,
    status: parsed.status ?? before.status,
    supplierId: parsed.supplierId ?? before.supplierId,
    locationId: parsed.locationId === undefined ? before.locationId : parsed.locationId,
  };

  await prisma.$transaction(async (tx) => {
    const after = await tx.roughStone.update({ where: { id }, data: dataUpdate });
    await auditDiff(
      { entity: "RoughStone", entityId: id, entityCode: before.code, userId: session.user.id, userName: session.user.name ?? undefined },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      ["gemType","variety","weightCt","purchasePrice","status","origin","color","clarity","observations","locationId","supplierId"] as never[],
      tx
    );
  });

  revalidatePath(`/rough/${id}`);
  revalidatePath("/rough");
}
