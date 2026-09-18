"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { createParcelWithRoughs } from "../actions";

type Row = {
  gemType: string;
  variety: string;
  weightCt: string;
  color: string;
  clarity: string;
  shape: string;
  purchasePrice: string;
};

const emptyRow = (): Row => ({
  gemType: "Sapphire", variety: "", weightCt: "",
  color: "", clarity: "", shape: "", purchasePrice: "",
});

const parseNum = (v: string) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

export function ParcelIntakeForm({
  suppliers, locations, defaultCurrency = "LKR",
}: {
  suppliers: { id: string; code: string; name: string }[];
  locations: { id: string; code: string; name: string }[];
  defaultCurrency?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [totalCost, setTotalCost] = useState("");

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const totalWt = rows.reduce((s, r) => s + parseNum(r.weightCt), 0);
  const parcelCost = parseNum(totalCost);
  const specifiedRowCost = rows.reduce((s, r) => s + parseNum(r.purchasePrice), 0);
  const unpricedRows = rows.filter((r) => r.purchasePrice === "");
  const unpricedTotalWt = unpricedRows.reduce((s, r) => s + parseNum(r.weightCt), 0);
  const remainingBudget = Math.max(0, parcelCost - specifiedRowCost);
  const avgUnpricedPerCt = unpricedTotalWt > 0 ? remainingBudget / unpricedTotalWt : 0;

  return (
    <form
      action={(fd) => start(async () => {
        setError(null);
        try { await createParcelWithRoughs(fd); }
        catch (e) { setError((e as Error).message); }
      })}
      className="space-y-8"
    >
      <input type="hidden" name="rowCount" value={String(rows.length)} />

      <section>
        <h3 className="font-serif text-lg mb-3 text-sgs-teal-700">Parcel header</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <F label="Supplier *">
            <select name="supplierId" required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Select —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.code}</option>)}
            </select>
          </F>
          <F label="Purchase date *"><Input name="purchaseDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)} /></F>
          <F label="Origin"><Input name="origin" placeholder="Ratnapura, Sri Lanka" /></F>
          <F label="Total cost *">
            <Input name="totalCost" required inputMode="decimal" value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)} />
          </F>
          <F label="Currency"><Input name="currency" defaultValue={defaultCurrency} /></F>
          <F label="Storage location">
            <select name="locationId" defaultValue="" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Unassigned —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
            </select>
          </F>
          <F label="Notes" span><Textarea name="notes" rows={2} /></F>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-serif text-lg text-sgs-teal-700">Rough stones</h3>
          <div className="text-xs text-muted-foreground">
            {rows.length} row{rows.length === 1 ? "" : "s"} · total {totalWt.toFixed(2)} ct
            {remainingBudget > 0 && unpricedRows.length > 0 && (
              <> · unpriced share ≈ {avgUnpricedPerCt.toFixed(2)} / ct</>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded-md p-3 bg-secondary/30">
              <input type="hidden" name={`row.${i}.gemType`} value={r.gemType} />
              <input type="hidden" name={`row.${i}.variety`} value={r.variety} />
              <input type="hidden" name={`row.${i}.weightCt`} value={r.weightCt} />
              <input type="hidden" name={`row.${i}.color`} value={r.color} />
              <input type="hidden" name={`row.${i}.clarity`} value={r.clarity} />
              <input type="hidden" name={`row.${i}.shape`} value={r.shape} />
              <input type="hidden" name={`row.${i}.purchasePrice`} value={r.purchasePrice} />

              <F label="Type *" cols={2}><Input required value={r.gemType} onChange={(e) => setRow(i, { gemType: e.target.value })} /></F>
              <F label="Variety" cols={2}><Input value={r.variety} onChange={(e) => setRow(i, { variety: e.target.value })} /></F>
              <F label="Weight (ct) *" cols={2}><Input required inputMode="decimal" value={r.weightCt} onChange={(e) => setRow(i, { weightCt: e.target.value })} /></F>
              <F label="Shape" cols={2}><Input value={r.shape} onChange={(e) => setRow(i, { shape: e.target.value })} /></F>
              <F label="Color" cols={1}><Input value={r.color} onChange={(e) => setRow(i, { color: e.target.value })} /></F>
              <F label="Price (opt)" cols={2}><Input inputMode="decimal" value={r.purchasePrice} onChange={(e) => setRow(i, { purchasePrice: e.target.value })} /></F>
              <div className="col-span-1 flex justify-end">
                <Button type="button" size="icon" variant="ghost"
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  disabled={rows.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <F label="Clarity" cols={12}><Input value={r.clarity} onChange={(e) => setRow(i, { clarity: e.target.value })} /></F>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
          <Plus className="h-4 w-4" /> Add another stone
        </Button>
      </section>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button asChild variant="outline"><Link href="/parcels">Cancel</Link></Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Register parcel"}</Button>
      </div>
    </form>
  );
}

const colSpan: Record<number, string> = {
  1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4",
  5: "col-span-5", 6: "col-span-6", 7: "col-span-7", 8: "col-span-8",
  9: "col-span-9", 10: "col-span-10", 11: "col-span-11", 12: "col-span-12",
};
function F({ label, children, span = false, cols }: { label: string; children: React.ReactNode; span?: boolean; cols?: number }) {
  const cls = cols ? colSpan[cols] : (span ? "md:col-span-3" : "");
  return (
    <div className={`space-y-1 ${cls}`}>
      <Label className="text-[10px]">{label}</Label>
      {children}
    </div>
  );
}
