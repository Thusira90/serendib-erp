"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccessTime } from "./access-time";

export type IssuedLink = {
  displayId: string;
  path: string;
  url: string | null;
  qrSvg: string | null;
  expiresAt: string | null;
};

/**
 * Shows a freshly minted link exactly once. The token lives only in this component's props and state:
 * closing the dialog drops it, and nothing else on the page ever holds the full address.
 */
export function AccessUrlModal({
  link,
  heading,
  partnerName,
  onClose,
}: {
  link: IssuedLink | null;
  heading: string;
  partnerName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // Read after mount: window during render would make the server HTML differ from the first client render.
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => { setCopied(false); }, [link]);

  const href = link ? link.url ?? (origin ? `${origin}${link.path}` : link.path) : "";
  const absolute = /^https?:\/\//i.test(href);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* the field is selectable as a fallback */ }
  }

  return (
    <Dialog open={link !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      {link && (
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{heading}</DialogTitle>
            <DialogDescription>
              This is the only time the full link is shown. Copy it now and send it to {partnerName} over a channel you trust.
              If it is lost, use Rotate to issue a new one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={href}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Partner link"
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-secondary/30 px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
              />
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                {copied ? <><Check className="text-emerald-600" /> Copied</> : <><Copy /> Copy</>}
              </Button>
            </div>

            {!absolute && (
              <p className="flex items-start gap-1.5 text-xs text-amber-900">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                The site address could not be detected. Put your site address in front of the copied path before sending it.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {absolute && (
                <Button asChild variant="outline" size="sm">
                  <a href={`https://wa.me/?text=${encodeURIComponent(href)}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle /> Send on WhatsApp
                  </a>
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                Link {link.displayId} · expires <AccessTime iso={link.expiresAt} dateOnly empty="never" />
              </span>
            </div>

            {link.qrSvg && (
              <div className="flex items-center gap-3">
                <div
                  className="h-36 w-36 shrink-0 rounded-md border bg-white p-1"
                  aria-label="QR code of the link"
                  dangerouslySetInnerHTML={{ __html: link.qrSvg }}
                />
                <p className="text-xs text-muted-foreground">Scanning the code opens the same link, so treat it as confidential too.</p>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={onClose}>Done</Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
