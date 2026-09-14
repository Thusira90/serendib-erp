import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2 } from "lucide-react";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { importSuppliersFromCsv } from "./actions";
import { NewSupplierButton } from "./new-supplier-button";

export default async function SuppliersPage() {
  const session = await requireCapability("supplier:read");
  const canWrite = can(session.user.role, "supplier:write");
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { parcels: true, roughStones: true } } },
  });
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><Building2 className="h-7 w-7 text-sgs-teal-500" /> Suppliers</h1>
          <p className="text-sm text-muted-foreground">Sources of rough gemstones.</p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <CsvImportDialog
              label="Import CSV"
              title="Import suppliers"
              templateFilename="suppliers-template.csv"
              columns={["name","code","country","city","contact","email","phone","notes"]}
              sample={[
                ["Ratnapura Rough Traders","","Sri Lanka","Ratnapura","Sarath Bandara","sarath@example.lk","+94 45 200 0000",""],
                ["Mogok Rough Imports","","Myanmar","Mogok","Zaw Min","zaw@example.mm","+95 9 000 0000","introduced 2024"],
              ]}
              importAction={importSuppliersFromCsv}
            />
            <NewSupplierButton />
          </div>
        )}
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Parcels</TableHead>
                <TableHead className="text-right">Rough stones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/suppliers/${s.id}`} className="text-sgs-teal-700 hover:underline">{s.code}</Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/suppliers/${s.id}`} className="hover:text-sgs-teal-700">{s.name}</Link>
                  </TableCell>
                  <TableCell>{s.country ?? "—"}</TableCell>
                  <TableCell>{s.city ?? "—"}</TableCell>
                  <TableCell>{s.contact ?? "—"}</TableCell>
                  <TableCell className="text-right">{s._count.parcels}</TableCell>
                  <TableCell className="text-right">{s._count.roughStones}</TableCell>
                </TableRow>
              ))}
              {suppliers.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">No suppliers yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
