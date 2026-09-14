import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { SgsLogo } from "@/components/brand/logo";
import { QuotationStatusControls } from "./status-controls";
import { PrintButton } from "@/components/print-button";
import { getCompanySettings } from "@/lib/company-settings";
import { CommentsThread } from "@/components/comments-thread";

const statusVariant: Record<string, "muted" | "teal" | "warning" | "success" | "danger"> = {
  DRAFT: "muted", SENT: "teal", ACCEPTED: "success", DECLINED: "danger", EXPIRED: "warning",
};

export default async function QuotationDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability("quotation:read");
  const { id } = await params;
  const q = await prisma.quotation.findUnique({
    where: { id },
    include: {
      customer: true,
      gemstone: {
        include: {
          certificates: { where: { status: "ISSUED" }, include: { laboratory: true }, take: 1 },
        },
      },
    },
  });
  if (!q) return notFound();
  const canWrite = can(session.user.role, "quotation:write");
  const company = await getCompanySettings();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/quotations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to quotations
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant[q.status] ?? "muted"}>{q.status}</Badge>
          {canWrite && <QuotationStatusControls id={q.id} status={q.status} />}
          <PrintButton />
        </div>
      </div>

      <div className="mx-auto max-w-[820px] bg-card border rounded-lg shadow-luxe p-10 print-page print:shadow-none print:border-0 print:p-0">
        <header className="flex items-start justify-between border-b pb-6 mb-8">
          <SgsLogo size={44} />
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Quotation</div>
            <div className="font-serif text-3xl">{q.code}</div>
            <div className="text-xs text-muted-foreground mt-1">Issued {formatDate(q.createdAt)}</div>
            {q.validUntil && <div className="text-xs text-muted-foreground">Valid until {formatDate(q.validUntil)}</div>}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">From</div>
            <div className="font-medium">{company.legalName}</div>
            {company.tradingName && <div className="text-sm text-muted-foreground">{company.tradingName}</div>}
            <div className="text-sm text-muted-foreground">{[company.city, company.country].filter(Boolean).join(", ")}</div>
            {company.email && <div className="text-sm text-muted-foreground">{company.email}</div>}
            {company.phone && <div className="text-sm text-muted-foreground">{company.phone}</div>}
            {(company.taxId || company.registrationNumber) && (
              <div className="text-[10px] text-muted-foreground mt-1">
                {company.registrationNumber && <>Reg {company.registrationNumber}</>}
                {company.registrationNumber && company.taxId && " · "}
                {company.taxId && <>VAT/Tax {company.taxId}</>}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">To</div>
            <div className="font-medium">{q.customer.displayName}</div>
            {q.customer.companyName && <div className="text-sm text-muted-foreground">{q.customer.companyName}</div>}
            <div className="text-sm text-muted-foreground">{[q.customer.city, q.customer.country].filter(Boolean).join(", ")}</div>
            <div className="text-sm text-muted-foreground">{q.customer.email ?? q.customer.phone ?? ""}</div>
          </div>
        </section>

        <section className="mb-8">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Gemstone</div>
          <div className="border rounded-md p-4 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
            <div className="rounded bg-sgs-gradient text-white p-4 h-40 flex flex-col justify-between">
              <div className="text-[10px] uppercase tracking-widest opacity-80">{q.gemstone.gemType}{q.gemstone.variety ? ` · ${q.gemstone.variety}` : ""}</div>
              <div>
                <div className="font-serif text-3xl num">{formatCarat(Number(q.gemstone.weightCt))}</div>
                <div className="text-[10px] opacity-85 font-mono mt-1">{q.gemstone.code}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <KV label="Origin" value={q.gemstone.origin ?? "—"} />
              <KV label="Treatment" value={q.gemstone.treatment ?? "—"} />
              <KV label="Shape" value={q.gemstone.shape ?? "—"} />
              <KV label="Cut" value={q.gemstone.cut ?? "—"} />
              <KV label="Color" value={q.gemstone.colorDescription ?? "—"} span />
              <KV label="Clarity" value={q.gemstone.clarity ?? "—"} />
              <KV label="Dimensions" value={[q.gemstone.lengthMm, q.gemstone.widthMm, q.gemstone.depthMm].filter(Boolean).map(v => `${Number(v).toFixed(1)}mm`).join(" × ") || "—"} />
              {q.gemstone.certificates[0] && (
                <KV label="Certificate" value={`${q.gemstone.certificates[0].laboratory.name}${q.gemstone.certificates[0].certificateNumber ? ` · #${q.gemstone.certificates[0].certificateNumber}` : ""}`} span />
              )}
            </div>
          </div>
        </section>

        <section className="mb-8 grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Terms</div>
            <div><span className="text-muted-foreground">Payment:</span> {q.paymentTerms ?? company.defaultPaymentTerms}</div>
            <div><span className="text-muted-foreground">Delivery:</span> {q.deliveryTerms ?? company.defaultDeliveryTerms}</div>
            <div><span className="text-muted-foreground">Shipping:</span> {q.shippingTerms ?? company.defaultShippingTerms}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Offer</div>
            <div className="font-serif text-4xl num text-sgs-purple-600">{formatCurrency(Number(q.price), q.currency)}</div>
          </div>
        </section>

        {q.notes && (
          <section className="mb-8 text-sm">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
            <div className="whitespace-pre-wrap text-muted-foreground">{q.notes}</div>
          </section>
        )}

        <footer className="border-t pt-4 text-xs text-muted-foreground">
          This quotation is offered subject to the stone remaining available at time of acceptance.
        </footer>
      </div>

      <div className="mx-auto max-w-[820px] print:hidden">
        <CommentsThread entity="Quotation" entityId={q.id} entityCode={q.code} revalidate={`/quotations/${q.id}`} />
      </div>
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
