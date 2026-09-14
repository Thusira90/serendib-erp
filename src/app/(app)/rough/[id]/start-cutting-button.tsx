"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Scissors } from "lucide-react";
import { startCuttingJob } from "@/app/(app)/cutting/actions";

export function StartCuttingButton({
  roughStoneId, cutters, defaultShape,
}: {
  roughStoneId: string;
  cutters: { id: string; name: string }[];
  defaultShape?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" size="sm"><Scissors className="h-4 w-4" /> Start cutting</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Start cutting job</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await startCuttingJob(fd); setOpen(false); }
            catch (e) { setError((e as Error).message); }
          })}
          className="space-y-3"
        >
          <input type="hidden" name="roughStoneId" value={roughStoneId} />
          <div className="space-y-1.5">
            <Label>Assign cutter (optional)</Label>
            <select name="cutterId" defaultValue="" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Unassigned —</option>
              {cutters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Planned cut</Label><Input name="plannedCut" defaultValue={defaultShape ?? ""} placeholder="Oval" /></div>
            <div className="space-y-1.5"><Label>Expected completion</Label><Input name="expectedCompletion" type="date" /></div>
            <div className="space-y-1.5"><Label>Target weight (ct)</Label><Input name="targetWeightCt" inputMode="decimal" /></div>
            <div className="space-y-1.5"><Label>Expected yield %</Label><Input name="expectedYieldPct" inputMode="decimal" placeholder="35" /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Starting…" : "Start job"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
