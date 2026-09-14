import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { NewQuotationButton } from "./new-quotation-button";
import { FileText } from "lucide-react";

const statusVariant: Record<string, "muted" | "teal" | "warning" | "success" | "danger" | "purple"> = {
  DRAFT: "muted", SENT: "teal", ACCEPTED: "success", DECLINED: "danger", EXPIRED: "warning",
};

export default async function QuotationsPage() {
  const session = await requireCapability("quotation:read");
  const canWrite = can(session.user.role, "quotation:write");
  const [quotations, customers, gemstones] = await Promise.all([
    prisma.quotation.findMany({ orderBy: { createdAt: "desc" }, include: { customer: true, gemstone: true } }),
    prisma.customer.findMany({ orderBy: { displayName: "asc" } }),
    prisma.gemstone.findMany({ where: { status: { in: ["AVAILABLE","IN_PROGRESS"] } }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><FileText className="h-7 w-7 text-sgs-purple-500" /> Quotations</h1>
          <p className="text-sm text-muted-foreground">Every price offered to a customer, printable and preserved.</p>
        </div>
        {canWrite && <NewQuotationButton
          customers={customers.map(c => ({ id: c.id, code: c.code, displayName: c.displayName }))}
          gemstones={gemstones.map(g => ({ id: g.id, code: g.code, gemType: g.gemType, variety: g.variety, askingPrice: g.askingPrice ? Number(g.askingPrice) : null, currency: g.currency }))}
        />}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Q #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Gemstone</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Valid until</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">No quotations yet.</TableCell></TableRow>
              )}
              {quotations.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/quotations/${q.id}`} className="text-sgs-teal-700 hover:underline">{q.code}</Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/customers/${q.customerId}`} className="text-sgs-teal-700 hover:underline">{q.customer.displayName}</Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/gemstones/${q.gemstoneId}`} className="text-sgs-teal-700 hover:underline font-mono text-xs">{q.gemstone.code}</Link>
                    <div className="text-xs text-muted-foreground">{q.gemstone.gemType}{q.gemstone.variety ? ` · ${q.gemstone.variety}` : ""}</div>
                  </TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(q.price), q.currency)}</TableCell>
                  <TableCell className="text-xs">{formatDate(q.validUntil)}</TableCell>
                  <TableCell><Badge variant={statusVariant[q.status] ?? "muted"}>{q.status}</Badge></TableCell>
                  <TableCell className="text-xs">{formatDate(q.sentAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
