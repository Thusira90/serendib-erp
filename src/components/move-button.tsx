"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MoveRight } from "lucide-react";
import { moveItem } from "@/app/(app)/locations/actions";

type LocationOption = { id: string; code: string; name: string };

export function MoveButton({
  itemKind, roughStoneId, gemstoneId, currentLocationId, locations,
}: {
  itemKind: "ROUGH" | "GEMSTONE";
  roughStoneId?: string;
  gemstoneId?: string;
  currentLocationId?: string | null;
  locations: LocationOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = locations.filter((l) => l.id !== currentLocationId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><MoveRight className="h-4 w-4" /> Move</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Move to location</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await moveItem(fd); setOpen(false); }
            catch (e) { setError((e as Error).message); }
          })}
          className="space-y-3"
        >
          <input type="hidden" name="itemKind" value={itemKind} />
          {roughStoneId && <input type="hidden" name="roughStoneId" value={roughStoneId} />}
          {gemstoneId && <input type="hidden" name="gemstoneId" value={gemstoneId} />}
          <div className="space-y-1.5">
            <Label>Destination *</Label>
            <select name="toLocationId" required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Select —</option>
              {options.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label>Reason</Label><Input name="reason" placeholder="Sent to QC / returned to vault …" /></div>
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Moving…" : "Move"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
