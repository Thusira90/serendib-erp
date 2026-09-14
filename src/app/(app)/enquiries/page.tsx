import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { NewEnquiryButton } from "./new-enquiry-button";
import { QuickQuoteButton } from "./quick-quote-button";
import { Mail } from "lucide-react";
import { getCompanySettings } from "@/lib/company-settings";

const statusVariant: Record<string, "muted" | "teal" | "warning" | "success" | "danger" | "purple"> = {
  NEW: "teal", CONTACTED: "muted", QUOTED: "purple",
  NEGOTIATING: "warning", RESERVED: "warning", WON: "success", LOST: "danger",
};

export default async function EnquiriesPage() {
  const session = await requireCapability("enquiry:read");
  const canWrite = can(session.user.role, "enquiry:write");
  const canQuote = can(session.user.role, "quotation:write");
  const [enquiries, customers, gemstones, company] = await Promise.all([
    prisma.enquiry.findMany({
      orderBy: { createdAt: "desc" },
      include: { customer: true, gemstone: true },
    }),
    prisma.customer.findMany({ orderBy: { displayName: "asc" } }),
    prisma.gemstone.findMany({ where: { status: { in: ["AVAILABLE","IN_PROGRESS","RESERVED"] } }, orderBy: { createdAt: "desc" }, take: 200 }),
    getCompanySettings(),
  ]);
  const availableGems = gemstones.map(g => ({
    id: g.id, code: g.code, gemType: g.gemType, variety: g.variety,
    askingPrice: g.askingPrice ? Number(g.askingPrice) : null,
    currency: g.currency,
  }));
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><Mail className="h-7 w-7 text-sgs-teal-500" /> Enquiries</h1>
          <p className="text-sm text-muted-foreground">Every inbound interest, tracked through to the sale.</p>
        </div>
        {canWrite && <NewEnquiryButton
          customers={customers.map(c => ({ id: c.id, code: c.code, displayName: c.displayName }))}
          gemstones={gemstones.map(g => ({ id: g.id, code: g.code, gemType: g.gemType, variety: g.variety }))}
        />}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Enq ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Gemstone</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Follow-up</TableHead>
                <TableHead>Status</TableHead>
                {canQuote && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {enquiries.length === 0 && (
                <TableRow><TableCell colSpan={canQuote ? 8 : 7} className="text-center text-sm text-muted-foreground py-10">No enquiries yet.</TableCell></TableRow>
              )}
              {enquiries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.code}</TableCell>
                  <TableCell>
                    <Link href={`/customers/${e.customerId}`} className="text-sgs-teal-700 hover:underline">{e.customer.displayName}</Link>
                  </TableCell>
                  <TableCell className="text-sm max-w-md truncate">{e.requirement}</TableCell>
                  <TableCell className="text-xs">
                    {e.gemstone ? <Link href={`/gemstones/${e.gemstone.id}`} className="text-sgs-teal-700 hover:underline font-mono">{e.gemstone.code}</Link> : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {e.budgetMin != null || e.budgetMax != null
                      ? `${e.budgetMin != null ? formatCurrency(Number(e.budgetMin), e.currency) : "…"} – ${e.budgetMax != null ? formatCurrency(Number(e.budgetMax), e.currency) : "…"}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(e.followUpDate)}</TableCell>
                  <TableCell><Badge variant={statusVariant[e.status] ?? "muted"}>{e.status}</Badge></TableCell>
                  {canQuote && (
                    <TableCell>
                      {e.status !== "WON" && e.status !== "LOST" && (
                        <QuickQuoteButton
                          enquiryId={e.id}
                          customerId={e.customerId}
                          customerName={e.customer.displayName}
                          gemstone={e.gemstone ? {
                            id: e.gemstone.id, code: e.gemstone.code,
                            gemType: e.gemstone.gemType, variety: e.gemstone.variety,
                            askingPrice: e.gemstone.askingPrice ? Number(e.gemstone.askingPrice) : null,
                            currency: e.gemstone.currency,
                          } : null}
                          availableGems={availableGems}
                          defaultCurrency={company.defaultCurrency}
                        />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
