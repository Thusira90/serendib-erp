"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createRoughStone } from "./actions";
import Link from "next/link";

type Option = { id: string; name: string; code?: string };

export function RoughForm({
  suppliers, parcels, locations, defaultCurrency = "LKR",
}: {
  suppliers: Option[];
  parcels: (Option & { supplier?: { name: string } })[];
  locations: (Option & { code: string })[];
  defaultCurrency?: string;
}) {
  const [pending, start] = useTransition();

  return (
    <form action={(fd) => start(() => createRoughStone(fd))} className="space-y-8">
      <Section title="Identification">
        <Field label="Gemstone type *"><Input name="gemType" required placeholder="Sapphire" /></Field>
        <Field label="Variety"><Input name="variety" placeholder="Blue Sapphire" /></Field>
        <Field label="Species"><Input name="species" placeholder="Corundum" /></Field>
        <Field label="Origin"><Input name="origin" placeholder="Sri Lanka" /></Field>
        <Field label="Mine / source"><Input name="mineSource" placeholder="Ratnapura" /></Field>
        <Field label="Purchase date *"><Input name="purchaseDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)} /></Field>
      </Section>

      <Section title="Physical characteristics">
        <Field label="Weight (ct) *"><Input name="weightCt" required inputMode="decimal" placeholder="25.4" /></Field>
        <Field label="Length (mm)"><Input name="lengthMm" inputMode="decimal" /></Field>
        <Field label="Width (mm)"><Input name="widthMm" inputMode="decimal" /></Field>
        <Field label="Height (mm)"><Input name="heightMm" inputMode="decimal" /></Field>
        <Field label="Shape"><Input name="shape" /></Field>
        <Field label="Color"><Input name="color" /></Field>
        <Field label="Transparency"><Input name="transparency" /></Field>
        <Field label="Clarity"><Input name="clarity" /></Field>
        <Field label="Inclusions"><Input name="inclusions" /></Field>
        <Field label="Observations" wide><Textarea name="observations" rows={3} /></Field>
      </Section>

      <Section title="Commercial">
        <Field label="Purchase price *"><Input name="purchasePrice" required inputMode="decimal" placeholder="8900" /></Field>
        <Field label="Currency"><Input name="currency" defaultValue={defaultCurrency} /></Field>
        <Field label="Initial valuation"><Input name="initialValuation" inputMode="decimal" /></Field>
        <Field label="Valued by"><Input name="valuationBy" /></Field>
        <Field label="Valuation notes" wide><Textarea name="valuationNotes" rows={2} /></Field>
      </Section>

      <Section title="Sourcing & location">
        <Field label="Supplier">
          <select name="supplierId" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">— None —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Parcel">
          <select name="parcelId" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">— None —</option>
            {parcels.map((p) => <option key={p.id} value={p.id}>{p.code} {p.supplier?.name ? `· ${p.supplier.name}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Location">
          <select name="locationId" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">— Unassigned —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
          </select>
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
