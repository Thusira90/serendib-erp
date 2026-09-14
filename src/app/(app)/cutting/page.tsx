import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { Scissors } from "lucide-react";

export default async function CuttingPage() {
  await requireCapability("cutting:read");
  const jobs = await prisma.cuttingJob.findMany({
    orderBy: { createdAt: "desc" },
    include: { roughStone: true, cutter: true, transformation: true },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-3"><Scissors className="h-7 w-7 text-sgs-purple-500" /> Cutting jobs</h1>
        <p className="text-sm text-muted-foreground">Every lapidary operation is a permanent record with its own yield.</p>
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
                    <TableCell><StatusBadge status={j.status} kind="cuttingJob" /></TableCell>
                  </TableRow>
                );
              })}
              {jobs.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">No cutting jobs yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
