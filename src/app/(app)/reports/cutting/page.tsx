import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCarat, formatCurrency, formatPercent } from "@/lib/utils";
import { HBarChart, compactCurrency } from "@/components/charts/bar-chart";
import { cuttingOverview } from "@/lib/reports";
import { ReportToolbar } from "../report-toolbar";

export default async function CuttingReport() {
  await requireCapability("report:read");
  const d = await cuttingOverview();
  return (
    <div className="space-y-6">
      <ReportToolbar csvKind="cutting" />
      <div>
        <h1 className="font-serif text-3xl">Cutting performance</h1>
        <p className="text-sm text-muted-foreground">Yield, cost, and throughput across cutters.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Jobs" value={String(d.totals.jobs)} />
        <Stat label="Completed" value={String(d.totals.completed)} />
        <Stat label="Overall yield" value={formatPercent(d.totals.overallYield)} accent />
        <Stat label="Overall waste" value={formatCarat(d.totals.totalWaste)} />
        <Stat label="Rough input" value={formatCarat(d.totals.totalInputWeight)} />
        <Stat label="Finished output" value={formatCarat(d.totals.totalOutputWeight)} />
        <Stat label="Total cutting cost" value={formatCurrency(d.totals.totalCuttingCost)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Yield by cutter</CardTitle></CardHeader>
          <CardContent>
            {d.cutters.length === 0 ? <div className="text-sm text-muted-foreground">No cutting data.</div> : (
              <HBarChart
                data={d.cutters.map((c) => ({ label: c.name, value: c.yieldPct * 100 }))}
                valueFormat={(v) => `${v.toFixed(1)}%`}
                accent="sgs-teal"
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cost by cutter</CardTitle></CardHeader>
          <CardContent>
            {d.cutters.length === 0 ? <div className="text-sm text-muted-foreground">No cutting data.</div> : (
              <HBarChart
                data={d.cutters.map((c) => ({ label: c.name, value: c.totalCost }))}
                valueFormat={compactCurrency("USD")}
                accent="sgs-purple"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Cutter productivity</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cutter</TableHead>
                <TableHead className="text-right">Jobs</TableHead>
                <TableHead className="text-right">Completed</TableHead>
                <TableHead className="text-right">Input</TableHead>
                <TableHead className="text-right">Output</TableHead>
                <TableHead className="text-right">Yield %</TableHead>
                <TableHead className="text-right">Avg duration</TableHead>
                <TableHead className="text-right">Total cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.cutters.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">No cutting jobs recorded.</TableCell></TableRow>
              )}
              {d.cutters.map((c) => (
                <TableRow key={c.name}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="text-right">{c.jobs}</TableCell>
                  <TableCell className="text-right">{c.completed}</TableCell>
                  <TableCell className="text-right num">{formatCarat(c.inputWeight)}</TableCell>
                  <TableCell className="text-right num">{formatCarat(c.outputWeight)}</TableCell>
                  <TableCell className="text-right num">{formatPercent(c.yieldPct)}</TableCell>
                  <TableCell className="text-right num">{c.avgDurationDays > 0 ? `${c.avgDurationDays.toFixed(1)} d` : "—"}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(c.totalCost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Job register</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Cutter</TableHead>
                <TableHead>Rough</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Expected yield</TableHead>
                <TableHead className="text-right">Actual yield</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="font-mono text-xs">{j.code}</TableCell>
                  <TableCell>{j.cutter?.name ?? "—"}</TableCell>
                  <TableCell><Link href={`/rough/${j.roughStoneId}`} className="font-mono text-xs text-sgs-teal-700 hover:underline">{j.roughStone.code}</Link></TableCell>
                  <TableCell><Badge variant="muted">{j.status.replaceAll("_", " ")}</Badge></TableCell>
                  <TableCell className="text-right num">{j.expectedYieldPct != null ? `${Number(j.expectedYieldPct).toFixed(1)}%` : "—"}</TableCell>
                  <TableCell className="text-right num">{j.actualYieldPct != null ? `${Number(j.actualYieldPct).toFixed(1)}%` : "—"}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(j.cuttingCost) + Number(j.laborCost) + Number(j.machineCost))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-serif text-2xl num mt-1 ${accent ? "text-sgs-purple-600" : ""}`}>{value}</div>
    </CardContent></Card>
  );
}
