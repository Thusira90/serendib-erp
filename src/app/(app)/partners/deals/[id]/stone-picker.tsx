"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Plus, Search, TriangleAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PayoutMethod } from "@/lib/enums";
import { attachStonesToDeal, listParcelRoughs, searchDealStones, type AttachResult } from "../actions";
import type { SaleDecision, StoneKind, StoneRef, StoneSearchRow } from "../deal-shared";

type Chip = StoneRef & { code: string };
type NeedsDecision = NonNullable<Extract<AttachResult, { ok: false }>["needsSaleDecision"]>;
type DecisionDraft = { mode: "IGNORE_EARLIER" | "INCLUDE_EARLIER"; from: string };

const keyOf = (s: StoneRef): string => `${s.kind}:${s.id}`;
const tomorrow = (): string => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

/** Debounced search, chips for the selection, and the attach call with the "already sold" decision. */
export function StonePicker({
  dealId,
  method,
  preselect,
  canRough,
  canGem,
}: {
  dealId: string;
  method: PayoutMethod;
  preselect: Chip | null;
  canRough: boolean;
  canGem: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rough, setRough] = useState(canRough);
  const [gem, setGem] = useState(canGem && !canRough);
  const [active, setActive] = useState(false);
  const [rows, setRows] = useState<StoneSearchRow[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [chips, setChips] = useState<Chip[]>(preselect ? [preselect] : []);
  const [notice, setNotice] = useState<string | null>(null);
  const [parcelNote, setParcelNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [decide, setDecide] = useState<NeedsDecision | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DecisionDraft>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!active) return;
    const kinds: StoneKind[] = [...(rough ? (["ROUGH"] as const) : []), ...(gem ? (["GEM"] as const) : [])];
    if (kinds.length === 0) {
      setRows([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      startSearch(async () => {
        const r = await searchDealStones({ dealId, q, kinds });
        if (mine !== seq.current) return;
        if (r.ok) {
          setRows(r.rows);
          setSearchError(null);
        } else {
          setSearchError(r.error);
        }
      });
    }, 250);
    return () => clearTimeout(t);
  }, [active, q, rough, gem, dealId, refreshKey]);

  const selected = new Set(chips.map(keyOf));

  function toggle(row: StoneSearchRow) {
    if (row.inDealNote) return;
    const key = keyOf(row);
    setNotice(null);
    setChips((prev) => (selected.has(key) ? prev.filter((c) => keyOf(c) !== key) : [...prev, { kind: row.kind, id: row.id, code: row.code }]));
  }

  function addParcel(parcelId: string) {
    setError(null);
    startSearch(async () => {
      const r = await listParcelRoughs({ dealId, parcelId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const addable = r.rows.filter((x) => !x.inDealNote);
      setChips((prev) => {
        const have = new Set(prev.map(keyOf));
        return [...prev, ...addable.filter((x) => !have.has(keyOf(x))).map((x) => ({ kind: x.kind, id: x.id, code: x.code }))];
      });
      const skipped = r.rows.length - addable.length;
      setParcelNote(
        `Parcel ${r.parcelCode}: ${addable.length} rough${addable.length === 1 ? "" : "s"} selected${skipped > 0 ? `, ${skipped} already in the deal` : ""}. ${r.drift ?? ""}`.trim(),
      );
    });
  }

  function attach(sales?: Record<string, SaleDecision>) {
    setError(null);
    setNotice(null);
    startSave(async () => {
      const r = await attachStonesToDeal({ dealId, stones: chips.map((c) => ({ kind: c.kind, id: c.id })), ...(sales ? { sales } : {}) });
      if (r.ok) {
        setChips([]);
        setParcelNote(null);
        setDecide(null);
        setNotice(
          `${r.added} stone${r.added === 1 ? "" : "s"} added.${r.warnings.length > 0 ? ` ${r.warnings.join(" ")}` : ""} If the deal splits an acquisition cost or an invested amount, run the allocation again.`,
        );
        setActive(true);
        setRefreshKey((k) => k + 1);
        router.refresh();
        return;
      }
      if (r.needsSaleDecision && r.needsSaleDecision.length > 0) {
        setDrafts(Object.fromEntries(r.needsSaleDecision.map((s) => [keyOf(s), { mode: "IGNORE_EARLIER" as const, from: tomorrow() }])));
        setDecide(r.needsSaleDecision);
        return;
      }
      setDecide(null);
      setError(r.error);
    });
  }

  function confirmDecisions() {
    const sales: Record<string, SaleDecision> = {};
    for (const [key, d] of Object.entries(drafts)) {
      sales[key] = d.mode === "IGNORE_EARLIER" ? { mode: "IGNORE_EARLIER", from: d.from } : { mode: "INCLUDE_EARLIER" };
    }
    attach(sales);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add stones</CardTitle>
        <CardDescription>
          Search by code, type, variety or origin. A rough counts as one lot. A rough and a gem cut from it cannot both be in the same deal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(true); }}
              onFocus={() => setActive(true)}
              placeholder="Search stones"
              aria-label="Search stones"
              className="pl-8"
            />
          </div>
          {canRough && (
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={rough} onChange={(e) => { setRough(e.target.checked); setActive(true); }} className="h-4 w-4" /> Roughs
            </label>
          )}
          {canGem && (
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={gem} onChange={(e) => { setGem(e.target.checked); setActive(true); }} className="h-4 w-4" /> Gems
            </label>
          )}
          {searching && <span className="text-xs text-muted-foreground">Searching...</span>}
        </div>

        {chips.length > 0 && (
          <div className="space-y-2 rounded-md border bg-secondary/30 p-3">
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={keyOf(c)} className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs">
                  <span className="font-mono">{c.code}</span>
                  <button type="button" aria-label={`Remove ${c.code}`} onClick={() => setChips((prev) => prev.filter((x) => keyOf(x) !== keyOf(c)))} className="rounded-full p-0.5 hover:bg-secondary">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => attach()} disabled={saving}>
                {saving ? "Adding..." : `Add ${chips.length} stone${chips.length === 1 ? "" : "s"} to the deal`}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setChips([]); setParcelNote(null); }} disabled={saving}>Clear</Button>
            </div>
          </div>
        )}

        {parcelNote && <p className="text-xs text-muted-foreground">{parcelNote}</p>}
        {error && <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}
        {notice && <div role="status" className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">{notice}</div>}
        {searchError && <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{searchError}</div>}

        {active && !searchError && (
          <div className={cn("divide-y rounded-md border", searching && "opacity-70")}>
            {rows.length === 0 && !searching && <p className="p-4 text-center text-sm text-muted-foreground">No stones match.</p>}
            {rows.map((row) => {
              const key = keyOf(row);
              const isSelected = selected.has(key);
              const disabled = row.inDealNote !== null;
              return (
                <div key={key} className={cn("flex flex-wrap items-start gap-3 p-3 text-sm", disabled && "bg-secondary/30 text-muted-foreground")}>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{row.code}</span>
                      <Badge variant={row.kind === "ROUGH" ? "teal" : "purple"}>{row.kind === "ROUGH" ? "Rough" : "Gem"}</Badge>
                      <Badge variant="muted">{row.status.replaceAll("_", " ").toLowerCase()}</Badge>
                      <span className="text-xs">{[row.variety ?? row.gemType, `${row.weightCt.toFixed(2)} ct`].join(" · ")}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      {row.kind === "ROUGH" && row.derivedGems !== null && row.derivedGems > 0 && <span>Cut into {row.derivedGems} gem{row.derivedGems === 1 ? "" : "s"}; they follow this rough</span>}
                      {row.parentRoughCode && <span>Cut from {row.parentRoughCode}</span>}
                      {row.hasLiveOrder && <span className="text-amber-800">Has a live sale</span>}
                      {row.parcel && <span>Parcel {row.parcel.code}</span>}
                      {row.inDealNote && <span className="font-medium">{row.inDealNote}</span>}
                    </div>
                    {row.otherDeals.length > 0 && (
                      <div className="flex items-start gap-1 text-[11px] text-amber-800">
                        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                        <span>Also in {row.otherDeals.map((d) => `${d.code} (${d.partnerName})`).join(", ")}. Shares are checked so they never add up to more than 100%.</span>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {row.kind === "ROUGH" && row.parcel && !disabled && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => addParcel(row.parcel!.id)} title={`Add every rough of parcel ${row.parcel.code}`}>
                        <Layers className="h-3.5 w-3.5" /> Whole parcel
                      </Button>
                    )}
                    <Button type="button" size="sm" variant={isSelected ? "secondary" : "outline"} disabled={disabled} onClick={() => toggle(row)}>
                      {isSelected ? "Selected" : <><Plus className="h-3.5 w-3.5" /> Add</>}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={decide !== null} onOpenChange={(o) => { if (!o) setDecide(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Already sold before it joins the deal</DialogTitle>
            <DialogDescription>
              Choose what the partner earns on the earlier sale of each stone below.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
            {(decide ?? []).map((s) => {
              const k = keyOf(s);
              const d = drafts[k] ?? { mode: "IGNORE_EARLIER" as const, from: tomorrow() };
              const set = (patch: Partial<DecisionDraft>) => setDrafts((all) => ({ ...all, [k]: { ...d, ...patch } }));
              return (
                <fieldset key={k} className="space-y-2 rounded-md border p-3 text-sm">
                  <legend className="px-1 font-mono text-xs">{s.code} <span className="font-sans text-muted-foreground">sold {s.soldOn}</span></legend>
                  <label className="flex items-start gap-2">
                    <input type="radio" name={`sale-${k}`} checked={d.mode === "IGNORE_EARLIER"} onChange={() => set({ mode: "IGNORE_EARLIER" })} className="mt-1" />
                    <span className="space-y-1">
                      <span className="block font-medium">Count sales from a date</span>
                      <span className="block text-xs text-muted-foreground">Sales before this date earn the partner nothing. Choose a date after the earlier sale.</span>
                      <Input type="date" value={d.from} onChange={(e) => set({ mode: "IGNORE_EARLIER", from: e.target.value })} className="h-8 w-44" aria-label={`Count sales of ${s.code} from`} />
                    </span>
                  </label>
                  <label className={cn("flex items-start gap-2", method === "INVESTMENT" && "opacity-60")}>
                    <input type="radio" name={`sale-${k}`} checked={d.mode === "INCLUDE_EARLIER"} disabled={method === "INVESTMENT"} onChange={() => set({ mode: "INCLUDE_EARLIER" })} className="mt-1" />
                    <span>
                      <span className="block font-medium">Include the earlier sale</span>
                      <span className="block text-xs text-muted-foreground">
                        {method === "INVESTMENT"
                          ? "Not available on an investment deal: it needs a count-from date."
                          : "The sale counts as if it happened inside the deal. The deal will carry a warning until it is settled."}
                      </span>
                    </span>
                  </label>
                </fieldset>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDecide(null)}>Cancel</Button>
            <Button type="button" onClick={confirmDecisions} disabled={saving}>{saving ? "Adding..." : "Add the stones"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
