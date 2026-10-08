"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Play, Square, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { minorToDecimalString } from "@/lib/partner-money";
import { activateDeal, cancelDeal, checkDealActivation, closeDeal, closeDealRequirements, setExcludedCostTypes } from "../actions";
import type { CloseRequirements } from "../deal-shared";

const fmt = (minor: number, currency: string): string => {
  const [i, f] = minorToDecimalString(Math.abs(minor)).split(".");
  return `${minor < 0 ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f} ${currency}`;
};

function Alert({ kind, children }: { kind: "error" | "warning" | "ok"; children: React.ReactNode }) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "rounded border px-2 py-1.5 text-xs",
        kind === "error" && "border-red-200 bg-red-50 text-red-700",
        kind === "warning" && "border-amber-300 bg-amber-50 text-amber-900",
        kind === "ok" && "border-emerald-200 bg-emerald-50 text-emerald-800",
      )}
    >
      {children}
    </div>
  );
}

type Which = "activate" | "close" | "cancel" | null;

/** Edit or amend, start, close and cancel. Each action is confirmed and the server re-checks every rule. */
export function DealStatusActions({
  dealId,
  code,
  status,
  hasLedger,
  canWrite,
}: {
  dealId: string;
  code: string;
  status: string;
  hasLedger: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [which, setWhich] = useState<Which>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // start
  const [check, setCheck] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  // close
  const [req, setReq] = useState<CloseRequirements | null>(null);
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState("");
  const [capitalNote, setCapitalNote] = useState("");
  // cancel
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (which === null) return;
    setError(null);
    if (which === "activate") {
      setCheck(null);
      let live = true;
      checkDealActivation(dealId).then((r) => {
        if (!live) return;
        if (r.ok) setCheck({ errors: r.errors, warnings: r.warnings });
        else setError(r.error);
      });
      return () => { live = false; };
    }
    if (which === "close") {
      setReq(null);
      setConfirm("");
      setNote("");
      setCapitalNote("");
      let live = true;
      closeDealRequirements(dealId).then((r) => {
        if (!live) return;
        if (r.ok) setReq(r.req);
        else setError(r.error);
      });
      return () => { live = false; };
    }
    setReason("");
  }, [which, dealId]);

  if (!canWrite || (status !== "DRAFT" && status !== "ACTIVE")) return null;
  const canAmend = status === "ACTIVE" && !hasLedger;
  const canCancel = status === "DRAFT" || !hasLedger;

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setWhich(null);
      router.refresh();
    });
  }

  const closeReady =
    req !== null &&
    (!req.needsTypedConfirm || confirm.trim().toUpperCase() === code.toUpperCase()) &&
    (!req.needsBalanceNote || note.trim() !== "") &&
    (!req.needsCapitalNote || capitalNote.trim() !== "");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {status === "DRAFT" && (
          <>
            <Button type="button" onClick={() => setWhich("activate")}><Play className="h-4 w-4" /> Start deal</Button>
            <Button asChild variant="outline"><Link href={`/partners/deals/${dealId}?edit=1`}><Pencil className="h-4 w-4" /> Edit draft</Link></Button>
          </>
        )}
        {canAmend && <Button asChild variant="outline"><Link href={`/partners/deals/${dealId}?edit=1`}><Pencil className="h-4 w-4" /> Amend terms</Link></Button>}
        {status === "ACTIVE" && <Button type="button" variant="outline" onClick={() => setWhich("close")}><Square className="h-4 w-4" /> Close deal</Button>}
        {canCancel && <Button type="button" variant="ghost" onClick={() => setWhich("cancel")}><XCircle className="h-4 w-4" /> Cancel deal</Button>}
      </div>

      <Dialog open={which === "activate"} onOpenChange={(o) => { if (!o) setWhich(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start {code}?</DialogTitle>
            <DialogDescription>Starting switches the partner&apos;s link on and makes the estimate live. The stones, costs and terms are checked first.</DialogDescription>
          </DialogHeader>
          {!check && !error && <p className="text-sm text-muted-foreground">Checking the deal...</p>}
          {check && check.errors.length > 0 && (
            <Alert kind="error">
              <p className="font-medium">Fix these before starting:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </Alert>
          )}
          {check && check.warnings.length > 0 && (
            <Alert kind="warning">
              <p className="font-medium">Worth knowing:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{check.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </Alert>
          )}
          {error && <Alert kind="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setWhich(null)}>Not yet</Button>
            <Button type="button" disabled={pending || !check || check.errors.length > 0} onClick={() => run(() => activateDeal(dealId))}>
              {pending ? "Starting..." : "Start the deal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={which === "close"} onOpenChange={(o) => { if (!o) setWhich(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close {code}?</DialogTitle>
            <DialogDescription>Closing keeps the history read-only. It does not move any money, and the partner&apos;s link keeps showing the statement.</DialogDescription>
          </DialogHeader>
          {!req && !error && <p className="text-sm text-muted-foreground">Checking the balance...</p>}
          {req && (
            <div className="space-y-3 text-sm">
              <p>Balance at the moment: <span className="font-medium">{fmt(req.balanceMinor, req.currency)}</span>.</p>
              {req.cancelledWithPayments && <Alert kind="warning">A cancelled sale had payments recorded against it.</Alert>}
              {req.estimateFailed && <Alert kind="warning">The deal could not be calculated just now, so it cannot be checked for capital or cancelled sales.</Alert>}
              {req.needsBalanceNote && (
                <div className="space-y-1.5">
                  <label htmlFor="close-note" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">How will the balance be settled? *</label>
                  <Textarea id="close-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              )}
              {req.needsCapitalNote && (
                <div className="space-y-1.5">
                  <label htmlFor="close-capital" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Capital still outstanding{req.capitalOutstandingMinor !== null ? ` (${fmt(req.capitalOutstandingMinor, req.currency)})` : ""}: name the written-off stones or say how it was resolved *
                  </label>
                  <Textarea id="close-capital" rows={2} maxLength={500} value={capitalNote} onChange={(e) => setCapitalNote(e.target.value)} />
                </div>
              )}
              {req.needsTypedConfirm && (
                <div className="space-y-1.5">
                  <label htmlFor="close-confirm" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Type {code} to confirm *</label>
                  <Input id="close-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
                </div>
              )}
            </div>
          )}
          {error && <Alert kind="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setWhich(null)}>Keep it open</Button>
            <Button
              type="button"
              disabled={pending || !closeReady}
              onClick={() => run(() => closeDeal({ dealId, confirm: confirm.trim() || null, note: note.trim() || null, capitalNote: capitalNote.trim() || null }))}
            >
              {pending ? "Closing..." : "Close the deal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={which === "cancel"} onOpenChange={(o) => { if (!o) setWhich(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {code}?</DialogTitle>
            <DialogDescription>
              A cancelled deal pays nothing and its stones are free for other deals. {status === "ACTIVE" ? "It can only be cancelled while it has no settlement, adjustment or payout." : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="cancel-reason" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Reason (optional)</label>
            <Textarea id="cancel-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <Alert kind="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setWhich(null)}>Keep the deal</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => cancelDeal({ dealId, reason: reason.trim() || null }))}>
              {pending ? "Cancelling..." : "Cancel the deal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export interface CostTypeRow {
  type: string;
  amountMinor: number;
  lines: number;
  missingRate: number;
}

const typeLabel = (t: string): string => t.charAt(0) + t.slice(1).toLowerCase().replaceAll("_", " ");

/** "Cost types in this deal": which types are charged to the partner. */
export function CostTypesTable({
  dealId,
  currency,
  rows,
  excluded,
  editable,
  hasLedger,
}: {
  dealId: string;
  currency: string;
  rows: CostTypeRow[];
  excluded: string[];
  editable: boolean;
  hasLedger: boolean;
}) {
  const router = useRouter();
  const [off, setOff] = useState<Set<string>>(new Set(excluded));
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = off.size !== excluded.length || excluded.some((t) => !off.has(t));

  function save() {
    setMessage(null);
    start(async () => {
      const r = await setExcludedCostTypes({ dealId, types: [...off] });
      if (!r.ok) {
        setMessage({ kind: "error", text: r.error });
        return;
      }
      setMessage({ kind: "ok", text: "Saved." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Cost type</th>
              <th className="px-3 py-1.5 text-right font-medium">Amount</th>
              <th className="px-3 py-1.5 text-center font-medium">Charged to the partner</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const locked = r.type === "ROUGH_PURCHASE";
              const included = locked || !off.has(r.type);
              return (
                <tr key={r.type}>
                  <td className="px-3 py-1.5">
                    {typeLabel(r.type)}
                    {r.lines > 0 && <span className="ml-1 text-xs text-muted-foreground">({r.lines} line{r.lines === 1 ? "" : "s"})</span>}
                  </td>
                  <td className="num px-3 py-1.5 text-right">
                    {fmt(r.amountMinor, currency)}
                    {r.missingRate > 0 && <span className="block text-[10px] text-amber-800">{r.missingRate} line{r.missingRate === 1 ? "" : "s"} need an exchange rate</span>}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Charge ${typeLabel(r.type)} to the partner`}
                      checked={included}
                      disabled={!editable || locked}
                      onChange={(e) =>
                        setOff((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.delete(r.type);
                          else next.add(r.type);
                          return next;
                        })
                      }
                      className="h-4 w-4"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasLedger && editable && (
        <p className="text-xs text-amber-800">This deal already has settlements. A change here moves the estimate; the next reconcile on the Money tab proposes the difference as an adjustment.</p>
      )}
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={save} disabled={!dirty || pending}>{pending ? "Saving..." : "Save cost types"}</Button>
          {message && <span className={cn("text-xs", message.kind === "error" ? "text-red-700" : "text-emerald-700")}>{message.text}</span>}
        </div>
      )}
    </div>
  );
}
