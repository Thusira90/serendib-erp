"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  } | null;
};

export function CustomerForm({ existing }: { existing?: Existing }) {
  const [pending, start] = useTransition();
  const action = existing ? updateCustomer : createCustomer;
  const p = existing?.preferences ?? { gemTypes: [], varieties: [], origins: [], colors: [], shapes: [], treatments: [], minWeightCt: null, maxWeightCt: null, budgetMin: null, budgetMax: null, currency: "LKR" };
  const csv = (a: string[]) => a.join(", ");
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

      <Section title="Preferences (comma separated)">
        <Field label="Preferred gem types"><Input name="prefGemTypes" defaultValue={csv(p.gemTypes)} placeholder="Sapphire, Ruby" /></Field>
        <Field label="Varieties"><Input name="prefVarieties" defaultValue={csv(p.varieties)} placeholder="Padparadscha, Blue Sapphire" /></Field>
        <Field label="Origins"><Input name="prefOrigins" defaultValue={csv(p.origins)} placeholder="Sri Lanka, Mogok" /></Field>
        <Field label="Colors"><Input name="prefColors" defaultValue={csv(p.colors)} placeholder="royal blue, cornflower" /></Field>
        <Field label="Shapes"><Input name="prefShapes" defaultValue={csv(p.shapes)} placeholder="Oval, Cushion" /></Field>
        <Field label="Treatments"><Input name="prefTreatments" defaultValue={csv(p.treatments)} placeholder="Unheated" /></Field>
        <Field label="Min weight (ct)"><Input name="prefMinWeightCt" inputMode="decimal" defaultValue={numOrEmpty(p.minWeightCt)} /></Field>
        <Field label="Max weight (ct)"><Input name="prefMaxWeightCt" inputMode="decimal" defaultValue={numOrEmpty(p.maxWeightCt)} /></Field>
        <Field label="Budget min"><Input name="prefBudgetMin" inputMode="decimal" defaultValue={numOrEmpty(p.budgetMin)} /></Field>
        <Field label="Budget max"><Input name="prefBudgetMax" inputMode="decimal" defaultValue={numOrEmpty(p.budgetMax)} /></Field>
        <Field label="Currency"><Input name="prefCurrency" defaultValue={p.currency} /></Field>
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
