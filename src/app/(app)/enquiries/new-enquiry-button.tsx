"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { createEnquiry } from "@/app/(app)/sales/actions";

export function NewEnquiryButton({
  customers, gemstones, defaultCurrency = "LKR",
}: {
  customers: { id: string; code: string; displayName: string }[];
  gemstones: { id: string; code: string; gemType: string; variety: string | null }[];
  defaultCurrency?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> New enquiry</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Log new enquiry</DialogTitle></DialogHeader>
        <form action={(fd) => start(async () => { await createEnquiry(fd); setOpen(false); })} className="grid grid-cols-2 gap-3">
          <Field label="Customer *" span>
            <select name="customerId" required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Select —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.displayName} · {c.code}</option>)}
            </select>
          </Field>
          <Field label="Gemstone (optional)" span>
            <select name="gemstoneId" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— General enquiry —</option>
              {gemstones.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.gemType}{g.variety ? ` (${g.variety})` : ""}</option>)}
            </select>
          </Field>
          <Field label="Requirement *" span>
            <Textarea name="requirement" required rows={3} placeholder="3-5 ct unheated Ceylon blue sapphire, oval or cushion, budget around $25k." />
          </Field>
          <Field label="Preferred origin"><Input name="preferredOrigin" /></Field>
          <Field label="Preferred treatment"><Input name="preferredTreatment" /></Field>
          <Field label="Preferred shape"><Input name="preferredShape" /></Field>
          <Field label="Quantity"><Input name="quantity" type="number" defaultValue={1} min={1} /></Field>
          <Field label="Min weight (ct)"><Input name="minWeightCt" inputMode="decimal" /></Field>
          <Field label="Max weight (ct)"><Input name="maxWeightCt" inputMode="decimal" /></Field>
          <Field label="Budget min"><Input name="budgetMin" inputMode="decimal" /></Field>
          <Field label="Budget max"><Input name="budgetMax" inputMode="decimal" /></Field>
          <Field label="Currency"><Input name="currency" defaultValue={defaultCurrency} /></Field>
          <Field label="Follow-up date"><Input name="followUpDate" type="date" /></Field>
          <Field label="Notes" span><Textarea name="notes" rows={2} /></Field>
          <div className="col-span-full flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Create enquiry"}</Button>
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
