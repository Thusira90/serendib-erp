import { requireCapability } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCarat, formatCurrency, formatPercent } from "@/lib/utils";
import { HBarChart, compactCurrency } from "@/components/charts/bar-chart";
import { profitabilityOverview } from "@/lib/reports";
import { ReportToolbar } from "../report-toolbar";

export default async function ProfitabilityReport() {
  await requireCapability("report:read");
  const d = await profitabilityOverview();

  return (
    <div className="space-y-6">
      <ReportToolbar csvKind="profitability" />
      <div>
        <h1 className="font-serif text-3xl">Profitability</h1>
        <p className="text-sm text-muted-foreground">Realized profit on closed sales plus projected profit sitting in inventory.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Realized revenue" value={formatCurrency(d.totals.realizedRevenue)} />
        <Stat label="Realized true cost" value={formatCurrency(d.totals.realizedCost)} />
        <Stat label="Realized profit" value={formatCurrency(d.totals.realizedProfit)} accent />
        <Stat label="Overall margin" value={formatPercent(d.totals.overallMargin)} accent />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Realized profit by variety</CardTitle></CardHeader>
          <CardContent>
            {d.byVariety.length === 0 ? (
              <div className="text-sm text-muted-foreground">No closed sales yet.</div>
            ) : (
              <HBarChart
                data={d.byVariety.map((r) => ({ label: r.key, value: r.value }))}
                valueFormat={compactCurrency("USD")}
                accent="sgs-purple"
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top projected profit in inventory</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gemstone</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Asking</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Projected profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.potential.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No priced inventory.</TableCell></TableRow>
                )}
                {d.potential.map((p) => (
                  <TableRow key={p.code}>
                    <TableCell>
                      <div className="text-xs font-mono">{p.code}</div>
                      <div className="text-xs text-muted-foreground">{p.label}</div>
                    </TableCell>
                    <TableCell className="text-right num">{formatCarat(p.weightCt)}</TableCell>
                    <TableCell className="text-right num">{formatCurrency(p.asking)}</TableCell>
                    <TableCell className="text-right num">{formatCurrency(p.cost)}</TableCell>
                    <TableCell className={`text-right num font-medium ${p.projectedProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(p.projectedProfit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Realized deals — profit ranked</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sale</TableHead>
                <TableHead>Gemstone</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.perStone.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">No closed sales yet.</TableCell></TableRow>
              )}
              {d.perStone.map((r) => (
                <TableRow key={r.salesOrderCode}>
                  <TableCell className="font-mono text-xs">{r.salesOrderCode}</TableCell>
                  <TableCell>
                    <div className="text-xs font-mono">{r.gemstoneCode}</div>
                    <div className="text-xs text-muted-foreground">{r.gemType}{r.variety ? ` · ${r.variety}` : ""}</div>
                  </TableCell>
                  <TableCell>{r.customer}</TableCell>
                  <TableCell className="text-right num">{formatCarat(r.weightCt)}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(r.revenue, r.currency)}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(r.cost, r.currency)}</TableCell>
                  <TableCell className={`text-right num font-medium ${r.profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(r.profit, r.currency)}</TableCell>
                  <TableCell className="text-right num">{formatPercent(r.margin)}</TableCell>
                  <TableCell className="text-right num">{formatPercent(r.roi)}</TableCell>
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
