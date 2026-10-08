"use client";

import { useState, useTransition } from "react";
import { PlusCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdjustmentReason } from "@/lib/enums";
import { decimalToMinor, minorToDecimalString } from "@/lib/partner-money";
import { formatCurrency } from "@/lib/utils";
import { createAdjustmentAction } from "../../ledger-actions";

const SELECT_CLASS = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";
const AMOUNT_RE = /^\d{1,12}(\.\d{1,2})?$/;

export const ADJUSTMENT_REASON_LABEL: Record<AdjustmentReason, string> = {
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
const REASON_ORDER = Object.keys(ADJUSTMENT_REASON_LABEL) as AdjustmentReason[];

const money = (m: number, currency: string) => formatCurrency(Number(minorToDecimalString(m)), currency);

function parseMinor(text: string): number | null {
  const t = text.replace(/[,\s]/g, "");
  return AMOUNT_RE.test(t) ? decimalToMinor(t) : null;
}

export function AdjustmentDialog({
  dealId,
  currency,
  balanceMinor,
  buckets,
  settlements,
}: {
  dealId: string;
  currency: string;
  balanceMinor: number;
  buckets: { key: string; label: string }[];
  settlements: { id: string; code: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [target, setTarget] = useState("");
  const [sign, setSign] = useState<"ADD" | "DEDUCT">("ADD");
  const [amount, setAmount] = useState("");
  const [reasonCode, setReasonCode] = useState<AdjustmentReason>("MANUAL");
  const [reason, setReason] = useState("");
  const [partnerNote, setPartnerNote] = useState("");
  const [settlementId, setSettlementId] = useState("");

  const minor = parseMinor(amount);
  const signed = minor === null ? null : sign === "DEDUCT" ? -minor : minor;
  const balanceAfter = signed === null || signed === 0 ? null : balanceMinor + signed;
  const canSubmit = !pending && signed !== null && signed !== 0 && reason.trim().length > 0;

  function reset() {
    setTarget(""); setSign("ADD"); setAmount(""); setReasonCode("MANUAL"); setReason(""); setPartnerNote(""); setSettlementId(""); setError(null);
  }

  function submit() {
    if (!canSubmit || minor === null) return;
    setError(null);
    start(async () => {
      const res = await createAdjustmentAction({
        dealId,
        bucketKey: target === "" ? null : target,
        amount: `${sign === "DEDUCT" ? "-" : ""}${amount.replace(/[,\s]/g, "")}`,
        reasonCode,
        reason: reason.trim(),
        partnerNote: partnerNote.trim() === "" ? undefined : partnerNote.trim(),
        settlementId: settlementId === "" ? undefined : settlementId,
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
        <Button variant="outline"><PlusCircle className="h-4 w-4" /> Add adjustment</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add adjustment</DialogTitle>
          <DialogDescription>
            A signed correction to what the partner has earned. It is added to the ledger and cannot be edited; to undo one, add an
            opposite adjustment.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="adj-target">Applies to</Label>
            <select id="adj-target" value={target} onChange={(e) => setTarget(e.target.value)} className={SELECT_CLASS}>
              <option value="">Whole deal (not tied to a stone)</option>
              {buckets.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
            {target !== "" && (
              <p className="flex items-start gap-1.5 text-xs text-amber-800">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Reconcile compares each stone with its calculated amount, so it may propose to undo an adjustment made here. For a lasting
                  manual amount, apply it to the whole deal.
                </span>
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="adj-sign">Effect</Label>
              <select id="adj-sign" value={sign} onChange={(e) => setSign(e.target.value === "DEDUCT" ? "DEDUCT" : "ADD")} className={SELECT_CLASS}>
                <option value="ADD">Increase what we owe the partner</option>
                <option value="DEDUCT">Reduce what we owe the partner</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-amount">Amount ({currency})</Label>
              <Input
                id="adj-amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                aria-invalid={amount !== "" && minor === null}
              />
              {amount !== "" && minor === null && <p className="text-xs text-red-600">Enter a positive amount with at most 2 decimals.</p>}
            </div>
          </div>

          {balanceAfter !== null && (
            <p className={`text-xs ${balanceAfter < 0 ? "text-red-700" : "text-muted-foreground"}`}>
              Balance after: {money(balanceAfter, currency)}
              {balanceAfter < 0 ? " (the partner would owe us; carried forward against future settlements)" : ""}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="adj-code">Reason</Label>
              <select id="adj-code" value={reasonCode} onChange={(e) => setReasonCode(e.target.value as AdjustmentReason)} className={SELECT_CLASS}>
                {REASON_ORDER.map((c) => <option key={c} value={c}>{ADJUSTMENT_REASON_LABEL[c]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-settlement">Relates to settlement</Label>
              <select id="adj-settlement" value={settlementId} onChange={(e) => setSettlementId(e.target.value)} className={SELECT_CLASS}>
                <option value="">None</option>
                {settlements.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">Explanation (internal) *</Label>
            <Textarea id="adj-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being adjusted?" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-note">Note to the partner (optional)</Label>
            <Input id="adj-note" maxLength={280} value={partnerNote} onChange={(e) => setPartnerNote(e.target.value)} />
            <p className="text-xs text-muted-foreground">Written for the partner to read, so keep it free of internal detail. Leave it empty to add no note.</p>
          </div>

          {error && <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button type="submit" variant="accent" disabled={!canSubmit}>{pending ? "Recording..." : "Record adjustment"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
