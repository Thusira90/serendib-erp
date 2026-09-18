"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { createQuotation } from "@/app/(app)/sales/actions";

export function NewQuotationButton({
  customers, gemstones, defaultCustomerId, defaultGemstoneId, defaultPrice, defaultCurrency = "LKR",
}: {
  customers: { id: string; code: string; displayName: string }[];
  gemstones: { id: string; code: string; gemType: string; variety: string | null; askingPrice: number | null; currency: string }[];
  defaultCustomerId?: string;
  defaultGemstoneId?: string;
  defaultPrice?: number;
  defaultCurrency?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> New quotation</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Draft quotation</DialogTitle></DialogHeader>
        <form action={(fd) => start(async () => { await createQuotation(fd); setOpen(false); })} className="grid grid-cols-2 gap-3">
          <Field label="Customer *" span>
            <select name="customerId" required defaultValue={defaultCustomerId ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Select —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.displayName} · {c.code}</option>)}
            </select>
          </Field>
          <Field label="Gemstone *" span>
            <select name="gemstoneId" required defaultValue={defaultGemstoneId ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Select —</option>
              {gemstones.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.gemType}{g.variety ? ` (${g.variety})` : ""}{g.askingPrice ? ` — ${g.askingPrice} ${g.currency}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Price *"><Input name="price" required inputMode="decimal" defaultValue={defaultPrice ?? ""} /></Field>
          <Field label="Currency"><Input name="currency" defaultValue={defaultCurrency} /></Field>
          <Field label="Valid until"><Input name="validUntil" type="date" /></Field>
          <Field label="Payment terms"><Input name="paymentTerms" placeholder="50% on order, 50% before shipping" /></Field>
          <Field label="Delivery terms" span><Input name="deliveryTerms" placeholder="Insured courier, 5–7 business days" /></Field>
          <Field label="Shipping terms" span><Input name="shippingTerms" placeholder="DAP customer address" /></Field>
          <Field label="Notes" span><Textarea name="notes" rows={2} /></Field>
          <div className="col-span-full flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Draft quotation"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, span = false }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={`space-y-1.5 ${span ? "col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
