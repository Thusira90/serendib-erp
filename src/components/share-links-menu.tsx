"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Copy, Check, MessageCircle, Mail, Share2, ExternalLink } from "lucide-react";
import Link from "next/link";

export type SharePath = {
  key: string;                    // stable id used for React keys + copied-state
  label: string;                  // "Catalogue view", "Verify certificate", …
  hint?: string;                  // one-line description under the label
  path: string;                   // "/catalogue/SGS-G-2026-000001" — origin-less
};

/**
 * Reusable "share" dialog. Given one or more origin-less paths, renders a
 * copy button for each (turned into a full URL client-side against
 * window.location.origin, so it always matches whatever domain the user
 * is browsing from — dev, staging, prod), plus WhatsApp and email buttons
 * that pre-compose the outgoing message with the caption.
 *
 * Deliberately client-only — the whole thing is copy-to-clipboard and
 * mailto: / wa.me handoffs. No server call.
 */
export function ShareLinksMenu({
  triggerLabel = "Share",
  triggerVariant = "outline",
  triggerSize = "default",
  title,
  intro,
  paths,
  defaultCaption,
  contactEmail,
  contactPhone,
}: {
  triggerLabel?: string;
  triggerVariant?: "outline" | "accent" | "ghost";
  triggerSize?: "default" | "sm" | "icon";
  title: string;
  intro?: string;
  paths: SharePath[];
  /** Editable caption composed into WhatsApp/email bodies. */
  defaultCaption: string;
  /** Optional pre-fill for the recipient. */
  contactEmail?: string | null;
  /** Optional pre-fill for the WhatsApp phone (E.164, digits only). */
  contactPhone?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState(defaultCaption);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [phone, setPhone] = useState(contactPhone ?? "");
  const [email, setEmail] = useState(contactEmail ?? "");

  const originOf = () => (typeof window === "undefined" ? "" : window.location.origin);
  const fullUrl = (p: SharePath) => `${originOf()}${p.path}`;

  const copy = async (p: SharePath) => {
    try {
      await navigator.clipboard.writeText(fullUrl(p));
      setCopiedKey(p.key);
      setTimeout(() => setCopiedKey((k) => (k === p.key ? null : k)), 1500);
    } catch { /* ignore — some browsers block clipboard */ }
  };

  /** Compose the caption + all paths into one shareable body. */
  const messageBody = () => {
    const urls = paths.map((p) => `${p.label}: ${fullUrl(p)}`).join("\n");
    return `${caption}\n\n${urls}`;
  };

  const waHref = () => {
    const digits = phone.replace(/\D+/g, "");
    const text = encodeURIComponent(messageBody());
    return digits
      ? `https://wa.me/${digits}?text=${text}`
      : `https://wa.me/?text=${text}`;
  };

  const mailHref = () => {
    const to = email ? encodeURIComponent(email) : "";
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(messageBody());
    return `mailto:${to}?subject=${subject}&body=${body}`;
  };

  const TriggerIcon = triggerSize === "icon" ? Share2 : Share2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          <TriggerIcon className="h-4 w-4" />
          {triggerSize !== "icon" && <span className="ml-1">{triggerLabel}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {intro && <p className="text-xs text-muted-foreground -mt-1">{intro}</p>}

        <div className="space-y-2">
          {paths.map((p) => (
            <div key={p.key} className="rounded-md border bg-secondary/30 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.label}</div>
                  {p.hint && <div className="text-[10px] text-muted-foreground">{p.hint}</div>}
                  <Link
                    href={p.path}
                    target="_blank"
                    className="text-xs text-sgs-teal-700 hover:underline font-mono break-all inline-flex items-center gap-1 mt-0.5"
                  >
                    {p.path} <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                </div>
                <Button size="sm" variant="outline" type="button" onClick={() => copy(p)}>
                  {copiedKey === p.key ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 pt-2 border-t">
          <div>
            <Label className="text-xs">Message</Label>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2}
              className="text-sm mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">WhatsApp number (optional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+94 77 123 4567" className="text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Email (optional)</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)}
                type="email" placeholder="customer@example.com" className="text-sm mt-1" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Numbers and emails aren't stored here — they only pre-fill the target app.
            Leave WhatsApp blank to open the chooser and pick a contact.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button asChild variant="outline">
            <a href={waHref()} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" /> Open WhatsApp
            </a>
          </Button>
          <Button asChild variant="accent">
            <a href={mailHref()}>
              <Mail className="h-4 w-4" /> Compose email
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
