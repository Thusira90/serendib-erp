"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { KeyRound, Plus, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { ROLES } from "@/lib/enums";
import { createUser, resetPassword, toggleUserActive, updateUserRole } from "./actions";

const roleLabel = (r: string) => r.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

export function NewUserButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><UserPlus className="h-4 w-4" /> Add user</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add user</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await createUser(fd); setOpen(false); }
            catch (e) { setError((e as Error).message); }
          })}
          className="space-y-3"
        >
          <F label="Name *"><Input name="name" required /></F>
          <F label="Email *"><Input name="email" type="email" required /></F>
          <F label="Role">
            <select name="role" defaultValue="SALES" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </F>
          <F label="Temporary password *"><Input name="password" required type="text" minLength={8} placeholder="At least 8 characters" /></F>
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Adding…" : "Add user"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ChangeRoleInline({ userId, currentRole, disabled }: { userId: string; currentRole: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <form action={(fd) => start(() => updateUserRole(fd))} className="inline-flex items-center gap-1">
      <input type="hidden" name="id" value={userId} />
      <select name="role" defaultValue={currentRole} disabled={disabled} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
        {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
      </select>
      <Button size="sm" variant="outline" disabled={pending || disabled}>{pending ? "…" : "Save"}</Button>
    </form>
  );
}

export function ToggleActiveButton({ userId, active, disabled }: { userId: string; active: boolean; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <form action={(fd) => start(() => toggleUserActive(fd))} className="inline">
      <input type="hidden" name="id" value={userId} />
      <Button size="sm" variant="ghost" disabled={pending || disabled}>
        {active ? (<><ShieldOff className="h-3.5 w-3.5" /> Disable</>) : (<><ShieldCheck className="h-3.5 w-3.5" /> Re-enable</>)}
      </Button>
    </form>
  );
}

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><KeyRound className="h-3.5 w-3.5" /> Reset password</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Reset password</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => { await resetPassword(fd); setOpen(false); })}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={userId} />
          <F label="New password *"><Input name="password" required minLength={8} placeholder="At least 8 characters" /></F>
          <div className="text-xs text-muted-foreground">The user will need to sign in again with this password.</div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Set password"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
