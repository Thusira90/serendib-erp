"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlusCircle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { changeAskingPrice } from "../../finance-actions";

type PricePoint = {
  id: string; oldPrice: number | null; newPrice: number; currency: string;
  reason: string | null; changedBy: string | null; changedAt: Date;
};

export function PricingTab({
  gemstoneId, priceHistory, currentPrice, currency, canWrite,
}: {
  gemstoneId: string;
  priceHistory: PricePoint[];
  currentPrice: number | null;
  currency: string;
  canWrite: boolean;
}) {
  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <ChangePriceDialog gemstoneId={gemstoneId} currency={currency} currentPrice={currentPrice} />
        </div>
      )}
      <div className="rounded-lg border bg-card divide-y">
        {priceHistory.length === 0 && <div className="p-4 text-sm text-muted-foreground">No pricing history yet.</div>}
        {priceHistory.map((p) => (
          <div key={p.id} className="p-3 flex items-center justify-between text-sm">
            <div>
              <span className="num">{p.oldPrice ? formatCurrency(Number(p.oldPrice), p.currency) : "∅"} → {formatCurrency(Number(p.newPrice), p.currency)}</span>
              {p.reason && <span className="text-muted-foreground ml-2">— {p.reason}</span>}
            </div>
            <div className="text-xs text-muted-foreground">{formatDate(p.changedAt)} · {p.changedBy ?? "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChangePriceDialog({ gemstoneId, currency, currentPrice }: { gemstoneId: string; currency: string; currentPrice: number | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><PlusCircle className="h-4 w-4" /> Change asking price</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Change asking price</DialogTitle></DialogHeader>
        <form action={(fd) => start(async () => { await changeAskingPrice(fd); setOpen(false); })} className="space-y-3">
          <input type="hidden" name="gemstoneId" value={gemstoneId} />
          <div className="text-sm text-muted-foreground">
            Current asking: <span className="num text-foreground">{currentPrice != null ? formatCurrency(currentPrice, currency) : "—"}</span>
          </div>
          <div className="space-y-1.5">
            <Label>New asking price *</Label>
            <CurrencyInput amountName="newPrice" currencyName="currency" required defaultCurrency={currency} />
          </div>
          <div className="space-y-1.5"><Label>Reason (recommended)</Label><Textarea name="reason" rows={2} placeholder="Certificate received; market uplift" /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Save new price"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
