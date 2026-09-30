import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { Scissors, Diamond, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function CuttingPage() {
  await requireCapability("cutting:read");
  const jobs = await prisma.cuttingJob.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      roughStone: true,
      cutter: true,
      transformation: {
        include: { outputs: { include: { gemstone: { select: { id: true, code: true } } } } },
      },
    },
  });
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><Scissors className="h-7 w-7 text-sgs-purple-500" /> Cutting jobs</h1>
          <p className="text-sm text-muted-foreground">Every lapidary operation is a permanent record with its own yield.</p>
        </div>
        <Button asChild variant="accent">
          <Link href="/rough"><Diamond className="h-4 w-4" /> Start a cutting job from a rough</Link>
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Rough</TableHead>
                <TableHead>Cutter</TableHead>
                <TableHead>Planned cut</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead className="text-right">Total cost</TableHead>
                <TableHead className="text-right">Yield</TableHead>
                <TableHead>Yielded gems</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => {
                const cost = Number(j.cuttingCost) + Number(j.laborCost) + Number(j.machineCost);
                return (
                  <TableRow key={j.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/cutting/${j.id}`} className="text-sgs-teal-700 hover:underline">{j.code}</Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/rough/${j.roughStoneId}`} className="text-sgs-teal-700 hover:underline font-mono text-xs">{j.roughStone.code}</Link>
                      <div className="text-xs text-muted-foreground">{j.roughStone.gemType} · {formatCarat(Number(j.roughStone.weightCt))}</div>
                    </TableCell>
                    <TableCell className="text-sm">{j.cutter?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{j.plannedCut ?? "—"}</TableCell>
                    <TableCell className="text-xs">{formatDate(j.startedAt)}</TableCell>
                    <TableCell className="text-xs">{formatDate(j.completedAt)}</TableCell>
                    <TableCell className="text-right num">{formatCurrency(cost, j.currency)}</TableCell>
                    <TableCell className="text-right num">{j.actualYieldPct ? `${Number(j.actualYieldPct).toFixed(1)}%` : "—"}</TableCell>
                    <TableCell className="text-xs">
                      {j.transformation?.outputs.length
                        ? j.transformation.outputs.map((o, i) => (
                            <span key={o.id}>
                              {i > 0 && ", "}
                              <Link href={`/gemstones/${o.gemstone.id}`} className="font-mono text-sgs-teal-700 hover:underline">{o.gemstone.code}</Link>
                            </span>
                          ))
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell><StatusBadge status={j.status} kind="cuttingJob" /></TableCell>
                  </TableRow>
                );
              })}
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12">
                    <div className="mx-auto max-w-md space-y-3">
                      <Scissors className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                      <div className="font-serif text-lg">No cutting jobs yet</div>
                      <div className="text-sm text-muted-foreground">
                        A cutting job always starts from a rough stone. Open the rough you want to cut
                        and use <span className="font-medium">Start cutting</span> on its Cutting tab —
                        yields, output stones and cost allocation are created together and the rough&apos;s
                        genealogy updates automatically.
                      </div>
                      <div>
                        <Button asChild variant="outline" size="sm">
                          <Link href="/rough">Choose a rough stone <ArrowRight className="h-3 w-3" /></Link>
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
