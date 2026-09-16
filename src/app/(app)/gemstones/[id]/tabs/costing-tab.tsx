"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlusCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { addCostAllocation } from "../../finance-actions";

type Cost = { id: string; type: string; description: string | null; amount: number; currency: string; incurredAt: Date };

export function CostingTab({
  gemstoneId, costs, totalCost, currency, canWrite,
}: {
  gemstoneId: string;
  costs: Cost[];
  totalCost: number;
  currency: string;
  canWrite: boolean;
}) {
  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <AddCostDialog gemstoneId={gemstoneId} currency={currency} />
        </div>
      )}
      <div className="rounded-lg border bg-card divide-y">
        {costs.length === 0 && <div className="p-4 text-sm text-muted-foreground">No cost allocations yet.</div>}
        {costs.map((c) => (
          <div key={c.id} className="p-3 flex items-center justify-between text-sm">
            <div>
              <Badge variant="muted" className="mr-2">{c.type.replaceAll("_", " ")}</Badge>
              <span className="text-muted-foreground">{c.description ?? "—"}</span>
            </div>
            <div className="num">{formatCurrency(Number(c.amount), c.currency)}</div>
          </div>
        ))}
        <div className="p-3 flex items-center justify-between font-medium bg-secondary/40">
          <span>Total true cost</span>
          <span className="num">{formatCurrency(totalCost, currency)}</span>
        </div>
      </div>
    </div>
  );
}

function AddCostDialog({ gemstoneId, currency }: { gemstoneId: string; currency: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><PlusCircle className="h-4 w-4" /> Add cost</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add cost allocation</DialogTitle></DialogHeader>
        <form action={(fd) => start(async () => { await addCostAllocation(fd); setOpen(false); })} className="space-y-3">
          <input type="hidden" name="gemstoneId" value={gemstoneId} />
          <div className="space-y-1.5">
            <Label>Cost type</Label>
            <select name="type" defaultValue="CERTIFICATION" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="ROUGH_PURCHASE">Rough purchase</option>
              <option value="CUTTING">Cutting</option>
              <option value="LABOR">Labor</option>
              <option value="CERTIFICATION">Certification</option>
              <option value="PHOTOGRAPHY">Photography</option>
              <option value="CGI">CGI</option>
              <option value="TRANSPORT">Transport</option>
              <option value="PACKAGING">Packaging</option>
              <option value="SHIPPING">Shipping</option>
              <option value="MARKETING">Marketing</option>
              <option value="CUSTOMS">Customs</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            <CurrencyInput amountName="amount" currencyName="currency" required defaultCurrency={currency} />
          </div>
          <div className="space-y-1.5"><Label>Description</Label><Textarea name="description" rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Add cost"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
