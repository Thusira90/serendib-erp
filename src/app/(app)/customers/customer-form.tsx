"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MultiComboboxInput } from "@/components/multi-combobox-input";
import { ExtraInfoField } from "@/components/extra-info-field";
import { CurrencySelect } from "@/components/ui/currency-input";
import { createCustomer, updateCustomer } from "./actions";

type Existing = {
  id: string;
  kind: string; type: string;
  displayName: string; companyName: string | null;
  country: string | null; city: string | null; addressLine: string | null;
  email: string | null; phone: string | null; website: string | null; socialProfile: string | null;
  notes: string | null;
  preferences?: {
    gemTypes: string[]; varieties: string[]; origins: string[];
    colors: string[]; shapes: string[]; treatments: string[];
    minWeightCt: number | null; maxWeightCt: number | null;
    budgetMin: number | null; budgetMax: number | null; currency: string;
    extras?: Array<{ label: string; value: string }>;
  } | null;
};

/** Starting suggestions for the extra-information labels; anything else can be typed. */
const EXTRA_LABELS = [
  "Preferred contact method", "Language", "Referred by", "Occasion", "Birthday", "Anniversary",
  "Ring / jewellery size", "Metal preference", "Spouse / partner", "Assistant / contact person",
  "Best time to call", "Time zone", "Payment preference", "Shipping preference",
];

export function CustomerForm({ existing, vocab = {} }: { existing?: Existing; vocab?: Record<string, string[]> }) {
  const opts = (key: string) => vocab[key] ?? [];
  const [pending, start] = useTransition();
  const action = existing ? updateCustomer : createCustomer;
  const p = existing?.preferences ?? { gemTypes: [], varieties: [], origins: [], colors: [], shapes: [], treatments: [], minWeightCt: null, maxWeightCt: null, budgetMin: null, budgetMax: null, currency: "LKR" };
  const numOrEmpty = (n: number | null) => (n == null ? "" : String(n));
  return (
    <form action={(fd) => start(() => action(fd))} className="space-y-8">
      {existing && <input type="hidden" name="id" value={existing.id} />}
      <Section title="Identity">
        <Field label="Kind">
          <select name="kind" defaultValue={existing?.kind ?? "INDIVIDUAL"} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="INDIVIDUAL">Individual</option>
            <option value="COMPANY">Company</option>
          </select>
        </Field>
        <Field label="Customer type">
          <select name="type" defaultValue={existing?.type ?? "PRIVATE_BUYER"} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="COLLECTOR">Collector</option>
            <option value="JEWELLER">Jeweller</option>
            <option value="JEWELLERY_BRAND">Jewelry brand</option>
            <option value="DEALER">Dealer</option>
            <option value="RETAILER">Retailer</option>
            <option value="WHOLESALER">Wholesaler</option>
            <option value="PRIVATE_BUYER">Private buyer</option>
            <option value="INTERNATIONAL_BUYER">International buyer</option>
          </select>
        </Field>
        <Field label="Display name *"><Input name="displayName" required defaultValue={existing?.displayName ?? ""} /></Field>
        <Field label="Company (optional)"><Input name="companyName" defaultValue={existing?.companyName ?? ""} /></Field>
      </Section>

      <Section title="Contact">
        <Field label="Email"><Input name="email" type="email" defaultValue={existing?.email ?? ""} /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={existing?.phone ?? ""} /></Field>
        <Field label="Country"><Input name="country" defaultValue={existing?.country ?? ""} /></Field>
        <Field label="City"><Input name="city" defaultValue={existing?.city ?? ""} /></Field>
        <Field label="Address" wide><Textarea name="addressLine" rows={2} defaultValue={existing?.addressLine ?? ""} /></Field>
        <Field label="Website"><Input name="website" defaultValue={existing?.website ?? ""} /></Field>
        <Field label="Social profile"><Input name="socialProfile" defaultValue={existing?.socialProfile ?? ""} /></Field>
      </Section>

      <Section title="Preferences">
        <Field label="Preferred gem types"><MultiComboboxInput name="prefGemTypes" defaultValue={p.gemTypes} options={opts("gemType")} /></Field>
        <Field label="Varieties"><MultiComboboxInput name="prefVarieties" defaultValue={p.varieties} options={opts("variety")} /></Field>
        <Field label="Origins"><MultiComboboxInput name="prefOrigins" defaultValue={p.origins} options={opts("origin")} /></Field>
        <Field label="Colors"><MultiComboboxInput name="prefColors" defaultValue={p.colors} options={opts("color")} /></Field>
        <Field label="Shapes"><MultiComboboxInput name="prefShapes" defaultValue={p.shapes} options={opts("shape")} /></Field>
        <Field label="Treatments"><MultiComboboxInput name="prefTreatments" defaultValue={p.treatments} options={opts("treatment")} /></Field>
        <Field label="Min weight (ct)"><NumberInput name="prefMinWeightCt" defaultValue={numOrEmpty(p.minWeightCt)} /></Field>
        <Field label="Max weight (ct)"><NumberInput name="prefMaxWeightCt" defaultValue={numOrEmpty(p.maxWeightCt)} /></Field>
        <Field label="Budget min"><NumberInput name="prefBudgetMin" defaultValue={numOrEmpty(p.budgetMin)} /></Field>
        <Field label="Budget max"><NumberInput name="prefBudgetMax" defaultValue={numOrEmpty(p.budgetMax)} /></Field>
        <Field label="Currency"><CurrencySelect name="prefCurrency" defaultValue={p.currency} /></Field>
      </Section>

      <Section title="Additional information">
        <ExtraInfoField name="extrasJson" defaultValue={p.extras ?? []} suggestions={EXTRA_LABELS} />
      </Section>

      <Section title="Notes">
        <Field label="Private notes" wide><Textarea name="notes" rows={4} defaultValue={existing?.notes ?? ""} /></Field>
      </Section>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button asChild variant="outline"><Link href={existing ? `/customers/${existing.id}` : "/customers"}>Cancel</Link></Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : existing ? "Save changes" : "Create customer"}</Button>
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
