import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import {
  computeCgi,
  tierForLab,
  type LabTier,
  type CgiOriginBand,
  type CgiTreatmentBand,
  type CgiColorBand,
  type CgiClarityBand,
  type CgiCutBand,
} from "@/lib/cgi";

type Tx = Prisma.TransactionClient;

/**
 * Recompute and persist the CGI score for one gemstone. Called from the
 * gemstone edit action, the certificate create/delete actions, and the
 * media + cost allocation actions — anywhere a signal that feeds the score
 * changes. Safe to call from inside an existing transaction (pass tx);
 * also safe to call standalone (opens its own prisma connection).
 */
export async function recomputeCgiForGemstone(gemstoneId: string, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;

  const g = await client.gemstone.findUnique({
    where: { id: gemstoneId },
    select: {
      id: true,
      weightCt: true,
      cgiOriginBand: true,
      cgiTreatmentBand: true,
      cgiColorBand: true,
      cgiClarityBand: true,
      cgiCutBand: true,
      certificates: { select: { laboratory: { select: { name: true } }, status: true } },
      transformationsAsOutput: { select: { id: true }, take: 1 },
      costAllocations: { select: { id: true }, take: 1 },
      digitalAssets: { select: { stage: true } },
    },
  });
  if (!g) return;

  // Highest tier among issued certificates
  let bestTier: LabTier | null = null;
  const rank: Record<LabTier, number> = { A: 3, B: 2, C: 1, D: 0 };
  for (const c of g.certificates) {
    if (c.status === "REJECTED") continue;
    const t = tierForLab(c.laboratory?.name);
    if (!bestTier || rank[t] > rank[bestTier]) bestTier = t;
  }

  const stages = new Set((g.digitalAssets ?? []).map((a) => a.stage).filter(Boolean) as string[]);
  const hasRoughMedia   = stages.has("ROUGH_INTAKE")   || stages.has("PLANNING") || stages.has("PRE_CUT");
  const hasCuttingMedia = stages.has("CUTTING")        || stages.has("POLISHING");
  const hasFinalMedia   = stages.has("FINAL")          || stages.has("CERTIFICATION") || stages.has("PACKAGING");

  const result = computeCgi({
    weightCt: Number(g.weightCt),
    originBand:    (g.cgiOriginBand    as CgiOriginBand    | null) ?? null,
    treatmentBand: (g.cgiTreatmentBand as CgiTreatmentBand | null) ?? null,
    colorBand:     (g.cgiColorBand     as CgiColorBand     | null) ?? null,
    clarityBand:   (g.cgiClarityBand   as CgiClarityBand   | null) ?? null,
    cutBand:       (g.cgiCutBand       as CgiCutBand       | null) ?? null,
    bestCertTier:  bestTier,
    hasParentRough: g.transformationsAsOutput.length > 0,
    hasBillChain:   g.costAllocations.length > 0,
    hasRoughMedia,
    hasCuttingMedia,
    hasFinalMedia,
  });

  await client.gemstone.update({
    where: { id: gemstoneId },
    data: {
      cgiScore:     result.score,
      cgiBand:      result.band,
      cgiBreakdown: JSON.stringify(result.breakdown),
      cgiComputedAt: new Date(),
    },
  });
}

/** Recompute CGI for every gemstone — used by a one-off backfill script. */
export async function backfillAllCgi(): Promise<number> {
  const ids = await prisma.gemstone.findMany({ select: { id: true } });
  let n = 0;
  for (const { id } of ids) {
    await recomputeCgiForGemstone(id);
    n++;
  }
  return n;
}
