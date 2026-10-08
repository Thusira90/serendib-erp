import "server-only";
import type { Session } from "next-auth";
import type { Capability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/enums";
import { can } from "@/lib/rbac.client";
import { parseArr } from "@/lib/session-guard";
import type { Db } from "@/lib/partner-gather";

// `can` comes from the client twin (kept identical to rbac.ts by scripts/test-rbac-drift.ts) and the session helpers are
// loaded lazily, so this module and the ledger that uses actorCan stay loadable by scripts without NextAuth.

/** Money actions never trust the JWT snapshot: they re-read the user. */
const ALWAYS_FRESH: ReadonlySet<Capability> = new Set<Capability>(["partner:settle"]);

type Principal = { role: Role; grants: string[]; denies: string[] };

/** The user's current role, grants and denies, or null when the user is gone or deactivated. */
export async function loadFreshPrincipal(db: Db, userId: string): Promise<Principal | null> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { active: true, role: true, capabilityGrants: true, capabilityDenies: true },
  });
  if (!row || !row.active) return null;
  return { role: row.role as Role, grants: parseArr(row.capabilityGrants), denies: parseArr(row.capabilityDenies) };
}

/** Fresh check for a known user id (the ledger uses this for the actor of every money write). */
export async function actorCan(db: Db, userId: string, cap: Capability): Promise<boolean> {
  const principal = await loadFreshPrincipal(db, userId);
  return principal !== null && can(principal, cap);
}

async function assertSession(session: Session, cap: Capability, fresh: boolean): Promise<void> {
  if (!can(session.user, cap)) throw new Error(`Forbidden: missing capability ${cap}`);
  if (fresh || ALWAYS_FRESH.has(cap)) {
    if (!(await actorCan(prisma, session.user.id, cap))) throw new Error(`Forbidden: missing capability ${cap}`);
  }
}

/**
 * Signed-in user holding `cap`. With `fresh` (always for partner:settle) the user is re-read from the database, so a
 * deactivation, demotion or deny takes effect at once. Redirects to /login when signed out; throws when forbidden.
 */
export async function requirePartnerCapability(cap: Capability, opts: { fresh?: boolean } = {}): Promise<Session> {
  const { requireAuth } = await import("@/lib/rbac");
  const session = await requireAuth();
  await assertSession(session, cap, opts.fresh === true);
  return session;
}

/** Same check without redirect or throw, for server actions that return { ok: false, error }. */
export async function tryPartnerCapability(
  cap: Capability,
  opts: { fresh?: boolean } = {},
): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Your session has ended. Sign in again." };
  try {
    await assertSession(session, cap, opts.fresh === true);
  } catch {
    return { ok: false, error: "You do not have permission to do this." };
  }
  return { ok: true, session };
}
