import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, Info, OctagonAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, requireCapability } from "@/lib/rbac";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EngineInvariantError, runEngineVersioned, type EngineResult, type GatherFlag } from "@/lib/partner-engine";
import { PartnerGatherError, buildRateMap, collectCurrencies, gatherDeal, type Evidence } from "@/lib/partner-gather";
import { checkObligations, getLedger, type Ledger } from "@/lib/partner-ledger";
import { decimalToMinor, minorToDecimalString, type Minor } from "@/lib/partner-money";
import type { EarnOn, PartnerScope, PayoutMethod } from "@/lib/enums";
import {
  DEFAULT_EXCLUDED_TYPES,
  EARN_ON_LABEL,
  EARN_ON_NOTE,
  FLAG_INFO,
  LEGAL_NOTICE,
  METHOD_FORMULA,
  METHOD_LABEL,
  SCOPE_LABEL,
  SCOPE_NOTE,
} from "../deal-shared";
import { CostTypesTable, DealStatusActions, type CostTypeRow } from "./deal-actions";

export interface DealFacts {
  result: EngineResult;
  flags: GatherFlag[];
  ledger: Ledger;
  evidence: Evidence;
  notYetSettled: Minor;
}

/** The live estimate with its flags, evidence and ledger. A deal whose terms or data cannot be calculated returns a message instead of throwing. */
export async function loadDealFacts(dealId: string): Promise<{ ok: true; facts: DealFacts } | { ok: false; error: string }> {
  try {
    const deal = await prisma.partnerDeal.findUniqueOrThrow({ where: { id: dealId }, select: { currency: true, rateOverrides: true } });
    const rates = await buildRateMap(deal, await collectCurrencies(prisma, dealId));
    const gathered = await gatherDeal(prisma, dealId, { asOf: new Date(), rates });
    const result = runEngineVersioned(gathered.input);
    const ledger = await getLedger(prisma, dealId);
    return { ok: true, facts: { result, flags: gathered.flags, ledger, evidence: gathered.evidence, notYetSettled: result.totalMinor - ledger.position } };
  } catch (e) {
    if (e instanceof PartnerGatherError || e instanceof EngineInvariantError) return { ok: false, error: e.message };
    console.error("partner deal facts failed", e);
    return { ok: false, error: "The figures could not be calculated just now. Try again in a moment." };
  }
}

const money = (m: Minor, currency: string): string => formatCurrency(Number(minorToDecimalString(m)), currency);

function parseList(text: string): string[] {
  try {
    const v: unknown = JSON.parse(text);
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v as string[];
  } catch {
    // fall through to the default
  }
  return [...DEFAULT_EXCLUDED_TYPES];
}

function parseRates(text: string | null): { ccy: string; rate: string }[] {
  if (!text) return [];
  try {
    const v: unknown = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.entries(v as Record<string, unknown>)
        .filter(([, r]) => typeof r === "string" || typeof r === "number")
        .map(([ccy, r]) => ({ ccy, rate: String(r) }))
        .sort((a, b) => a.ccy.localeCompare(b.ccy));
    }
  } catch {
    // an unreadable value counts as none
  }
  return [];
}

const FLAG_STYLE = {
  BLOCK: { icon: OctagonAlert, box: "border-red-300 bg-red-50 text-red-900", title: "Must be fixed (settlement is refused)" },
  ACK: { icon: TriangleAlert, box: "border-amber-300 bg-amber-50 text-amber-900", title: "Needs your acknowledgement at settlement" },
  INFO: { icon: Info, box: "border bg-secondary/40 text-foreground", title: "For your information" },
} as const;

function Figure({ label, hint, value, negative = false, accent = false }: { label: string; hint?: string; value: string; negative?: boolean; accent?: boolean }) {
  return (
    <Card className={accent ? "border-sgs-teal-500/50" : undefined}>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`num mt-0.5 font-serif text-xl ${negative ? "text-red-700" : ""}`}>{value}</div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export async function OverviewTab({ dealId }: { dealId: string }) {
  const session = await requireCapability("partner:read");
  const canWrite = can(session.user, "partner:write");

  const deal = await prisma.partnerDeal.findUnique({
    where: { id: dealId },
    select: {
      id: true, code: true, status: true, title: true, partnerTitle: true, method: true, scope: true, earnOn: true, currency: true,
      ratePct: true, fixedFee: true, invested: true, capitalProtected: true, excludedCostTypes: true, rateOverrides: true, ratesFrozenAt: true,
      formulaVersion: true, termsVersion: true, termsAmendedAt: true, partnerNote: true, internalNotes: true, activatedAt: true, closedAt: true,
      createdAt: true, createdByName: true,
      partner: { select: { name: true } },
      stones: { where: { removedAt: null }, select: { id: true, roughStone: { select: { code: true } }, gemstone: { select: { code: true } } } },
    },
  });
  if (!deal) notFound();
  const method = deal.method as PayoutMethod;
  const scope = deal.scope as PartnerScope;
  const earnOn = deal.earnOn as EarnOn;
  const open = deal.status === "DRAFT" || deal.status === "ACTIVE";

  const [settlements, adjustments, payouts, factsResult] = await Promise.all([
    prisma.partnerSettlement.count({ where: { dealId } }),
    prisma.partnerAdjustment.count({ where: { dealId } }),
    prisma.partnerPayout.count({ where: { dealId } }),
    loadDealFacts(dealId),
  ]);
  const hasLedger = settlements + adjustments + payouts > 0;
  const facts = factsResult.ok ? factsResult.facts : null;
  const cur = deal.currency;

  let obligations: Awaited<ReturnType<typeof checkObligations>> | null = null;
  if (facts && open && deal.stones.length > 0) {
    try {
      obligations = await checkObligations(prisma, dealId);
    } catch (e) {
      if (!(e instanceof PartnerGatherError || e instanceof EngineInvariantError)) console.error("partner obligations check failed", e);
    }
  }

  const excluded = parseList(deal.excludedCostTypes);
  const rates = parseRates(deal.rateOverrides);
  const stoneCode = new Map(deal.stones.map((s) => [s.id, s.roughStone?.code ?? s.gemstone?.code ?? "Stone"] as const));

  // Cost types: every line the gatherer saw, grouped by type (rejected and replaced lines are not costs).
  const byType = new Map<string, CostTypeRow>();
  if (facts) {
    for (const u of facts.evidence.units) {
      for (const l of u.costLines) {
        if (l.excluded !== undefined && l.excluded !== "EXCLUDED_TYPE") continue;
        const row = byType.get(l.type) ?? { type: l.type, amountMinor: 0, lines: 0, missingRate: 0 };
        row.lines += 1;
        if (l.convertedMinor === null) row.missingRate += 1;
        else row.amountMinor += l.convertedMinor;
        byType.set(l.type, row);
      }
    }
  }
  for (const t of excluded) if (!byType.has(t)) byType.set(t, { type: t, amountMinor: 0, lines: 0, missingRate: 0 });
  const costRows = [...byType.values()].sort((a, b) => a.type.localeCompare(b.type));

  const flags = facts?.flags ?? [];
  // "no rate for USD, EUR on <stone>" and "no rate for USD/LKR (<stone>)": the currencies the gatherer could not convert.
  const rateCurrencies = [
    ...new Set(
      flags
        .filter((f) => f.code.startsWith("NEEDS_RATE"))
        .flatMap((f) => /no rate for ([A-Z]{3}(?:[/,]\s*[A-Z]{3})*)/.exec(f.detail)?.[1].match(/[A-Z]{3}/g) ?? [])
        .filter((c) => c !== "LKR"),
    ),
  ].sort();
  const bySeverity = (s: GatherFlag["severity"]) => flags.filter((f) => f.severity === s);

  const drift =
    facts === null
      ? []
      : facts.result.buckets
          .map((b) => {
            const credited = facts.ledger.perBucket.find((p) => p.bucketKey === b.bucketKey)?.credited ?? 0;
            return { key: b.bucketKey, label: b.bucketKey === "POOL" ? "The pool" : stoneCode.get(b.bucketKey) ?? "Stone", engine: b.amountMinor, credited, delta: b.amountMinor - credited };
          })
          .filter((d) => d.delta !== 0);

  const termValue =
    method === "FIXED_FEE"
      ? deal.fixedFee === null ? "Not set" : `${money(decimalToMinor(deal.fixedFee), cur)} ${scope === "PER_STONE" ? "per stone" : "for the whole lot"}`
      : deal.ratePct === null ? "Not set" : `${Number(deal.ratePct.toString())}%`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {deal.status === "DRAFT" && "Draft. The terms are editable and the partner's link does not work yet. Add the stones, check the figures and flags, then start the deal."}
          {deal.status === "ACTIVE" && "Active. The partner's link works and the estimate is live. Settle on the Money tab."}
          {deal.status === "CLOSED" && "Closed. The history is read-only; the partner's link keeps showing the statement."}
          {deal.status === "CANCELLED" && "Cancelled. Nothing is owed and the stones are free for other deals."}
        </p>
        <DealStatusActions dealId={deal.id} code={deal.code} status={deal.status} hasLedger={hasLedger} canWrite={canWrite} />
      </div>

      <div role="note" className={`flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 ${method === "INVESTMENT" || method === "PROFIT_SHARE" ? "border-2 border-amber-400 p-4 text-sm" : "text-xs"}`}>
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{LEGAL_NOTICE}</p>
      </div>

      {!factsResult.ok && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">The figures cannot be calculated yet.</p>
            <p className="text-xs">{factsResult.error}</p>
          </div>
        </div>
      )}

      {rateCurrencies.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Exchange rate needed for {rateCurrencies.join(", ")}. Add a manual rate
            {canWrite && open && !hasLedger ? (
              <>
                {" "}in the <Link href={`/partners/deals/${deal.id}?edit=1`} className="font-medium underline">deal form</Link>.
              </>
            ) : hasLedger ? (
              <> with Revalue rates on the Money tab.</>
            ) : (
              "."
            )}
          </p>
        </div>
      )}

      <section aria-label="Figures" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Figure label="Estimate" hint="Live, may change until settled" value={facts ? money(facts.result.totalMinor, cur) : "n/a"} accent />
        <Figure label="Settled" hint="Confirmed statements" value={facts ? money(facts.ledger.settled, cur) : "n/a"} />
        <Figure label="Adjustments" hint="Signed corrections" value={facts ? money(facts.ledger.adjustments, cur) : "n/a"} negative={!!facts && facts.ledger.adjustments < 0} />
        <Figure label="Paid" hint="Paid minus received back" value={facts ? money(facts.ledger.netPaid, cur) : "n/a"} />
        <Figure
          label="Balance"
          hint={facts && facts.ledger.balance < 0 ? "Carried forward against the partner" : "Settled + adjustments - paid"}
          value={facts ? money(facts.ledger.balance, cur) : "n/a"}
          negative={!!facts && facts.ledger.balance < 0}
        />
        <Figure label="Not yet settled" hint="Estimate - settled - adjustments" value={facts ? money(facts.notYetSettled, cur) : "n/a"} negative={!!facts && facts.notYetSettled < 0} />
      </section>

      {facts && facts.result.capitalOutstandingMinor !== null && (
        <p className="text-sm text-muted-foreground">
          Capital still at work: <span className="font-medium text-foreground">{money(facts.result.capitalOutstandingMinor, cur)}</span>
          {facts.result.capitalWrittenOffMinor ? <> · written off: <span className="font-medium text-foreground">{money(facts.result.capitalWrittenOffMinor, cur)}</span></> : null}
        </p>
      )}

      {facts && deal.stones.length === 0 && open && (
        <p className="rounded-lg border bg-secondary/30 p-4 text-center text-sm text-muted-foreground">Nothing earned yet. Add stones on the Stones tab; estimates appear once a stone is sold.</p>
      )}

      {flags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Flags</CardTitle>
            <CardDescription>From the latest calculation. Fixing the cause makes a flag disappear.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(["BLOCK", "ACK", "INFO"] as const).map((sev) => {
              const list = bySeverity(sev);
              if (list.length === 0) return null;
              const style = FLAG_STYLE[sev];
              const Icon = style.icon;
              const body = (
                <ul className="space-y-2">
                  {list.map((f, i) => {
                    const info = Object.prototype.hasOwnProperty.call(FLAG_INFO, f.code) ? FLAG_INFO[f.code as keyof typeof FLAG_INFO] : null;
                    return (
                      <li key={`${f.code}-${i}`} className={`rounded-md border p-2.5 text-sm ${style.box}`}>
                        <div className="flex items-start gap-2">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                          <div className="min-w-0 space-y-0.5">
                            <p className="font-medium">{info?.label ?? f.code.replaceAll("_", " ").toLowerCase()}</p>
                            {f.detail && <p className="break-words text-xs opacity-90">{f.detail}</p>}
                            {info && <p className="text-xs"><span className="font-medium">Fix:</span> {info.fix}</p>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              );
              return sev === "INFO" ? (
                <details key={sev}>
                  <summary className="cursor-pointer text-sm font-medium">{style.title} ({list.length})</summary>
                  <div className="mt-2">{body}</div>
                </details>
              ) : (
                <div key={sev} className="space-y-2">
                  <p className="text-sm font-medium">{style.title} ({list.length})</p>
                  {body}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {facts && open && deal.stones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Checks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {obligations && (
              <div className={`flex items-start gap-2 rounded-md border p-2.5 ${obligations.blocked ? "border-red-300 bg-red-50 text-red-900" : obligations.exceedsProfit ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                {obligations.blocked ? <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : obligations.exceedsProfit ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                <div>
                  <p className="font-medium">
                    Amounts owed across the open partner deals on these stones: {money(obligations.obligationsMinor, cur)} against revenue of {money(obligations.revenueMinor, cur)}.
                  </p>
                  <p className="text-xs">
                    {obligations.blocked
                      ? "The amounts owed exceed the revenue. Settlement is refused until this is fixed."
                      : obligations.exceedsProfit
                        ? "The amounts owed (less returned capital) exceed the company's realised profit. This is expected when per-stone deals floor losses; check it is intended."
                        : "Within the revenue, and within the company's profit."}
                  </p>
                </div>
              </div>
            )}
            {drift.length > 0 ? (
              <div className="space-y-1.5">
                <p className="font-medium">Estimate against what has been credited</p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Where</th>
                        <th className="px-3 py-1.5 text-right font-medium">Estimate</th>
                        <th className="px-3 py-1.5 text-right font-medium">Credited</th>
                        <th className="px-3 py-1.5 text-right font-medium">Difference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {drift.map((d) => (
                        <tr key={d.key}>
                          <td className="px-3 py-1.5">{d.label}</td>
                          <td className="num px-3 py-1.5 text-right">{money(d.engine, cur)}</td>
                          <td className="num px-3 py-1.5 text-right">{money(d.credited, cur)}</td>
                          <td className={`num px-3 py-1.5 text-right ${d.delta < 0 ? "text-red-700" : ""}`}>{money(d.delta, cur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">The Money tab turns a difference into a settlement line or an adjustment when you reconcile.</p>
              </div>
            ) : (
              !obligations && <p className="text-muted-foreground">Nothing to check yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Terms</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <KV label="Partner">{deal.partner.name}</KV>
            <KV label="Method">
              <span className="font-medium">{METHOD_LABEL[method]}</span>
              <span className="block text-xs text-muted-foreground">{METHOD_FORMULA[method]}</span>
            </KV>
            <KV label={method === "FIXED_FEE" ? "Fee" : "Rate"}>{termValue}</KV>
            {method === "INVESTMENT" && (
              <>
                <KV label="Invested">{deal.invested === null ? "Not set" : money(decimalToMinor(deal.invested), cur)}</KV>
                <KV label="Capital first on a loss">{deal.capitalProtected ? "Yes: the company bears a shortfall" : "No: a loss is shared"}</KV>
              </>
            )}
            <KV label="Scope">
              <span className="font-medium">{SCOPE_LABEL[scope]}</span>
              <span className="block text-xs text-muted-foreground">{SCOPE_NOTE[scope]}</span>
            </KV>
            <KV label="Earned">
              <span className="font-medium">{EARN_ON_LABEL[earnOn]}</span>
              <span className="block text-xs text-muted-foreground">{EARN_ON_NOTE[earnOn]}</span>
            </KV>
            <KV label="Currency">{cur}</KV>
            <KV label="Manual rates">
              {rates.length === 0 ? (
                <span className="text-muted-foreground">None (live rates)</span>
              ) : (
                <span>
                  {rates.map((r) => `1 ${r.ccy} = ${r.rate} LKR`).join(" · ")}
                  {deal.ratesFrozenAt && <Badge variant="muted" className="ml-2">Frozen {formatDate(deal.ratesFrozenAt)}</Badge>}
                </span>
              )}
            </KV>
            <KV label="Terms version">
              {deal.termsVersion}
              {deal.termsAmendedAt && <span className="text-muted-foreground"> · amended {formatDate(deal.termsAmendedAt)}</span>}
              <span className="text-muted-foreground"> · formula {deal.formulaVersion}</span>
            </KV>
            <KV label="Partner sees as title">{deal.partnerTitle ?? <span className="text-muted-foreground">Your deal</span>}</KV>
            <KV label="Note to partner">{deal.partnerNote ?? <span className="text-muted-foreground">None</span>}</KV>
            <KV label="Internal notes"><span className="whitespace-pre-wrap">{deal.internalNotes ?? <span className="text-muted-foreground">None</span>}</span></KV>
            <KV label="Dates">
              Created {formatDate(deal.createdAt)}{deal.createdByName ? ` by ${deal.createdByName}` : ""}
              {deal.activatedAt && ` · started ${formatDate(deal.activatedAt)}`}
              {deal.closedAt && ` · ${deal.status === "CANCELLED" ? "cancelled" : "closed"} ${formatDate(deal.closedAt)}`}
            </KV>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cost types in this deal</CardTitle>
          <CardDescription>
            Every cost recorded against the deal&apos;s stones, by type. Unticked types are never charged to the partner. The stone&apos;s own purchase price always counts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {costRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No costs are recorded against these stones yet.</p>
          ) : (
            <CostTypesTable dealId={deal.id} currency={cur} rows={costRows} excluded={excluded} editable={canWrite && open} hasLedger={hasLedger} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
