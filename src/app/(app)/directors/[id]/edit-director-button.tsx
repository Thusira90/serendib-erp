"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { DIRECTOR_ROLES } from "@/lib/enums";
import { updateDirector } from "../actions";

type Director = {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  address: string | null;
  active: boolean;
  joinedAt: Date;
  leftAt: Date | null;
  notes: string | null;
};

const dateInput = (d: Date | null) => d ? d.toISOString().slice(0, 10) : "";

export function EditDirectorButton({ director }: { director: Director }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit director</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => { await updateDirector(fd); setOpen(false); })}
          className="grid grid-cols-2 gap-3"
        >
          <input type="hidden" name="id" value={director.id} />
          <Field label="Name *" span><Input name="name" required defaultValue={director.name} /></Field>
          <Field label="Role *">
            <select name="role" defaultValue={director.role} required
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {DIRECTOR_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              {!DIRECTOR_ROLES.some((r) => r === director.role) && (
                <option value={director.role}>{director.role}</option>
              )}
            </select>
          </Field>
          <Field label="Status">
            <div className="flex gap-4 items-center h-9 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="active" value="true" defaultChecked={director.active} /> Active
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="active" value="false" defaultChecked={!director.active} /> Inactive
              </label>
            </div>
          </Field>
          <Field label="Joined"><Input name="joinedAt" type="date" defaultValue={dateInput(director.joinedAt)} /></Field>
          <Field label="Left"><Input name="leftAt" type="date" defaultValue={dateInput(director.leftAt)} /></Field>
          <Field label="Email"><Input name="email" type="email" defaultValue={director.email ?? ""} /></Field>
          <Field label="Phone"><Input name="phone" defaultValue={director.phone ?? ""} /></Field>
          <Field label="National ID"><Input name="nationalId" defaultValue={director.nationalId ?? ""} /></Field>
          <Field label="Address" span><Input name="address" defaultValue={director.address ?? ""} /></Field>
          <Field label="Notes" span><Textarea name="notes" rows={2} defaultValue={director.notes ?? ""} /></Field>
          <div className="col-span-full flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
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
