"use client";

import { useState, useTransition } from "react";
import { Banknote, TriangleAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PARTNER_CURRENCIES, PAYOUT_PAYMENT_METHODS, type PayoutPaymentMethod } from "@/lib/enums";
import { decimalToMinor, minorToDecimalString } from "@/lib/partner-money";
import { formatCurrency } from "@/lib/utils";
import { recordPayoutAction, reversePayoutAction } from "../../ledger-actions";

const SELECT_CLASS = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";
const AMOUNT_RE = /^\d{1,12}(\.\d{1,2})?$/;

const METHOD_LABEL: Record<PayoutPaymentMethod, string> = { BANK_TRANSFER: "Bank transfer", CASH: "Cash", CHEQUE: "Cheque", OTHER: "Other" };

const money = (m: number, currency: string) => formatCurrency(Number(minorToDecimalString(m)), currency);

function parseMinor(text: string): number | null {
  const t = text.replace(/[,\s]/g, "");
  return AMOUNT_RE.test(t) ? decimalToMinor(t) : null;
}

function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PayoutDialog({
  dealId,
  currency,
  earnOn,
  balanceMinor,
  netPaidMinor,
  collected,
}: {
  dealId: string;
  currency: string;
  earnOn: "SALE" | "PAYMENT";
  balanceMinor: number;
  netPaidMinor: number;
  /** SALE deals only: what the buyers have paid against the credited position. */
  collected: { collectedMinor: number; perBucket: { label: string; creditedMinor: number; paidPct: number }[] } | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [direction, setDirection] = useState<"PAID" | "RECEIVED">(balanceMinor < 0 ? "RECEIVED" : "PAID");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [method, setMethod] = useState<PayoutPaymentMethod | "">("");
  const [reference, setReference] = useState("");
  const [partnerNote, setPartnerNote] = useState("");
  const [origAmount, setOrigAmount] = useState("");
  const [origCurrency, setOrigCurrency] = useState("");
  const [ack, setAck] = useState(false);

  const owed = Math.max(0, -balanceMinor);
  const maxMinor = direction === "PAID" ? Math.max(0, balanceMinor) : Math.min(owed, Math.max(0, netPaidMinor));
  const minor = parseMinor(amount);
  const overMax = minor !== null && minor > maxMinor;
  const today = localToday();
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(paidAt) && paidAt <= today;
  const origMinor = origAmount.trim() === "" ? null : parseMinor(origAmount);
  const origOk = (origAmount.trim() === "" && origCurrency === "") || (origMinor !== null && origMinor > 0 && origCurrency !== "");
  const ahead = direction === "PAID" && earnOn === "SALE" && collected !== null && minor !== null && netPaidMinor + minor > collected.collectedMinor;
  const needAck = ahead || (error?.startsWith("Paying ahead") ?? false);
  const canSubmit = !pending && minor !== null && minor > 0 && !overMax && maxMinor > 0 && dateOk && origOk && (!needAck || ack);

  function reset() {
    setDirection(balanceMinor < 0 ? "RECEIVED" : "PAID");
    setAmount(""); setPaidAt(localToday()); setMethod(""); setReference(""); setPartnerNote(""); setOrigAmount(""); setOrigCurrency(""); setAck(false); setError(null);
  }

  function submit() {
    if (!canSubmit) return;
    setError(null);
    start(async () => {
      const res = await recordPayoutAction({
        dealId,
        direction,
        amount: amount.replace(/[,\s]/g, ""),
        paidAt,
        method: method === "" ? undefined : method,
        reference: reference.trim() === "" ? undefined : reference.trim(),
        partnerNote: partnerNote.trim() === "" ? undefined : partnerNote.trim(),
        originalAmount: origAmount.trim() === "" ? undefined : origAmount.replace(/[,\s]/g, ""),
        originalCurrency: origCurrency === "" ? undefined : origCurrency,
        ackPayingAhead: needAck && ack ? true : undefined,
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
    <Dialog open={open} onOpenChange={(o) => { if (!pending) { setOpen(o); if (o) reset(); else setError(null); } }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Banknote className="h-4 w-4" /> Record payout</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record payout</DialogTitle>
          <DialogDescription>
            Money paid to the partner, or paid back by them. Amounts are in {currency}. A payout cannot be more than the balance
            (no advances).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
          <div className="rounded-md border bg-secondary/30 px-3 py-2 text-xs">
            Balance {balanceMinor < 0 ? <span className="font-medium text-red-700">{money(balanceMinor, currency)} (the partner owes us)</span> : <span className="font-medium">{money(balanceMinor, currency)}</span>}
            {" "}· Net paid so far {money(netPaidMinor, currency)}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pay-direction">Type</Label>
              <select
                id="pay-direction"
                value={direction}
                onChange={(e) => { setDirection(e.target.value === "RECEIVED" ? "RECEIVED" : "PAID"); setAck(false); }}
                className={SELECT_CLASS}
              >
                <option value="PAID">Paid to the partner</option>
                <option value="RECEIVED">Received from the partner (repayment)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Date paid</Label>
              <Input id="pay-date" type="date" value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-end justify-between gap-2">
              <Label htmlFor="pay-amount">Amount ({currency})</Label>
              {maxMinor > 0 && (
                <button
                  type="button"
                  className="text-xs text-sgs-teal-700 hover:underline"
                  onClick={() => setAmount(minorToDecimalString(maxMinor))}
                >
                  Use the maximum ({money(maxMinor, currency)})
                </button>
              )}
            </div>
            <Input
              id="pay-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setAck(false); }}
              placeholder="0.00"
              aria-invalid={(amount !== "" && minor === null) || overMax}
            />
            {amount !== "" && minor === null && <p className="text-xs text-red-600">Enter a positive amount with at most 2 decimals.</p>}
            {overMax && (
              <p className="text-xs text-red-600">
                {direction === "PAID"
                  ? `That is more than the balance of ${money(Math.max(0, balanceMinor), currency)}.`
                  : maxMinor === 0
                    ? "The partner owes nothing right now, so there is nothing to receive."
                    : `At most ${money(maxMinor, currency)} can be received.`}
              </p>
            )}
            {maxMinor === 0 && !overMax && (
              <p className="text-xs text-muted-foreground">
                {direction === "PAID" ? "Nothing is owed to the partner right now." : "The partner owes nothing right now, so there is nothing to receive."}
              </p>
            )}
          </div>

          {earnOn === "SALE" && direction === "PAID" && collected !== null && (
            <div className="space-y-2 rounded-md border px-3 py-2 text-xs">
              <p>
                This deal earns when a stone is sold. Buyers have paid for <span className="font-medium">{money(Math.max(0, collected.collectedMinor), currency)}</span> of
                what the partner has been credited; {money(netPaidMinor, currency)} has already been paid out.
              </p>
              {collected.perBucket.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-muted-foreground">Collected by stone</summary>
                  <table className="mt-1.5 w-full text-left">
                    <thead className="text-muted-foreground">
                      <tr><th className="py-0.5 font-medium">Stone</th><th className="py-0.5 text-right font-medium">Credited</th><th className="py-0.5 text-right font-medium">Buyer paid</th></tr>
                    </thead>
                    <tbody>
                      {collected.perBucket.map((b) => (
                        <tr key={b.label} className="border-t">
                          <td className="py-0.5">{b.label}</td>
                          <td className="py-0.5 text-right num">{money(b.creditedMinor, currency)}</td>
                          <td className="py-0.5 text-right num">{b.paidPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          )}

          {needAck && direction === "PAID" && (
            <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950">
              <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>
                <span className="flex items-center gap-1 font-semibold"><TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Paying ahead of collection</span>
                This payout is more than the buyers have paid for so far. I want to pay the partner before the money is collected.
              </span>
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pay-method">Method</Label>
              <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PayoutPaymentMethod | "")} className={SELECT_CLASS}>
                <option value="">Not stated</option>
                {PAYOUT_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-reference">Reference</Label>
              <Input id="pay-reference" maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer or cheque number" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Paid in another currency (optional)</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input inputMode="decimal" autoComplete="off" aria-label="Original amount" value={origAmount} onChange={(e) => setOrigAmount(e.target.value)} placeholder="Amount actually sent" />
              <select aria-label="Original currency" value={origCurrency} onChange={(e) => setOrigCurrency(e.target.value)} className={SELECT_CLASS}>
                <option value="">Currency</option>
                {PARTNER_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {!origOk && <p className="text-xs text-red-600">Give both the amount and its currency, or leave both empty.</p>}
            <p className="text-xs text-muted-foreground">For your records only. The ledger always uses the {currency} amount above.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-note">Note to the partner (optional)</Label>
            <Input id="pay-note" maxLength={280} value={partnerNote} onChange={(e) => setPartnerNote(e.target.value)} />
          </div>

          {error && <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
            <Button type="submit" variant="accent" disabled={!canSubmit}>{pending ? "Recording..." : "Record payout"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReversePayoutButton({ payoutId, payoutCode, amountLabel }: { payoutId: string; payoutCode: string; amountLabel: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function submit() {
    if (reason.trim() === "" || pending) return;
    setError(null);
    start(async () => {
      const res = await reversePayoutAction({ payoutId, reason: reason.trim() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setReason("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) { setOpen(o); if (!o) { setError(null); setReason(""); } } }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700"><Undo2 className="h-4 w-4" /> Reverse</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse payout {payoutCode}</DialogTitle>
          <DialogDescription>
            Use this when the payout was entered by mistake or the money came back. An equal entry of {amountLabel} is recorded against
            it and the original stays on the ledger. A payout can be reversed once.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rev-reason">Reason *</Label>
            <Textarea id="rev-reason" rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being reversed?" />
          </div>
          {error && <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Keep payout</Button>
            <Button type="submit" variant="destructive" disabled={pending || reason.trim() === ""}>{pending ? "Reversing..." : "Reverse payout"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
