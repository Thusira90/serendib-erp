"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { createLocation } from "./actions";

export function NewLocationButton({
  parents,
}: {
  parents: { id: string; code: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> New location</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add location</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await createLocation(fd); setOpen(false); }
            catch (e) { setError((e as Error).message); }
          })}
          className="space-y-3"
        >
          <div className="space-y-1.5"><Label>Code *</Label><Input name="code" required placeholder="VAULT-C" /></div>
          <div className="space-y-1.5"><Label>Name *</Label><Input name="name" required placeholder="Cabinet C" /></div>
          <div className="space-y-1.5">
            <Label>Parent</Label>
            <select name="parentId" defaultValue="" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Root —</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
          </div>
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Add location"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
