"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createRoughStone } from "./actions";
import Link from "next/link";
import { ComboboxInput } from "@/components/combobox-input";
import { EntityPicker } from "@/components/entity-picker";
import { CurrencyInput } from "@/components/ui/currency-input";
import { MediaUploadField } from "@/components/media-upload-field";
import { quickCreateSupplier, quickCreateLocation } from "@/app/(app)/lookups/actions";

type Option = { id: string; name: string; code?: string };

export function RoughForm({
  suppliers, parcels, locations, defaultCurrency = "LKR", vocab,
}: {
  suppliers: Option[];
  parcels: (Option & { supplier?: { name: string } })[];
  locations: (Option & { code: string })[];
  defaultCurrency?: string;
  vocab: Record<string, string[]>;
}) {
  const [pending, start] = useTransition();
  const [currency, setCurrency] = useState(defaultCurrency);
  const [valuationCurrency, setValuationCurrency] = useState(defaultCurrency);
  const v = (key: string) => vocab[`roughStone.${key}`] ?? vocab[key] ?? [];

  return (
    <form action={(fd) => start(() => createRoughStone(fd))} className="space-y-8">
      <Section title="Identification">
        <Field label="Gemstone type *"><ComboboxInput name="gemType" required placeholder="Sapphire" options={v("gemType")} /></Field>
        <Field label="Variety"><ComboboxInput name="variety" placeholder="Blue Sapphire" options={v("variety")} /></Field>
        <Field label="Species"><ComboboxInput name="species" placeholder="Corundum" options={v("species")} /></Field>
        <Field label="Origin"><ComboboxInput name="origin" placeholder="Sri Lanka" options={v("origin")} /></Field>
        <Field label="Mine / source"><ComboboxInput name="mineSource" placeholder="Ratnapura" options={v("mineSource")} /></Field>
        <Field label="Purchase date *"><Input name="purchaseDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)} /></Field>
      </Section>

      <Section title="Physical characteristics">
        <Field label="Weight (ct) *"><Input name="weightCt" required inputMode="decimal" placeholder="25.4" /></Field>
        <Field label="Length (mm)"><Input name="lengthMm" inputMode="decimal" /></Field>
        <Field label="Width (mm)"><Input name="widthMm" inputMode="decimal" /></Field>
        <Field label="Height (mm)"><Input name="heightMm" inputMode="decimal" /></Field>
        <Field label="Shape"><ComboboxInput name="shape" placeholder="Cushion" options={v("shape")} /></Field>
        <Field label="Color"><ComboboxInput name="color" placeholder="Royal Blue" options={v("color")} /></Field>
        <Field label="Transparency"><ComboboxInput name="transparency" options={v("transparency")} /></Field>
        <Field label="Clarity"><ComboboxInput name="clarity" options={v("clarity")} /></Field>
        <Field label="Inclusions"><Input name="inclusions" /></Field>
        <Field label="Observations" wide><Textarea name="observations" rows={3} /></Field>
      </Section>

      <Section title="Commercial">
        <Field label="Purchase price *" wide>
          <CurrencyInput
            amountName="purchasePrice"
            currencyName="currency"
            required
            placeholder="8900"
            defaultCurrency={defaultCurrency}
            currency={currency}
            onCurrencyChange={setCurrency}
          />
        </Field>
        <Field label="Initial valuation" wide>
          <CurrencyInput
            amountName="initialValuation"
            currencyName="valuationCurrency"
            defaultCurrency={defaultCurrency}
            currency={valuationCurrency}
            onCurrencyChange={setValuationCurrency}
          />
        </Field>
        <Field label="Valued by"><Input name="valuationBy" /></Field>
        <Field label="Valuation notes" wide><Textarea name="valuationNotes" rows={2} /></Field>
      </Section>

      <Section title="Media (photos & videos)">
        <Field label="Upload images or videos" wide>
          <MediaUploadField
            name="mediaFiles"
            buttonLabel="Upload photos or videos"
            helper={<>Everything you upload here is tagged as <span className="font-medium">rough intake</span> and follows the stone through every cutting job and finished gem in its lineage — visible on the Media tab and in the Lifecycle timeline. First image becomes the primary photo; more can be added later.</>}
          />
        </Field>
      </Section>

      <Section title="Sourcing & location">
        <Field label="Supplier">
          <EntityPicker
            name="supplierId"
            emptyLabel="— None —"
            options={suppliers.map((s) => ({ id: s.id, label: s.name, hint: s.code }))}
            onQuickCreate={async (nm) => {
              const r = await quickCreateSupplier(nm);
              return { id: r.id, label: r.name, hint: r.code };
            }}
            createLabel="Add supplier"
            createPlaceholder="Supplier name"
          />
        </Field>
        <Field label="Parcel">
          <EntityPicker
            name="parcelId"
            emptyLabel="— None —"
            options={parcels.map((p) => ({ id: p.id, label: p.code ?? p.name, hint: p.supplier?.name ?? undefined }))}
          />
        </Field>
        <Field label="Location">
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
        </Field>
      </Section>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button asChild variant="outline"><Link href="/rough">Cancel</Link></Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Register rough stone"}</Button>
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
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`space-y-1.5 ${wide ? "md:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
