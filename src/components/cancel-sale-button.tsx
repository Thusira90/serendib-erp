"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Ban } from "lucide-react";
import { cancelSale } from "@/app/(app)/sales/actions";

export function CancelSaleButton({ salesOrderId, saleCode, gemCode }: { salesOrderId: string; saleCode: string; gemCode: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-red-600 hover:text-red-700"><Ban className="h-4 w-4" /> Cancel sale</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancel sale {saleCode}</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            const res = await cancelSale(fd);
            if (res.ok) setOpen(false); else setError(res.error);
          })}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={salesOrderId} />
          <p className="text-xs text-muted-foreground">
            The invoice is voided and {gemCode} returns to available stock. A sale that holds payments must be refunded first,
            and one that has shipped cannot be cancelled.
          </p>
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Textarea name="reason" rows={3} required placeholder="Why is this sale being cancelled?" />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Keep sale</Button>
            <Button variant="destructive" disabled={pending}>{pending ? "Cancelling…" : "Cancel sale"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
