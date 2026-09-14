"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { createSupplier } from "./actions";

export function NewSupplierButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> New supplier</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add supplier</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await createSupplier(fd); }
            catch (e) { setError((e as Error).message); }
          })}
          className="space-y-3"
        >
          <F label="Name *"><Input name="name" required placeholder="Ratnapura Rough Traders" /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Country"><Input name="country" placeholder="Sri Lanka" /></F>
            <F label="City"><Input name="city" placeholder="Ratnapura" /></F>
          </div>
          <F label="Contact person"><Input name="contact" placeholder="Sarath Bandara" /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Email"><Input name="email" type="email" /></F>
            <F label="Phone"><Input name="phone" /></F>
          </div>
          <F label="Code (optional)"><Input name="code" placeholder="SUP-0004 (auto if blank)" /></F>
          <F label="Notes"><Textarea name="notes" rows={2} /></F>
          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Add supplier"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
