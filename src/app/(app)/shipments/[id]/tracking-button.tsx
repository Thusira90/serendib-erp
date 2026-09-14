"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Truck } from "lucide-react";
import { CARRIERS } from "@/lib/carriers";
import { updateShipmentTracking } from "../actions";

export function TrackingButton({
  id, courier, trackingNumber,
}: {
  id: string;
  courier: string | null;
  trackingNumber: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hasTracking = !!trackingNumber;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Truck className="h-4 w-4" /> {hasTracking ? "Update tracking" : "Set tracking"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Carrier &amp; tracking</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await updateShipmentTracking(fd); setOpen(false); }
            catch (e) { setError((e as Error).message); }
          })}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={id} />
          <div className="space-y-1.5">
            <Label>Courier</Label>
            <select
              name="courier"
              defaultValue={courier ?? ""}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— None yet —</option>
              {CARRIERS.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Tracking / AWB number</Label>
            <Input name="trackingNumber" defaultValue={trackingNumber ?? ""} placeholder="1Z999AA10123456784" />
          </div>
          <div className="text-xs text-muted-foreground">
            After saving, a &ldquo;Track&rdquo; link takes the recipient straight to the courier&rsquo;s tracking page.
          </div>
          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
