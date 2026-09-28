import "server-only";
import { prisma } from "@/lib/db";

/**
 * A cut stone's provenance strip: which rough it came from, which cutting
 * job made it, and (optionally) the transformation record ID. Every element
 * is optional because direct-acquisition gems have no rough parent, and old
 * transformations may have no linked cutting job.
 */
export type Provenance = {
  roughCode: string | null;
  roughId: string | null;
  roughPurchasedAt: Date | null;
  cuttingJobCode: string | null;
  cuttingJobId: string | null;
  transformationCode: string | null;
};

/**
 * Resolve provenance for a single gemstone id in one round-trip. Handles
 * the case where a gem came from multiple input roughs (unusual — merges
 * happen but rarely) by picking the first, since the strip is a summary.
 */
export async function getGemstoneProvenance(gemstoneId: string): Promise<Provenance> {
  const gem = await prisma.gemstone.findUnique({
    where: { id: gemstoneId },
    select: {
      transformationsAsOutput: {
        select: {
          transformation: {
            select: {
              code: true,
              cuttingJob: { select: { id: true, code: true } },
              inputs: {
                select: {
                  roughStone: { select: { id: true, code: true, purchaseDate: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const t = gem?.transformationsAsOutput[0]?.transformation;
  const inp = t?.inputs[0]?.roughStone;
  return {
    roughCode: inp?.code ?? null,
    roughId: inp?.id ?? null,
    roughPurchasedAt: inp?.purchaseDate ?? null,
    cuttingJobCode: t?.cuttingJob?.code ?? null,
    cuttingJobId: t?.cuttingJob?.id ?? null,
    transformationCode: t?.code ?? null,
  };
}
