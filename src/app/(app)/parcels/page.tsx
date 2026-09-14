import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { PackageOpen, Plus } from "lucide-react";

export default async function ParcelsPage() {
  const session = await requireCapability("rough:read");
  const canWrite = can(session.user.role, "rough:write");
  const parcels = await prisma.parcel.findMany({
    orderBy: { purchaseDate: "desc" },
    include: { supplier: true, _count: { select: { roughStones: true } } },
  });
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><PackageOpen className="h-7 w-7 text-sgs-teal-500" /> Parcels</h1>
          <p className="text-sm text-muted-foreground">Rough purchases as they arrive from suppliers.</p>
        </div>
        {canWrite && (
          <Button asChild variant="accent"><Link href="/parcels/new"><Plus className="h-4 w-4" /> New parcel</Link></Button>
        )}
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parcel</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Purchased</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Total cost</TableHead>
                <TableHead className="text-right">Rough count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parcels.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.code}</TableCell>
                  <TableCell>{p.supplier?.name ?? "—"}</TableCell>
                  <TableCell>{formatDate(p.purchaseDate)}</TableCell>
                  <TableCell>{p.origin ?? "—"}</TableCell>
                  <TableCell className="text-right num">{formatCarat(Number(p.totalWeightCt))}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(p.totalCost), p.currency)}</TableCell>
                  <TableCell className="text-right">{p._count.roughStones}</TableCell>
                </TableRow>
              ))}
              {parcels.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">No parcels yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
