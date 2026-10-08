"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { decimalToMinor, minorToDecimalString } from "@/lib/partner-money";
import {
  allocateAcquisitionAction,
  allocateInvestmentAction,
  detachStone,
  previewAllocation,
  setAssetPartnerHidden,
} from "../actions";
import { writeOffStoneAction } from "../../ledger-actions";
import type { AllocationRow, AllocationSpecInput } from "../deal-shared";

const money = (text: string): number | null => {
  const t = text.trim();
  if (t === "") return null;
  try {
    return decimalToMinor(t);
  } catch {
    return null;
  }
};
const fmt = (minor: number): string => {
  const [i, f] = minorToDecimalString(Math.abs(minor)).split(".");
  return `${minor < 0 ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f}`;
};

export function RemoveStoneButton({ dealId, dealStoneId, code, needsReason }: { dealId: string; dealStoneId: string; code: string; needsReason: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove() {
    setError(null);
    start(async () => {
      const r = await detachStone({ dealId, dealStoneId, reason: reason.trim() || null });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Remove ${code} from the deal`}>
        <Trash2 className="h-3.5 w-3.5" /> Remove
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {code} from the deal?</DialogTitle>
            <DialogDescription>
              The stone stays in the system. A stone with a sale or with money credited to the partner cannot be removed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={`remove-${dealStoneId}`} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Reason {needsReason ? "*" : "(optional)"}
            </label>
            <Textarea id={`remove-${dealStoneId}`} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Keep it</Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={pending || (needsReason && reason.trim() === "")}>
              {pending ? "Removing..." : "Remove stone"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Investment deals: the capital placed on this stone is lost or cannot be sold. Needs partner:settle (the server re-checks it). */
export function WriteOffStoneButton({ dealId, dealStoneId, code }: { dealId: string; dealStoneId: string; code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function writeOff() {
    setError(null);
    start(async () => {
      const r = await writeOffStoneAction({ dealId, dealStoneId, note: note.trim() });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Write off the capital on ${code}`}>
        <TriangleAlert className="h-3.5 w-3.5" /> Write off
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write off the capital on {code}?</DialogTitle>
            <DialogDescription>
              Use this when the stone is lost or cannot be sold. If the deal shares losses, its capital is simply not returned. If it returns capital first, the company bears the loss:
              record that with an adjustment on the Money tab. The partner is shown a capital written-off line.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={`writeoff-${dealStoneId}`} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">What happened? *</label>
            <Textarea id={`writeoff-${dealStoneId}`} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Not now</Button>
            <Button type="button" variant="destructive" onClick={writeOff} disabled={pending || note.trim() === ""}>
              {pending ? "Writing off..." : "Write off the capital"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MediaHideToggle({ assetId, dealId, hidden, canWrite }: { assetId: string; dealId: string; hidden: boolean; canWrite: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!canWrite) return null;
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant={hidden ? "outline" : "ghost"}
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await setAssetPartnerHidden(assetId, !hidden, dealId);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        <EyeOff className="h-3.5 w-3.5" /> {hidden ? "Release" : "Hide"}
      </Button>
      {error && <p role="alert" className="max-w-[12rem] text-[11px] text-red-700">{error}</p>}
    </div>
  );
}

export interface AllocStone {
  dealStoneId: string;
  code: string;
  kind: "ROUGH" | "GEM";
  /** The stone's own price as plain decimal text, and its currency. */
  priceText: string | null;
  priceCurrency: string | null;
  overrideText: string | null;
  investedText: string | null;
  parcelId: string | null;
}
export interface AllocParcel {
  id: string;
  code: string;
  inDeal: number;
  total: number;
  totalCostText: string;
  currency: string;
}

type Mode = "POOL_LUMP" | "PARCEL_TOTAL" | "MANUAL";

function ResultTable({ rows, total, label }: { rows: AllocationRow[]; total: number; label: string }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">Stone</th>
            <th className="px-3 py-1.5 text-right font-medium">{label}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.dealStoneId}>
              <td className="px-3 py-1.5 font-mono text-xs">{r.code}</td>
              <td className="num px-3 py-1.5 text-right">{fmt(r.amountMinor)}{r.currency ? ` ${r.currency}` : ""}</td>
            </tr>
          ))}
          <tr className="bg-secondary/30 font-medium">
            <td className="px-3 py-1.5">Total</td>
            <td className="num px-3 py-1.5 text-right">{fmt(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Acquisition cost allocator (lump, parcel total, manual) and the investment splitter, each with a rolled-back preview. */
export function AllocatorPanel({
  dealId,
  method,
  scope,
  currency,
  investedText,
  investmentLocked,
  stones,
  parcels,
}: {
  dealId: string;
  method: string;
  scope: string;
  currency: string;
  investedText: string | null;
  investmentLocked: boolean;
  stones: AllocStone[];
  parcels: AllocParcel[];
}) {
  const router = useRouter();
  const pooled = scope === "POOLED";
  const [mode, setMode] = useState<Mode>(pooled ? "POOL_LUMP" : parcels.length > 0 ? "PARCEL_TOTAL" : "MANUAL");
  const [lump, setLump] = useState("");
  const [lumpCurrency, setLumpCurrency] = useState(currency);
  const [basis, setBasis] = useState<"WEIGHT" | "EQUAL">("WEIGHT");
  const [manualCurrency, setManualCurrency] = useState(currency);
  const [manual, setManual] = useState<Record<string, string>>(() => Object.fromEntries(stones.map((s) => [s.dealStoneId, s.overrideText ?? ""])));
  const [preview, setPreview] = useState<{ key: string; rows: AllocationRow[]; total: number } | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, start] = useTransition();

  const [inv, setInv] = useState<Record<string, string>>(() => Object.fromEntries(stones.map((s) => [s.dealStoneId, s.investedText ?? ""])));
  const [invMessage, setInvMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [invBusy, startInv] = useTransition();

  const completeParcels = parcels.filter((p) => p.inDeal === p.total);
  const parcelOk = parcels.length > 0 && completeParcels.length === parcels.length;
  const specKey = JSON.stringify([mode, lump, lumpCurrency, basis, manualCurrency, manual]);

  function buildSpec(): AllocationSpecInput | string {
    if (mode === "PARCEL_TOTAL") return { source: "PARCEL_TOTAL" };
    if (mode === "POOL_LUMP") {
      const minor = money(lump);
      if (minor === null || minor < 0) return "Enter the lump sum as a number.";
      return { source: "POOL_LUMP", basis, amountMinor: minor, currency: lumpCurrency };
    }
    const rows: { dealStoneId: string; amountMinor: number }[] = [];
    for (const s of stones) {
      const text = manual[s.dealStoneId] ?? "";
      if (text.trim() === "") continue;
      const minor = money(text);
      if (minor === null || minor < 0) return `The cost for ${s.code} is not a valid amount.`;
      rows.push({ dealStoneId: s.dealStoneId, amountMinor: minor });
    }
    return { source: "MANUAL", currency: manualCurrency, manual: rows };
  }

  function runPreview() {
    setMessage(null);
    const spec = buildSpec();
    if (typeof spec === "string") {
      setMessage({ kind: "error", text: spec });
      return;
    }
    start(async () => {
      const r = await previewAllocation({ dealId, kind: "ACQUISITION", spec });
      if (!r.ok) {
        setPreview(null);
        setMessage({ kind: "error", text: r.error });
        return;
      }
      setPreview({ key: specKey, rows: r.rows, total: r.totalMinor });
    });
  }

  function apply() {
    setMessage(null);
    const spec = buildSpec();
    if (typeof spec === "string") {
      setMessage({ kind: "error", text: spec });
      return;
    }
    start(async () => {
      const r = await allocateAcquisitionAction({ dealId, spec });
      if (!r.ok) {
        setMessage({ kind: "error", text: r.error });
        return;
      }
      setPreview(null);
      setMessage({ kind: "ok", text: "Costs allocated. They are frozen per stone, so later weight changes do not move them." });
      router.refresh();
    });
  }

  function parcelDrift(p: AllocParcel): string | null {
    const members = stones.filter((s) => s.parcelId === p.id);
    if (members.length === 0 || members.some((s) => s.priceText === null || s.priceCurrency !== p.currency)) return null;
    const total = money(p.totalCostText);
    if (total === null) return null;
    const sum = members.reduce((acc, s) => acc + (money(s.priceText ?? "") ?? 0), 0);
    const diff = total - sum;
    return diff === 0 ? "Matches the stones' own prices." : `${fmt(Math.abs(diff))} ${p.currency} ${diff > 0 ? "more" : "less"} than the stones' own prices added up.`;
  }

  const invested = investedText === null ? null : money(investedText);
  const invSum = stones.reduce((acc, s) => acc + (money(inv[s.dealStoneId] ?? "") ?? 0), 0);
  const invBalanced = invested !== null && invSum === invested;

  function autoSplit() {
    setInvMessage(null);
    startInv(async () => {
      const r = await previewAllocation({ dealId, kind: "INVESTMENT" });
      if (!r.ok) {
        setInvMessage({ kind: "error", text: r.error });
        return;
      }
      setInv(Object.fromEntries(r.rows.map((x) => [x.dealStoneId, minorToDecimalString(x.amountMinor)])));
      setInvMessage({ kind: "ok", text: "Proposed split (by cost basis, largest remainder). Edit if you like, then save." });
    });
  }

  function saveInvestment() {
    setInvMessage(null);
    const manualRows: { dealStoneId: string; amountMinor: number }[] = [];
    for (const s of stones) {
      const minor = money(inv[s.dealStoneId] ?? "");
      if (minor === null || minor < 0) {
        setInvMessage({ kind: "error", text: `The invested amount for ${s.code} is not valid.` });
        return;
      }
      manualRows.push({ dealStoneId: s.dealStoneId, amountMinor: minor });
    }
    startInv(async () => {
      const r = await allocateInvestmentAction({ dealId, manual: manualRows });
      if (!r.ok) {
        setInvMessage({ kind: "error", text: r.error });
        return;
      }
      setInvMessage({ kind: "ok", text: "Invested amount split and frozen per stone." });
      router.refresh();
    });
  }

  const modes: { key: Mode; label: string; note: string; disabled: boolean; why: string }[] = [
    {
      key: "POOL_LUMP",
      label: "Spread a lump sum",
      note: "One amount for the whole pool, spread by weight or equally. Stones with their own cost keep it.",
      disabled: !pooled,
      why: "Only for pooled deals.",
    },
    {
      key: "PARCEL_TOTAL",
      label: "Use the parcel total",
      note: "Spreads each parcel's total cost over its roughs by weight, instead of the roughs' own prices.",
      disabled: !parcelOk,
      why: parcels.length === 0 ? "None of the roughs belong to a parcel." : "Add every rough of the parcel to the deal first.",
    },
    { key: "MANUAL", label: "Enter by hand", note: "A cost for every stone, in one currency. Also how you confirm each stone's own price.", disabled: false, why: "" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Allocate acquisition cost</CardTitle>
          <CardDescription>
            Freezes a cost per stone so later weight changes cannot move it. Needed when stones have no price of their own, when a parcel&apos;s total differs from its stones&apos; prices, or to confirm prices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Allocation source">
            {modes.map((m) => (
              <label key={m.key} className={cn("relative block", m.disabled ? "cursor-not-allowed" : "cursor-pointer")}>
                <input type="radio" name="alloc-mode" className="peer sr-only" checked={mode === m.key} disabled={m.disabled} onChange={() => { setMode(m.key); setMessage(null); }} />
                <div className={cn("h-full rounded-lg border p-3 text-sm peer-checked:border-sgs-teal-500 peer-checked:bg-sgs-teal-100/40 peer-focus-visible:ring-2 peer-focus-visible:ring-ring", m.disabled && "opacity-50")}>
                  <div className="font-medium">{m.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{m.disabled ? m.why : m.note}</div>
                </div>
              </label>
            ))}
          </div>

          {mode === "POOL_LUMP" && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label htmlFor="alloc-lump" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Lump sum</label>
                <Input id="alloc-lump" inputMode="decimal" className="w-44" value={lump} onChange={(e) => setLump(e.target.value)} placeholder="500000" />
              </div>
              <div className="space-y-1">
                <label htmlFor="alloc-lump-ccy" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Currency</label>
                <Input id="alloc-lump-ccy" className="w-20 uppercase" maxLength={3} value={lumpCurrency} onChange={(e) => setLumpCurrency(e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-1">
                <label htmlFor="alloc-basis" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Spread by</label>
                <select id="alloc-basis" value={basis} onChange={(e) => setBasis(e.target.value === "EQUAL" ? "EQUAL" : "WEIGHT")} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="WEIGHT">Weight</option>
                  <option value="EQUAL">Equal shares</option>
                </select>
              </div>
            </div>
          )}

          {mode === "PARCEL_TOTAL" && (
            <ul className="space-y-1 text-sm">
              {parcels.map((p) => (
                <li key={p.id} className="rounded-md border p-2">
                  <span className="font-mono text-xs">{p.code}</span>{" "}
                  <span className="text-muted-foreground">
                    {p.inDeal} of {p.total} roughs in the deal. Parcel total {fmt(money(p.totalCostText) ?? 0)} {p.currency}.
                  </span>
                  {parcelDrift(p) && <span className="block text-xs text-amber-800">Drift: {parcelDrift(p)}</span>}
                </li>
              ))}
            </ul>
          )}

          {mode === "MANUAL" && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="alloc-manual-ccy" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Currency</label>
                <Input id="alloc-manual-ccy" className="w-20 uppercase" maxLength={3} value={manualCurrency} onChange={(e) => setManualCurrency(e.target.value.toUpperCase())} />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setManual((m) => ({ ...m, ...Object.fromEntries(stones.filter((s) => s.priceText !== null && s.priceCurrency === manualCurrency).map((s) => [s.dealStoneId, s.priceText ?? ""])) }))}
                >
                  Fill with the stones&apos; own prices
                </Button>
              </div>
              <div className="space-y-1.5">
                {stones.map((s) => (
                  <div key={s.dealStoneId} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-44 truncate font-mono text-xs">{s.code}</span>
                    <Input
                      aria-label={`Acquisition cost of ${s.code}`}
                      inputMode="decimal"
                      className="w-40"
                      value={manual[s.dealStoneId] ?? ""}
                      onChange={(e) => setManual((m) => ({ ...m, [s.dealStoneId]: e.target.value }))}
                    />
                    {s.priceText !== null && <span className="text-xs text-muted-foreground">own price {fmt(money(s.priceText) ?? 0)} {s.priceCurrency}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {message && (
            <div role={message.kind === "error" ? "alert" : "status"} className={cn("rounded border px-2 py-1.5 text-xs", message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
              {message.text}
            </div>
          )}
          {preview && preview.key === specKey && <ResultTable rows={preview.rows} total={preview.total} label="Cost to be frozen" />}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={runPreview} disabled={busy}>{busy ? "Working..." : "Preview"}</Button>
            <Button type="button" onClick={apply} disabled={busy || !preview || preview.key !== specKey}>Apply allocation</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">The preview runs the real allocation and then undoes it, so nothing is saved until you apply.</p>
        </CardContent>
      </Card>

      {method === "INVESTMENT" && (
        <Card>
          <CardHeader>
            <CardTitle>Split the invested amount</CardTitle>
            <CardDescription>
              The partner&apos;s capital {investedText !== null ? `(${fmt(invested ?? 0)} ${currency}) ` : ""}is split over the stones and frozen, so capital is returned stone by stone as each one sells.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {investmentLocked && (
              <p className="rounded border bg-secondary/40 p-2 text-xs text-muted-foreground">The split is frozen because the deal already has a settlement.</p>
            )}
            <div className="space-y-1.5">
              {stones.map((s) => (
                <div key={s.dealStoneId} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-44 truncate font-mono text-xs">{s.code}</span>
                  <Input
                    aria-label={`Invested in ${s.code}`}
                    inputMode="decimal"
                    className="w-40"
                    disabled={investmentLocked}
                    value={inv[s.dealStoneId] ?? ""}
                    onChange={(e) => setInv((m) => ({ ...m, [s.dealStoneId]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className={cn("text-sm", invBalanced ? "text-emerald-700" : "text-amber-800")}>
              Split {fmt(invSum)} of {fmt(invested ?? 0)} {currency}
              {!invBalanced && invested !== null && ` (${fmt(invested - invSum)} ${invested - invSum > 0 ? "still to place" : "too much"})`}
            </div>
            {invMessage && (
              <div role={invMessage.kind === "error" ? "alert" : "status"} className={cn("rounded border px-2 py-1.5 text-xs", invMessage.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
                {invMessage.text}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={autoSplit} disabled={invBusy || investmentLocked}>Auto-split by cost basis</Button>
              <Button type="button" onClick={saveInvestment} disabled={invBusy || investmentLocked || !invBalanced}>Save split</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
