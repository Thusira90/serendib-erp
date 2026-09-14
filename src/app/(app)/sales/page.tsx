import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Receipt } from "lucide-react";

const statusVariant: Record<string, "muted" | "teal" | "warning" | "success" | "danger" | "purple"> = {
  DRAFT: "muted", CONFIRMED: "teal", INVOICED: "teal",
  PARTIAL: "warning", PAID: "success", CANCELLED: "danger",
  SHIPPED: "purple", DELIVERED: "success",
};

export default async function SalesPage() {
  await requireCapability("sale:read");
  const sales = await prisma.salesOrder.findMany({
    orderBy: { saleDate: "desc" },
    include: {
      customer: true, gemstone: true,
      payments: true,
    },
  });
  const totalSales = sales.reduce((s, so) => s + Number(so.totalAmount), 0);
  const totalCollected = sales.reduce((s, so) => s + so.payments.reduce((a, p) => a + Number(p.amount), 0), 0);
  const outstanding = totalSales - totalCollected;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-3"><Receipt className="h-7 w-7 text-sgs-purple-500" /> Sales</h1>
        <p className="text-sm text-muted-foreground">Confirmed deals, with invoicing and payments tracked here.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Sales" value={String(sales.length)} />
        <Stat label="Revenue booked" value={formatCurrency(totalSales)} />
        <Stat label="Collected" value={formatCurrency(totalCollected)} />
        <Stat label="Outstanding" value={formatCurrency(outstanding)} accent={outstanding > 0} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SO #</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Gemstone</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Sale date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">No sales yet.</TableCell></TableRow>
              )}
              {sales.map((s) => {
                const paid = s.payments.reduce((a, p) => a + Number(p.amount), 0);
                const remaining = Number(s.totalAmount) - paid;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/sales/${s.id}`} className="text-sgs-teal-700 hover:underline">{s.code}</Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.invoiceNumber}</TableCell>
                    <TableCell>
                      <Link href={`/customers/${s.customerId}`} className="text-sgs-teal-700 hover:underline">{s.customer.displayName}</Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/gemstones/${s.gemstoneId}`} className="font-mono text-xs text-sgs-teal-700 hover:underline">{s.gemstone.code}</Link>
                    </TableCell>
                    <TableCell className="text-right num">{formatCurrency(Number(s.totalAmount), s.currency)}</TableCell>
                    <TableCell className="text-right num">{formatCurrency(paid, s.currency)}</TableCell>
                    <TableCell className={`text-right num ${remaining > 0 ? "text-sgs-purple-600" : "text-muted-foreground"}`}>{formatCurrency(remaining, s.currency)}</TableCell>
                    <TableCell className="text-xs">{formatDate(s.saleDate)}</TableCell>
                    <TableCell><Badge variant={statusVariant[s.status] ?? "muted"}>{s.status}</Badge></TableCell>
                  </TableRow>
                );
              })}
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
