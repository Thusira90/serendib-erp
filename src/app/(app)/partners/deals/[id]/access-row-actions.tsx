"use client";

import { useState, useTransition } from "react";
import { Ban, CalendarPlus, KeyRound, LockOpen, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearAccessPassword, extendAccess, revokePartnerAccess, rotatePartnerAccess, setAccessPassword } from "../../access-actions";
import { AccessUrlModal, type IssuedLink } from "./access-url-modal";

export type AccessRowInfo = {
  id: string;
  displayId: string;
  status: "ACTIVE" | "LOCKED" | "EXPIRED" | "REVOKED";
  hasPassword: boolean;
  expiresAt: string | null;
};

type Mode = "revoke" | "rotate" | "password" | "clear" | "extend";

const EXTEND: { value: string; days: 7 | 30 | 90 | 180 | 365 | null; label: string }[] = [
  { value: "30", days: 30, label: "30 days from now" },
  { value: "90", days: 90, label: "90 days from now" },
  { value: "180", days: 180, label: "180 days from now" },
  { value: "365", days: 365, label: "365 days from now" },
  { value: "7", days: 7, label: "7 days from now" },
  { value: "never", days: null, label: "No expiry" },
];

const SELECT_CLASS = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";
const BTN = "h-7 gap-1 px-2 text-xs";

export function AccessRowActions({ access, partnerName }: { access: AccessRowInfo; partnerName: string }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [extendTo, setExtendTo] = useState("90");
  const [confirmNever, setConfirmNever] = useState(false);

  const live = access.status !== "REVOKED";

  function open(next: Mode) {
    setError(null);
    setReason("");
    setPassword("");
    setExtendTo("90");
    setConfirmNever(false);
    setMode(next);
  }

  function close() {
    if (!pending) setMode(null);
  }

  function run(task: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const res = await task();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMode(null);
    });
  }

  function submit() {
    switch (mode) {
      case "revoke":
        return run(() => revokePartnerAccess({ accessId: access.id, reason: reason.trim() || undefined }));
      case "clear":
        return run(() => clearAccessPassword({ accessId: access.id }));
      case "password":
        if (password.length < 10) {
          setError("Password must be at least 10 characters.");
          return;
        }
        return run(() => setAccessPassword({ accessId: access.id, password }));
      case "extend": {
        const days = EXTEND.find((o) => o.value === extendTo)?.days ?? null;
        return run(() => extendAccess({ accessId: access.id, expiryDays: days, confirmNoExpiry: confirmNever }));
      }
      case "rotate":
        setError(null);
        start(async () => {
          const res = await rotatePartnerAccess({ accessId: access.id });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setMode(null);
          setIssued({ displayId: res.displayId, path: res.path, url: res.url, qrSvg: res.qrSvg, expiresAt: res.expiresAt });
        });
        return;
      default:
        return;
    }
  }

  const noExpiry = mode === "extend" && extendTo === "never";
  const submitDisabled = pending || (noExpiry && !confirmNever) || (mode === "password" && password.length === 0);

  const copy: Record<Mode, { title: string; description: string; action: string; destructive?: boolean }> = {
    revoke: {
      title: `Revoke link ${access.displayId}?`,
      description: `The link stops opening straight away. It cannot recall photos or files already saved, and image addresses already seen stay reachable. If you think this link reached someone it should not have, revoke it and send ${partnerName} a new one.`,
      action: "Revoke link",
      destructive: true,
    },
    rotate: {
      title: `Replace link ${access.displayId}?`,
      description: "A new link is created and this one stops working at once. The password carries over; the expiry carries over too (an expired link gets a new 90-day expiry). The new link is shown once.",
      action: "Replace link",
    },
    password: {
      title: access.hasPassword ? "Change password" : "Set a password",
      description: "Changing the password signs the partner out on every device and lifts any lockout. Share the password over a different channel from the link.",
      action: access.hasPassword ? "Change password" : "Set password",
    },
    clear: {
      title: "Remove the password?",
      description: "Anyone who has the link will be able to open it without a password.",
      action: "Remove password",
      destructive: true,
    },
    extend: {
      title: "Extend expiry",
      description: "Pick a date later than the current expiry. A link that has already expired opens again once extended.",
      action: "Extend",
    },
  };

  return (
    <>
      {live && (
        <div className="flex flex-wrap gap-1">
          {access.expiresAt !== null && (
            <Button type="button" variant="outline" size="sm" className={BTN} onClick={() => open("extend")}><CalendarPlus /> Extend</Button>
          )}
          <Button type="button" variant="outline" size="sm" className={BTN} onClick={() => open("password")}>
            <KeyRound /> {access.hasPassword ? "Change password" : "Set password"}
          </Button>
          {access.hasPassword && (
            <Button type="button" variant="outline" size="sm" className={BTN} onClick={() => open("clear")}><LockOpen /> Clear password</Button>
          )}
          <Button type="button" variant="outline" size="sm" className={BTN} onClick={() => open("rotate")}><RotateCw /> Rotate</Button>
          <Button type="button" variant="outline" size="sm" className={`${BTN} text-red-700 hover:text-red-800`} onClick={() => open("revoke")}><Ban /> Revoke</Button>
        </div>
      )}

      <Dialog open={mode !== null} onOpenChange={(o) => { if (!o) close(); }}>
        {mode && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{copy[mode].title}</DialogTitle>
              <DialogDescription>{copy[mode].description}</DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
              {mode === "revoke" && (
                <div className="space-y-1.5">
                  <Label htmlFor="revoke-reason">Reason (internal, optional)</Label>
                  <Input id="revoke-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Link sent to the wrong person" />
                </div>
              )}
              {mode === "password" && (
                <div className="space-y-1.5">
                  <Label htmlFor="link-password">New password</Label>
                  <Input
                    id="link-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    maxLength={72}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 10 characters"
                  />
                </div>
              )}
              {mode === "extend" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="extend-to">New expiry</Label>
                    <select id="extend-to" value={extendTo} onChange={(e) => { setExtendTo(e.target.value); setConfirmNever(false); }} className={SELECT_CLASS}>
                      {EXTEND.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {noExpiry && (
                    <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                      <input type="checkbox" className="mt-0.5" checked={confirmNever} onChange={(e) => setConfirmNever(e.target.checked)} />
                      <span>I understand this link will keep working until I revoke it.</span>
                    </label>
                  )}
                </div>
              )}
              {error && <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button>
                <Button type="submit" variant={copy[mode].destructive ? "destructive" : "default"} disabled={submitDisabled}>
                  {pending ? "Working..." : copy[mode].action}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <AccessUrlModal link={issued} heading="New link ready" partnerName={partnerName} onClose={() => setIssued(null)} />
    </>
  );
}
