import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Handshake } from "lucide-react";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { decimalToMinor, minorToDecimalString, type Minor } from "@/lib/partner-money";
import { getLedger } from "@/lib/partner-ledger";
import { PARTNER_KIND_LABEL } from "../new-partner-button";
import { EditPartnerButton, PartnerActiveButton } from "./edit-partner-button";

const METHOD_LABEL: Record<string, string> = {
  PROFIT_SHARE: "Profit share",
  SALE_COMMISSION: "Sale commission",
  FIXED_FEE: "Fixed fee",
  INVESTMENT: "Investment",
};
const SCOPE_LABEL: Record<string, string> = { PER_STONE: "Per stone", POOLED: "Pooled" };
const STATUS_VARIANT = { DRAFT: "muted", ACTIVE: "success", CLOSED: "secondary", CANCELLED: "danger" } as const;
const OPEN_STATUSES: readonly string[] = ["DRAFT", "ACTIVE"];

const money = (m: Minor, currency: string) => formatCurrency(Number(minorToDecimalString(m)), currency);

export default async function PartnerDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability("partner:read");
  const canWrite = can(session.user, "partner:write");
  const { id } = await params;

  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      deals: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, code: true, title: true, status: true, method: true, scope: true, currency: true,
          ratePct: true, fixedFee: true, createdAt: true,
          _count: { select: { stones: { where: { removedAt: null } } } },
        },
      },
    },
  });
  if (!partner) return notFound();

  // DRAFT deals cannot have ledger rows, so only the others are read.
  const balances = new Map<string, Minor | null>();
  await Promise.all(
    partner.deals
      .filter((d) => d.status !== "DRAFT")
      .map(async (d) => {
        try {
          balances.set(d.id, (await getLedger(prisma, d.id)).balance);
        } catch {
          balances.set(d.id, null);
        }
      }),
  );

  const owed = new Map<string, Minor>();
  const against = new Map<string, Minor>();
  for (const d of partner.deals) {
    const b = balances.get(d.id);
    if (b === undefined || b === null) continue;
    if (b > 0) owed.set(d.currency, (owed.get(d.currency) ?? 0) + b);
    if (b < 0) against.set(d.currency, (against.get(d.currency) ?? 0) + b);
  }
  const openDeals = partner.deals.filter((d) => OPEN_STATUSES.includes(d.status)).length;

  return (
    <div className="space-y-6">
      <Link href="/partners" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to partners
      </Link>

      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-lg bg-sgs-gradient text-white grid place-items-center">
            <Handshake className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs flex items-center gap-2">
              <Badge variant="teal">{PARTNER_KIND_LABEL[partner.kind] ?? partner.kind}</Badge>
              {!partner.active && <Badge variant="muted">Inactive</Badge>}
              <span className="font-mono text-xs">{partner.code}</span>
            </div>
            <h1 className="font-serif text-3xl mt-1">{partner.name}</h1>
            <div className="text-sm text-muted-foreground">
              {[partner.company, partner.country].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
        </div>
        {canWrite && (
          <div className="flex items-start gap-2">
            <EditPartnerButton
              partnerId={partner.id}
              values={{
                name: partner.name,
                kind: partner.kind,
                company: partner.company,
                contactName: partner.contactName,
                phone: partner.phone,
                email: partner.email,
                country: partner.country,
                notes: partner.notes,
              }}
            />
            <PartnerActiveButton partnerId={partner.id} active={partner.active} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Open deals">{openDeals}</Stat>
        <Stat label="All deals">{partner.deals.length}</Stat>
        <Stat label="Balance owed">
          <MoneyLines totals={owed} empty="Nothing owed" />
        </Stat>
        <Stat label="Carried forward">
          <MoneyLines totals={against} empty="None" negative />
        </Stat>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <KV label="Contact name" value={partner.contactName ?? "—"} />
            <KV label="Company" value={partner.company ?? "—"} />
            <KV label="Email" value={partner.email ? <a href={`mailto:${partner.email}`} className="text-sgs-teal-700 hover:underline">{partner.email}</a> : "—"} />
            <KV label="Phone" value={partner.phone ?? "—"} />
            <KV label="Country" value={partner.country ?? "—"} />
            <KV label="Added" value={formatDate(partner.createdAt)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Internal notes</CardTitle>
            <p className="text-xs text-muted-foreground">Never shown to the partner.</p>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {partner.notes ?? <span className="text-muted-foreground">No notes.</span>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Deals</CardTitle>
          {canWrite && partner.active && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/partners/deals/new?partnerId=${partner.id}`}>New deal</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {partner.deals.length === 0 ? (
            <EmptyState
              icon={Handshake}
              title="No deals yet"
              description={partner.active
                ? "A deal ties this partner to specific stones and a payout method."
                : "This partner is inactive. Reactivate them to create a deal."}
              primary={canWrite && partner.active ? { label: "New deal", href: `/partners/deals/new?partnerId=${partner.id}` } : undefined}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Stones</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partner.deals.map((d) => {
                  const b = balances.get(d.id);
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Link href={`/partners/deals/${d.id}`} className="font-mono text-xs text-sgs-teal-700 hover:underline">{d.code}</Link>
                        <div className="text-xs text-muted-foreground max-w-[18rem] truncate">{d.title}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {METHOD_LABEL[d.method] ?? d.method}
                        <div className="text-xs text-muted-foreground">{termText(d)}</div>
                      </TableCell>
                      <TableCell className="text-sm">{SCOPE_LABEL[d.scope] ?? d.scope}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[d.status as keyof typeof STATUS_VARIANT] ?? "muted"}>{d.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right num">{d._count.stones}</TableCell>
                      <TableCell className={`text-right num ${b !== undefined && b !== null && b < 0 ? "text-red-700" : ""}`}>
                        {b === undefined ? "—" : b === null ? "n/a" : money(b, d.currency)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function termText(d: { method: string; scope: string; currency: string; ratePct: { toString(): string } | null; fixedFee: { toString(): string } | null }): string {
  if (d.method === "FIXED_FEE") {
    if (d.fixedFee === null) return "—";
    return `${money(decimalToMinor(d.fixedFee), d.currency)}${d.scope === "PER_STONE" ? " per stone" : ""}`;
  }
  return d.ratePct === null ? "—" : `${Number(d.ratePct.toString())}%`;
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-serif text-2xl num mt-0.5">{children}</div>
      </CardContent>
    </Card>
  );
}

function MoneyLines({ totals, empty, negative = false }: { totals: Map<string, Minor>; empty: string; negative?: boolean }) {
  const entries = [...totals].sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <span className="text-muted-foreground/60">{empty}</span>;
  return (
    <span className={`flex flex-col text-lg leading-tight ${negative ? "text-red-700" : ""}`}>
      {entries.map(([currency, m]) => <span key={currency}>{money(m, currency)}</span>)}
    </span>
  );
}
