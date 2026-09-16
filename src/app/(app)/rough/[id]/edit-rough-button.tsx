"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { ROUGH_STATUSES } from "@/lib/enums";
import { updateRoughStone } from "../actions";

const label = (s: string) => s.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

type RoughExisting = {
  id: string;
  code: string;
  gemType: string; variety: string | null;
  weightCt: number;
  color: string | null; clarity: string | null;
  origin: string | null;
  purchasePrice: number; currency: string;
  status: string;
  locationId: string | null;
  observations: string | null;
};

export function EditRoughButton({
  rough, locations,
}: {
  rough: RoughExisting;
  locations: { id: string; code: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Pencil className="h-4 w-4" /> Edit</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Edit rough — <span className="font-mono text-sm">{rough.code}</span></DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await updateRoughStone(fd); setOpen(false); }
            catch (e) { setError((e as Error).message); }
          })}
          className="grid grid-cols-2 gap-3"
        >
          <input type="hidden" name="id" value={rough.id} />
          <F label="Gem type *"><Input name="gemType" required defaultValue={rough.gemType} /></F>
          <F label="Variety"><Input name="variety" defaultValue={rough.variety ?? ""} /></F>
          <F label="Weight (ct) *"><Input name="weightCt" required inputMode="decimal" defaultValue={rough.weightCt} /></F>
          <F label="Origin"><Input name="origin" defaultValue={rough.origin ?? ""} /></F>
          <F label="Color"><Input name="color" defaultValue={rough.color ?? ""} /></F>
          <F label="Clarity"><Input name="clarity" defaultValue={rough.clarity ?? ""} /></F>
          <F label="Purchase price *" span>
            <CurrencyInput amountName="purchasePrice" currencyName="currency" required defaultAmount={rough.purchasePrice} defaultCurrency={rough.currency} />
          </F>
          <F label="Status">
            <select name="status" defaultValue={rough.status} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {ROUGH_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </F>
          <F label="Location">
            <select name="locationId" defaultValue={rough.locationId ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Unassigned —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
            </select>
          </F>
          <F label="Observations" span><Textarea name="observations" rows={2} defaultValue={rough.observations ?? ""} /></F>
          {/* updateRoughStone requires purchaseDate not to be edited; keep original by not sending it */}
          {error && <div className="col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children, span = false }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={`space-y-1.5 ${span ? "col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
