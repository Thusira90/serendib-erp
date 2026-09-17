import { requireCapability } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCarat, formatCurrency } from "@/lib/utils";
import { HBarChart, compactCurrency } from "@/components/charts/bar-chart";
import { inventoryOverview } from "@/lib/reports";
import { ReportToolbar } from "../report-toolbar";

export default async function InventoryReport() {
  await requireCapability("report:read");
  const d = await inventoryOverview();

  return (
    <div className="space-y-6">
      <ReportToolbar csvKind="inventory" />
      <div>
        <h1 className="font-serif text-3xl">Inventory report</h1>
        <p className="text-sm text-muted-foreground">A single-page picture of what's in the vault and what it's worth.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Rough pieces" value={String(d.totals.roughCount)} />
        <Stat label="Rough weight" value={formatCarat(d.totals.roughWeight)} />
        <Stat label="Rough acquisition" value={formatCurrency(d.totals.roughCost)} />
        <Stat label="Finished true cost" value={formatCurrency(d.totals.gemTrueCost)} />
        <Stat label="Finished pieces" value={String(d.totals.gemCount)} />
        <Stat label="Finished weight" value={formatCarat(d.totals.gemWeight)} />
        <Stat label="Asking value" value={formatCurrency(d.totals.gemAskingTotal)} accent />
        <Stat label="Potential margin" value={formatCurrency(d.totals.gemAskingTotal - d.totals.gemTrueCost)} accent />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Rough by origin (acquisition value)</CardTitle></CardHeader>
          <CardContent>
            {d.roughByOrigin.length === 0 ? (
              <div className="text-sm text-muted-foreground">No rough data.</div>
            ) : (
              <HBarChart
                data={d.roughByOrigin.map((r) => ({ label: r.key, value: r.value }))}
                valueFormat={compactCurrency("LKR")}
                accent="sgs-teal"
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Finished by origin (asking value)</CardTitle></CardHeader>
          <CardContent>
            {d.gemByOrigin.length === 0 ? (
              <div className="text-sm text-muted-foreground">No finished data.</div>
            ) : (
              <HBarChart
                data={d.gemByOrigin.map((r) => ({ label: r.key, value: r.asking }))}
                valueFormat={compactCurrency("LKR")}
                accent="sgs-purple"
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Rough by gem type</CardTitle></CardHeader>
          <CardContent>
            {d.roughByType.length === 0 ? (
              <div className="text-sm text-muted-foreground">No rough data.</div>
            ) : (
              <HBarChart
                data={d.roughByType.map((r) => ({ label: r.key, value: r.value }))}
                valueFormat={compactCurrency("LKR")}
                accent="sgs-teal"
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Finished by gem type (asking)</CardTitle></CardHeader>
          <CardContent>
            {d.gemByType.length === 0 ? (
              <div className="text-sm text-muted-foreground">No finished data.</div>
            ) : (
              <HBarChart
                data={d.gemByType.map((r) => ({ label: r.key, value: r.asking }))}
                valueFormat={compactCurrency("LKR")}
                accent="sgs-purple"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Finished inventory by status</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">True cost</TableHead>
                <TableHead className="text-right">Asking</TableHead>
                <TableHead className="text-right">Potential margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.gemByStatus.map((s) => (
                <TableRow key={s.key}>
                  <TableCell><Badge variant="muted">{s.key.replaceAll("_", " ")}</Badge></TableCell>
                  <TableCell className="text-right">{s.count}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(s.cost)}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(s.asking)}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(s.asking - s.cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Finished inventory age</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <AgeTile label="≤ 30 days"    value={d.aging["0-30"]} accent="sgs-teal" />
            <AgeTile label="30–90 days"   value={d.aging["30-90"]} accent="sgs-teal" />
            <AgeTile label="90–180 days"  value={d.aging["90-180"]} accent="sgs-purple" />
            <AgeTile label="180+ days"    value={d.aging["180+"]} accent="sgs-purple" />
          </div>
          <div className="text-xs text-muted-foreground mt-3">
            Stones sitting past 180 days may need re-pricing, re-photography, or a targeted push to a matching customer.
          </div>
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

function AgeTile({ label, value, accent }: { label: string; value: number; accent: "sgs-teal" | "sgs-purple" }) {
  const bg = accent === "sgs-teal" ? "bg-sgs-teal-50" : "bg-sgs-purple-50";
  return (
    <div className={`rounded-md ${bg} p-4`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-serif text-2xl num mt-1">{value}</div>
    </div>
  );
}
