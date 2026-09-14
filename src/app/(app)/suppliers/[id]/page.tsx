import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, Building2 } from "lucide-react";

export default async function SupplierDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("supplier:read");
  const { id } = await params;
  const s = await prisma.supplier.findUnique({
    where: { id },
    include: {
      parcels: { orderBy: { purchaseDate: "desc" } },
      roughStones: {
        orderBy: { purchaseDate: "desc" },
        include: { parcel: true },
      },
    },
  });
  if (!s) return notFound();

  const totalSpend = s.roughStones.reduce((sum, r) => sum + Number(r.purchasePrice), 0);
  const totalWeight = s.roughStones.reduce((sum, r) => sum + Number(r.weightCt), 0);
  const avgPerCt = totalWeight > 0 ? totalSpend / totalWeight : 0;

  return (
    <div className="space-y-6">
      <Link href="/suppliers" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to suppliers
      </Link>

      <div className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-lg bg-sgs-gradient text-white grid place-items-center">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs flex items-center gap-2">
              <Badge variant="teal">Supplier</Badge>
              <span className="font-mono text-xs">{s.code}</span>
            </div>
            <h1 className="font-serif text-3xl mt-1">{s.name}</h1>
            <div className="text-sm text-muted-foreground">
              {[s.city, s.country].filter(Boolean).join(", ") || "—"}
              {s.contact && ` · ${s.contact}`}
            </div>
          </div>
        </div>
        <div className="text-right space-y-1">
          <Stat label="Total spend" value={formatCurrency(totalSpend)} />
          <Stat label="Weight sourced" value={formatCarat(totalWeight)} />
          <Stat label="Avg per ct" value={formatCurrency(avgPerCt)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <KV label="Email" value={s.email ?? "—"} />
            <KV label="Phone" value={s.phone ?? "—"} />
            <KV label="Country" value={s.country ?? "—"} />
            <KV label="City" value={s.city ?? "—"} />
            <KV label="Notes" value={s.notes ?? "—"} span />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Volume</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <KV label="Parcels" value={String(s.parcels.length)} />
            <KV label="Rough stones" value={String(s.roughStones.length)} />
            <KV label="First purchase" value={formatDate(s.roughStones.at(-1)?.purchaseDate)} />
            <KV label="Latest purchase" value={formatDate(s.roughStones[0]?.purchaseDate)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Parcels</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parcel</TableHead>
                <TableHead>Purchased</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.parcels.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No parcels yet.</TableCell></TableRow>
              )}
              {s.parcels.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.code}</TableCell>
                  <TableCell>{formatDate(p.purchaseDate)}</TableCell>
                  <TableCell className="text-sm">{p.origin ?? "—"}</TableCell>
                  <TableCell className="text-right num">{formatCarat(Number(p.totalWeightCt))}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(p.totalCost), p.currency)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-md truncate">{p.notes ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rough stones</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rough</TableHead>
                <TableHead>Parcel</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.roughStones.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">No rough stones yet.</TableCell></TableRow>
              )}
              {s.roughStones.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/rough/${r.id}`} className="font-mono text-xs text-sgs-teal-700 hover:underline">{r.code}</Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.parcel?.code ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.gemType}{r.variety ? ` · ${r.variety}` : ""}</TableCell>
                  <TableCell className="text-sm">{r.origin ?? "—"}</TableCell>
                  <TableCell className="text-right num">{formatCarat(Number(r.weightCt))}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(r.purchasePrice), r.currency)}</TableCell>
                  <TableCell><Badge variant="muted">{r.status.replaceAll("_", " ")}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KV({ label, value, span = false }: { label: string; value: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-serif text-lg num">{value}</div>
    </div>
  );
}
