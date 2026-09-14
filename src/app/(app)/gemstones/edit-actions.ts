"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { auditDiff } from "@/lib/audit";
import { GEMSTONE_STATUSES } from "@/lib/enums";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);
const dec = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

const schema = z.object({
  id: z.string().min(1),
  gemType: z.string().min(1),
  variety: z.string().nullable(),
  species: z.string().nullable(),
  origin: z.string().nullable(),
  treatment: z.string().nullable(),
  treatmentStatus: z.string().nullable(),
  weightCt: z.number().positive(),
  lengthMm: z.number().nullable(),
  widthMm: z.number().nullable(),
  depthMm: z.number().nullable(),
  shape: z.string().nullable(),
  cut: z.string().nullable(),
  facetingStyle: z.string().nullable(),
  colorDescription: z.string().nullable(),
  clarity: z.string().nullable(),
  luster: z.string().nullable(),
  fluorescence: z.string().nullable(),
  symmetry: z.string().nullable(),
  polish: z.string().nullable(),
  inclusions: z.string().nullable(),
  status: z.enum(GEMSTONE_STATUSES),
  locationId: z.string().nullable(),
});

/**
 * Update the frequently-edited fields of a gemstone. Deliberately does NOT
 * touch cost, price history, or status transitions that belong to the
 * commerce actions (reserve / sell / release / changeAskingPrice).
 */
export async function updateGemstone(fd: FormData) {
  const session = await requireCapability("gemstone:write");
  const parsed = schema.parse({
    id: str(fd.get("id")),
    gemType: str(fd.get("gemType")) ?? "",
    variety: str(fd.get("variety")),
    species: str(fd.get("species")),
    origin: str(fd.get("origin")),
    treatment: str(fd.get("treatment")),
    treatmentStatus: str(fd.get("treatmentStatus")),
    weightCt: dec(fd.get("weightCt")) ?? 0,
    lengthMm: dec(fd.get("lengthMm")),
    widthMm: dec(fd.get("widthMm")),
    depthMm: dec(fd.get("depthMm")),
    shape: str(fd.get("shape")),
    cut: str(fd.get("cut")),
    facetingStyle: str(fd.get("facetingStyle")),
    colorDescription: str(fd.get("colorDescription")),
    clarity: str(fd.get("clarity")),
    luster: str(fd.get("luster")),
    fluorescence: str(fd.get("fluorescence")),
    symmetry: str(fd.get("symmetry")),
    polish: str(fd.get("polish")),
    inclusions: str(fd.get("inclusions")),
    status: str(fd.get("status")),
    locationId: str(fd.get("locationId")),
  });

  const before = await prisma.gemstone.findUniqueOrThrow({ where: { id: parsed.id } });

  // Weight changed → recompute costPerCt from stored totalCost.
  const nextCostPerCt = parsed.weightCt > 0 ? Number(before.totalCost) / parsed.weightCt : 0;
  // Price/ct follows too if askingPrice is set.
  const nextPricePerCt = before.askingPrice != null && parsed.weightCt > 0
    ? Number(before.askingPrice) / parsed.weightCt
    : before.pricePerCt;

  await prisma.$transaction(async (tx) => {
    const after = await tx.gemstone.update({
      where: { id: parsed.id },
      data: {
        gemType: parsed.gemType,
        variety: parsed.variety,
        species: parsed.species,
        origin: parsed.origin,
        treatment: parsed.treatment,
        treatmentStatus: parsed.treatmentStatus,
        weightCt: parsed.weightCt,
        lengthMm: parsed.lengthMm,
        widthMm: parsed.widthMm,
        depthMm: parsed.depthMm,
        shape: parsed.shape,
        cut: parsed.cut,
        facetingStyle: parsed.facetingStyle,
        colorDescription: parsed.colorDescription,
        clarity: parsed.clarity,
        luster: parsed.luster,
        fluorescence: parsed.fluorescence,
        symmetry: parsed.symmetry,
        polish: parsed.polish,
        inclusions: parsed.inclusions,
        status: parsed.status,
        locationId: parsed.locationId,
        costPerCt: nextCostPerCt,
        pricePerCt: nextPricePerCt ?? undefined,
      },
    });
    await auditDiff(
      { entity: "Gemstone", entityId: parsed.id, entityCode: before.code, userId: session.user.id, userName: session.user.name ?? null },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      [
        "gemType","variety","species","origin","treatment","treatmentStatus",
        "weightCt","lengthMm","widthMm","depthMm","shape","cut","facetingStyle",
        "colorDescription","clarity","luster","fluorescence","symmetry","polish",
        "inclusions","status","locationId",
      ] as never[],
      tx,
    );
  });

  revalidatePath(`/gemstones/${parsed.id}`);
  revalidatePath("/gemstones");
}
