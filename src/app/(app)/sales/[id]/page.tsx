import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, Receipt } from "lucide-react";
import { RecordPaymentButton } from "./record-payment-button";
import { PrepareShipmentButton } from "./prepare-shipment-button";
import { getCompanySettings } from "@/lib/company-settings";
import { SgsLogo } from "@/components/brand/logo";
import { CommentsThread } from "@/components/comments-thread";
import { PrintButton } from "@/components/print-button";

const statusVariant: Record<string, "muted" | "teal" | "warning" | "success" | "danger" | "purple"> = {
  DRAFT: "muted", CONFIRMED: "teal", INVOICED: "teal",
  PARTIAL: "warning", PAID: "success", CANCELLED: "danger",
  SHIPPED: "purple", DELIVERED: "success",
};

export default async function SaleDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability("sale:read");
  const { id } = await params;
  const s = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      gemstone: true,
      payments: { orderBy: { receivedAt: "asc" } },
      shipment: true,
    },
  });
  if (!s) return notFound();
  const canPay = can(session.user.role, "payment:write");
  const canShip = can(session.user.role, "shipment:write");

  const paid = s.payments.reduce((a, p) => a + Number(p.amount), 0);
  const remaining = Number(s.totalAmount) - paid;
  const company = await getCompanySettings();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/sales" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to sales
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-[820px] bg-card border rounded-lg shadow-luxe p-10 print-page print:shadow-none print:border-0 print:p-0">
        <header className="border-b pb-6 mb-8">
          <div className="flex items-start justify-between">
            <SgsLogo size={44} />
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground flex items-center gap-2 justify-end">
                <Receipt className="h-3.5 w-3.5" /> Invoice
              </div>
              <div className="font-serif text-3xl">{s.invoiceNumber}</div>
              <div className="text-xs text-muted-foreground mt-1 font-mono">Sales order {s.code}</div>
              <div className="mt-2"><Badge variant={statusVariant[s.status] ?? "muted"}>{s.status}</Badge></div>
              <div className="text-xs text-muted-foreground mt-2">Sale date {formatDate(s.saleDate)}</div>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-8 mb-8 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">From</div>
            <div className="font-medium">{company.legalName}</div>
            {company.tradingName && <div className="text-muted-foreground">{company.tradingName}</div>}
            <div className="text-muted-foreground">{[company.city, company.country].filter(Boolean).join(", ")}</div>
            {company.email && <div className="text-muted-foreground">{company.email}</div>}
            {company.phone && <div className="text-muted-foreground">{company.phone}</div>}
            {(company.taxId || company.registrationNumber) && (
              <div className="text-[10px] text-muted-foreground mt-1">
                {company.registrationNumber && <>Reg {company.registrationNumber}</>}
                {company.registrationNumber && company.taxId && " · "}
                {company.taxId && <>VAT/Tax {company.taxId}</>}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Bill to</div>
            <div className="font-medium">{s.customer.displayName}</div>
            {s.customer.companyName && <div className="text-muted-foreground">{s.customer.companyName}</div>}
            <div className="text-muted-foreground">{[s.customer.city, s.customer.country].filter(Boolean).join(", ")}</div>
            <div className="text-muted-foreground">{s.customer.email ?? s.customer.phone ?? ""}</div>
          </div>
        </section>

        <section className="mb-6 text-sm text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Gemstone</div>
          <div className="font-mono text-xs">{s.gemstone.code}</div>
          <div>{s.gemstone.gemType}{s.gemstone.variety ? ` · ${s.gemstone.variety}` : ""}</div>
          <div className="text-muted-foreground">{formatCarat(Number(s.gemstone.weightCt))}{s.gemstone.origin ? ` · ${s.gemstone.origin}` : ""}</div>
        </section>

        <section className="border rounded-md divide-y mb-6">
          <div className="p-3 flex justify-between text-sm">
            <div>
              <div className="font-medium">{s.gemstone.gemType}{s.gemstone.variety ? ` · ${s.gemstone.variety}` : ""}</div>
              <div className="text-xs text-muted-foreground">{s.gemstone.code} · {formatCarat(Number(s.gemstone.weightCt))}</div>
            </div>
            <div className="num">{formatCurrency(Number(s.agreedPrice), s.currency)}</div>
          </div>
          <div className="p-3 flex justify-between text-sm">
            <div className="text-muted-foreground">Tax</div>
            <div className="num">{formatCurrency(Number(s.taxAmount), s.currency)}</div>
          </div>
          <div className="p-3 flex justify-between font-medium bg-secondary/40">
            <div>Total</div>
            <div className="num font-serif text-lg">{formatCurrency(Number(s.totalAmount), s.currency)}</div>
          </div>
        </section>

        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Payments</div>
              <div className="text-sm">
                <span className="num font-medium">{formatCurrency(paid, s.currency)}</span> of {formatCurrency(Number(s.totalAmount), s.currency)} received
                {remaining > 0 && <span className="text-muted-foreground"> · {formatCurrency(remaining, s.currency)} outstanding</span>}
              </div>
            </div>
            {canPay && remaining > 0 && (
              <div className="print:hidden">
                <RecordPaymentButton salesOrderId={s.id} currency={s.currency} suggestedAmount={remaining} />
              </div>
            )}
          </div>
          <Card>
            <CardContent className="p-0 divide-y">
              {s.payments.length === 0 && <div className="p-3 text-sm text-muted-foreground">No payments yet.</div>}
              {s.payments.map((p) => (
                <div key={p.id} className="p-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-mono text-xs mr-2">{p.code}</span>
                    <span>{p.method.replaceAll("_", " ")}</span>
                    {p.reference && <span className="text-muted-foreground ml-2">Ref {p.reference}</span>}
                    {p.notes && <div className="text-xs text-muted-foreground">{p.notes}</div>}
                  </div>
                  <div className="text-right">
                    <div className="num">{formatCurrency(Number(p.amount), p.currency)}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(p.receivedAt)} · {p.recordedBy ?? "—"}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Shipment</div>
              {s.shipment ? (
                <div className="text-sm">
                  <Link href={`/shipments/${s.shipment.id}`} className="font-mono text-sgs-teal-700 hover:underline">{s.shipment.code}</Link>
                  <span className="text-muted-foreground"> · {s.shipment.status.replaceAll("_", " ")}</span>
                  {s.shipment.destination && <span className="text-muted-foreground"> · {s.shipment.destination}</span>}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Not yet shipped.</div>
              )}
            </div>
            {canShip && !s.shipment && (
              <div className="print:hidden">
                <PrepareShipmentButton
                  salesOrderId={s.id}
                  defaultDestination={[s.customer.city, s.customer.country].filter(Boolean).join(", ") || ""}
                  defaultCountry={s.customer.country ?? ""}
                  defaultCurrency={s.currency}
                  defaultDeclaredValue={Number(s.totalAmount)}
                />
              </div>
            )}
          </div>
        </section>

        {s.notes && (
          <section className="text-sm text-muted-foreground border-t pt-4">{s.notes}</section>
        )}
      </div>

      <div className="mx-auto max-w-[820px] print:hidden">
        <CommentsThread entity="SalesOrder" entityId={s.id} entityCode={s.code} revalidate={`/sales/${s.id}`} />
      </div>
    </div>
  );
}
