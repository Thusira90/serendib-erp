"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";
import { SHAREHOLDER_KINDS } from "@/lib/enums";
import { createShareholder } from "@/app/(app)/directors/actions";

type DirectorOption = { id: string; name: string; code: string; alreadyLinked: boolean };

export function NewShareholderButton({ directors }: { directors: DirectorOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<string>("INDIVIDUAL");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><UserPlus className="h-4 w-4" /> Add shareholder</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add shareholder</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => { await createShareholder(fd); setOpen(false); })}
          className="grid grid-cols-2 gap-3"
        >
          <Field label="Kind *">
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {SHAREHOLDER_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label={kind === "ENTITY" ? "Also a director?" : "Linked director"}>
            <select name="directorId" defaultValue=""
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— None —</option>
              {directors.map((d) => (
                <option key={d.id} value={d.id} disabled={d.alreadyLinked}>
                  {d.name} · {d.code}{d.alreadyLinked ? " (already linked)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label={kind === "ENTITY" ? "Entity name *" : "Name *"} span>
            <Input name="name" required placeholder={kind === "ENTITY" ? "Serendib Holdings (Pvt) Ltd" : "Aloka Perera"} />
          </Field>
          <Field label={kind === "ENTITY" ? "Company reg. no." : "National ID / passport"}>
            <Input name="nationalId" placeholder={kind === "ENTITY" ? "PV 12345" : "199012345678"} />
          </Field>
          <Field label="Email"><Input name="email" type="email" /></Field>
          <Field label="Phone" span><Input name="phone" /></Field>
          <Field label="Address" span><Input name="address" /></Field>
          <Field label="Notes" span><Textarea name="notes" rows={2} /></Field>
          <div className="col-span-full flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Add shareholder"}</Button>
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
