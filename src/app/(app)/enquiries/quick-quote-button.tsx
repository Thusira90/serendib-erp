"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText } from "lucide-react";
import { createQuotation } from "@/app/(app)/sales/actions";

type Gem = { id: string; code: string; gemType: string; variety: string | null; askingPrice: number | null; currency: string };

/**
 * Row-level "Quote this" action on an enquiry.
 * Opens a dialog pre-filled with the enquiry's customer, its gemstone (if any),
 * the gem's asking price, and the enquiry id — so the resulting quotation
 * is threaded back through Enquiry.quotations automatically.
 */
export function QuickQuoteButton({
  enquiryId, customerId, customerName,
  gemstone, availableGems,
  defaultCurrency,
}: {
  enquiryId: string;
  customerId: string;
  customerName: string;
  gemstone: Gem | null;                  // stone attached to the enquiry (if any)
  availableGems: Gem[];                  // fallback list to pick from
  defaultCurrency: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initialGem = gemstone ?? availableGems[0] ?? null;
  const [selectedGemId, setSelectedGemId] = useState(initialGem?.id ?? "");
  const selected = availableGems.find((g) => g.id === selectedGemId) ?? gemstone ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><FileText className="h-4 w-4" /> Quote</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Quote for {customerName}</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await createQuotation(fd); setOpen(false); }
            catch (e) { setError((e as Error).message); }
          })}
          className="grid grid-cols-2 gap-3"
        >
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="enquiryId" value={enquiryId} />
          <div className="col-span-2 space-y-1.5">
            <Label>Gemstone *</Label>
            <select
              name="gemstoneId" required
              value={selectedGemId}
              onChange={(e) => setSelectedGemId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Select —</option>
              {availableGems.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} · {g.gemType}{g.variety ? ` (${g.variety})` : ""}
                  {g.askingPrice ? ` — ${g.askingPrice} ${g.currency}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Price *</Label>
            <CurrencyInput
              amountName="price"
              currencyName="currency"
              required
              defaultAmount={selected?.askingPrice ?? ""}
              defaultCurrency={selected?.currency ?? defaultCurrency}
            />
          </div>
          <div className="space-y-1.5"><Label>Valid until</Label><Input name="validUntil" type="date" /></div>
          <div className="space-y-1.5"><Label>Payment terms</Label><Input name="paymentTerms" /></div>
          <div className="col-span-2 space-y-1.5"><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
          {error && <div className="col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Draft quotation"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
