"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { GEMSTONE_STATUSES } from "@/lib/enums";
import { updateGemstone } from "../edit-actions";

const label = (s: string) => s.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

type GemExisting = {
  id: string; code: string;
  gemType: string; variety: string | null; species: string | null;
  origin: string | null; treatment: string | null; treatmentStatus: string | null;
  weightCt: number;
  lengthMm: number | null; widthMm: number | null; depthMm: number | null;
  shape: string | null; cut: string | null; facetingStyle: string | null;
  colorDescription: string | null; clarity: string | null;
  luster: string | null; fluorescence: string | null;
  symmetry: string | null; polish: string | null;
  inclusions: string | null;
  status: string;
  locationId: string | null;
};

export function EditGemstoneButton({
  gem, locations,
}: {
  gem: GemExisting;
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
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Edit gemstone — <span className="font-mono text-sm">{gem.code}</span></DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await updateGemstone(fd); setOpen(false); }
            catch (e) { setError((e as Error).message); }
          })}
          className="grid grid-cols-3 gap-3 max-h-[70vh] overflow-y-auto pr-1"
        >
          <input type="hidden" name="id" value={gem.id} />

          <F label="Gem type *" cols={1}><Input name="gemType" required defaultValue={gem.gemType} /></F>
          <F label="Variety" cols={1}><Input name="variety" defaultValue={gem.variety ?? ""} /></F>
          <F label="Species" cols={1}><Input name="species" defaultValue={gem.species ?? ""} /></F>

          <F label="Origin" cols={1}><Input name="origin" defaultValue={gem.origin ?? ""} /></F>
          <F label="Treatment" cols={1}><Input name="treatment" defaultValue={gem.treatment ?? ""} /></F>
          <F label="Treatment status" cols={1}><Input name="treatmentStatus" defaultValue={gem.treatmentStatus ?? ""} /></F>

          <F label="Weight (ct) *" cols={1}><Input name="weightCt" required inputMode="decimal" defaultValue={gem.weightCt} /></F>
          <F label="Length (mm)" cols={1}><Input name="lengthMm" inputMode="decimal" defaultValue={gem.lengthMm ?? ""} /></F>
          <F label="Width (mm)" cols={1}><Input name="widthMm" inputMode="decimal" defaultValue={gem.widthMm ?? ""} /></F>
          <F label="Depth (mm)" cols={1}><Input name="depthMm" inputMode="decimal" defaultValue={gem.depthMm ?? ""} /></F>

          <F label="Shape" cols={1}><Input name="shape" defaultValue={gem.shape ?? ""} /></F>
          <F label="Cut" cols={1}><Input name="cut" defaultValue={gem.cut ?? ""} /></F>
          <F label="Faceting style" cols={1}><Input name="facetingStyle" defaultValue={gem.facetingStyle ?? ""} /></F>

          <F label="Clarity" cols={1}><Input name="clarity" defaultValue={gem.clarity ?? ""} /></F>
          <F label="Luster" cols={1}><Input name="luster" defaultValue={gem.luster ?? ""} /></F>
          <F label="Fluorescence" cols={1}><Input name="fluorescence" defaultValue={gem.fluorescence ?? ""} /></F>

          <F label="Symmetry" cols={1}><Input name="symmetry" defaultValue={gem.symmetry ?? ""} /></F>
          <F label="Polish" cols={1}><Input name="polish" defaultValue={gem.polish ?? ""} /></F>
          <F label="Status" cols={1}>
            <select name="status" defaultValue={gem.status} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {GEMSTONE_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </F>

          <F label="Location" cols={3}>
            <select name="locationId" defaultValue={gem.locationId ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Unassigned —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
            </select>
          </F>

          <F label="Colour description" cols={3}><Input name="colorDescription" defaultValue={gem.colorDescription ?? ""} /></F>
          <F label="Inclusions" cols={3}><Textarea name="inclusions" rows={2} defaultValue={gem.inclusions ?? ""} /></F>

          {error && <div className="col-span-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

          <div className="col-span-3 flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const colSpan: Record<number, string> = {
  1: "col-span-1", 2: "col-span-2", 3: "col-span-3",
};
function F({ label, children, cols = 1 }: { label: string; children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  return (
    <div className={`space-y-1.5 ${colSpan[cols]}`}>
      <Label className="text-[10px]">{label}</Label>
      {children}
    </div>
  );
}
