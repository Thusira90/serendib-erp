import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { Plus, Diamond } from "lucide-react";

export default async function RoughListPage() {
  const session = await requireCapability("rough:read");
  const rough = await prisma.roughStone.findMany({
    orderBy: { createdAt: "desc" },
    include: { supplier: true, location: true, parcel: true, _count: { select: { transformationsAsInput: true } } },
  });
  const canWrite = can(session.user.role, "rough:write");

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><Diamond className="h-7 w-7 text-sgs-teal-500" /> Rough Stones</h1>
          <p className="text-sm text-muted-foreground">Every rough acquisition, permanent record.</p>
        </div>
        {canWrite && (
          <Button asChild variant="accent"><Link href="/rough/new"><Plus className="h-4 w-4" /> New rough stone</Link></Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total pieces" value={String(rough.length)} />
        <StatCard label="Total weight" value={formatCarat(rough.reduce((s, r) => s + Number(r.weightCt), 0))} />
        <StatCard label="Acquisition value" value={formatCurrency(rough.reduce((s, r) => s + Number(r.purchasePrice), 0))} />
        <StatCard label="Available" value={String(rough.filter(r => r.status === "AVAILABLE").length)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rough ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Yielded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rough.map((r) => (
                <TableRow key={r.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/rough/${r.id}`} className="font-mono text-xs text-sgs-teal-700 hover:underline">{r.code}</Link>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{r.gemType}</div>
                    {r.variety && <div className="text-xs text-muted-foreground">{r.variety}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{r.origin ?? "—"}</TableCell>
                  <TableCell className="text-right num">{formatCarat(Number(r.weightCt))}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(r.purchasePrice), r.currency)}</TableCell>
                  <TableCell className="text-sm">{r.supplier?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.location?.name ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={r.status} kind="rough" /></TableCell>
                  <TableCell className="text-right">
                    {r._count.transformationsAsInput > 0 ? <Badge variant="purple">{r._count.transformationsAsInput}</Badge> : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                </TableRow>
              ))}
              {rough.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">
                    No rough stones yet.{canWrite && <> <Link href="/rough/new" className="text-sgs-teal-700 hover:underline">Register the first one →</Link></>}
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-serif text-2xl num mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
