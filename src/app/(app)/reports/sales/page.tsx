import { requireCapability } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { HBarChart, compactCurrency } from "@/components/charts/bar-chart";
import { ColumnChart } from "@/components/charts/column-chart";
import { salesOverview } from "@/lib/reports";
import { ReportToolbar } from "../report-toolbar";

export default async function SalesReport() {
  await requireCapability("report:read");
  const d = await salesOverview();

  const monthly = d.byMonth.map((m) => ({
    label: m.month, value: m.revenue, secondary: m.paid,
  }));

  return (
    <div className="space-y-6">
      <ReportToolbar csvKind="sales" />
      <div>
        <h1 className="font-serif text-3xl">Sales report</h1>
        <p className="text-sm text-muted-foreground">Last 12 months. Tracks booked revenue and cash collected.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Orders" value={String(d.totals.orders)} />
        <Stat label="Revenue booked" value={formatCurrency(d.totals.revenue)} accent />
        <Stat label="Collected" value={formatCurrency(d.totals.paid)} />
        <Stat label="Outstanding" value={formatCurrency(d.totals.outstanding)} />
        <Stat label="Avg order value" value={formatCurrency(d.totals.avgOrderValue)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Revenue by month · cash collected (line)</CardTitle></CardHeader>
        <CardContent>
          <ColumnChart data={monthly} formatValue={compactCurrency("LKR")} secondaryLabel="Collected" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>By country</CardTitle></CardHeader>
          <CardContent>
            {d.byCountry.length === 0 ? <Empty /> : (
              <HBarChart data={d.byCountry.map((r) => ({ label: r.key, value: r.value }))} valueFormat={compactCurrency("LKR")} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>By gemstone type</CardTitle></CardHeader>
          <CardContent>
            {d.byGemType.length === 0 ? <Empty /> : (
              <HBarChart data={d.byGemType.map((r) => ({ label: r.key, value: r.value }))} valueFormat={compactCurrency("LKR")} accent="sgs-purple" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Top customers</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.byCustomer.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">No sales in the window.</TableCell></TableRow>
              )}
              {d.byCustomer.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{r.key}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(r.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Salesperson performance</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Salesperson</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Revenue booked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.bySalesperson.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">No attributed sales.</TableCell></TableRow>
              )}
              {d.bySalesperson.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{r.key}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(r.value)}</TableCell>
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
function Empty() {
  return <div className="text-sm text-muted-foreground">No sales data.</div>;
}
