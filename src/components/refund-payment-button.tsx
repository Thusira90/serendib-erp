"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Undo2 } from "lucide-react";
import { recordRefund } from "@/app/(app)/sales/actions";

export function RefundPaymentButton({
  salesOrderId, currency, maxAmount,
}: { salesOrderId: string; currency: string; maxAmount: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Undo2 className="h-4 w-4" /> Record refund</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record refund</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            const res = await recordRefund(fd);
            if (res.ok) setOpen(false); else setError(res.error);
          })}
          className="space-y-3"
        >
          <input type="hidden" name="salesOrderId" value={salesOrderId} />
          <p className="text-xs text-muted-foreground">
            Money paid back to the customer. Up to {maxAmount.toFixed(2)} {currency} is currently held on this order.
          </p>
          <Field label="Refund amount *">
            <CurrencyInput amountName="amount" currencyName="currency" required defaultAmount={maxAmount.toFixed(2)} defaultCurrency={currency} />
          </Field>
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
          <Field label="Refunded on"><Input name="receivedAt" type="date" /></Field>
          <Field label="Reason / notes"><Textarea name="notes" rows={2} /></Field>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Record refund"}</Button>
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
