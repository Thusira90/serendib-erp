import type { ReactNode } from "react";
import type { PartnerPortalDto } from "@/lib/partner-dto";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { effectIsNegative, fmtDate, fmtEffect, fmtMoney, fmtPct, Row, Section } from "./portal-ui";

type Deal = PartnerPortalDto["deal"];
type Statement = PartnerPortalDto["statement"];

function Figure({ tag, variant, title, sub, children }: {
  tag: string;
  variant: BadgeProps["variant"];
  title: string;
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">{title}</div>
        <Badge variant={variant} className="shrink-0 text-[10px] uppercase tracking-wider">{tag}</Badge>
      </div>
      <div className="num mt-2 break-words font-serif text-2xl">{children}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

interface HistoryRow {
  seq: number;
  on: string;
  ref: string;
  label: string;
  effect: string;
  negative: boolean;
  note: string | null;
}

function historyRows(s: Statement): HistoryRow[] {
  const rows: Omit<HistoryRow, "seq">[] = [];
  for (const x of s.settlements) {
    rows.push({ on: x.on, ref: x.ref, label: "Settled statement", effect: fmtEffect(x.amount), negative: effectIsNegative(x.amount), note: x.note });
  }
  for (const x of s.adjustments.items) {
    rows.push({ on: x.on, ref: x.ref, label: x.label, effect: fmtEffect(x.amount), negative: effectIsNegative(x.amount), note: x.note });
  }
  for (const x of s.paid.items) {
    const sign = x.direction === "PAID" ? -1 : 1;
    rows.push({
      on: x.on,
      ref: x.ref,
      label: x.direction === "PAID" ? "Paid to you" : "Received back from you",
      effect: fmtEffect(x.amount, sign),
      negative: effectIsNegative(x.amount, sign),
      note: x.note,
    });
  }
  return rows
    .map((r, seq) => ({ ...r, seq }))
    .sort((a, b) => b.on.localeCompare(a.on) || a.seq - b.seq);
}

const LEGEND: { term: string; text: string }[] = [
  { term: "Estimated", text: "recalculated from current sales and costs. It can change until it is settled." },
  { term: "Settled", text: "confirmed statements. These figures are fixed." },
  { term: "Adjustments", text: "recorded corrections, positive or negative." },
  { term: "Paid", text: "amounts paid to you." },
  { term: "Balance", text: "settled + adjustments − paid." },
];

export function StatementCards({ statement: s }: { statement: Statement }) {
  const negative = s.balance.amount < 0;
  const awaiting = s.estimate.amount.amount === 0 && s.estimate.soldStones > 0;
  const history = historyRows(s);
  const parts: { label: string; value: string }[] = [];
  if (s.estimate.parts.capitalReturned) parts.push({ label: "Capital returned", value: fmtMoney(s.estimate.parts.capitalReturned) });
  if (s.estimate.parts.profitShare) parts.push({ label: "Your share of profit", value: fmtMoney(s.estimate.parts.profitShare) });
  if (s.estimate.parts.commission) parts.push({ label: "Your commission", value: fmtMoney(s.estimate.parts.commission) });
  if (s.estimate.parts.fixedFee) parts.push({ label: "Your fixed fee", value: fmtMoney(s.estimate.parts.fixedFee) });
  const capital: { label: string; value: string }[] = [];
  if (s.capitalOutstanding) capital.push({ label: "Capital still at work", value: fmtMoney(s.capitalOutstanding) });
  if (s.capitalWrittenOff) capital.push({ label: "Capital written off", value: fmtMoney(s.capitalWrittenOff) });

  return (
    <Section id="account" title="Your account">
      <Card className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-end">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {negative ? "Balance carried forward against you" : "Balance due to you"}
            </div>
            <div className={cn("num mt-1 break-words font-serif text-4xl sm:text-5xl", negative && "text-red-700")}>
              {fmtMoney(s.balance)}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {negative
                ? "This amount is carried forward and will be netted against what you earn next."
                : s.balance.amount === 0
                  ? "Nothing is due to you at the moment."
                  : "Settled and adjusted earnings that have not been paid to you yet."}
            </p>
          </div>
          <dl aria-label="How the balance is worked out" className="rounded-lg bg-secondary/40 px-4 py-2">
            <Row label="Settled to date" value={fmtEffect(s.settled.amount)} negative={effectIsNegative(s.settled.amount)} />
            <Row label="Adjustments" value={fmtEffect(s.adjustments.amount)} negative={effectIsNegative(s.adjustments.amount)} />
            <Row label="Paid to you" value={fmtEffect(s.paid.amount, -1)} negative={effectIsNegative(s.paid.amount, -1)} />
            <Row label="Balance" value={fmtMoney(s.balance)} negative={negative} strong />
          </dl>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Figure
            tag="Estimate"
            variant="warning"
            title="Estimated earnings (live)"
            sub={
              <>
                {awaiting
                  ? "Nothing is recognised on the sold stones yet. This updates as payments arrive."
                  : s.estimate.soldStones === 0
                    ? "Nothing earned yet. Estimates appear once a stone is sold."
                    : `As of ${fmtDate(s.estimate.asOf)}`}
                {s.estimate.totalStones > 0 && (
                  <span className="mt-0.5 block">{s.estimate.soldStones} of {s.estimate.totalStones} stones sold</span>
                )}
                {s.estimate.incomplete && <span className="mt-0.5 block text-amber-800">Some figures are still being finalised.</span>}
              </>
            }
          >
            {awaiting ? (s.estimate.incomplete ? "Being finalised" : "Awaiting payment") : fmtMoney(s.estimate.amount)}
          </Figure>
          <Figure
            tag="Settled"
            variant="success"
            title="Settled to date"
            sub={s.settled.count > 0 ? `${s.settled.count} ${s.settled.count === 1 ? "statement" : "statements"}${s.settled.lastOn ? `, latest ${fmtDate(s.settled.lastOn)}` : ""}` : "No statement settled yet"}
          >
            {fmtMoney(s.settled.amount)}
          </Figure>
          <Figure
            tag="Adjustments"
            variant="purple"
            title="Adjustments"
            sub={s.adjustments.items.length > 0 ? `${s.adjustments.items.length} recorded` : "None recorded"}
          >
            {fmtMoney(s.adjustments.amount)}
          </Figure>
          <Figure
            tag="Paid"
            variant="default"
            title="Paid to you"
            sub={s.paid.lastOn ? `Latest ${fmtDate(s.paid.lastOn)}` : "Nothing paid yet"}
          >
            {fmtMoney(s.paid.amount)}
          </Figure>
          <Figure
            tag="Not yet settled"
            variant="muted"
            title="Not yet settled"
            sub="Estimated earnings that no statement or adjustment covers yet"
          >
            {fmtMoney(s.notYetSettled)}
          </Figure>
        </div>

        {(parts.length > 0 || capital.length > 0) && (
          <div className="grid gap-6 md:grid-cols-2">
            {parts.length > 0 && (
              <div>
                <h3 className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">What your estimate is made of</h3>
                <dl>{parts.map((p) => <Row key={p.label} label={p.label} value={p.value} />)}</dl>
              </div>
            )}
            {capital.length > 0 && (
              <div>
                <h3 className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Your capital</h3>
                <dl>{capital.map((p) => <Row key={p.label} label={p.label} value={p.value} />)}</dl>
              </div>
            )}
          </div>
        )}

        <dl className="grid gap-x-6 gap-y-1 rounded-lg border border-dashed p-4 text-xs text-muted-foreground sm:grid-cols-2">
          {LEGEND.map((l) => (
            <div key={l.term}>
              <dt className="inline font-semibold text-foreground">{l.term}</dt>
              <dd className="inline"> = {l.text}</dd>
            </div>
          ))}
        </dl>

        <div>
          <h3 className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">History</h3>
          {history.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing has been settled or paid yet.</p>
          ) : (
            <ul className="divide-y">
              {history.map((h) => (
                <li key={h.seq} className="avoid-break grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 py-3 text-sm md:grid-cols-[6.5rem_7.5rem_1fr_auto] md:gap-x-4">
                  <span className="col-start-1 row-start-2 text-xs text-muted-foreground num md:row-start-1 md:text-sm">{fmtDate(h.on)}</span>
                  <span className="col-start-2 row-start-2 text-right font-mono text-xs text-muted-foreground md:col-start-2 md:row-start-1 md:text-left">{h.ref}</span>
                  <span className="col-start-1 row-start-1 min-w-0 font-medium md:col-start-3">{h.label}</span>
                  <span className={cn("num col-start-2 row-start-1 text-right font-medium md:col-start-4", h.negative && "text-red-700")}>{h.effect}</span>
                  {h.note && (
                    <span className="col-span-2 row-start-3 whitespace-pre-line text-xs text-muted-foreground md:col-span-2 md:col-start-3 md:row-start-2">{h.note}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {s.calculation === null && (
          <p className="text-xs text-muted-foreground">Calculated per the agreed terms (see Your terms below).</p>
        )}
      </Card>
    </Section>
  );
}

const earnKind = (label: string): "PAYMENT" | "SALE" | null => {
  const pay = /pay/i.test(label);
  const sale = /\bsale\b|\bsold\b/i.test(label);
  return pay === sale ? null : pay ? "PAYMENT" : "SALE";
};

const scopeKind = (label: string): "POOLED" | "PER_STONE" | null =>
  /pool/i.test(label) ? "POOLED" : /stone/i.test(label) ? "PER_STONE" : null;

export function TermsCard({ deal }: { deal: Deal }) {
  const t = deal.terms;
  const earn = earnKind(deal.earnOnLabel);
  const scope = scopeKind(deal.scopeLabel);
  const profitBased = t.invested !== null || /profit|invest/i.test(deal.methodLabel);

  return (
    <Section id="terms" title="Your terms">
      <Card className="p-4 sm:p-6">
        <dl className="divide-y">
          <div className="py-3 first:pt-0">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Arrangement</dt>
            <dd className="mt-0.5 font-medium">{deal.methodLabel}</dd>
            {deal.methodNote && <dd className="mt-1 text-sm text-muted-foreground">{deal.methodNote}</dd>}
          </div>
          {(t.ratePct !== null || t.fixedFee || t.invested) && (
            <div className="grid gap-x-6 gap-y-3 py-3 sm:grid-cols-3">
              {t.ratePct !== null && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Rate</dt>
                  <dd className="num mt-0.5 font-serif text-xl">{fmtPct(t.ratePct)}</dd>
                </div>
              )}
              {t.fixedFee && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Fixed fee</dt>
                  <dd className="num mt-0.5 font-serif text-xl">{fmtMoney(t.fixedFee)}</dd>
                </div>
              )}
              {t.invested && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount invested</dt>
                  <dd className="num mt-0.5 font-serif text-xl">{fmtMoney(t.invested)}</dd>
                </div>
              )}
            </div>
          )}
          {t.invested && (
            <div className="py-3">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">If a stone sells for less than it cost</dt>
              <dd className="mt-0.5 text-sm">
                {t.capitalProtected
                  ? "Your capital is returned first, up to what the stone fetched."
                  : "Your capital is returned in proportion to what the stone fetched."}
              </dd>
            </div>
          )}
          <div className="py-3">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">How stones are counted</dt>
            <dd className="mt-0.5 text-sm">
              <span className="font-medium">{deal.scopeLabel}.</span>{" "}
              {scope === "PER_STONE" &&
                (profitBased
                  ? "Each stone is calculated on its own. A stone that sells at a loss counts as zero and does not reduce what you earn on other stones, so profits and losses are not netted across stones."
                  : "Each stone is calculated on its own.")}
              {scope === "POOLED" &&
                (profitBased
                  ? "All stones are calculated together as one pool, so a loss on one stone reduces the profit shared on the others. Stones that have not sold yet are left out until they sell."
                  : "All stones are calculated together as one pool.")}
            </dd>
          </div>
          <div className="py-3">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">When you earn</dt>
            <dd className="mt-0.5 text-sm">
              <span className="font-medium">{deal.earnOnLabel}.</span>{" "}
              {earn === "PAYMENT" && "You are paid in proportion to the payments we receive from the buyer."}
              {earn === "SALE" && "Your earnings count in full once a stone is sold, whether or not the buyer has paid yet."}
            </dd>
          </div>
          <div className="py-3">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Rounding</dt>
            <dd className="mt-0.5 text-sm">Every amount is rounded once, to the nearest cent, with halves rounded away from zero.</dd>
          </div>
          {(deal.startedOn || deal.closedOn || deal.termsAmendedOn) && (
            <div className="grid gap-x-6 gap-y-3 py-3 sm:grid-cols-3">
              {deal.startedOn && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Started</dt>
                  <dd className="mt-0.5 text-sm">{fmtDate(deal.startedOn)}</dd>
                </div>
              )}
              {deal.closedOn && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Closed</dt>
                  <dd className="mt-0.5 text-sm">{fmtDate(deal.closedOn)}</dd>
                </div>
              )}
              {deal.termsAmendedOn && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Terms last amended on</dt>
                  <dd className="mt-0.5 text-sm">{fmtDate(deal.termsAmendedOn)}</dd>
                </div>
              )}
            </div>
          )}
          {deal.partnerNote && (
            <div className="py-3 last:pb-0">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Note from Serendib</dt>
              <dd className="mt-1 whitespace-pre-line rounded-lg bg-secondary/40 p-3 text-sm italic">{deal.partnerNote}</dd>
            </div>
          )}
        </dl>
      </Card>
    </Section>
  );
}
