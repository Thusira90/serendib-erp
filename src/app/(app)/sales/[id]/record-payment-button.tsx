"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { recordPayment } from "@/app/(app)/sales/actions";

export function RecordPaymentButton({ salesOrderId, currency, suggestedAmount }: { salesOrderId: string; currency: string; suggestedAmount: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> Record payment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
        <form action={(fd) => start(async () => { await recordPayment(fd); setOpen(false); })} className="space-y-3">
          <input type="hidden" name="salesOrderId" value={salesOrderId} />
          <Field label="Amount *"><Input name="amount" required inputMode="decimal" defaultValue={suggestedAmount.toFixed(2)} /></Field>
          <Field label="Currency"><Input name="currency" defaultValue={currency} /></Field>
          <Field label="Method">
            <select name="method" defaultValue="BANK_TRANSFER" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CARD">Card</option>
              <option value="CASH">Cash</option>
              <option value="CRYPTO">Crypto</option>
              <option value="CHEQUE">Cheque</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Reference"><Input name="reference" placeholder="SWIFT / TXN id" /></Field>
          <Field label="Received on"><Input name="receivedAt" type="date" /></Field>
          <Field label="Notes"><Textarea name="notes" rows={2} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Record payment"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
