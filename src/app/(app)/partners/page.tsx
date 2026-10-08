import { Suspense } from "react";
import Link from "next/link";
import { Handshake } from "lucide-react";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { decimalToMinor, minorToDecimalString, type Minor } from "@/lib/partner-money";
import { computeEstimate } from "@/lib/partner-ledger";
import { PartnersTabs } from "./partners-tabs";
import { NewPartnerButton, PARTNER_KIND_LABEL } from "./new-partner-button";

const METHOD_LABEL: Record<string, string> = {
  PROFIT_SHARE: "Profit share",
  SALE_COMMISSION: "Sale commission",
  FIXED_FEE: "Fixed fee",
  INVESTMENT: "Investment",
};
const SCOPE_LABEL: Record<string, string> = { PER_STONE: "Per stone", POOLED: "Pooled" };
const STATUS_VARIANT = { DRAFT: "muted", ACTIVE: "success", CLOSED: "secondary", CANCELLED: "danger" } as const;
const OPEN_STATUSES: readonly string[] = ["DRAFT", "ACTIVE"];
const DRIFT_CODES: ReadonlySet<string> = new Set(["COST_DRIFT", "PURCHASE_DRIFT", "PARCEL_DRIFT"]);
/** Each live estimate is a full gather, so only this many active deals get one on the list. */
const MAX_ESTIMATES = 10;
const ESTIMATE_CONCURRENCY = 3;
/** Keeps the streamed estimates inside a serverless function's time limit; deals left over show a dash. */
const ESTIMATE_BUDGET_MS = 6_000;

type DealRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  method: string;
  scope: string;
  currency: string;
  ratePct: number | null;
  fixedFee: Minor | null;
  partnerId: string;
  partnerName: string;
  stones: number;
  balance: Minor;
};

type Estimate = { totalMinor: Minor; block: number; ack: number; drift: number };
type Estimates = Map<string, Estimate | null>;

const money = (m: Minor, currency: string) => formatCurrency(Number(minorToDecimalString(m)), currency);
const typeLabel = (k: string) => PARTNER_KIND_LABEL[k] ?? k;

function addTo(map: Map<string, Minor>, currency: string, m: Minor) {
  map.set(currency, (map.get(currency) ?? 0) + m);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e: unknown) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Never rejects: a deal that cannot be calculated maps to null, one that did not fit the time budget is left out. */
async function loadEstimates(dealIds: string[]): Promise<Estimates> {
  const out: Estimates = new Map();
  const queue = dealIds.slice(0, MAX_ESTIMATES);
  const deadline = Date.now() + ESTIMATE_BUDGET_MS;
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const left = deadline - Date.now();
      if (left < 300) return;
      try {
        const e = await withTimeout(computeEstimate(prisma, id), left);
        out.set(id, {
          totalMinor: e.result.totalMinor,
          block: e.flags.filter((f) => f.severity === "BLOCK").length,
          ack: e.flags.filter((f) => f.severity === "ACK").length,
          drift: e.flags.filter((f) => DRIFT_CODES.has(f.code)).length,
        });
      } catch {
        out.set(id, null);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(ESTIMATE_CONCURRENCY, queue.length) }, worker));
  return out;
}

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireCapability("partner:read");
  const canWrite = can(session.user, "partner:write");
  const { tab } = await searchParams;

  const [partners, deals, settled, adjusted, payouts] = await Promise.all([
    prisma.partner.findMany({
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, kind: true, company: true, active: true },
    }),
    prisma.partnerDeal.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, code: true, title: true, status: true, method: true, scope: true, currency: true,
        ratePct: true, fixedFee: true, partnerId: true,
        partner: { select: { name: true } },
        _count: { select: { stones: { where: { removedAt: null } } } },
      },
    }),
    prisma.partnerSettlement.groupBy({ by: ["dealId"], _sum: { amount: true } }),
    prisma.partnerAdjustment.groupBy({ by: ["dealId"], _sum: { amount: true } }),
    prisma.partnerPayout.groupBy({ by: ["dealId", "direction"], _sum: { amount: true } }),
  ]);

  // balance = settled + adjustments - (paid - received), the ledger's definition, from three grouped queries.
  const balanceByDeal = new Map<string, Minor>();
  const bump = (dealId: string, m: Minor) => balanceByDeal.set(dealId, (balanceByDeal.get(dealId) ?? 0) + m);
  for (const r of settled) if (r._sum.amount) bump(r.dealId, decimalToMinor(r._sum.amount));
  for (const r of adjusted) if (r._sum.amount) bump(r.dealId, decimalToMinor(r._sum.amount));
  for (const r of payouts) {
    if (r._sum.amount) bump(r.dealId, (r.direction === "RECEIVED" ? 1 : -1) * decimalToMinor(r._sum.amount));
  }

  const rows: DealRow[] = deals.map((d) => ({
    id: d.id,
    code: d.code,
    title: d.title,
    status: d.status,
    method: d.method,
    scope: d.scope,
    currency: d.currency,
    ratePct: d.ratePct === null ? null : Number(d.ratePct.toString()),
    fixedFee: d.fixedFee === null ? null : decimalToMinor(d.fixedFee),
    partnerId: d.partnerId,
    partnerName: d.partner.name,
    stones: d._count.stones,
    balance: balanceByDeal.get(d.id) ?? 0,
  }));

  const perPartner = new Map<string, { open: number; owed: Map<string, Minor>; against: Map<string, Minor> }>();
  const owedTotal = new Map<string, Minor>();
  const againstTotal = new Map<string, Minor>();
  for (const d of rows) {
    const e = perPartner.get(d.partnerId) ?? { open: 0, owed: new Map<string, Minor>(), against: new Map<string, Minor>() };
    if (OPEN_STATUSES.includes(d.status)) e.open++;
    if (d.balance > 0) { addTo(e.owed, d.currency, d.balance); addTo(owedTotal, d.currency, d.balance); }
    if (d.balance < 0) { addTo(e.against, d.currency, d.balance); addTo(againstTotal, d.currency, d.balance); }
    perPartner.set(d.partnerId, e);
  }

  const activeDeals = rows.filter((d) => d.status === "ACTIVE");
  const draftCount = rows.filter((d) => d.status === "DRAFT").length;
  const activePartners = partners.filter((p) => p.active).length;
  const estimatesPromise = loadEstimates(activeDeals.map((d) => d.id));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><Handshake className="h-7 w-7 text-sgs-teal-500" /> Partners</h1>
          <p className="text-sm text-muted-foreground">Brokers, investors and agents who share in the profit or price of specific stones.</p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button asChild variant="outline"><Link href="/partners/deals/new">New deal</Link></Button>
            <NewPartnerButton />
          </div>
        )}
      </div>

      {partners.length === 0 ? (
        <Card>
          <CardContent className="p-2">
            <EmptyState
              icon={Handshake}
              title="No partners yet"
              description="A partner is a broker, investor or agent you pay from the profit, the sale price or a fixed fee on specific stones. Add the partner first, then create a deal for their stones."
            />
            {canWrite && <div className="flex justify-center pb-8"><NewPartnerButton /></div>}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Partners" subtitle={partners.length > activePartners ? `${partners.length - activePartners} inactive` : undefined}>
              {activePartners}
            </StatTile>
            <StatTile label="Open deals" subtitle={`${activeDeals.length} active · ${draftCount} draft`}>
              {activeDeals.length + draftCount}
            </StatTile>
            <StatTile
              label="Owed to partners"
              subtitle={againstTotal.size > 0 ? `${[...againstTotal].map(([c, m]) => money(-m, c)).join(", ")} carried forward against partners` : undefined}
            >
              <MoneyLines totals={owedTotal} empty="Nothing owed" />
            </StatTile>
            <Suspense fallback={<StatTile label="Needs attention" subtitle="Checking active deals">…</StatTile>}>
              <AttentionTile promise={estimatesPromise} activeCount={activeDeals.length} />
            </Suspense>
          </div>

          <PartnersTabs
            defaultTab={tab === "deals" ? "deals" : "partners"}
            partnerCount={partners.length}
            dealCount={rows.length}
            partners={
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Partner</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Open deals</TableHead>
                        <TableHead className="text-right">Balance owed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partners.map((p) => {
                        const e = perPartner.get(p.id);
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-mono text-xs">
                              <Link href={`/partners/${p.id}`} className="text-sgs-teal-700 hover:underline">{p.code}</Link>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Link href={`/partners/${p.id}`} className="hover:text-sgs-teal-700">{p.name}</Link>
                                {!p.active && <Badge variant="muted">Inactive</Badge>}
                              </div>
                              {p.company && <div className="text-xs text-muted-foreground">{p.company}</div>}
                            </TableCell>
                            <TableCell><Badge variant="teal">{typeLabel(p.kind)}</Badge></TableCell>
                            <TableCell className="text-right num">{e?.open ?? 0}</TableCell>
                            <TableCell className="text-right num">
                              <MoneyLines totals={e?.owed ?? new Map()} empty="—" small />
                              {e && e.against.size > 0 && (
                                <div className="text-xs text-red-700">
                                  {[...e.against].map(([c, m]) => `${money(m, c)}`).join(", ")} carried forward
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            }
            deals={
              rows.length === 0 ? (
                <Card>
                  <CardContent className="p-2">
                    <EmptyState
                      icon={Handshake}
                      title="No deals yet"
                      description="A deal ties a partner to specific stones, a payout method and what the partner can see."
                      primary={canWrite ? { label: "New deal", href: "/partners/deals/new" } : undefined}
                    />
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  <Suspense fallback={<DealsTable rows={rows} estimates={null} />}>
                    <DealsTableLoaded rows={rows} promise={estimatesPromise} />
                  </Suspense>
                  {activeDeals.length > MAX_ESTIMATES && (
                    <p className="text-xs text-muted-foreground">
                      Live estimates are calculated for the {MAX_ESTIMATES} most recent active deals. Open a deal for its own figure.
                    </p>
                  )}
                </div>
              )
            }
          />
        </>
      )}
    </div>
  );
}

async function DealsTableLoaded({ rows, promise }: { rows: DealRow[]; promise: Promise<Estimates> }) {
  return <DealsTable rows={rows} estimates={await promise} />;
}

async function AttentionTile({ promise, activeCount }: { promise: Promise<Estimates>; activeCount: number }) {
  const estimates = await promise;
  let flagged = 0;
  let failed = 0;
  for (const e of estimates.values()) {
    if (e === null) failed++;
    else if (e.block > 0 || e.drift > 0) flagged++;
  }
  const parts: string[] = [];
  if (estimates.size < activeCount) parts.push(`${estimates.size} of ${activeCount} active deals checked`);
  else parts.push(activeCount === 0 ? "No active deals" : `${activeCount} active deal${activeCount === 1 ? "" : "s"} checked`);
  if (failed > 0) parts.push(`${failed} could not be calculated`);
  return <StatTile label="Needs attention" subtitle={`With a blocking or drift flag · ${parts.join(" · ")}`}>{flagged}</StatTile>;
}

function DealsTable({ rows, estimates }: { rows: DealRow[]; estimates: Estimates | null }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Estimate</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => {
              const est = d.status === "ACTIVE" && estimates !== null ? estimates.get(d.id) : undefined;
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link href={`/partners/deals/${d.id}`} className="font-mono text-xs text-sgs-teal-700 hover:underline">{d.code}</Link>
                    <div className="text-xs text-muted-foreground max-w-[16rem] truncate">{d.title}</div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/partners/${d.partnerId}`} className="hover:text-sgs-teal-700">{d.partnerName}</Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {METHOD_LABEL[d.method] ?? d.method}
                    <div className="text-xs text-muted-foreground">{termText(d)}</div>
                  </TableCell>
                  <TableCell className="text-sm">{SCOPE_LABEL[d.scope] ?? d.scope}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[d.status as keyof typeof STATUS_VARIANT] ?? "muted"}>{d.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right num">
                    {d.status !== "ACTIVE" ? "—"
                      : estimates === null ? <span className="text-xs text-muted-foreground">calculating…</span>
                      : est === undefined ? <span title="Open the deal for its live estimate">—</span>
                      : est === null ? <span className="text-xs text-muted-foreground" title="The estimate could not be calculated">n/a</span>
                      : money(est.totalMinor, d.currency)}
                  </TableCell>
                  <TableCell className={`text-right num ${d.balance < 0 ? "text-red-700" : ""}`}>
                    {d.status === "DRAFT" ? "—" : money(d.balance, d.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    {!est ? <span className="text-muted-foreground">—</span> : <FlagBadges est={est} />}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FlagBadges({ est }: { est: Estimate }) {
  if (est.block === 0 && est.ack === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <span className="inline-flex items-center gap-1 justify-end">
      {est.block > 0 && <Badge variant="danger">{est.block} block</Badge>}
      {est.ack > 0 && <Badge variant="warning">{est.ack} to check</Badge>}
    </span>
  );
}

function termText(d: DealRow): string {
  if (d.method === "FIXED_FEE") {
    if (d.fixedFee === null) return "—";
    return `${money(d.fixedFee, d.currency)}${d.scope === "PER_STONE" ? " per stone" : ""}`;
  }
  return d.ratePct === null ? "—" : `${d.ratePct}%`;
}

function StatTile({ label, subtitle, children }: { label: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-serif text-2xl num mt-0.5">{children}</div>
        {subtitle && <div className="text-[10px] text-muted-foreground italic mt-0.5">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

function MoneyLines({ totals, empty, small = false }: { totals: Map<string, Minor>; empty: string; small?: boolean }) {
  const entries = [...totals].sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <span className="text-muted-foreground/60">{empty}</span>;
  return (
    <span className={`flex flex-col ${small ? "" : "text-lg leading-tight"}`}>
      {entries.map(([currency, m]) => <span key={currency}>{money(m, currency)}</span>)}
    </span>
  );
}
