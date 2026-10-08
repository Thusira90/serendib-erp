"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Scale, TriangleAlert } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdjustmentReason } from "@/lib/enums";
import { minorToDecimalString } from "@/lib/partner-money";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { commitReconcileAction, previewReconcileAction, type ReconcileView } from "../../ledger-actions";
import { ADJUSTMENT_REASON_LABEL } from "./adjustment-dialog";

const SELECT_CLASS = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

/** The reasons a reconcile row may carry (the ledger rejects anything else). */
const RECONCILE_CODES = ["COST_CHANGE", "PRICE_CHANGE", "FX_CORRECTION", "CORRECTION", "NETTING", "SALE_CANCELLED"] as const;
type ReconcileCode = (typeof RECONCILE_CODES)[number];
const isReconcileCode = (c: string): c is ReconcileCode => (RECONCILE_CODES as readonly string[]).includes(c);

const SETTLEMENT_REASON_LABEL: Record<string, string> = {
  FIRST: "First earnings for this stone",
  NEW_REALIZATION: "New sale or payment",
  COST_CHANGED: "Costs changed",
  PRICE_CHANGED: "Sale price changed",
};

const SOURCE_BADGE: Record<"MANUAL" | "LIVE" | "FALLBACK", { label: string; variant: BadgeProps["variant"] }> = {
  MANUAL: { label: "Manual", variant: "teal" },
  LIVE: { label: "Live", variant: "success" },
  FALLBACK: { label: "Fallback (approximate)", variant: "warning" },
};

type Row = ReconcileView["proposal"][number];
type Flag = ReconcileView["flags"][number];
type Entry = { code: ReconcileCode; text: string; note: string };
type CommitFailure = { message: string; refresh: boolean };

const money = (m: number, currency: string) => formatCurrency(Number(minorToDecimalString(m)), currency);
const signedMoney = (m: number, currency: string) => `${m > 0 ? "+" : ""}${money(m, currency)}`;
const reasonLabel = (code: string): string =>
  SETTLEMENT_REASON_LABEL[code] ?? (code in ADJUSTMENT_REASON_LABEL ? ADJUSTMENT_REASON_LABEL[code as AdjustmentReason] : code);

function failureOf(res: { error: string; detail?: string[] }): CommitFailure {
  const detail = res.detail ?? [];
  switch (res.error) {
    case "DATA_CHANGED":
      return { message: "The deal changed while you were reviewing (a sale, payment or cost was updated). Nothing was recorded. Review the new figures.", refresh: true };
    case "RATES_STALE":
      return { message: "The exchange rates are more than 15 minutes old. Nothing was recorded. Review again to fetch current rates.", refresh: true };
    case "BLOCKED":
      return { message: `Recording is blocked by: ${detail.join(", ")}. Resolve these first.`, refresh: true };
    case "ACK_REQUIRED":
      return { message: `Acknowledge before recording: ${detail.join(", ")}.`, refresh: true };
    case "NOTHING_TO_DO":
      return { message: "There is nothing left to record; the ledger already matches.", refresh: true };
    case "FORBIDDEN":
      return { message: detail[0] ?? "You do not have permission to do this.", refresh: false };
    default:
      return { message: detail.join(" ") || "The reconcile could not be recorded. Nothing was changed.", refresh: false };
  }
}

export function ReconcileDialog({ dealId, dealCode }: { dealId: string; dealCode: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ReconcileView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [committing, startCommit] = useTransition();
  const [commitFailure, setCommitFailure] = useState<CommitFailure | null>(null);
  const [done, setDone] = useState<{ settlementCode: string | null; adjustmentCodes: string[] } | null>(null);

  const [acks, setAcks] = useState<Record<string, boolean>>({});
  const [forced, setForced] = useState<Record<string, boolean>>({});
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [stlNote, setStlNote] = useState("");
  const [stlPartnerNote, setStlPartnerNote] = useState("");

  function load() {
    setView(null); setLoadError(null); setCommitFailure(null); setDone(null);
    setAcks({}); setForced({}); setEntries({}); setStlNote(""); setStlPartnerNote("");
    startLoad(async () => {
      try {
        const res = await previewReconcileAction(dealId);
        if (!res.ok) {
          setLoadError(res.error);
          return;
        }
        const initial: Record<string, Entry> = {};
        for (const r of res.view.proposal) {
          if (r.kind === "ADJUSTMENT" && isReconcileCode(r.reasonCode)) initial[r.bucketKey] = { code: r.reasonCode, text: "", note: "" };
        }
        setEntries(initial);
        setView(res.view);
      } catch {
        setLoadError("The review could not be loaded. Check your connection and try again.");
      }
    });
  }

  const main = view ? view.proposal.filter((r) => !r.belowMateriality) : [];
  const below = view ? view.proposal.filter((r) => r.belowMateriality) : [];
  const included = [...main, ...below.filter((r) => forced[r.bucketKey])];
  const net = included.reduce((s, r) => s + r.deltaMinor, 0);
  const hasSettlement = included.some((r) => r.kind === "SETTLEMENT");
  const missingAck = view ? view.needsAck.filter((c) => !acks[c]) : [];
  const blocked = view ? view.blocking.length > 0 : false;
  const canConfirm = view !== null && !blocked && missingAck.length === 0 && included.length > 0 && !committing;

  function setEntry(key: string, patch: Partial<Entry>, fallbackCode: ReconcileCode) {
    setEntries((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { code: fallbackCode, text: "", note: "" }), ...patch } }));
  }

  function confirm() {
    if (!view || !canConfirm) return;
    const reasons: Record<string, { code: ReconcileCode; text: string; partnerNote?: string }> = {};
    for (const r of included) {
      if (r.kind !== "ADJUSTMENT" || !isReconcileCode(r.reasonCode)) continue;
      const e = entries[r.bucketKey];
      if (!e) continue;
      const text = e.text.trim();
      const note = e.note.trim();
      if (text === "" && note === "" && e.code === r.reasonCode) continue;
      reasons[r.bucketKey] = { code: e.code, text: text || `Restated by reconcile (${e.code})`, ...(note ? { partnerNote: note } : {}) };
    }
    setCommitFailure(null);
    startCommit(async () => {
      try {
        const res = await commitReconcileAction({
          dealId,
          inputsHash: view.inputsHash,
          rates: view.rates,
          ackedFlags: view.needsAck.filter((c) => acks[c]),
          forceBelowMateriality: below.filter((r) => forced[r.bucketKey]).map((r) => r.bucketKey),
          reasons,
          settlementNote: hasSettlement && stlNote.trim() !== "" ? stlNote.trim() : undefined,
          settlementPartnerNote: hasSettlement && stlPartnerNote.trim() !== "" ? stlPartnerNote.trim() : undefined,
        });
        if (res.ok) {
          setDone({ settlementCode: res.settlementCode, adjustmentCodes: res.adjustmentCodes });
          return;
        }
        setCommitFailure(failureOf(res));
      } catch {
        // The request may or may not have reached the server, so the admin is sent back to a fresh review rather than a blind retry.
        setCommitFailure({ message: "The request did not complete. Review again to see whether it was recorded before trying a second time.", refresh: true });
      }
    });
  }

  const flagGroups = (severity: Flag["severity"]): [string, Flag[]][] => {
    const m = new Map<string, Flag[]>();
    for (const f of view?.flags ?? []) if (f.severity === severity) m.set(f.code, [...(m.get(f.code) ?? []), f]);
    return [...m.entries()];
  };
  const blockGroups = flagGroups("BLOCK");
  const ackGroups = flagGroups("ACK");
  const infoGroups = flagGroups("INFO");

  const currency = view?.currency ?? "";
  const rateEntries = view ? Object.entries(view.rates.perUnit).sort(([a], [b]) => a.localeCompare(b)) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (committing) return; setOpen(o); if (o) load(); }}>
      <DialogTrigger asChild>
        <Button variant="accent"><Scale className="h-4 w-4" /> Reconcile</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reconcile {dealCode}</DialogTitle>
          <DialogDescription>
            Step 1: review what would be recorded from the latest costs, sales and payments. Step 2: confirm. Nothing is saved until you confirm.
          </DialogDescription>
        </DialogHeader>

        {loading && view === null && loadError === null && (
          <p className="py-6 text-center text-sm text-muted-foreground" role="status">Calculating from the latest costs, sales and payments...</p>
        )}

        {loadError !== null && (
          <div className="space-y-3">
            <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
              <Button variant="accent" onClick={load} disabled={loading}>Try again</Button>
            </div>
          </div>
        )}

        {done !== null && (
          <div className="space-y-3">
            <div role="status" className="flex items-start gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                Recorded.
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {done.settlementCode && <li>Settlement <span className="font-mono">{done.settlementCode}</span></li>}
                  {done.adjustmentCodes.map((c) => <li key={c}>Adjustment <span className="font-mono">{c}</span></li>)}
                </ul>
              </div>
            </div>
            <div className="flex justify-end"><Button variant="outline" onClick={() => setOpen(false)}>Close</Button></div>
          </div>
        )}

        {view !== null && done === null && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Figure label="Earned to date" value={money(view.totalMinor, currency)} hint={`as of ${formatDateTime(view.asOf)}`} />
              <Figure label="Credited so far" value={money(view.position, currency)} />
              <Figure label="Recording now" value={signedMoney(net, currency)} tone={net < 0 ? "negative" : undefined} />
              <Figure label="Balance after" value={money(view.balance + net, currency)} tone={view.balance + net < 0 ? "negative" : undefined} />
            </div>

            {blockGroups.length > 0 && (
              <section aria-label="Blocking issues" className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
                  <TriangleAlert className="h-4 w-4" aria-hidden /> Fix these before recording
                </p>
                {blockGroups.map(([code, fs]) => <FlagItem key={code} code={code} flags={fs} />)}
              </section>
            )}

            <section aria-label="Proposed entries" className="space-y-2">
              <h3 className="text-sm font-medium">What will be recorded</h3>
              {main.length === 0 ? (
                <p className="rounded-md border bg-secondary/30 px-3 py-3 text-sm text-muted-foreground">
                  {below.length === 0
                    ? "Nothing to record. The ledger already matches the calculated amounts."
                    : "Nothing needs recording. The only differences are below the materiality threshold, listed next."}
                </p>
              ) : (
                main.map((r) => (
                  <ProposalBlock
                    key={r.bucketKey}
                    row={r}
                    currency={currency}
                    entry={entries[r.bucketKey]}
                    onEntry={(patch) => isReconcileCode(r.reasonCode) && setEntry(r.bucketKey, patch, r.reasonCode)}
                  />
                ))
              )}
              {hasSettlement && (
                <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="stl-note">Settlement note (internal)</Label>
                    <Input id="stl-note" maxLength={500} value={stlNote} onChange={(e) => setStlNote(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="stl-partner-note">Note to the partner (optional)</Label>
                    <Input id="stl-partner-note" maxLength={280} value={stlPartnerNote} onChange={(e) => setStlPartnerNote(e.target.value)} />
                  </div>
                </div>
              )}
            </section>

            {below.length > 0 && (
              <section aria-label="Below materiality" className="space-y-2">
                <h3 className="text-sm font-medium">Below materiality</h3>
                <p className="text-xs text-muted-foreground">
                  Differences smaller than 1.00 or 0.1% of what the stone was credited are not recorded unless you include them.
                </p>
                {below.map((r) => (
                  <div key={r.bucketKey} className="rounded-md border p-3">
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={forced[r.bucketKey] === true}
                        onChange={(e) => setForced((prev) => ({ ...prev, [r.bucketKey]: e.target.checked }))}
                      />
                      <span className="flex-1">
                        Include <span className="font-medium">{r.label}</span>: {signedMoney(r.deltaMinor, currency)}
                        <span className="ml-2 text-xs text-muted-foreground">{reasonLabel(r.reasonCode)}</span>
                      </span>
                    </label>
                    {forced[r.bucketKey] === true && (
                      <div className="mt-2">
                        <ReasonFields row={r} entry={entries[r.bucketKey]} onEntry={(patch) => isReconcileCode(r.reasonCode) && setEntry(r.bucketKey, patch, r.reasonCode)} />
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {ackGroups.length > 0 && (
              <section aria-label="Flags to acknowledge" className="space-y-2">
                <h3 className="text-sm font-medium">Acknowledge before recording</h3>
                {ackGroups.map(([code, fs]) => (
                  <div key={code} className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-3">
                    <FlagItem code={code} flags={fs} />
                    <label className="flex items-center gap-2 text-xs font-medium text-amber-950">
                      <input type="checkbox" checked={acks[code] === true} onChange={(e) => setAcks((prev) => ({ ...prev, [code]: e.target.checked }))} />
                      I have reviewed this
                    </label>
                  </div>
                ))}
              </section>
            )}

            {infoGroups.length > 0 && (
              <details className="rounded-md border px-3 py-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">{infoGroups.length} {infoGroups.length === 1 ? "note" : "notes"} for information</summary>
                <div className="mt-2 space-y-2">
                  {infoGroups.map(([code, fs]) => <FlagItem key={code} code={code} flags={fs} />)}
                </div>
              </details>
            )}

            <section aria-label="Exchange rates" className="space-y-1.5">
              <h3 className="text-sm font-medium">Exchange rates used</h3>
              {rateEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground">Every amount is in LKR, so no exchange rates are used.</p>
              ) : (
                <>
                  <ul className="divide-y rounded-md border text-sm">
                    {rateEntries.map(([ccy, r]) => (
                      <li key={ccy} className="flex items-center justify-between gap-3 px-3 py-1.5">
                        <span>1 {ccy} = <span className="num">{r.rate}</span> LKR</span>
                        <Badge variant={SOURCE_BADGE[r.source].variant}>{SOURCE_BADGE[r.source].label}</Badge>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Fetched {formatDateTime(view.rates.fetchedAt)}. These exact rates are stored with the settlement and frozen on the deal at the first one.
                    They stay valid for 15 minutes.
                  </p>
                </>
              )}
            </section>

            {commitFailure !== null && (
              <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{commitFailure.message}</div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">
                {blocked
                  ? "Resolve the blocking issues first."
                  : missingAck.length > 0
                    ? "Acknowledge every flag above."
                    : included.length === 0
                      ? "Nothing to record."
                      : `${included.length} ${included.length === 1 ? "entry" : "entries"} will be recorded.`}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" disabled={committing} onClick={() => setOpen(false)}>Cancel</Button>
                {commitFailure?.refresh && <Button variant="outline" disabled={loading || committing} onClick={load}>Review again</Button>}
                <Button variant="accent" disabled={!canConfirm} onClick={confirm}>{committing ? "Recording..." : "Confirm and record"}</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "negative" }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`num font-serif text-lg leading-tight ${tone === "negative" ? "text-red-700" : ""}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function FlagItem({ code, flags }: { code: string; flags: Flag[] }) {
  return (
    <div className="space-y-1 text-xs">
      <Badge variant="outline" className="font-mono">{code}</Badge>
      <ul className="list-disc space-y-0.5 pl-5 text-foreground/80">
        {flags.map((f, i) => <li key={`${f.unitKey ?? f.bucketKey ?? ""}-${i}`}>{f.detail}</li>)}
      </ul>
    </div>
  );
}

function ProposalBlock({ row, currency, entry, onEntry }: { row: Row; currency: string; entry: Entry | undefined; onEntry: (patch: Partial<Entry>) => void }) {
  const settlement = row.kind === "SETTLEMENT";
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{row.label}</span>
          <Badge variant={settlement ? "success" : "warning"}>{settlement ? "Settlement" : "Adjustment"}</Badge>
        </div>
        <span className={`num text-sm font-medium ${row.deltaMinor < 0 ? "text-red-700" : ""}`}>{signedMoney(row.deltaMinor, currency)}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
        <span>Calculated {money(row.engineMinor, currency)}</span>
        <span>Credited so far {money(row.creditedMinor, currency)}</span>
      </div>
      {settlement ? (
        <p className="text-xs text-muted-foreground">{(row.reasons ?? [row.reasonCode]).map(reasonLabel).join(" · ")}</p>
      ) : (
        <ReasonFields row={row} entry={entry} onEntry={onEntry} />
      )}
    </div>
  );
}

function ReasonFields({ row, entry, onEntry }: { row: Row; entry: Entry | undefined; onEntry: (patch: Partial<Entry>) => void }) {
  if (!isReconcileCode(row.reasonCode)) {
    return <p className="text-xs text-muted-foreground">{reasonLabel(row.reasonCode)}. Recorded as calculated.</p>;
  }
  const e: Entry = entry ?? { code: row.reasonCode, text: "", note: "" };
  const id = `rec-${row.bucketKey}`;
  return (
    <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-code`}>Reason</Label>
        <select id={`${id}-code`} value={e.code} onChange={(ev) => onEntry({ code: ev.target.value as ReconcileCode })} className={SELECT_CLASS}>
          {RECONCILE_CODES.map((c) => <option key={c} value={c}>{ADJUSTMENT_REASON_LABEL[c]}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-text`}>Explanation (internal)</Label>
        <Input id={`${id}-text`} maxLength={500} value={e.text} onChange={(ev) => onEntry({ text: ev.target.value })} placeholder={`Restated by reconcile (${e.code})`} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${id}-note`}>Note to the partner (optional)</Label>
        <Input id={`${id}-note`} maxLength={280} value={e.note} onChange={(ev) => onEntry({ note: ev.target.value })} />
      </div>
    </div>
  );
}
