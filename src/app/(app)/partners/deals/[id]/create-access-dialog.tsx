"use client";

import { useState, useTransition } from "react";
import { Link2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPartnerAccess } from "../../access-actions";
import { AccessUrlModal, type IssuedLink } from "./access-url-modal";

const EXPIRY: { value: string; days: 7 | 30 | 90 | 180 | 365 | null; label: string }[] = [
  { value: "7", days: 7, label: "7 days" },
  { value: "30", days: 30, label: "30 days" },
  { value: "90", days: 90, label: "90 days (recommended)" },
  { value: "180", days: 180, label: "180 days" },
  { value: "365", days: 365, label: "365 days" },
  { value: "never", days: null, label: "No expiry" },
];

const SELECT_CLASS = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

export function CreateAccessDialog({
  dealId,
  partnerName,
  stoneCount,
  shows,
  showsFinancials,
  disabledReason,
}: {
  dealId: string;
  partnerName: string;
  stoneCount: number;
  /** What the partner would see, already phrased for the warning (for example "the account statement, sale price and stone details"). */
  shows: string;
  /** True when any of sale price, purchase cost, cost breakdown, supplier name or receipts is visible to the partner. */
  showsFinancials: boolean;
  disabledReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedLink | null>(null);

  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [confirmNever, setConfirmNever] = useState(false);
  const [password, setPassword] = useState("");
  const [ack, setAck] = useState(false);

  const days = EXPIRY.find((e) => e.value === expiry)?.days ?? null;
  const noExpiry = days === null;
  const hasPassword = password.length > 0;
  const expiryText = days === null
    ? "never"
    : new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const canSubmit = ack && !pending && (!noExpiry || confirmNever);

  function reset() {
    setLabel(""); setExpiry("90"); setConfirmNever(false); setPassword(""); setAck(false); setError(null);
  }

  function submit() {
    if (!ack) return;
    if (hasPassword && password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await createPartnerAccess({
        dealId,
        label: label.trim() || undefined,
        expiryDays: days,
        confirmNoExpiry: confirmNever,
        password: hasPassword ? password : undefined,
        acknowledged: true,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setIssued({ displayId: res.displayId, path: res.path, url: res.url, qrSvg: res.qrSvg, expiresAt: res.expiresAt });
      setOpen(false);
      reset();
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!pending) { setOpen(o); if (!o) reset(); } }}>
        <DialogTrigger asChild>
          <Button variant="accent" disabled={disabledReason !== null} title={disabledReason ?? undefined}>
            <Link2 className="h-4 w-4" /> Create link
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create a link for {partnerName}</DialogTitle>
            <DialogDescription>A private page that shows this deal&apos;s statement. No sign-in is needed to open it.</DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="access-label">Label (internal)</Label>
              <Input id="access-label" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Hassan phone" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="access-expiry">Expires</Label>
                <select id="access-expiry" value={expiry} onChange={(e) => { setExpiry(e.target.value); setConfirmNever(false); }} className={SELECT_CLASS}>
                  {EXPIRY.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="access-password">Password (optional)</Label>
                <Input
                  id="access-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  maxLength={72}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 10 characters"
                />
              </div>
            </div>

            {noExpiry && (
              <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                <input type="checkbox" className="mt-0.5" checked={confirmNever} onChange={(e) => setConfirmNever(e.target.checked)} />
                <span>I understand this link will keep working until I revoke it.</span>
              </label>
            )}

            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
              <p className="flex items-center gap-1.5 font-semibold">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden /> Read before creating
              </p>
              <p>
                Anyone who has this link can open this page. It shows {shows} for {stoneCount} {stoneCount === 1 ? "stone" : "stones"} to whoever
                holds it, even if it is forwarded or screenshotted. Send it only to {partnerName} over a channel you trust.
                This link {hasPassword ? "is protected by a password" : "has no password"}. It expires on {expiryText}.
                Every visit is logged (time, country, device type) and you can revoke it at any time; revoking stops the page opening
                but cannot recall photos or files already saved, and image addresses already seen stay reachable.
                The link also appears in hosting request logs. The full link is shown only once; use Rotate if it is lost.
              </p>
              {!hasPassword && showsFinancials && (
                <p className="font-semibold text-red-700">This link has no password and shows financial details.</p>
              )}
              <label className="flex items-start gap-2 pt-1 font-medium">
                <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>I have read this and want to create the link.</span>
              </label>
            </div>

            {error && <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={!canSubmit}>{pending ? "Creating..." : "Create link"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AccessUrlModal link={issued} heading="Link created" partnerName={partnerName} onClose={() => setIssued(null)} />
    </>
  );
}
