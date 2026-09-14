import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCarat, formatDate } from "@/lib/utils";
import { Diamond, Gem, GitBranch } from "lucide-react";
import { buildRoughGenealogy } from "@/lib/genealogy";
import { GenealogyTree } from "@/components/genealogy-tree";
import { GenealogyPicker } from "./genealogy-picker";

export default async function GenealogyPage({ searchParams }: { searchParams: Promise<{ rough?: string }> }) {
  await requireCapability("genealogy:read");
  const sp = await searchParams;

  const [transformations, roughsWithOutputs] = await Promise.all([
    prisma.gemstoneTransformation.findMany({
      orderBy: { performedAt: "desc" },
      take: 25,
      include: {
        inputs: { include: { roughStone: true } },
        outputs: { include: { gemstone: true } },
      },
    }),
    prisma.roughStone.findMany({
      where: { transformationsAsInput: { some: {} } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, code: true, gemType: true, variety: true, weightCt: true },
    }),
  ]);

  const featuredId = sp.rough ?? roughsWithOutputs[0]?.id ?? transformations[0]?.inputs[0]?.roughStoneId;
  const featured = featuredId ? await buildRoughGenealogy(featuredId) : null;

  const options = roughsWithOutputs.map((r) => ({
    id: r.id,
    code: r.code,
    label: `${r.gemType}${r.variety ? ` · ${r.variety}` : ""} · ${formatCarat(Number(r.weightCt))}`,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3">
            <GitBranch className="h-7 w-7 text-sgs-purple-500" /> Gemstone genealogy
          </h1>
          <p className="text-sm text-muted-foreground">
            Every finished stone remembers the rough it came from — and every rough remembers what it became.
          </p>
        </div>
        <GenealogyPicker options={options} currentId={featuredId ?? undefined} />
      </div>

      {featured ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Featured lineage</CardTitle>
            <Link href={`/rough/${featured.id}`} className="text-xs text-sgs-teal-700 hover:underline">
              Open rough record →
            </Link>
          </CardHeader>
          <CardContent>
            <GenealogyTree root={featured} />
            <Legend />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-8 text-sm text-muted-foreground text-center">
            No rough stones have been cut yet. Register a cutting job to start tracing lineage.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Recent transformations</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {transformations.length === 0 && <div className="text-sm text-muted-foreground py-4">No transformations recorded yet.</div>}
          {transformations.map((t) => (
            <div key={t.id} className="py-3 flex items-center justify-between text-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-xs">{t.code}</span>
                <span className="text-muted-foreground">{formatDate(t.performedAt)}</span>
                <span className="text-muted-foreground">·</span>
                <span className="inline-flex items-center gap-1 flex-wrap">
                  {t.inputs.map((i) => (
                    <Link
                      key={i.id}
                      href={`/genealogy?rough=${i.roughStoneId}`}
                      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs hover:border-sgs-teal-500"
                    >
                      <Diamond className="h-3 w-3 text-sgs-teal-500" /><span className="font-mono">{i.roughStone.code}</span>
                    </Link>
                  ))}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="inline-flex items-center gap-1 flex-wrap">
                  {t.outputs.map((o) => (
                    <Link
                      key={o.id}
                      href={`/gemstones/${o.gemstoneId}`}
                      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs hover:border-sgs-purple-500"
                    >
                      <Gem className="h-3 w-3 text-sgs-purple-500" /><span className="font-mono">{o.gemstone.code}</span>
                    </Link>
                  ))}
                </span>
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {formatCarat(Number(t.totalInputWeightCt))} → {formatCarat(Number(t.totalOutputWeightCt))} · yield {Number(t.yieldPct).toFixed(1)}%
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
      <div className="inline-flex items-center gap-1.5"><Diamond className="h-3 w-3 text-sgs-teal-500" /> Rough stone</div>
      <div className="inline-flex items-center gap-1.5"><Gem className="h-3 w-3 text-sgs-purple-500" /> Finished gemstone</div>
      <div className="inline-flex items-center gap-1.5">
        <span className="inline-block w-4 h-0 border-t border-border" /> Yield event
      </div>
    </div>
  );
}
