import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { getExchangeRates } from "@/lib/money";
import { netPaidInOrderCurrency, toBaseStored } from "@/lib/sales-ledger";

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
  const rates = await getExchangeRates();
  // Headline figures cover live (non-cancelled) sales only, in LKR. Each sale's
  // paid amount is summed in that sale's own currency, never across currencies.
  const live = sales.filter((so) => so.status !== "CANCELLED");
  const paidIn = (so: (typeof sales)[number]) => netPaidInOrderCurrency(rates, so.payments, so.currency);
  const lkr = (so: (typeof sales)[number], amount: number) => toBaseStored(rates, amount, so.currency, so.fxRateLkr);
  const totalSales = live.reduce((s, so) => s + lkr(so, Number(so.agreedPrice)), 0);
  const totalCollected = live.reduce((s, so) => s + lkr(so, paidIn(so)), 0);
  const outstanding = live.reduce((s, so) => s + lkr(so, Number(so.totalAmount) - paidIn(so)), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-3"><Receipt className="h-7 w-7 text-sgs-purple-500" /> Sales</h1>
        <p className="text-sm text-muted-foreground">Confirmed deals, with invoicing and payments tracked here.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Sales" value={String(live.length)} />
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
                <TableRow><TableCell colSpan={9}>
                  <EmptyState
                    icon={Receipt}
                    title="No sales yet"
                    description={<>A sale is the final step in the funnel: an agreed price, a payment record, and (usually) a shipment. Confirm a reservation into a sale, or record a direct sale from a stone&apos;s detail page.</>}
                    secondary={{ label: "Go to reservations", href: "/reservations" }}
                  />
                </TableCell></TableRow>
              )}
              {sales.map((s) => {
                const paid = paidIn(s);
                const remaining = s.status === "CANCELLED" ? 0 : Number(s.totalAmount) - paid;
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
