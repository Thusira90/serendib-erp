"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GEMSTONE_STATUSES } from "@/lib/enums";
import { createFinishedGemstone } from "../create-actions";

const roleLabel = (s: string) => s.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

export function GemstoneIntakeForm({
  suppliers, locations, defaultCurrency,
}: {
  suppliers: { id: string; code: string; name: string }[];
  locations: { id: string; code: string; name: string }[];
  defaultCurrency: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="space-y-4">
        <div className="h-4 bg-secondary/60 rounded w-1/3 animate-pulse" />
        <div className="h-24 bg-secondary/40 rounded animate-pulse" />
        <div className="h-24 bg-secondary/40 rounded animate-pulse" />
      </div>
    );
  }
  return (
    <form
      action={(fd) => start(async () => {
        setError(null);
        try { await createFinishedGemstone(fd); }
        catch (e) { setError((e as Error).message); }
      })}
      className="space-y-8"
    >
      <Section title="Identity">
        <F label="Gemstone type *"><Input name="gemType" required placeholder="Sapphire" /></F>
        <F label="Variety"><Input name="variety" placeholder="Blue Sapphire" /></F>
        <F label="Species"><Input name="species" placeholder="Corundum" /></F>
        <F label="Origin"><Input name="origin" placeholder="Sri Lanka" /></F>
        <F label="Treatment"><Input name="treatment" placeholder="Unheated" /></F>
        <F label="Treatment status"><Input name="treatmentStatus" placeholder="Verified / Untested" /></F>
      </Section>

      <Section title="Physical characteristics">
        <F label="Weight (ct) *"><Input name="weightCt" required inputMode="decimal" placeholder="8.72" /></F>
        <F label="Length (mm)"><Input name="lengthMm" inputMode="decimal" /></F>
        <F label="Width (mm)"><Input name="widthMm" inputMode="decimal" /></F>
        <F label="Depth (mm)"><Input name="depthMm" inputMode="decimal" /></F>
        <F label="Shape"><Input name="shape" placeholder="Oval" /></F>
        <F label="Cut"><Input name="cut" placeholder="Brilliant / mixed" /></F>
        <F label="Faceting style" wide><Input name="facetingStyle" placeholder="Ceylon oval" /></F>
      </Section>

      <Section title="Colour & quality">
        <F label="Colour (description)" wide><Input name="colorDescription" placeholder="Royal blue, medium tone" /></F>
        <F label="Hue"><Input name="colorHue" /></F>
        <F label="Tone"><Input name="colorTone" /></F>
        <F label="Saturation"><Input name="colorSaturation" /></F>
        <F label="Clarity"><Input name="clarity" placeholder="Eye-clean" /></F>
        <F label="Transparency"><Input name="transparency" placeholder="Transparent" /></F>
        <F label="Luster"><Input name="luster" placeholder="Vitreous" /></F>
        <F label="Fluorescence"><Input name="fluorescence" placeholder="None / weak / medium" /></F>
        <F label="Symmetry"><Input name="symmetry" placeholder="Very good" /></F>
        <F label="Polish"><Input name="polish" placeholder="Excellent" /></F>
        <F label="Inclusions" wide><Textarea name="inclusions" rows={2} /></F>
      </Section>

      <Section title="Commercial">
        <F label="Acquisition cost *"><Input name="acquisitionCost" required inputMode="decimal" placeholder="8500" /></F>
        <F label="Currency"><Input name="currency" defaultValue={defaultCurrency} /></F>
        <F label="Asking price"><Input name="askingPrice" inputMode="decimal" /></F>
        <F label="Minimum acceptable"><Input name="minimumPrice" inputMode="decimal" /></F>
      </Section>

      <Section title="Sourcing">
        <F label="Supplier">
          <select name="supplierId" defaultValue="" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">— External / one-off —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.code}</option>)}
          </select>
        </F>
        <F label="Vendor / dealer (free text)"><Input name="vendorName" placeholder="Used when the source isn't a registered supplier" /></F>
        <F label="Acquisition date"><Input name="acquisitionDate" type="date" defaultValue={new Date().toISOString().slice(0,10)} /></F>
        <F label="Source reference"><Input name="sourceReference" placeholder="Invoice #, auction lot, memo id…" /></F>
      </Section>

      <Section title="Logistics">
        <F label="Status">
          <select name="status" defaultValue="AVAILABLE" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            {GEMSTONE_STATUSES.map((s) => <option key={s} value={s}>{roleLabel(s)}</option>)}
          </select>
        </F>
        <F label="Storage location">
          <select name="locationId" defaultValue="" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">— Unassigned —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
          </select>
        </F>
        <F label="Primary photo (optional)" wide>
          <Input name="primaryPhoto" type="file" accept="image/*" />
          <div className="text-[10px] text-muted-foreground mt-1">Set as the stone's primary finished photo. More photos and CGI can be added on the detail page.</div>
        </F>
      </Section>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button asChild variant="outline"><Link href="/gemstones">Cancel</Link></Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Register gemstone"}</Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-serif text-lg mb-3 text-sgs-teal-700">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}
function F({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`space-y-1.5 ${wide ? "md:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
