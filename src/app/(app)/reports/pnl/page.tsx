import { requireCapability } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { HBarChart, compactCurrency } from "@/components/charts/bar-chart";
import { pnlForLast12Months } from "@/lib/pnl";
import { ReportToolbar } from "../report-toolbar";

export default async function PnlReport() {
  await requireCapability("report:read");
  const p = await pnlForLast12Months();

  const t = p.totals;
  const grossMargin = t.revenue > 0 ? t.grossProfit / t.revenue : 0;
  const netMargin = t.revenue > 0 ? t.netIncome / t.revenue : 0;

  return (
    <div className="space-y-6">
      <ReportToolbar csvKind="pnl" />
      <div>
        <h1 className="font-serif text-3xl">Profit &amp; loss</h1>
        <p className="text-sm text-muted-foreground">Rolling 12 months. Revenue less allocated COGS less operating expenses.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Revenue" value={formatCurrency(t.revenue)} />
        <Stat label="COGS" value={formatCurrency(t.cogs)} />
        <Stat label="Gross profit" value={formatCurrency(t.grossProfit)} accent={t.grossProfit >= 0} />
        <Stat label="Operating expenses" value={formatCurrency(t.opex)} />
        <Stat label="Net income" value={formatCurrency(t.netIncome)} accent={t.netIncome >= 0} danger={t.netIncome < 0} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Gross margin" value={formatPercent(grossMargin)} />
        <Stat label="Net margin" value={formatPercent(netMargin)} accent={netMargin >= 0} danger={netMargin < 0} />
      </div>

      <Card>
        <CardHeader><CardTitle>Month-by-month</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Gross profit</TableHead>
                <TableHead className="text-right">Opex</TableHead>
                <TableHead className="text-right">Net income</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell>{m.month}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(m.revenue)}</TableCell>
                  <TableCell className="text-right num text-muted-foreground">{formatCurrency(m.cogs)}</TableCell>
                  <TableCell className={`text-right num ${m.grossProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(m.grossProfit)}</TableCell>
                  <TableCell className="text-right num text-muted-foreground">{formatCurrency(m.opex)}</TableCell>
                  <TableCell className={`text-right num font-medium ${m.netIncome >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(m.netIncome)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-secondary/40 font-medium">
                <TableCell>Total</TableCell>
                <TableCell className="text-right num">{formatCurrency(t.revenue)}</TableCell>
                <TableCell className="text-right num">{formatCurrency(t.cogs)}</TableCell>
                <TableCell className={`text-right num ${t.grossProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(t.grossProfit)}</TableCell>
                <TableCell className="text-right num">{formatCurrency(t.opex)}</TableCell>
                <TableCell className={`text-right num ${t.netIncome >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(t.netIncome)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Operating expenses by category</CardTitle></CardHeader>
          <CardContent>
            {p.opexByCategory.length === 0 ? (
              <div className="text-sm text-muted-foreground">No operating expenses in the window.</div>
            ) : (
              <HBarChart data={p.opexByCategory.map((r) => ({ label: r.key, value: r.value }))} valueFormat={compactCurrency("USD")} accent="sgs-purple" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Revenue by country</CardTitle></CardHeader>
          <CardContent>
            {p.revenueByCountry.length === 0 ? (
              <div className="text-sm text-muted-foreground">No revenue yet.</div>
            ) : (
              <HBarChart data={p.revenueByCountry.map((r) => ({ label: r.key, value: r.value }))} valueFormat={compactCurrency("USD")} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = false, danger = false }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-serif text-2xl num mt-1 ${danger ? "text-red-700" : accent ? "text-sgs-purple-600" : ""}`}>{value}</div>
    </CardContent></Card>
  );
}
