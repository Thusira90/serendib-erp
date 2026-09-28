"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ShieldCheck, Sparkles } from "lucide-react";
import { PERMISSION_GROUPS, PERMISSION_PRESETS, can, type Capability, type Principal } from "@/lib/rbac.client";
import { updateUserPermissions } from "./actions";
import type { Role } from "@/lib/enums";

const capLabel = (c: string) => c.replace(":", " · ").replaceAll("_", " ")
  .replace(/\b\w/g, (l) => l.toUpperCase());

/**
 * Per-user permissions editor. Shows the role's default access as a faded
 * baseline you cannot uncheck; per-user grants (extending the role) and
 * denies (fencing it in) toggle on top. One-click presets swap the whole
 * pattern for common cases like "inventory viewer" or "data entry".
 */
export function PermissionsButton({
  userId, userName, role, initialGrants, initialDenies, disabled,
}: {
  userId: string;
  userName: string;
  role: Role;
  initialGrants: string[];
  initialDenies: string[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [grants, setGrants] = useState<Set<string>>(new Set(initialGrants));
  const [denies, setDenies] = useState<Set<string>>(new Set(initialDenies));

  // For each capability, we compute three states:
  //   - fromRole   → the role's default matrix has it (baseline)
  //   - granted    → in the user's grants overlay
  //   - denied     → in the user's denies overlay
  // The effective state is: (fromRole || granted) && !denied.
  const rolePrincipal: Principal = { role };

  function toggleEffective(cap: Capability) {
    const fromRole = can(rolePrincipal, cap);
    const nextGrants = new Set(grants);
    const nextDenies = new Set(denies);
    const currentlyEffective = (fromRole || nextGrants.has(cap)) && !nextDenies.has(cap);
    if (currentlyEffective) {
      // Turn it off: if the role grants it, we need a deny. Otherwise just remove the grant.
      if (fromRole) nextDenies.add(cap); else nextGrants.delete(cap);
    } else {
      // Turn it on: if the role would grant it (currently denied), remove the deny. Otherwise add a grant.
      if (nextDenies.has(cap)) nextDenies.delete(cap); else nextGrants.add(cap);
    }
    setGrants(nextGrants);
    setDenies(nextDenies);
  }

  function applyPreset(preset: { caps: Capability[] }) {
    const target = new Set<string>(preset.caps);
    const nextGrants = new Set<string>();
    const nextDenies = new Set<string>();
    // Walk every capability the app knows about — anything in the target
    // set that the role doesn't already grant becomes a grant; anything
    // the role grants that isn't in the target set becomes a deny.
    for (const g of PERMISSION_GROUPS) for (const cap of g.caps) {
      const fromRole = can(rolePrincipal, cap);
      const wanted = target.has(cap);
      if (wanted && !fromRole) nextGrants.add(cap);
      if (!wanted && fromRole && cap !== "user:manage") nextDenies.add(cap);
    }
    setGrants(nextGrants);
    setDenies(nextDenies);
  }

  function clearOverrides() {
    setGrants(new Set());
    setDenies(new Set());
  }

  const effectiveCount = useMemo(() => {
    let n = 0;
    for (const g of PERMISSION_GROUPS) for (const cap of g.caps) {
      if (can({ role, grants: [...grants], denies: [...denies] }, cap)) n++;
    }
    return n;
  }, [role, grants, denies]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={disabled}>
          <ShieldCheck className="h-3.5 w-3.5" /> Permissions
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Permissions — {userName}</DialogTitle>
        </DialogHeader>

        <form
          action={(fd) => start(async () => {
            fd.set("grants", [...grants].join(","));
            fd.set("denies", [...denies].join(","));
            await updateUserPermissions(fd);
            setOpen(false);
          })}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={userId} />

          <div className="rounded-md border bg-secondary/30 p-3 space-y-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Presets — one click sets the pattern below.
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PERMISSION_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  title={p.description}
                  className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-secondary"
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={clearOverrides}
                className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-secondary text-muted-foreground"
                title="Remove all per-user overrides; user returns to their role's default access"
              >
                Reset to role default
              </button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Effective access: <span className="font-medium text-foreground">{effectiveCount}</span> capabilities.
            A <span className="text-emerald-700">green tick</span> means the user has it, faded means they don&apos;t. Toggle any box —
            grants and denies overlay on top of the role.
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-4 pr-1">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  {group.label}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {group.caps.map((cap) => {
                    const fromRole = can(rolePrincipal, cap);
                    const granted = grants.has(cap);
                    const denied = denies.has(cap);
                    const effective = (fromRole || granted) && !denied;
                    const overlay = granted ? "grant" : denied ? "deny" : null;
                    return (
                      <label
                        key={cap}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border cursor-pointer text-xs ${
                          effective ? "bg-emerald-50/60 border-emerald-500/30" : "bg-background border-input opacity-70"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={effective}
                          onChange={() => toggleEffective(cap)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="flex-1">{capLabel(cap)}</span>
                        {overlay === "grant" && <span className="text-[9px] font-medium text-sgs-teal-700">+GRANT</span>}
                        {overlay === "deny" && <span className="text-[9px] font-medium text-red-700">−DENY</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="text-[10px] text-muted-foreground bg-secondary/40 rounded p-2">
            <span className="font-medium">How it works:</span> effective = role default ∪ grants − denies. A deny always beats a grant.
            The <span className="font-mono">user:manage</span> capability can only be granted through the SUPER_ADMIN role
            and cannot be denied — so the owner tier never gets locked out.
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Save permissions"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
