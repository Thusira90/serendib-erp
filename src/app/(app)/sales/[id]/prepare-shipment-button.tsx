"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plane } from "lucide-react";
import { createShipment } from "@/app/(app)/shipments/actions";

export function PrepareShipmentButton({
  salesOrderId, defaultDestination, defaultCountry, defaultCurrency, defaultDeclaredValue,
}: {
  salesOrderId: string;
  defaultDestination: string;
  defaultCountry: string;
  defaultCurrency: string;
  defaultDeclaredValue: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plane className="h-4 w-4" /> Prepare shipment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Prepare shipment</DialogTitle></DialogHeader>
        <form action={(fd) => start(async () => { await createShipment(fd); setOpen(false); })} className="space-y-3">
          <input type="hidden" name="salesOrderId" value={salesOrderId} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Courier"><Input name="courier" placeholder="FedEx / Malca-Amit" /></Field>
            <Field label="Tracking #"><Input name="trackingNumber" /></Field>
            <Field label="Destination" span><Input name="destination" defaultValue={defaultDestination} /></Field>
            <Field label="Destination country"><Input name="destCountry" defaultValue={defaultCountry} /></Field>
            <Field label="Currency"><Input name="currency" defaultValue={defaultCurrency} /></Field>
            <Field label="Shipping cost"><Input name="shippingCost" inputMode="decimal" /></Field>
            <Field label="Insurance cost"><Input name="insuranceCost" inputMode="decimal" /></Field>
            <Field label="Declared value" span><Input name="declaredValue" inputMode="decimal" defaultValue={defaultDeclaredValue} /></Field>
            <Field label="Notes" span><Textarea name="notes" rows={2} /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Create shipment"}</Button>
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
