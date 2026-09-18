"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { DIRECTOR_ROLES } from "@/lib/enums";
import { createDirector } from "./actions";

export function NewDirectorButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Plus className="h-4 w-4" /> Add director</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add director</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          A director is a person holding a board seat. If the same person also holds shares,
          record them as a Shareholder from the Shareholders page and link back to this director.
        </p>
        <form
          action={(fd) => start(async () => { await createDirector(fd); setOpen(false); })}
          className="grid grid-cols-2 gap-3"
        >
          <Field label="Name *" span><Input name="name" required placeholder="Aloka Perera" /></Field>
          <Field label="Role *">
            <select name="role" defaultValue="Director" required
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {DIRECTOR_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Joined"><Input name="joinedAt" type="date" defaultValue={new Date().toISOString().slice(0,10)} /></Field>
          <Field label="Email"><Input name="email" type="email" placeholder="aloka@serendib.lk" /></Field>
          <Field label="Phone"><Input name="phone" placeholder="+94 77 123 4567" /></Field>
          <Field label="National ID / passport" span><Input name="nationalId" placeholder="199012345678" /></Field>
          <Field label="Address" span><Input name="address" placeholder="12 Galle Road, Colombo 03" /></Field>
          <Field label="Notes" span><Textarea name="notes" rows={2} placeholder="Board resolution number, appointment context…" /></Field>
          <div className="col-span-full flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Add director"}</Button>
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
