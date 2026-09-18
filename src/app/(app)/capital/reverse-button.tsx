"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Undo2 } from "lucide-react";
import { reverseCapitalTransaction } from "@/app/(app)/directors/actions";

export function ReverseButton({ id, code }: { id: string; code: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Post a reversing entry">
          <Undo2 className="h-3.5 w-3.5 text-red-600" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reverse {code}</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => { await reverseCapitalTransaction(fd); setOpen(false); })}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={id} />
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Textarea name="reason" required rows={3} placeholder="e.g. duplicate entry, wrong amount, wrong director" />
            <p className="text-[10px] text-muted-foreground">
              This posts a matching negative entry. The original stays visible in the ledger, marked REVERSED.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending} variant="destructive">{pending ? "Posting…" : "Post reversal"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
