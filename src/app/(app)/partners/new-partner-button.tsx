"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { PARTNER_KINDS } from "@/lib/enums";
import { createPartner } from "./actions";

export const PARTNER_KIND_LABEL: Record<string, string> = {
  BROKER: "Broker",
  INVESTOR: "Investor",
  AGENT: "Agent",
};

export type PartnerFormValues = {
  name?: string;
  kind?: string;
  company?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
  notes?: string | null;
};

export function NewPartnerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> New partner</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add partner</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            const r = await createPartner(fd);
            if (!r.ok) { setError(r.error); return; }
            setOpen(false);
            router.push(`/partners/${r.id}`);
          })}
          className="space-y-3"
        >
          <PartnerFields />
          {error && <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Add partner"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PartnerFields({ values = {} }: { values?: PartnerFormValues }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <F label="Name *"><Input name="name" required maxLength={120} defaultValue={values.name ?? ""} placeholder="Hassan Trading" /></F>
        <F label="Type *">
          <select
            name="kind"
            required
            defaultValue={values.kind ?? "BROKER"}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {PARTNER_KINDS.map((k) => <option key={k} value={k}>{PARTNER_KIND_LABEL[k] ?? k}</option>)}
          </select>
        </F>
      </div>
      <F label="Company"><Input name="company" maxLength={120} defaultValue={values.company ?? ""} placeholder="Hassan Gems Ltd" /></F>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <F label="Contact name"><Input name="contactName" maxLength={120} defaultValue={values.contactName ?? ""} /></F>
        <F label="Country"><Input name="country" maxLength={80} defaultValue={values.country ?? ""} placeholder="Thailand" /></F>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <F label="Phone"><Input name="phone" maxLength={40} defaultValue={values.phone ?? ""} /></F>
        <F label="Email"><Input name="email" type="email" maxLength={200} defaultValue={values.email ?? ""} /></F>
      </div>
      <F label="Internal notes">
        <Textarea name="notes" rows={3} maxLength={2000} defaultValue={values.notes ?? ""} />
        <p className="text-[11px] text-muted-foreground">Never shown to the partner.</p>
      </F>
    </>
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
