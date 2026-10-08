"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ComboboxInput } from "@/components/combobox-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { GEMSTONE_STATUSES, GEMSTONE_COMMERCE_STATUSES, manualStatusOptions } from "@/lib/enums";
import { updateGemstone } from "../edit-actions";
import {
  CGI_ORIGIN_BANDS, CGI_TREATMENT_BANDS, CGI_COLOR_BANDS, CGI_CLARITY_BANDS, CGI_CUT_BANDS,
} from "@/lib/cgi";

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
  cgiOriginBand: string | null;
  cgiTreatmentBand: string | null;
  cgiColorBand: string | null;
  cgiClarityBand: string | null;
  cgiCutBand: string | null;
  cgiQualityNotes: string | null;
};

export function EditGemstoneButton({
  gem, locations, vocab,
}: {
  gem: GemExisting;
  locations: { id: string; code: string; name: string }[];
  vocab: Record<string, string[]>;
}) {
  const v = (key: string) => vocab[`gemstone.${key}`] ?? [];
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // RESERVED / SOLD are set and cleared by the reserve and sell flows only.
  const statusOptions = manualStatusOptions(GEMSTONE_STATUSES, GEMSTONE_COMMERCE_STATUSES, gem.status);
  const statusLocked = (GEMSTONE_COMMERCE_STATUSES as readonly string[]).includes(gem.status);
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

          <F label="Gem type *" cols={1}><ComboboxInput name="gemType" required defaultValue={gem.gemType} options={v("gemType")} /></F>
          <F label="Variety" cols={1}><ComboboxInput name="variety" defaultValue={gem.variety} options={v("variety")} /></F>
          <F label="Species" cols={1}><ComboboxInput name="species" defaultValue={gem.species} options={v("species")} /></F>

          <F label="Origin" cols={1}><ComboboxInput name="origin" defaultValue={gem.origin} options={v("origin")} /></F>
          <F label="Treatment" cols={1}><ComboboxInput name="treatment" defaultValue={gem.treatment} options={v("treatment")} /></F>
          <F label="Treatment status" cols={1}><ComboboxInput name="treatmentStatus" defaultValue={gem.treatmentStatus} options={v("treatmentStatus")} /></F>

          <F label="Weight (ct) *" cols={1}><NumberInput name="weightCt" required defaultValue={gem.weightCt} /></F>
          <F label="Length (mm)" cols={1}><NumberInput name="lengthMm" defaultValue={gem.lengthMm ?? ""} /></F>
          <F label="Width (mm)" cols={1}><NumberInput name="widthMm" defaultValue={gem.widthMm ?? ""} /></F>
          <F label="Depth (mm)" cols={1}><NumberInput name="depthMm" defaultValue={gem.depthMm ?? ""} /></F>

          <F label="Shape" cols={1}><ComboboxInput name="shape" defaultValue={gem.shape} options={v("shape")} /></F>
          <F label="Cut" cols={1}><ComboboxInput name="cut" defaultValue={gem.cut} options={v("cut")} /></F>
          <F label="Faceting style" cols={1}><ComboboxInput name="facetingStyle" defaultValue={gem.facetingStyle} options={v("facetingStyle")} /></F>

          <F label="Clarity" cols={1}><ComboboxInput name="clarity" defaultValue={gem.clarity} options={v("clarity")} /></F>
          <F label="Luster" cols={1}><ComboboxInput name="luster" defaultValue={gem.luster} options={v("luster")} /></F>
          <F label="Fluorescence" cols={1}><ComboboxInput name="fluorescence" defaultValue={gem.fluorescence} options={v("fluorescence")} /></F>

          <F label="Symmetry" cols={1}><ComboboxInput name="symmetry" defaultValue={gem.symmetry} options={v("symmetry")} /></F>
          <F label="Polish" cols={1}><ComboboxInput name="polish" defaultValue={gem.polish} options={v("polish")} /></F>
          <F label="Status" cols={1}>
            <select name="status" defaultValue={gem.status} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {statusOptions.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
            {statusLocked && (
              <p className="text-[10px] text-muted-foreground">
                {gem.status === "SOLD" ? "Cancel the sale" : "Release the reservation"} to change this.
              </p>
            )}
          </F>

          <F label="Location" cols={3}>
            <select name="locationId" defaultValue={gem.locationId ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Unassigned —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
            </select>
          </F>

          <F label="Colour description" cols={3}><Input name="colorDescription" defaultValue={gem.colorDescription ?? ""} /></F>
          <F label="Inclusions" cols={3}><Textarea name="inclusions" rows={2} defaultValue={gem.inclusions ?? ""} /></F>

          <div className="col-span-3 mt-2 pt-3 border-t">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Ceylon Gem Identity (CGI)</div>
            <div className="grid grid-cols-3 gap-3">
              <F label="Origin confidence" cols={1}>
                <BandSelect name="cgiOriginBand" options={CGI_ORIGIN_BANDS} value={gem.cgiOriginBand} />
              </F>
              <F label="Treatment status" cols={1}>
                <BandSelect name="cgiTreatmentBand" options={CGI_TREATMENT_BANDS} value={gem.cgiTreatmentBand} />
              </F>
              <F label="Colour grade" cols={1}>
                <BandSelect name="cgiColorBand" options={CGI_COLOR_BANDS} value={gem.cgiColorBand} />
              </F>
              <F label="Clarity grade" cols={1}>
                <BandSelect name="cgiClarityBand" options={CGI_CLARITY_BANDS} value={gem.cgiClarityBand} />
              </F>
              <F label="Cut grade" cols={1}>
                <BandSelect name="cgiCutBand" options={CGI_CUT_BANDS} value={gem.cgiCutBand} />
              </F>
              <F label="Grader notes" cols={3}>
                <Textarea name="cgiQualityNotes" rows={2} defaultValue={gem.cgiQualityNotes ?? ""} placeholder="Free-form notes (optional)" />
              </F>
            </div>
          </div>

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

function BandSelect({
  name, options, value,
}: {
  name: string;
  options: ReadonlyArray<{ value: string; label: string; hint?: string }>;
  value: string | null;
}) {
  return (
    <select
      name={name}
      defaultValue={value ?? ""}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
    >
      <option value="">— Not graded —</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} title={o.hint ?? ""}>{o.label}</option>
      ))}
    </select>
  );
}
