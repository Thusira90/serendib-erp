import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/enums";

export function parseArr(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

/** Fingerprint of the password hash, so a password reset ends sessions opened with the old one. */
export const pwStamp = (hash: string) => createHash("sha256").update(hash).digest("hex").slice(0, 16);

export type LiveUser = { role: Role; grants: string[]; denies: string[]; stamp: string };

// Sessions are JWTs, so role, grants and active state are re-read from the
// database at most once per interval per server instance. Deactivating,
// demoting or resetting a user therefore takes effect within a minute.
const REFRESH_MS = 60_000;
const liveCache = new Map<string, { at: number; user: LiveUser | null }>();

/** Current state of a user, or null when they are deleted or deactivated. */
export async function loadLiveUser(id: string): Promise<LiveUser | null> {
  const hit = liveCache.get(id);
  if (hit && Date.now() - hit.at < REFRESH_MS) return hit.user;
  const row = await prisma.user.findUnique({
    where: { id },
    select: { active: true, role: true, capabilityGrants: true, capabilityDenies: true, passwordHash: true },
  });
  const user: LiveUser | null = row && row.active
    ? { role: row.role as Role, grants: parseArr(row.capabilityGrants), denies: parseArr(row.capabilityDenies), stamp: pwStamp(row.passwordHash) }
    : null;
  liveCache.set(id, { at: Date.now(), user });
  return user;
}

/** Drops the cached state so a change made on this instance applies immediately. */
export function forgetLiveUser(id: string): void {
  liveCache.delete(id);
}
