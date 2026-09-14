import "server-only";
import { prisma } from "@/lib/db";

export type GenealogyNode = {
  kind: "rough" | "gemstone";
  id: string;
  code: string;
  weightCt: number;
  label: string;
  status: string;
  origin?: string | null;
  transformations?: {
    id: string;
    code: string;
    performedAt: Date;
    operator?: string | null;
    yieldPct: number;
    wasteWeightCt: number;
    children: GenealogyNode[];
  }[];
  producedBy?: {
    id: string;
    code: string;
    performedAt: Date;
    operator?: string | null;
    parents: { kind: "rough"; id: string; code: string; weightCt: number }[];
  }[];
};

async function collectRough(id: string, depth: number, seen: Set<string>): Promise<GenealogyNode> {
  if (seen.has(`R:${id}`)) {
    const r = await prisma.roughStone.findUnique({ where: { id } });
    return {
      kind: "rough",
      id,
      code: r?.code ?? "?",
      weightCt: Number(r?.weightCt ?? 0),
      label: `${r?.gemType ?? "Rough"}${r?.variety ? ` · ${r?.variety}` : ""}`,
      status: r?.status ?? "?",
      origin: r?.origin,
    };
  }
  seen.add(`R:${id}`);
  const rough = await prisma.roughStone.findUnique({
    where: { id },
    include: {
      transformationsAsInput: {
        include: {
          transformation: {
            include: {
              outputs: { include: { gemstone: true } },
            },
          },
        },
      },
    },
  });
  if (!rough) throw new Error("Rough stone not found");

  const transformations = depth > 0
    ? await Promise.all(
        // Group input records by transformation
        Array.from(
          new Map(rough.transformationsAsInput.map((i) => [i.transformationId, i])).values()
        ).map(async (i) => {
          const tx = i.transformation;
          const children: GenealogyNode[] = await Promise.all(
            tx.outputs.map((o) => collectGemstone(o.gemstoneId, depth - 1, seen))
          );
          return {
            id: tx.id,
            code: tx.code,
            performedAt: tx.performedAt,
            operator: tx.operator,
            yieldPct: Number(tx.yieldPct),
            wasteWeightCt: Number(tx.wasteWeightCt),
            children,
          };
        })
      )
    : [];

  return {
    kind: "rough",
    id: rough.id,
    code: rough.code,
    weightCt: Number(rough.weightCt),
    label: `${rough.gemType}${rough.variety ? ` · ${rough.variety}` : ""}`,
    status: rough.status,
    origin: rough.origin,
    transformations,
  };
}

async function collectGemstone(id: string, depth: number, seen: Set<string>): Promise<GenealogyNode> {
  if (seen.has(`G:${id}`)) {
    const g = await prisma.gemstone.findUnique({ where: { id } });
    return {
      kind: "gemstone",
      id,
      code: g?.code ?? "?",
      weightCt: Number(g?.weightCt ?? 0),
      label: `${g?.gemType ?? "Gemstone"}${g?.variety ? ` · ${g?.variety}` : ""}`,
      status: g?.status ?? "?",
      origin: g?.origin,
    };
  }
  seen.add(`G:${id}`);
  const gem = await prisma.gemstone.findUnique({
    where: { id },
    include: {
      transformationsAsOutput: {
        include: {
          transformation: {
            include: {
              inputs: { include: { roughStone: true } },
            },
          },
        },
      },
    },
  });
  if (!gem) throw new Error("Gemstone not found");

  const producedBy = depth > 0
    ? Array.from(
        new Map(gem.transformationsAsOutput.map((o) => [o.transformationId, o])).values()
      ).map((o) => ({
        id: o.transformation.id,
        code: o.transformation.code,
        performedAt: o.transformation.performedAt,
        operator: o.transformation.operator,
        parents: o.transformation.inputs.map((i) => ({
          kind: "rough" as const,
          id: i.roughStone.id,
          code: i.roughStone.code,
          weightCt: Number(i.roughStone.weightCt),
        })),
      }))
    : [];

  return {
    kind: "gemstone",
    id: gem.id,
    code: gem.code,
    weightCt: Number(gem.weightCt),
    label: `${gem.gemType}${gem.variety ? ` · ${gem.variety}` : ""}`,
    status: gem.status,
    origin: gem.origin,
    producedBy,
  };
}

export async function buildRoughGenealogy(roughId: string) {
  return collectRough(roughId, 5, new Set());
}

export async function buildGemstoneGenealogy(gemstoneId: string) {
  return collectGemstone(gemstoneId, 5, new Set());
}
