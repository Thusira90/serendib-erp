"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Lock, Receipt, ShoppingBag, Unlock } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { reserveGemstone, releaseReservation, createSale } from "@/app/(app)/sales/actions";

type MiniCustomer = { id: string; code: string; displayName: string };
type ActiveReservation = {
  id: string; code: string;
  customer: { id: string; displayName: string };
  price: number; deposit: number | null; currency: string;
  expiresAt: Date | null; reservedAt: Date;
};
type ExistingSale = {
  id: string; code: string; invoiceNumber: string;
  customer: { id: string; displayName: string };
  totalAmount: number; currency: string; saleDate: Date;
};

export function CommerceSection({
  gemstoneId, status, askingPrice, currency,
  customers, activeReservation, sale,
  canReserve, canSell,
}: {
  gemstoneId: string;
  status: string;
  askingPrice: number | null;
  currency: string;
  customers: MiniCustomer[];
  activeReservation: ActiveReservation | null;
  sale: ExistingSale | null;
  canReserve: boolean;
  canSell: boolean;
}) {
  return (
    <div className="space-y-3">
      {status === "AVAILABLE" && (
        <Card>
          <CardHeader className="pb-3"><CardTitle>Ready to sell</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {canReserve && <ReserveDialog gemstoneId={gemstoneId} customers={customers} askingPrice={askingPrice} currency={currency} />}
            {canSell && <SellDialog gemstoneId={gemstoneId} customers={customers} askingPrice={askingPrice} currency={currency} reservationId={null} lockCustomerId={null} />}
          </CardContent>
        </Card>
      )}

      {status === "RESERVED" && activeReservation && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-sgs-purple-500" /> Reserved</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <KV label="Reservation" value={<span className="font-mono">{activeReservation.code}</span>} />
              <KV label="Customer" value={<Link href={`/customers/${activeReservation.customer.id}`} className="text-sgs-teal-700 hover:underline">{activeReservation.customer.displayName}</Link>} />
              <KV label="Agreed price" value={formatCurrency(activeReservation.price, activeReservation.currency)} />
              <KV label="Deposit" value={activeReservation.deposit != null ? formatCurrency(activeReservation.deposit, activeReservation.currency) : "—"} />
              <KV label="Reserved" value={formatDate(activeReservation.reservedAt)} />
              <KV label="Expires" value={formatDate(activeReservation.expiresAt)} />
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {canSell && <SellDialog gemstoneId={gemstoneId} customers={customers} askingPrice={activeReservation.price} currency={activeReservation.currency} reservationId={activeReservation.id} lockCustomerId={activeReservation.customer.id} />}
              {canReserve && (
                <form action={releaseReservation}>
                  <input type="hidden" name="id" value={activeReservation.id} />
                  <input type="hidden" name="reason" value="Released from gemstone view" />
                  <Button variant="outline"><Unlock className="h-4 w-4" /> Release reservation</Button>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {status === "SOLD" && sale && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><Receipt className="h-4 w-4 text-sgs-purple-500" /> Sold</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <KV label="Sales order" value={<Link href={`/sales/${sale.id}`} className="font-mono text-sgs-teal-700 hover:underline">{sale.code}</Link>} />
            <KV label="Invoice" value={<span className="font-mono">{sale.invoiceNumber}</span>} />
            <KV label="Customer" value={<Link href={`/customers/${sale.customer.id}`} className="text-sgs-teal-700 hover:underline">{sale.customer.displayName}</Link>} />
            <KV label="Sale date" value={formatDate(sale.saleDate)} />
            <KV label="Total" value={<span className="num font-medium">{formatCurrency(sale.totalAmount, sale.currency)}</span>} span />
          </CardContent>
        </Card>
      )}

      {(status === "IN_PROGRESS" || status === "ARCHIVED" || status === "LOST") && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">
          Not available for sale in current state (<Badge variant="muted">{status}</Badge>).
        </CardContent></Card>
      )}
    </div>
  );
}

function KV({ label, value, span = false }: { label: string; value: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function ReserveDialog({ gemstoneId, customers, askingPrice, currency }: {
  gemstoneId: string; customers: MiniCustomer[]; askingPrice: number | null; currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Lock className="h-4 w-4" /> Reserve for customer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Reserve gemstone</DialogTitle></DialogHeader>
        <form action={(fd) => start(async () => {
          setError(null);
          try { await reserveGemstone(fd); setOpen(false); }
          catch (e) { setError((e as Error).message); }
        })} className="space-y-3">
          <input type="hidden" name="gemstoneId" value={gemstoneId} />
          <div className="space-y-1.5">
            <Label>Customer *</Label>
            <select name="customerId" required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Select —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.displayName} · {c.code}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label>Agreed price *</Label><Input name="price" required inputMode="decimal" defaultValue={askingPrice ?? ""} /></div>
          <div className="space-y-1.5"><Label>Currency</Label><Input name="currency" defaultValue={currency} /></div>
          <div className="space-y-1.5"><Label>Deposit paid</Label><Input name="deposit" inputMode="decimal" /></div>
          <div className="space-y-1.5"><Label>Expires on</Label><Input name="expiresAt" type="date" /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Reserve"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SellDialog({ gemstoneId, customers, askingPrice, currency, reservationId, lockCustomerId }: {
  gemstoneId: string; customers: MiniCustomer[]; askingPrice: number | null; currency: string;
  reservationId: string | null;
  lockCustomerId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default"><ShoppingBag className="h-4 w-4" /> {reservationId ? "Complete sale" : "Sell now"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{reservationId ? "Complete sale from reservation" : "Record direct sale"}</DialogTitle></DialogHeader>
        <form action={(fd) => start(async () => {
          setError(null);
          try { await createSale(fd); setOpen(false); }
          catch (e) { setError((e as Error).message); }
        })} className="space-y-3">
          <input type="hidden" name="gemstoneId" value={gemstoneId} />
          {reservationId && <input type="hidden" name="reservationId" value={reservationId} />}
          <div className="space-y-1.5">
            <Label>Customer *</Label>
            {lockCustomerId ? (
              <>
                <input type="hidden" name="customerId" value={lockCustomerId} />
                <div className="text-sm px-3 py-2 rounded-md border bg-secondary/50">
                  {customers.find((c) => c.id === lockCustomerId)?.displayName ?? lockCustomerId}
                </div>
              </>
            ) : (
              <select name="customerId" required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Select —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.displayName} · {c.code}</option>)}
              </select>
            )}
          </div>
          <div className="space-y-1.5"><Label>Agreed price *</Label><Input name="agreedPrice" required inputMode="decimal" defaultValue={askingPrice ?? ""} /></div>
          <div className="space-y-1.5"><Label>Tax</Label><Input name="taxAmount" inputMode="decimal" defaultValue="0" /></div>
          <div className="space-y-1.5"><Label>Currency</Label><Input name="currency" defaultValue={currency} /></div>
          <div className="space-y-1.5"><Label>Sale date</Label><Input name="saleDate" type="date" /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Confirm sale"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
