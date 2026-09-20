"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABEL } from "@/lib/enums";
import { createAccount } from "./actions";

type ParentOption = { code: string; name: string; type: string };

export function NewAccountButton({ parents, defaultCurrency = "LKR" }: { parents: ParentOption[]; defaultCurrency?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [type, setType] = useState<string>("ASSET");
  const filteredParents = parents.filter((p) => p.type === type);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Plus className="h-4 w-4" /> New account</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Chart of Accounts entry</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          System accounts (seeded from spec §10) can be deactivated but not deleted. Use this to add sub-accounts
          under the standard categories — e.g. multiple bank accounts under 1200.
        </p>
        <form
          action={(fd) => start(async () => { await createAccount(fd); setOpen(false); })}
          className="grid grid-cols-2 gap-3"
        >
          <Field label="Code *"><Input name="code" required placeholder="1201" maxLength={20} /></Field>
          <Field label="Type *">
            <select name="type" value={type} onChange={(e) => setType(e.target.value)} required
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Name *" span><Input name="name" required placeholder="HSBC operating account" /></Field>
          <Field label="Parent">
            <select name="parentCode" defaultValue=""
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— None —</option>
              {filteredParents.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
            </select>
          </Field>
          <Field label="Currency"><Input name="currency" defaultValue={defaultCurrency} /></Field>
          <Field label="Description" span><Textarea name="description" rows={2} /></Field>
          <input type="hidden" name="subtype" value="" />
          <div className="col-span-full flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Create account"}</Button>
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
