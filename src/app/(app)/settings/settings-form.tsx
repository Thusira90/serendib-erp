"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCompanySettings } from "./actions";

type S = {
  legalName: string;
  tradingName: string | null;
  addressLine: string | null;
  city: string | null;
  country: string;
  taxId: string | null;
  registrationNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  defaultCurrency: string;
  defaultPaymentTerms: string;
  defaultDeliveryTerms: string;
  defaultShippingTerms: string;
};

export function SettingsForm({ existing, canWrite }: { existing: S; canWrite: boolean }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <form
      action={(fd) => start(async () => {
        setSaved(false);
        await updateCompanySettings(fd);
        setSaved(true);
      })}
      className="space-y-8"
    >
      <Section title="Identity">
        <F label="Legal name *"><Input name="legalName" required defaultValue={existing.legalName} /></F>
        <F label="Trading name"><Input name="tradingName" defaultValue={existing.tradingName ?? ""} /></F>
        <F label="Registration number"><Input name="registrationNumber" defaultValue={existing.registrationNumber ?? ""} /></F>
        <F label="Tax ID"><Input name="taxId" defaultValue={existing.taxId ?? ""} /></F>
      </Section>

      <Section title="Address">
        <F label="Address line" wide><Textarea name="addressLine" rows={2} defaultValue={existing.addressLine ?? ""} /></F>
        <F label="City"><Input name="city" defaultValue={existing.city ?? ""} /></F>
        <F label="Country *"><Input name="country" required defaultValue={existing.country} /></F>
      </Section>

      <Section title="Contact">
        <F label="Email"><Input name="email" type="email" defaultValue={existing.email ?? ""} /></F>
        <F label="Phone"><Input name="phone" defaultValue={existing.phone ?? ""} /></F>
        <F label="Website" wide><Input name="website" defaultValue={existing.website ?? ""} /></F>
      </Section>

      <Section title="Commercial defaults">
        <F label="Default currency"><Input name="defaultCurrency" defaultValue={existing.defaultCurrency} /></F>
        <F label="Payment terms" wide><Input name="defaultPaymentTerms" defaultValue={existing.defaultPaymentTerms} /></F>
        <F label="Delivery terms" wide><Input name="defaultDeliveryTerms" defaultValue={existing.defaultDeliveryTerms} /></F>
        <F label="Shipping terms" wide><Input name="defaultShippingTerms" defaultValue={existing.defaultShippingTerms} /></F>
      </Section>

      {canWrite ? (
        <div className="flex justify-end gap-3 pt-4 border-t items-center">
          {saved && <span className="text-xs text-emerald-700">Saved.</span>}
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground pt-4 border-t">Read-only for your role.</div>
      )}
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
