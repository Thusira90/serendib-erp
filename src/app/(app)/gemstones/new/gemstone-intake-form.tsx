"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { GEMSTONE_STATUSES } from "@/lib/enums";
import { createFinishedGemstone } from "../create-actions";
import { ComboboxInput } from "@/components/combobox-input";
import { EntityPicker } from "@/components/entity-picker";
import { MediaUploadField } from "@/components/media-upload-field";
import { quickCreateSupplier, quickCreateLocation } from "@/app/(app)/lookups/actions";

const roleLabel = (s: string) => s.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

export function GemstoneIntakeForm({
  suppliers, locations, defaultCurrency, vocab,
}: {
  suppliers: { id: string; code: string; name: string }[];
  locations: { id: string; code: string; name: string }[];
  defaultCurrency: string;
  vocab: Record<string, string[]>;
}) {
  const v = (key: string) => vocab[`gemstone.${key}`] ?? vocab[key] ?? [];
  const [priceCurrency, setPriceCurrency] = useState(defaultCurrency);
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
        <F label="Gemstone type *"><ComboboxInput name="gemType" required placeholder="Sapphire" options={v("gemType")} /></F>
        <F label="Variety"><ComboboxInput name="variety" placeholder="Blue Sapphire" options={v("variety")} /></F>
        <F label="Species"><ComboboxInput name="species" placeholder="Corundum" options={v("species")} /></F>
        <F label="Origin"><ComboboxInput name="origin" placeholder="Sri Lanka" options={v("origin")} /></F>
        <F label="Treatment"><ComboboxInput name="treatment" placeholder="Unheated" options={v("treatment")} /></F>
        <F label="Treatment status"><Input name="treatmentStatus" placeholder="Verified / Untested" /></F>
      </Section>

      <Section title="Physical characteristics">
        <F label="Weight (ct) *"><Input name="weightCt" required inputMode="decimal" placeholder="8.72" /></F>
        <F label="Length (mm)"><Input name="lengthMm" inputMode="decimal" /></F>
        <F label="Width (mm)"><Input name="widthMm" inputMode="decimal" /></F>
        <F label="Depth (mm)"><Input name="depthMm" inputMode="decimal" /></F>
        <F label="Shape"><ComboboxInput name="shape" placeholder="Oval" options={v("shape")} /></F>
        <F label="Cut"><ComboboxInput name="cut" placeholder="Brilliant / mixed" options={v("cut")} /></F>
        <F label="Faceting style" wide><ComboboxInput name="facetingStyle" placeholder="Ceylon oval" options={v("facetingStyle")} /></F>
      </Section>

      <Section title="Colour & quality">
        <F label="Colour (description)" wide><Input name="colorDescription" placeholder="Royal blue, medium tone" /></F>
        <F label="Hue"><ComboboxInput name="colorHue" options={v("colorHue")} /></F>
        <F label="Tone"><ComboboxInput name="colorTone" options={v("colorTone")} /></F>
        <F label="Saturation"><ComboboxInput name="colorSaturation" options={v("colorSaturation")} /></F>
        <F label="Clarity"><ComboboxInput name="clarity" placeholder="Eye-clean" options={v("clarity")} /></F>
        <F label="Transparency"><ComboboxInput name="transparency" placeholder="Transparent" options={v("transparency")} /></F>
        <F label="Luster"><ComboboxInput name="luster" placeholder="Vitreous" options={v("luster")} /></F>
        <F label="Fluorescence"><ComboboxInput name="fluorescence" placeholder="None / weak / medium" options={v("fluorescence")} /></F>
        <F label="Symmetry"><ComboboxInput name="symmetry" placeholder="Very good" options={v("symmetry")} /></F>
        <F label="Polish"><ComboboxInput name="polish" placeholder="Excellent" options={v("polish")} /></F>
        <F label="Inclusions" wide><Textarea name="inclusions" rows={2} /></F>
      </Section>

      <Section title="Commercial">
        <F label="Acquisition cost *" wide>
          <CurrencyInput
            amountName="acquisitionCost"
            currencyName="currency"
            required
            placeholder="8500"
            defaultCurrency={defaultCurrency}
            currency={priceCurrency}
            onCurrencyChange={setPriceCurrency}
          />
        </F>
        <F label="Asking price" wide>
          <CurrencyInput
            amountName="askingPrice"
            currencyName="askingPriceCurrency"
            defaultCurrency={defaultCurrency}
            currency={priceCurrency}
            onCurrencyChange={setPriceCurrency}
          />
        </F>
        <F label="Minimum acceptable" wide>
          <CurrencyInput
            amountName="minimumPrice"
            currencyName="minimumPriceCurrency"
            defaultCurrency={defaultCurrency}
            currency={priceCurrency}
            onCurrencyChange={setPriceCurrency}
          />
        </F>
      </Section>

      <Section title="Sourcing">
        <F label="Supplier">
          <EntityPicker
            name="supplierId"
            emptyLabel="— External / one-off —"
            options={suppliers.map((s) => ({ id: s.id, label: s.name, hint: s.code }))}
            onQuickCreate={async (nm) => {
              const r = await quickCreateSupplier(nm);
              return { id: r.id, label: r.name, hint: r.code };
            }}
            createLabel="Add supplier"
            createPlaceholder="Supplier name"
          />
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
          <EntityPicker
            name="locationId"
            emptyLabel="— Unassigned —"
            options={locations.map((l) => ({ id: l.id, label: l.name, hint: l.code }))}
            onQuickCreate={async (nm) => {
              const r = await quickCreateLocation(nm);
              return { id: r.id, label: r.name, hint: r.code };
            }}
            createLabel="Add location"
            createPlaceholder="Location name, e.g. Vault A"
          />
        </F>
        <F label="Photos & videos (optional)" wide>
          <MediaUploadField
            name="mediaFiles"
            buttonLabel="Upload photos or videos"
            helper={<>Upload one or more images and videos of the finished stone. First image becomes the primary photo; all attach to the Photography tab and the stone&apos;s Lifecycle timeline. More can be added on the detail page.</>}
          />
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
