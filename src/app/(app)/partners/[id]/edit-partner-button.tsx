"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { PartnerFields, type PartnerFormValues } from "../new-partner-button";
import { setPartnerActive, updatePartner } from "../actions";

export function EditPartnerButton({ partnerId, values }: { partnerId: string; values: PartnerFormValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit partner</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            const r = await updatePartner(fd);
            if (!r.ok) { setError(r.error); return; }
            setOpen(false);
            router.refresh();
          })}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={partnerId} />
          <PartnerFields values={values} />
          {error && <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PartnerActiveButton({ partnerId, active }: { partnerId: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function toggle() {
    if (active && !window.confirm("Deactivate this partner? Their statement links stop working while they are inactive.")) return;
    setError(null);
    start(async () => {
      const r = await setPartnerActive(partnerId, !active);
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
    });
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={toggle}>
        {pending ? "Saving…" : active ? "Deactivate" : "Reactivate"}
      </Button>
      {error && <span role="alert" className="max-w-xs text-right text-xs text-red-700">{error}</span>}
    </span>
  );
}
