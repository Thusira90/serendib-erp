import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, ShieldCheck, ShieldX } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { replaySettlement } from "@/lib/partner-ledger";
import { decimalToMinor, minorToDecimalString, type Minor } from "@/lib/partner-money";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PrintButton } from "@/components/print-button";

const METHOD_LABEL: Record<string, string> = {
  PROFIT_SHARE: "Profit share",
  SALE_COMMISSION: "Sale commission",
  FIXED_FEE: "Fixed fee",
  INVESTMENT: "Investment",
};
const SCOPE_LABEL: Record<string, string> = { PER_STONE: "Per stone", POOLED: "Pooled" };
const EARN_ON_LABEL: Record<string, string> = { SALE: "When a stone is sold", PAYMENT: "As buyers pay" };
const SETTLEMENT_REASON_LABEL: Record<string, string> = {
  FIRST: "First earnings for this stone",
  NEW_REALIZATION: "New sale or payment",
  COST_CHANGED: "Costs changed",
  PRICE_CHANGED: "Sale price changed",
};
const SOURCE_BADGE: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  MANUAL: { label: "Manual", variant: "teal" },
  LIVE: { label: "Live", variant: "success" },
  FALLBACK: { label: "Fallback (approximate)", variant: "warning" },
};
const SEVERITY_BADGE: Record<string, BadgeProps["variant"]> = { BLOCK: "danger", ACK: "warning", INFO: "muted" };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type BucketFacts = { key: string; lines: { key: string; label: string; amountMinor: Minor | null }[] };

/** The engine's explain lines per bucket, read defensively from the stored result. */
function bucketFacts(result: unknown): Map<string, BucketFacts> {
  const out = new Map<string, BucketFacts>();
  if (!isRecord(result) || !Array.isArray(result.buckets)) return out;
  for (const b of result.buckets) {
    if (!isRecord(b) || typeof b.bucketKey !== "string") continue;
    const lines: BucketFacts["lines"] = [];
    if (Array.isArray(b.lines)) {
      for (const l of b.lines) {
        if (isRecord(l) && typeof l.key === "string" && typeof l.label === "string") {
          lines.push({ key: l.key, label: l.label, amountMinor: typeof l.amountMinor === "number" ? l.amountMinor : null });
        }
      }
    }
    out.set(b.bucketKey, { key: b.bucketKey, lines });
  }
  return out;
}

export default async function SettlementSnapshotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; sid: string }>;
  searchParams: Promise<{ verify?: string }>;
}) {
  await requireCapability("partner:read");
  const { id, sid } = await params;
  const { verify } = await searchParams;

  const s = await prisma.partnerSettlement.findFirst({
    where: { id: sid, dealId: id },
    select: {
      id: true, code: true, seq: true, formulaVersion: true, termsVersion: true, currency: true, asOf: true, terms: true, inputsHash: true,
      result: true, rates: true, flags: true, earnedTotal: true, positionBefore: true, amount: true, note: true, partnerNote: true,
      createdByName: true, createdAt: true,
      lines: { orderBy: { createdAt: "asc" }, select: { id: true, bucketKey: true, cumulative: true, creditedBefore: true, amount: true, reasons: true } },
      deal: { select: { id: true, code: true, title: true, partner: { select: { id: true, name: true } } } },
    },
  });
  if (!s) notFound();

  const stones = await prisma.partnerDealStone.findMany({
    where: { dealId: id },
    select: { id: true, roughStone: { select: { code: true } }, gemstone: { select: { code: true } } },
  });
  const stoneLabel = new Map(stones.map((d) => [d.id, d.roughStone?.code ?? d.gemstone?.code ?? "Stone"] as const));
  const labelOf = (key: string): string => (key === "POOL" ? "Pool" : stoneLabel.get(key) ?? "Removed stone");

  const currency = s.currency;
  const money = (m: Minor) => formatCurrency(Number(minorToDecimalString(m)), currency);
  const dec = (v: { toString(): string }) => money(decimalToMinor(v));

  const terms = parseJson(s.terms);
  const rates = parseJson(s.rates);
  const flagsRaw = parseJson(s.flags);
  const facts = bucketFacts(parseJson(s.result));

  const termRows: [string, string][] = [];
  if (isRecord(terms)) {
    if (typeof terms.method === "string") termRows.push(["Method", METHOD_LABEL[terms.method] ?? terms.method]);
    if (typeof terms.scope === "string") termRows.push(["Scope", SCOPE_LABEL[terms.scope] ?? terms.scope]);
    if (typeof terms.earnOn === "string") termRows.push(["Earns", EARN_ON_LABEL[terms.earnOn] ?? terms.earnOn]);
    if (typeof terms.rateBp === "number") termRows.push(["Rate", `${terms.rateBp / 100}%`]);
    if (typeof terms.feeMinor === "number") termRows.push(["Fixed fee", money(terms.feeMinor)]);
    if (typeof terms.investedMinor === "number") termRows.push(["Invested", money(terms.investedMinor)]);
    if (typeof terms.capitalProtected === "boolean") termRows.push(["Capital returned first on a loss", terms.capitalProtected ? "Yes" : "No"]);
  }
  termRows.push(["Currency", currency], ["Terms version", String(s.termsVersion)], ["Formula version", s.formulaVersion]);

  const rateEntries =
    isRecord(rates) && isRecord(rates.perUnit)
      ? Object.entries(rates.perUnit)
          .filter((e): e is [string, Record<string, unknown>] => isRecord(e[1]))
          .sort(([a], [b]) => a.localeCompare(b))
      : [];
  const fetchedAt = isRecord(rates) && typeof rates.fetchedAt === "string" ? rates.fetchedAt : null;

  const flags = Array.isArray(flagsRaw) ? flagsRaw.filter(isRecord) : [];

  const replay = verify === "1" ? await replaySettlement(s.id) : null;
  const here = `/partners/deals/${s.deal.id}/settlements/${s.id}`;

  return (
    <div className="space-y-6">
      <Link href={`/partners/deals/${s.deal.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="h-4 w-4" /> Back to {s.deal.code}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary"><Lock className="mr-1 h-3 w-3" aria-hidden /> Immutable snapshot</Badge>
            <span className="font-mono">{s.code}</span>
          </div>
          <h1 className="mt-1 font-serif text-3xl">Settlement {s.code}</h1>
          <p className="text-sm text-muted-foreground">
            {s.deal.code} · {s.deal.partner.name} · {s.deal.title}
          </p>
          <p className="text-xs text-muted-foreground">
            Recorded {formatDateTime(s.createdAt)}{s.createdByName ? ` by ${s.createdByName}` : ""} · calculated as of {formatDateTime(s.asOf)}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button asChild variant="outline" size="sm">
            <Link href={here + "?verify=1"} prefetch={false}><ShieldCheck className="h-4 w-4" /> Verify (replay)</Link>
          </Button>
          <PrintButton />
        </div>
      </div>

      {replay && (
        replay.match ? (
          <div role="status" className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>Verified. Running the stored inputs through formula {s.formulaVersion} again reproduces the stored result exactly.</span>
          </div>
        ) : (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <ShieldX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>Does not match. {replay.diff ?? "The replayed result differs from the stored one."}</span>
          </div>
        )
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Settlement amount" value={dec(s.amount)} />
        <Figure label="Earned in total at the time" value={dec(s.earnedTotal)} />
        <Figure label="Credited before" value={dec(s.positionBefore)} />
        <Figure label="Lines" value={String(s.lines.length)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Terms at the time</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {termRows.map(([label, value]) => (
              <div key={label}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="mt-0.5">{value}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exchange rates used</CardTitle>
            {fetchedAt && <p className="text-xs text-muted-foreground">Fetched {formatDateTime(fetchedAt)}. LKR per 1 unit.</p>}
          </CardHeader>
          <CardContent className="p-0">
            {rateEntries.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Every amount was in LKR, so no exchange rates were used.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateEntries.map(([ccy, r]) => {
                    const src = typeof r.source === "string" ? r.source : "";
                    return (
                      <TableRow key={ccy}>
                        <TableCell className="font-medium">{ccy}</TableCell>
                        <TableCell className="text-right num">{typeof r.rate === "string" ? r.rate : "—"}</TableCell>
                        <TableCell>{SOURCE_BADGE[src] ? <Badge variant={SOURCE_BADGE[src].variant}>{SOURCE_BADGE[src].label}</Badge> : src || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent className="space-y-4 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stone</TableHead>
                <TableHead className="text-right">Calculated</TableHead>
                <TableHead className="text-right">Credited before</TableHead>
                <TableHead className="text-right">This settlement</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.lines.map((l) => {
                const reasons = parseJson(l.reasons);
                const list = Array.isArray(reasons) ? reasons.filter((r): r is string => typeof r === "string") : [];
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{labelOf(l.bucketKey)}</TableCell>
                    <TableCell className="text-right num">{dec(l.cumulative)}</TableCell>
                    <TableCell className="text-right num">{dec(l.creditedBefore)}</TableCell>
                    <TableCell className="text-right num font-medium">{dec(l.amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{list.map((r) => SETTLEMENT_REASON_LABEL[r] ?? r).join(" · ") || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="space-y-3 px-6 pb-6">
            {s.lines.map((l) => {
              const f = facts.get(l.bucketKey);
              if (!f || f.lines.length === 0) return null;
              return (
                <details key={l.id} open className="rounded-md border px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium">How {labelOf(l.bucketKey)} was calculated</summary>
                  <dl className="mt-2 divide-y text-sm">
                    {f.lines.map((x) => (
                      <div key={x.key} className="flex items-center justify-between gap-4 py-1">
                        <dt className="text-muted-foreground">{x.label}</dt>
                        <dd className="num">{x.amountMinor === null ? "n/a" : money(x.amountMinor)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Flags acknowledged</CardTitle>
          <p className="text-xs text-muted-foreground">Raised by the checks at the time and acknowledged by the person who recorded this settlement.</p>
        </CardHeader>
        <CardContent>
          {flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">None. Nothing needed acknowledging.</p>
          ) : (
            <ul className="divide-y text-sm">
              {flags.map((f, i) => {
                const severity = typeof f.severity === "string" ? f.severity : "INFO";
                return (
                  <li key={`${String(f.code)}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span className="flex items-center gap-2">
                      <Badge variant={SEVERITY_BADGE[severity] ?? "muted"}>{severity}</Badge>
                      <span className="font-mono text-xs">{typeof f.code === "string" ? f.code : "UNKNOWN"}</span>
                      {typeof f.bucketKey === "string" && <span className="text-xs text-muted-foreground">{labelOf(f.bucketKey)}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{typeof f.ackedByName === "string" ? `Acknowledged by ${f.ackedByName}` : "Acknowledged"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {(s.note || s.partnerNote) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {s.note && (
            <Card>
              <CardHeader><CardTitle>Internal note</CardTitle></CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">{s.note}</CardContent>
            </Card>
          )}
          {s.partnerNote && (
            <Card>
              <CardHeader><CardTitle>Note to the partner</CardTitle></CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">{s.partnerNote}</CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Integrity</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Inputs hash (SHA-256)</div>
            <div className="mt-0.5 break-all font-mono text-xs">{s.inputsHash}</div>
          </div>
          <p className="text-xs text-muted-foreground">
            The inputs, terms, rates and result above are stored exactly as calculated and are never edited or deleted. If this settlement was wrong,
            the correction is an adjustment on the Money tab. Verify (replay) re-runs the stored inputs and compares the result.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-0.5 font-serif text-xl num">{value}</div>
      </CardContent>
    </Card>
  );
}
