"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Undo2 } from "lucide-react";
import { reverseJournalEntry } from "../actions";

export function ReverseJournalButton({ id, code }: { id: string; code: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm"><Undo2 className="h-4 w-4" /> Reverse</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reverse {code}</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => { await reverseJournalEntry(fd); setOpen(false); })}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={id} />
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Textarea name="reason" required rows={3} placeholder="e.g. wrong account, duplicate entry, wrong amount" />
            <p className="text-[10px] text-muted-foreground">
              A matching reversing entry is posted in the current open period. Both entries stay in the ledger.
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
