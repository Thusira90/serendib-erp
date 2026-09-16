"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { EXPENSE_CATEGORIES } from "@/lib/enums";
import { createExpense } from "./actions";

const label = (c: string) => c.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

export function NewExpenseButton({ defaultCurrency }: { defaultCurrency: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> Record expense</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record expense</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => { await createExpense(fd); setOpen(false); })}
          className="grid grid-cols-2 gap-3"
        >
          <Field label="Category *">
            <select name="category" defaultValue="OFFICE" required
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </Field>
          <Field label="Amount *" span>
            <CurrencyInput amountName="amount" currencyName="currency" required defaultCurrency={defaultCurrency} />
          </Field>
          <Field label="Date"><Input name="incurredAt" type="date" defaultValue={new Date().toISOString().slice(0,10)} /></Field>
          <Field label="Vendor"><Input name="vendor" placeholder="Supplier / payee" /></Field>
          <Field label="Description *" span><Input name="description" required placeholder="Office rent April 2026" /></Field>
          <Field label="Related to (optional)" span>
            <div className="grid grid-cols-3 gap-2">
              <select name="relatedEntity" defaultValue="" className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="">— None —</option>
                <option value="Gemstone">Gemstone</option>
                <option value="RoughStone">Rough stone</option>
                <option value="CuttingJob">Cutting job</option>
                <option value="Customer">Customer</option>
                <option value="Shipment">Shipment</option>
              </select>
              <Input name="relatedCode" placeholder="Code (e.g. SGS-G-…)" className="col-span-2" />
            </div>
          </Field>
          <Field label="Receipt (image or PDF)" span><Input name="receiptFile" type="file" accept="application/pdf,image/*" /></Field>
          <Field label="Notes" span><Textarea name="notes" rows={2} /></Field>
          <div className="col-span-full flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Record"}</Button>
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
