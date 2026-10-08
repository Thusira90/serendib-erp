import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getFieldVocabulary } from "@/lib/field-vocab";
import type { TreatmentRow, TreatmentStatus } from "@/lib/treatment-types";

const include = {
  roughStone: { select: { id: true, code: true, gemType: true, variety: true, weightCt: true } },
  gemstone: { select: { id: true, code: true, gemType: true, variety: true, weightCt: true } },
} satisfies Prisma.TreatmentInclude;

type Loaded = Prisma.TreatmentGetPayload<{ include: typeof include }>;

function toRow(t: Loaded): TreatmentRow {
  const stone = t.roughStone ?? t.gemstone;
  const label = stone
    ? `${stone.gemType}${stone.variety ? ` · ${stone.variety}` : ""} · ${Number(stone.weightCt).toFixed(2)} ct`
    : "Stone removed";
  return {
    id: t.id,
    code: t.code,
    kind: t.roughStoneId ? "ROUGH" : "GEMSTONE",
    stoneId: stone?.id ?? "",
    stoneCode: stone?.code ?? "—",
    stoneLabel: label,
    type: t.type,
    status: t.status as TreatmentStatus,
    providerKind: t.providerKind,
    providerName: t.providerName,
    providerContact: t.providerContact,
    startDate: t.startDate?.toISOString() ?? null,
    endDate: t.endDate?.toISOString() ?? null,
    cost: Number(t.cost),
    currency: t.currency,
    weightBeforeCt: t.weightBeforeCt != null ? Number(t.weightBeforeCt) : null,
    weightAfterCt: t.weightAfterCt != null ? Number(t.weightAfterCt) : null,
    notes: t.notes,
  };
}

/**
 * Treatments matching `where`, newest first. `missingTable` is true when the
 * treatments table has not been created on this database yet, so pages can say
 * so instead of failing.
 */
export async function loadTreatments(where: Prisma.TreatmentWhereInput = {}): Promise<{ rows: TreatmentRow[]; missingTable: boolean }> {
  try {
    const found = await prisma.treatment.findMany({
      where,
      include,
      orderBy: [{ startDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 500,
    });
    return { rows: found.map(toRow), missingTable: false };
  } catch {
    return { rows: [], missingTable: true };
  }
}

/** Treatment types and provider names to suggest: the starter list plus what has already been used. */
export async function loadTreatmentVocab(): Promise<{ types: string[]; providers: string[] }> {
  const v = await getFieldVocabulary([
    { model: "treatment", field: "type", seedKey: "treatmentType" },
    { model: "treatment", field: "providerName", seedKey: "providerName" },
  ]);
  return { types: v["treatment.type"] ?? [], providers: v["treatment.providerName"] ?? [] };
}

/** Every stone, for the stone picker on the Treatments page. */
export async function loadStoneOptions() {
  const [rough, gems] = await Promise.all([
    prisma.roughStone.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, code: true, gemType: true, variety: true, weightCt: true }, take: 1000 }),
    prisma.gemstone.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, code: true, gemType: true, variety: true, weightCt: true }, take: 1000 }),
  ]);
  const opt = (s: { id: string; code: string; gemType: string; variety: string | null; weightCt: unknown }) => ({
    id: s.id,
    label: `${s.gemType}${s.variety ? ` · ${s.variety}` : ""} · ${Number(s.weightCt).toFixed(2)} ct`,
    hint: s.code,
  });
  return { rough: rough.map(opt), gems: gems.map(opt) };
}
