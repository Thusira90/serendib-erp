"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { saveUpload } from "@/lib/uploads";
import { GEMSTONE_STATUSES } from "@/lib/enums";

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

const schema = z.object({
  // identity
  gemType: z.string().min(1),
  variety: z.string().nullable(),
  species: z.string().nullable(),
  origin: z.string().nullable(),
  treatment: z.string().nullable(),
  treatmentStatus: z.string().nullable(),
  // physical
  weightCt: z.number().positive(),
  lengthMm: z.number().nullable(),
  widthMm: z.number().nullable(),
  depthMm: z.number().nullable(),
  shape: z.string().nullable(),
  cut: z.string().nullable(),
  facetingStyle: z.string().nullable(),
  // color / clarity
  colorHue: z.string().nullable(),
  colorTone: z.string().nullable(),
  colorSaturation: z.string().nullable(),
  colorDescription: z.string().nullable(),
  clarity: z.string().nullable(),
  transparency: z.string().nullable(),
  luster: z.string().nullable(),
  fluorescence: z.string().nullable(),
  inclusions: z.string().nullable(),
  symmetry: z.string().nullable(),
  polish: z.string().nullable(),
  // commercial
  acquisitionCost: z.number().nonnegative(),
  currency: z.string(),
  askingPrice: z.number().nullable(),
  minimumPrice: z.number().nullable(),
  // sourcing
  supplierId: z.string().nullable(),
  vendorName: z.string().nullable(),
  acquisitionDate: z.date().nullable(),
  sourceReference: z.string().nullable(),
  // logistics
  locationId: z.string().nullable(),
  status: z.enum(GEMSTONE_STATUSES),
});

/**
 * Direct-acquisition intake — a faceted gemstone bought from an external
 * source (dealer, auction, private sale) rather than cut in-house.
 *
 * Everything happens in one transaction:
 *   1. Mint a new SGS-G-YYYY-###### code.
 *   2. Create the Gemstone with all provided fields.
 *   3. Log the acquisition as a `CostAllocation` of type ROUGH_PURCHASE (that
 *      cost type already means "the acquisition of the underlying material"
 *      — extending the enum for this one case would ripple through reports).
 *   4. Roll `totalCost` and `costPerCt` from the allocation.
 *   5. Save the optional primary photo as a `DigitalAsset`.
 *   6. Audit + notify.
 */
export async function createFinishedGemstone(fd: FormData) {
  const session = await requireCapability("gemstone:write");

  const parsed = schema.parse({
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
    colorHue: str(fd.get("colorHue")),
    colorTone: str(fd.get("colorTone")),
    colorSaturation: str(fd.get("colorSaturation")),
    colorDescription: str(fd.get("colorDescription")),
    clarity: str(fd.get("clarity")),
    transparency: str(fd.get("transparency")),
    luster: str(fd.get("luster")),
    fluorescence: str(fd.get("fluorescence")),
    inclusions: str(fd.get("inclusions")),
    symmetry: str(fd.get("symmetry")),
    polish: str(fd.get("polish")),
    acquisitionCost: dec(fd.get("acquisitionCost")) ?? 0,
    currency: str(fd.get("currency")) ?? "LKR",
    askingPrice: dec(fd.get("askingPrice")),
    minimumPrice: dec(fd.get("minimumPrice")),
    supplierId: str(fd.get("supplierId")),
    vendorName: str(fd.get("vendorName")),
    acquisitionDate: date(fd.get("acquisitionDate")),
    sourceReference: str(fd.get("sourceReference")),
    locationId: str(fd.get("locationId")),
    status: str(fd.get("status")) ?? "AVAILABLE",
  });

  const photoFile = fd.get("primaryPhoto") as File | null;
  const photo = await saveUpload(photoFile, "photos-gem");

  const year = (parsed.acquisitionDate ?? new Date()).getUTCFullYear();

  const gem = await prisma.$transaction(async (tx) => {
    const code = await nextCode(codePrefix.gemstone, year, tx);

    // Resolve supplier for the audit + allocation description (if picked).
    let supplierLabel: string | null = parsed.vendorName;
    if (parsed.supplierId) {
      const sup = await tx.supplier.findUnique({ where: { id: parsed.supplierId } });
      if (sup) supplierLabel = sup.name;
    }

    const created = await tx.gemstone.create({
      data: {
        code,
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
        colorHue: parsed.colorHue,
        colorTone: parsed.colorTone,
        colorSaturation: parsed.colorSaturation,
        colorDescription: parsed.colorDescription,
        clarity: parsed.clarity,
        transparency: parsed.transparency,
        luster: parsed.luster,
        fluorescence: parsed.fluorescence,
        inclusions: parsed.inclusions,
        symmetry: parsed.symmetry,
        polish: parsed.polish,
        totalCost: parsed.acquisitionCost,
        costPerCt: parsed.weightCt > 0 ? parsed.acquisitionCost / parsed.weightCt : 0,
        currency: parsed.currency,
        askingPrice: parsed.askingPrice ?? undefined,
        minimumPrice: parsed.minimumPrice ?? undefined,
        pricePerCt: parsed.askingPrice != null && parsed.weightCt > 0
          ? parsed.askingPrice / parsed.weightCt : undefined,
        status: parsed.status,
        locationId: parsed.locationId,
      },
    });

    if (parsed.acquisitionCost > 0) {
      const desc = supplierLabel
        ? `Direct acquisition from ${supplierLabel}${parsed.sourceReference ? ` (ref ${parsed.sourceReference})` : ""}`
        : `Direct acquisition${parsed.sourceReference ? ` (ref ${parsed.sourceReference})` : ""}`;
      await tx.costAllocation.create({
        data: {
          gemstoneId: created.id,
          type: "ROUGH_PURCHASE",
          description: desc,
          amount: parsed.acquisitionCost,
          currency: parsed.currency,
          incurredAt: parsed.acquisitionDate ?? new Date(),
        },
      });
    }

    if (photo) {
      await tx.digitalAsset.create({
        data: {
          gemstoneId: created.id,
          kind: "FINISHED_PHOTO",
          url: photo.url,
          contentType: photo.contentType,
          originalName: photo.originalName,
          caption: "Intake photo",
          isPrimary: true,
          createdBy: session.user.name ?? null,
        },
      });
    }

    await writeAudit({
      entity: "Gemstone", entityId: created.id, entityCode: created.code,
      action: "DIRECT_ACQUISITION",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Direct-acquired ${parsed.gemType}${parsed.variety ? ` (${parsed.variety})` : ""} · ${parsed.weightCt.toFixed(2)}ct · ${parsed.acquisitionCost.toFixed(2)} ${parsed.currency}${supplierLabel ? ` from ${supplierLabel}` : ""}.`,
      metadata: { supplierId: parsed.supplierId, vendorName: parsed.vendorName, sourceReference: parsed.sourceReference },
    }, tx);

    return created;
  });

  await notify({
    type: "ALERT",
    title: `New finished stone added — ${gem.code}`,
    body: `${gem.gemType}${gem.variety ? ` · ${gem.variety}` : ""} · ${Number(gem.weightCt).toFixed(2)}ct`,
    entity: "Gemstone", entityId: gem.id, entityCode: gem.code,
    url: `/gemstones/${gem.id}`,
    excludeUserIds: [session.user.id],
  }).catch(() => { /* non-fatal */ });

  revalidatePath("/gemstones");
  revalidatePath("/");
  redirect(`/gemstones/${gem.id}`);
}
