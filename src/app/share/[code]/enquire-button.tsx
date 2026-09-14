"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageCircle, Check } from "lucide-react";
import { submitShareEnquiry } from "./enquire-actions";

export function EnquireButton({
  shareCode,
  gemstoneId,
  gemstoneCode,
  gemstoneLabel,
}: {
  shareCode: string;
  gemstoneId: string;
  gemstoneCode: string;
  gemstoneLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ kind: "success" } | { kind: "error"; message: string } | null>(null);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setStatus(null); }}>
      <DialogTrigger asChild>
        <Button variant="accent" className="w-full">
          <MessageCircle className="h-4 w-4" /> Enquire
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Enquire about {gemstoneCode}</DialogTitle></DialogHeader>
        {status?.kind === "success" ? (
          <div className="py-6 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-emerald-50 grid place-items-center">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="font-serif text-lg">Thank you</div>
            <p className="text-sm text-muted-foreground">
              We&rsquo;ve received your enquiry about {gemstoneLabel} and a member of our team will get back to you shortly.
            </p>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </div>
        ) : (
          <form
            action={(fd) => start(async () => {
              const result = await submitShareEnquiry(fd);
              if (result.ok) {
                setStatus({ kind: "success" });
              } else {
                setStatus({ kind: "error", message: result.error });
              }
            })}
            className="space-y-3"
          >
            <input type="hidden" name="shareCode" value={shareCode} />
            <input type="hidden" name="gemstoneId" value={gemstoneId} />
            <p className="text-xs text-muted-foreground">
              About: <span className="font-medium text-foreground">{gemstoneLabel}</span> · <span className="font-mono">{gemstoneCode}</span>
            </p>
            <div className="space-y-1.5">
              <Label>Your name *</Label>
              <Input name="senderName" required placeholder="Jane Chen" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input name="senderEmail" type="email" placeholder="jane@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input name="senderPhone" placeholder="+65 …" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Message *</Label>
              <Textarea name="message" rows={4} required placeholder="I'd love to know more about the pricing, treatment, and availability of this stone." />
            </div>
            {status?.kind === "error" && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{status.message}</div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={pending}>{pending ? "Sending…" : "Send enquiry"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
