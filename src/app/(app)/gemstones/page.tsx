import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCarat, formatCurrency } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { Gem, Plus } from "lucide-react";

export default async function GemstoneListPage() {
  const session = await requireCapability("gemstone:read");
  const canWrite = can(session.user.role, "gemstone:write");
  const gems = await prisma.gemstone.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      location: true,
      transformationsAsOutput: { include: { transformation: { include: { inputs: { include: { roughStone: true } } } } } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><Gem className="h-7 w-7 text-sgs-purple-500" /> Finished Gemstones</h1>
          <p className="text-sm text-muted-foreground">Each stone carries its lineage, cost and price history forever.</p>
        </div>
        {canWrite && (
          <Button asChild variant="accent"><Link href="/gemstones/new"><Plus className="h-4 w-4" /> Register gemstone</Link></Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {gems.map((g) => {
          const parents = g.transformationsAsOutput.flatMap((o) => o.transformation.inputs.map((i) => i.roughStone.code));
          const margin = g.askingPrice != null ? Number(g.askingPrice) - Number(g.totalCost) : null;
          return (
            <Link key={g.id} href={`/gemstones/${g.id}`}>
              <Card className="hover:shadow-luxe-lg transition-shadow overflow-hidden">
                <div className="h-28 bg-sgs-gradient relative">
                  <div className="absolute top-3 right-3"><StatusBadge status={g.status} kind="gemstone" /></div>
                  <div className="absolute bottom-3 left-4 text-white">
                    <div className="text-[10px] uppercase tracking-widest opacity-80">{g.gemType}{g.variety ? ` · ${g.variety}` : ""}</div>
                    <div className="font-serif text-2xl leading-tight">{formatCarat(Number(g.weightCt))}</div>
                  </div>
                </div>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-sgs-teal-700">{g.code}</span>
                    {g.origin && <Badge variant="teal">{g.origin}</Badge>}
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Asking</span>
                    <span className="num font-medium">{g.askingPrice ? formatCurrency(Number(g.askingPrice), g.currency) : "—"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">True cost</span>
                    <span className="num">{formatCurrency(Number(g.totalCost), g.currency)}</span>
                  </div>
                  {margin != null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Est. margin</span>
                      <span className={`num font-medium ${margin >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(margin, g.currency)}</span>
                    </div>
                  )}
                  {parents.length > 0 && (
                    <div className="text-[10px] text-muted-foreground pt-2 border-t">
                      From {parents.slice(0, 2).map((p) => <span key={p} className="font-mono">{p}</span>).reduce<React.ReactNode[]>((acc, el, i) => acc.length ? [...acc, ", ", el] : [el], [])}
                      {parents.length > 2 && ` +${parents.length - 2}`}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {gems.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-12">No finished gemstones yet. Complete a cutting job to see one here.</div>
        )}
      </div>
    </div>
  );
}
