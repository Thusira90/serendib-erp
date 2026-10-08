"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { revalueRatesAction } from "../../ledger-actions";

const RATE_RE = /^\d{1,9}(\.\d{1,6})?$/;

export type RevalueRow = {
  currency: string;
  /** LKR per 1 unit as stored, or null when no rate is available yet. */
  rate: string | null;
  source: "MANUAL" | "LIVE" | "FALLBACK" | null;
};

const SOURCE_BADGE: Record<NonNullable<RevalueRow["source"]>, { label: string; variant: BadgeProps["variant"] }> = {
  MANUAL: { label: "Manual", variant: "teal" },
  LIVE: { label: "Live", variant: "success" },
  FALLBACK: { label: "Fallback (approximate)", variant: "warning" },
};

export function RevalueDialog({ dealId, frozen, rows }: { dealId: string; frozen: boolean; rows: RevalueRow[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  const valueOf = (r: RevalueRow): string => values[r.currency] ?? r.rate ?? "";
  const invalid = rows.some((r) => {
    const v = valueOf(r).trim();
    return v !== "" && (!RATE_RE.test(v) || Number(v) <= 0);
  });
  const changed = rows.filter((r) => {
    const v = valueOf(r).trim();
    return v !== "" && RATE_RE.test(v) && Number(v) > 0 && (r.rate === null || Number(v) !== Number(r.rate));
  });
  const canSubmit = !pending && !invalid && changed.length > 0 && reason.trim().length > 0;

  function reset() {
    setValues({}); setReason(""); setError(null);
  }

  function submit() {
    if (!canSubmit) return;
    setError(null);
    start(async () => {
      const res = await revalueRatesAction({
        dealId,
        rates: Object.fromEntries(changed.map((r) => [r.currency, valueOf(r).trim()])),
        reason: reason.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      reset();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) { setOpen(o); if (!o) reset(); } }}>
      <DialogTrigger asChild>
        <Button variant="outline"><ArrowLeftRight className="h-4 w-4" /> Revalue rates</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revalue exchange rates</DialogTitle>
          <DialogDescription>
            {frozen
              ? "The first settlement froze this deal's rates so that live rate changes never move an amount already credited. This is the only way to change them."
              : "Set a fixed rate for a currency. Once the first settlement is recorded the rates in use are frozen and can only be changed here."}
            {" "}Nothing is restated now: the next reconcile proposes the effect as an exchange-rate correction.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
          <div className="space-y-2">
            {rows.map((r) => {
              const v = valueOf(r);
              const bad = v.trim() !== "" && (!RATE_RE.test(v.trim()) || Number(v.trim()) <= 0);
              return (
                <div key={r.currency} className="grid items-center gap-2 sm:grid-cols-[7rem_1fr_6rem]">
                  <Label htmlFor={`rate-${r.currency}`} className="normal-case tracking-normal text-sm text-foreground">1 {r.currency} =</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`rate-${r.currency}`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={v}
                      onChange={(e) => setValues((prev) => ({ ...prev, [r.currency]: e.target.value }))}
                      placeholder="No rate yet"
                      aria-invalid={bad}
                    />
                    <span className="text-sm text-muted-foreground">LKR</span>
                  </div>
                  <div>{r.source ? <Badge variant={SOURCE_BADGE[r.source].variant}>{SOURCE_BADGE[r.source].label}</Badge> : <Badge variant="danger">Missing</Badge>}</div>
                </div>
              );
            })}
            {invalid && <p className="text-xs text-red-600">A rate must be a positive number with at most 6 decimals.</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rate-reason">Reason *</Label>
            <Textarea id="rate-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are the rates changing?" />
          </div>

          {error && <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{changed.length === 0 ? "No rate changed yet." : `${changed.length} ${changed.length === 1 ? "rate" : "rates"} will change.`}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={!canSubmit}>{pending ? "Saving..." : "Revalue rates"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
