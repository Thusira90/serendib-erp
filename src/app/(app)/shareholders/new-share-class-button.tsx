"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Layers } from "lucide-react";
import { createShareClass } from "@/app/(app)/directors/actions";

export function NewShareClassButton({ defaultCurrency = "LKR" }: { defaultCurrency?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Layers className="h-4 w-4" /> New share class</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New share class</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => { await createShareClass(fd); setOpen(false); })}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code *"><Input name="code" required placeholder="ORD" maxLength={10} /></Field>
            <Field label="Name *"><Input name="name" required placeholder="Ordinary shares" /></Field>
          </div>
          <Field label="Face value *">
            <CurrencyInput amountName="faceValue" currencyName="currency"
              defaultCurrency={defaultCurrency} required placeholder="10.00" />
          </Field>
          <Field label="Notes"><Textarea name="notes" rows={2} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Create class"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
