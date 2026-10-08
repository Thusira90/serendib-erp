import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, Info, Scale, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, requireCapability } from "@/lib/rbac";
import type { AdjustmentReason } from "@/lib/enums";
import { PartnerGatherError, collectCurrencies } from "@/lib/partner-gather";
import { computeEstimate, getCollectedShare, getLedger } from "@/lib/partner-ledger";
import { EngineInvariantError, decimalToMinor, minorToDecimalString, type Minor, type RateMap } from "@/lib/partner-money";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdjustmentDialog } from "./adjustment-dialog";
import { PayoutDialog, ReversePayoutButton } from "./payout-dialog";
import { ReconcileDialog } from "./reconcile-dialog";
import { RevalueDialog, type RevalueRow } from "./revalue-dialog";

const REASON_LABEL: Record<AdjustmentReason, string> = {
  MANUAL: "Manual adjustment",
  CORRECTION: "Correction",
  GOODWILL: "Goodwill",
  FORFEITED_DEPOSIT: "Forfeited deposit",
  STONE_WRITTEN_OFF: "Stone written off",
  COST_CHANGE: "Cost change",
  PRICE_CHANGE: "Sale price change",
  FX_CORRECTION: "Exchange-rate correction",
  SALE_CANCELLED: "Sale cancelled",
  NETTING: "Netted against an earlier gain",
  STONE_REMOVED: "Stone removed",
};
const METHOD_LABEL: Record<string, string> = { BANK_TRANSFER: "Bank transfer", CASH: "Cash", CHEQUE: "Cheque", OTHER: "Other" };
const SOURCE_BADGE: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  MANUAL: { label: "Manual", variant: "teal" },
  LIVE: { label: "Live", variant: "success" },
  FALLBACK: { label: "Fallback (approximate)", variant: "warning" },
};

const reasonLabel = (code: string): string => (code in REASON_LABEL ? REASON_LABEL[code as AdjustmentReason] : code);

function parseOverrides(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const raw: unknown = JSON.parse(json);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [ccy, v] of Object.entries(raw)) {
      if (/^[A-Z]{3}$/.test(ccy) && ccy !== "LKR" && (typeof v === "string" || typeof v === "number")) out[ccy] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

/** Whole-number percentage of a buyer-paid fraction (display only). */
function percentOf(f: { n: string; d: string }): number {
  try {
    const d = BigInt(f.d);
    if (d <= 0n) return 0;
    return Math.min(100, Math.max(0, Number((BigInt(f.n) * 10_000n) / d) / 100));
  } catch {
    return 0;
  }
}

export default async function MoneyTab({ dealId }: { dealId: string }) {
  const session = await requireCapability("partner:read");
  const canSettle = can(session.user, "partner:settle");

  const [deal, settlements, adjustments, payouts, dealStones] = await Promise.all([
    prisma.partnerDeal.findUnique({
      where: { id: dealId },
      select: { id: true, code: true, status: true, scope: true, earnOn: true, currency: true, rateOverrides: true, ratesFrozenAt: true },
    }),
    prisma.partnerSettlement.findMany({
      where: { dealId },
      orderBy: { seq: "desc" },
      select: {
        id: true, code: true, createdAt: true, createdByName: true, amount: true, earnedTotal: true, note: true, partnerNote: true,
        _count: { select: { lines: true } },
      },
    }),
    prisma.partnerAdjustment.findMany({
      where: { dealId },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, bucketKey: true, amount: true, reasonCode: true, reason: true, partnerNote: true, createdAt: true, createdByName: true },
    }),
    prisma.partnerPayout.findMany({
      where: { dealId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, code: true, direction: true, amount: true, paidAt: true, method: true, reference: true, originalAmount: true,
        originalCurrency: true, partnerNote: true, reversalOfId: true, createdByName: true,
      },
    }),
    prisma.partnerDealStone.findMany({
      where: { dealId },
      select: { id: true, removedAt: true, roughStone: { select: { code: true } }, gemstone: { select: { code: true } } },
    }),
  ]);
  if (!deal) notFound();

  const currency = deal.currency;
  const money = (m: Minor) => formatCurrency(Number(minorToDecimalString(m)), currency);
  const live = deal.status === "ACTIVE" || deal.status === "CLOSED";

  if (!live && settlements.length === 0 && adjustments.length === 0 && payouts.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Scale}
            title="No money yet"
            description={
              deal.status === "DRAFT"
                ? "Earnings, settlements and payouts start once the deal is active. Activate it from the Overview tab."
                : "This deal was cancelled before anything was recorded."
            }
          />
        </CardContent>
      </Card>
    );
  }

  // Live estimate; a deal with incomplete terms cannot be calculated, which must not hide the recorded ledger.
  let estimate: Awaited<ReturnType<typeof computeEstimate>> | null = null;
  let estimateError: string | null = null;
  if (live) {
    try {
      estimate = await computeEstimate(prisma, deal.id);
    } catch (e) {
      estimateError = e instanceof PartnerGatherError || e instanceof EngineInvariantError ? e.message : "The estimate could not be calculated just now.";
    }
  }
  const ledger = estimate?.ledger ?? (await getLedger(prisma, deal.id));
  const flagCounts = {
    block: estimate ? new Set(estimate.flags.filter((f) => f.severity === "BLOCK").map((f) => f.code)).size : 0,
    ack: estimate ? new Set(estimate.flags.filter((f) => f.severity === "ACK").map((f) => f.code)).size : 0,
  };

  // Bucket labels: a deal stone's own code, or "Pool".
  const stoneLabel = new Map(dealStones.map((s) => [s.id, s.roughStone?.code ?? s.gemstone?.code ?? "Stone"] as const));
  const removed = new Set(dealStones.filter((s) => s.removedAt !== null).map((s) => s.id));
  const labelOf = (key: string | null): string =>
    key === null ? "Whole deal" : key === "POOL" ? "Pool" : `${stoneLabel.get(key) ?? "Removed stone"}${removed.has(key) ? " (removed)" : ""}`;
  const bucketOptions: { key: string; label: string }[] =
    deal.scope === "POOLED"
      ? [{ key: "POOL", label: "Pool" }]
      : [
          ...dealStones.filter((s) => s.removedAt === null).map((s) => ({ key: s.id, label: labelOf(s.id) })),
          ...ledger.perBucket.filter((b) => removed.has(b.bucketKey)).map((b) => ({ key: b.bucketKey, label: labelOf(b.bucketKey) })),
        ];

  // Exchange rates in play: frozen overrides, the live map, and any currency that has data but no rate.
  const overrides = parseOverrides(deal.rateOverrides);
  const rateMap: RateMap["perUnit"] = estimate?.rates.perUnit ?? {};
  let needed: string[] = [];
  if (live) {
    try {
      needed = (await collectCurrencies(prisma, deal.id)).filter((c) => c !== "LKR");
    } catch {
      needed = [];
    }
  }
  const rateRows: RevalueRow[] = [...new Set([...needed, ...Object.keys(overrides), ...Object.keys(rateMap)])]
    .sort()
    .map((c): RevalueRow => ({
      currency: c,
      rate: overrides[c] ?? rateMap[c]?.rate ?? null,
      source: overrides[c] !== undefined ? "MANUAL" : rateMap[c]?.source ?? null,
    }));
  const missingRates = rateRows.filter((r) => r.rate === null).map((r) => r.currency);

  // SALE deals: how much of the credited position the buyers have actually paid (for the paying-ahead check).
  let collected: { collectedMinor: Minor; perBucket: { label: string; creditedMinor: Minor; paidPct: number }[] } | null = null;
  if (canSettle && live && deal.earnOn === "SALE" && ledger.balance > 0) {
    try {
      const share = await getCollectedShare(prisma, deal.id);
      if (share) {
        collected = {
          collectedMinor: share.collectedMinor,
          perBucket: share.perBucket.map((b) => ({ label: labelOf(b.bucketKey), creditedMinor: b.creditedMinor, paidPct: percentOf(b.paidFraction) })),
        };
      }
    } catch {
      collected = null;
    }
  }

  const reversed = new Set(payouts.map((p) => p.reversalOfId).filter((x): x is string => x !== null));
  const negative = ledger.balance < 0;

  return (
    <div className="space-y-6">
      {missingRates.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Exchange rate needed for {missingRates.join(", ")}. Add a manual rate{canSettle ? " with Revalue rates" : ""}; amounts in {missingRates.length === 1 ? "that currency" : "those currencies"} are left out until then.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Estimate" caption="Live, not recorded" value={estimate ? money(estimate.result.totalMinor) : "n/a"} />
        <Stat label="Settled" value={money(ledger.settled)} />
        <Stat label="Adjustments" value={money(ledger.adjustments)} negative={ledger.adjustments < 0} />
        <Stat label="Net paid" value={money(ledger.netPaid)} />
        <Stat label="Balance" value={money(ledger.balance)} negative={negative} caption={negative ? "Partner owes us" : ledger.balance > 0 ? "We owe the partner" : "Settled up"} />
        <Stat
          label="Not yet settled"
          caption="Estimate minus recorded"
          value={estimate ? money(estimate.notYetSettled) : "n/a"}
          negative={estimate !== null && estimate.notYetSettled < 0}
        />
      </div>

      {negative && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            The partner owes {money(-ledger.balance)}. It is carried forward and netted against future settlements; record a RECEIVED payout if it is recovered.
          </span>
        </div>
      )}
      {estimateError !== null && (
        <p className="text-xs text-amber-800">The live estimate is not available: {estimateError}</p>
      )}
      {(flagCounts.block > 0 || flagCounts.ack > 0) && (
        <p className="text-xs text-muted-foreground">
          The latest check found {flagCounts.block > 0 ? `${flagCounts.block} blocking ${flagCounts.block === 1 ? "issue" : "issues"}` : ""}
          {flagCounts.block > 0 && flagCounts.ack > 0 ? " and " : ""}
          {flagCounts.ack > 0 ? `${flagCounts.ack} ${flagCounts.ack === 1 ? "flag" : "flags"} to acknowledge` : ""}. Reconcile lists them.
        </p>
      )}

      {live && (
        <div className="flex flex-wrap items-center gap-2">
          {canSettle ? (
            <>
              <ReconcileDialog dealId={deal.id} dealCode={deal.code} />
              <AdjustmentDialog
                dealId={deal.id}
                currency={currency}
                balanceMinor={ledger.balance}
                buckets={bucketOptions}
                settlements={settlements.map((s) => ({ id: s.id, code: s.code }))}
              />
              <PayoutDialog
                dealId={deal.id}
                currency={currency}
                earnOn={deal.earnOn === "SALE" ? "SALE" : "PAYMENT"}
                balanceMinor={ledger.balance}
                netPaidMinor={ledger.netPaid}
                collected={collected}
              />
              {rateRows.length > 0 && <RevalueDialog dealId={deal.id} frozen={deal.ratesFrozenAt !== null} rows={rateRows} />}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">You can view this ledger. Recording settlements, adjustments and payouts needs the settle permission.</p>
          )}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Settlements</CardTitle></CardHeader>
        <CardContent className="p-0">
          {settlements.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="No settlements yet"
              description={
                estimate && estimate.result.totalMinor > 0
                  ? "Something has been earned but nothing is recorded yet. Reconcile records it."
                  : "Nothing earned yet. Estimates appear once a stone is sold."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Settlement</TableHead>
                  <TableHead>Recorded</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Earned in total then</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/partners/deals/${deal.id}/settlements/${s.id}`} className="font-mono text-xs text-sgs-teal-700 hover:underline">{s.code}</Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(s.createdAt)}</TableCell>
                    <TableCell className="text-xs">{s.createdByName ?? "—"}</TableCell>
                    <TableCell className="text-right num">{s._count.lines}</TableCell>
                    <TableCell className="text-right num">{money(decimalToMinor(s.earnedTotal))}</TableCell>
                    <TableCell className="text-right num font-medium">{money(decimalToMinor(s.amount))}</TableCell>
                    <TableCell className="max-w-[18rem] text-xs text-muted-foreground">
                      {s.note ?? ""}
                      {s.partnerNote && <div>Partner sees: {s.partnerNote}</div>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Adjustments</CardTitle></CardHeader>
        <CardContent className="p-0">
          {adjustments.length === 0 ? (
            <EmptyState icon={Scale} title="No adjustments" description="Corrections to earlier settlements, and manual amounts, appear here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adjustment</TableHead>
                  <TableHead>Recorded</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((a) => {
                  const m = decimalToMinor(a.amount);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">{a.code}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatDateTime(a.createdAt)}</TableCell>
                      <TableCell className="text-sm">{labelOf(a.bucketKey)}</TableCell>
                      <TableCell className="max-w-[22rem] text-sm">
                        {reasonLabel(a.reasonCode)}
                        <div className="text-xs text-muted-foreground">{a.reason}</div>
                        {a.partnerNote && <div className="text-xs text-muted-foreground">Partner sees: {a.partnerNote}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{a.createdByName ?? "—"}</TableCell>
                      <TableCell className={`text-right num font-medium ${m < 0 ? "text-red-700" : ""}`}>{m > 0 ? "+" : ""}{money(m)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payouts</CardTitle></CardHeader>
        <CardContent className="p-0">
          {payouts.length === 0 ? (
            <EmptyState icon={Banknote} title="No payouts yet" description="Payments to the partner, and any repayments from them, appear here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payout</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {canSettle && live && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p) => {
                  const m = decimalToMinor(p.amount);
                  const isPaid = p.direction === "PAID";
                  const isReversal = p.reversalOfId !== null;
                  const wasReversed = reversed.has(p.id);
                  return (
                    <TableRow key={p.id} className={wasReversed ? "text-muted-foreground" : undefined}>
                      <TableCell className="font-mono text-xs">{p.code}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatDate(p.paidAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant={isPaid ? "success" : "warning"}>{isPaid ? "Paid" : "Received"}</Badge>
                          {isReversal && <Badge variant="muted">Reversal</Badge>}
                          {wasReversed && <Badge variant="muted">Reversed</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{p.method ? METHOD_LABEL[p.method] ?? p.method : "—"}</TableCell>
                      <TableCell className="max-w-[18rem] text-xs">
                        {p.reference ?? "—"}
                        {p.originalAmount !== null && p.originalCurrency && (
                          <div className="text-muted-foreground">Sent as {formatCurrency(Number(minorToDecimalString(decimalToMinor(p.originalAmount))), p.originalCurrency)}</div>
                        )}
                        {p.partnerNote && <div className="text-muted-foreground">Partner sees: {p.partnerNote}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{p.createdByName ?? "—"}</TableCell>
                      <TableCell className="text-right num font-medium">{isPaid ? money(m) : money(-m)}</TableCell>
                      {canSettle && live && (
                        <TableCell className="text-right">
                          {isPaid && !wasReversed && <ReversePayoutButton payoutId={p.id} payoutCode={p.code} amountLabel={money(m)} />}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {rateRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Exchange rates</CardTitle>
            <p className="text-xs text-muted-foreground">
              {deal.ratesFrozenAt
                ? `Frozen on ${formatDate(deal.ratesFrozenAt)} at the first settlement, so live rate changes never move an amount already credited.`
                : "These rates float until the first settlement freezes the ones in use."}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">LKR per unit</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rateRows.map((r) => (
                  <TableRow key={r.currency}>
                    <TableCell className="font-medium">{r.currency}</TableCell>
                    <TableCell className="text-right num">{r.rate ?? "—"}</TableCell>
                    <TableCell>
                      {r.source ? <Badge variant={SOURCE_BADGE[r.source].variant}>{SOURCE_BADGE[r.source].label}</Badge> : <Badge variant="danger">Missing</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, caption, negative = false }: { label: string; value: string; caption?: string; negative?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-0.5 font-serif text-xl num ${negative ? "text-red-700" : ""}`}>{value}</div>
        {caption && <div className="text-[10px] text-muted-foreground">{caption}</div>}
      </CardContent>
    </Card>
  );
}
