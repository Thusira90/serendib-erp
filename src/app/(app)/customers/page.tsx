import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Users2 } from "lucide-react";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { importCustomersFromCsv } from "./import-actions";

const kindLabel: Record<string, string> = { INDIVIDUAL: "Individual", COMPANY: "Company" };
const typeLabel: Record<string, string> = {
  COLLECTOR: "Collector", JEWELLER: "Jeweller", JEWELLERY_BRAND: "Jewelry Brand",
  DEALER: "Dealer", RETAILER: "Retailer", WHOLESALER: "Wholesaler",
  PRIVATE_BUYER: "Private Buyer", INTERNATIONAL_BUYER: "International Buyer",
};

export default async function CustomersPage() {
  const session = await requireCapability("customer:read");
  const canWrite = can(session.user.role, "customer:write");
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { enquiries: true, quotations: true, reservations: true, salesOrders: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><Users2 className="h-7 w-7 text-sgs-teal-500" /> Customers</h1>
          <p className="text-sm text-muted-foreground">The people and houses who buy from us.</p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <CsvImportDialog
              label="Import CSV"
              title="Import customers"
              templateFilename="customers-template.csv"
              columns={["displayName","kind","type","companyName","country","city","addressLine","email","phone","website","socialProfile","notes"]}
              sample={[
                ["James Chen","INDIVIDUAL","PRIVATE_BUYER","","Singapore","Singapore","","james.chen@example.com","+65 9000 1234","","",""],
                ["Maison Aurel","COMPANY","JEWELLERY_BRAND","Maison Aurel SA","France","Paris","1 rue Cambon","sourcing@maison-aurel.example","+33 1 42 00 00 00","https://maison-aurel.example","",""],
              ]}
              importAction={importCustomersFromCsv}
            />
            <Button asChild variant="accent"><Link href="/customers/new"><Plus className="h-4 w-4" /> New customer</Link></Button>
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
                <TableHead>Type</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Enq</TableHead>
                <TableHead className="text-right">Quot</TableHead>
                <TableHead className="text-right">Res</TableHead>
                <TableHead className="text-right">Sales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">
                  No customers yet.{canWrite && <> <Link href="/customers/new" className="text-sgs-teal-700 hover:underline">Add the first one →</Link></>}
                </TableCell></TableRow>
              )}
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/customers/${c.id}`} className="text-sgs-teal-700 hover:underline">{c.code}</Link>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{c.displayName}</div>
                    {c.companyName && <div className="text-xs text-muted-foreground">{c.companyName}</div>}
                  </TableCell>
                  <TableCell><Badge variant="teal">{typeLabel[c.type]}</Badge></TableCell>
                  <TableCell className="text-sm">{[c.city, c.country].filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {c.email && <div>{c.email}</div>}
                    {c.phone && <div className="text-muted-foreground">{c.phone}</div>}
                  </TableCell>
                  <TableCell className="text-right">{c._count.enquiries}</TableCell>
                  <TableCell className="text-right">{c._count.quotations}</TableCell>
                  <TableCell className="text-right">{c._count.reservations}</TableCell>
                  <TableCell className="text-right">{c._count.salesOrders}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
