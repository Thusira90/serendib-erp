"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Clock, X, ShoppingCart } from "lucide-react";
import { extendReservation, releaseReservation, createSale } from "@/app/(app)/sales/actions";

export function ExtendReservationButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start"><Clock className="h-4 w-4" /> Extend hold</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Extend reservation</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await extendReservation(fd); setOpen(false); }
            catch (e) { setError((e as Error).message); }
          })}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={id} />
          <div className="space-y-1.5">
            <Label>Extend by (days)</Label>
            <Input name="days" type="number" defaultValue={7} min={1} required />
          </div>
          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Extending…" : "Extend"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReleaseReservationButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-red-700"><X className="h-4 w-4" /> Release hold</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Release reservation</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await releaseReservation(fd); setOpen(false); }
            catch (e) { setError((e as Error).message); }
          })}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={id} />
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Textarea name="reason" rows={2} placeholder="Client passed, hold expired, sold to other party…" />
          </div>
          <div className="text-xs text-muted-foreground">
            This will mark the reservation as RELEASED and return the gemstone to AVAILABLE.
          </div>
          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending} variant="destructive">{pending ? "Releasing…" : "Release"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConvertToSaleButton({
  reservationId, customerId, gemstoneId, price, currency,
}: {
  reservationId: string;
  customerId: string;
  gemstoneId: string;
  price: number;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" className="w-full justify-start"><ShoppingCart className="h-4 w-4" /> Convert to sale</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Convert reservation to sales order</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await createSale(fd); }
            catch (e) { setError((e as Error).message); }
          })}
          className="space-y-3"
        >
          <input type="hidden" name="reservationId" value={reservationId} />
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="gemstoneId" value={gemstoneId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Agreed price *</Label>
              <Input name="agreedPrice" required inputMode="decimal" defaultValue={price} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input name="currency" defaultValue={currency} />
            </div>
            <div className="space-y-1.5">
              <Label>Tax</Label>
              <Input name="taxAmount" inputMode="decimal" defaultValue={0} />
            </div>
            <div className="space-y-1.5">
              <Label>Sale date</Label>
              <Input name="saleDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea name="notes" rows={2} />
          </div>
          <div className="text-xs text-muted-foreground">
            Creates a sales order and marks the reservation as CONVERTED.
          </div>
          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Converting…" : "Convert to sale"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
