"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { tryPartnerCapability } from "@/lib/partner-auth";
import {
  PartnerAccessError,
  createAccess,
  revokeAccess,
  rotateAccess,
  setAccessPassword as storeAccessPassword,
  tokenFingerprint,
} from "@/lib/partner-access";
import { renderQrSvg } from "@/lib/qr";

type Fail = { ok: false; error: string };
type Actor = { id: string; name: string | null };

const GENERIC_ERROR = "Something went wrong and nothing was changed. Try again.";
const DAY_MS = 86_400_000;

const fail = (error: string): Fail => ({ ok: false, error });
const firstIssue = (e: z.ZodError): string => e.issues[0]?.message ?? "Check the details and try again.";

function describe(e: unknown): string {
  if (e instanceof PartnerAccessError) return e.message;
  console.error("partner access action failed:", e instanceof Error ? e.name : "unknown");
  return GENERIC_ERROR;
}

// Every export of a "use server" file is a public endpoint, so each call re-checks the user against the database.
async function authorise(): Promise<{ ok: true; actor: Actor } | Fail> {
  const gate = await tryPartnerCapability("partner:write", { fresh: true });
  if (!gate.ok) return fail(gate.error);
  return { ok: true, actor: { id: gate.session.user.id, name: gate.session.user.name ?? null } };
}

const ID = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Unknown link");
const EXPIRY_DAYS = z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(180), z.literal(365), z.null()]);
const PASSWORD = z.string().min(10, "Password must be at least 10 characters").max(72, "Password must be at most 72 characters");

const needsNoExpiryConfirm = (v: { expiryDays: number | null; confirmNoExpiry: boolean }) => v.expiryDays !== null || v.confirmNoExpiry;
const NO_EXPIRY_MESSAGE = { message: "Confirm that this link should never expire." };

const createSchema = z.object({
  dealId: ID,
  label: z.string().trim().max(80, "Label is too long (80 characters at most)").optional(),
  expiryDays: EXPIRY_DAYS,
  confirmNoExpiry: z.boolean(),
  password: PASSWORD.optional(),
  acknowledged: z.literal(true, { errorMap: () => ({ message: "Confirm that you have read the warning." }) }),
}).strict().refine(needsNoExpiryConfirm, NO_EXPIRY_MESSAGE);

const rotateSchema = z.object({ accessId: ID }).strict();
const revokeSchema = z.object({ accessId: ID, reason: z.string().trim().max(200).optional() }).strict();
const passwordSchema = z.object({ accessId: ID, password: PASSWORD }).strict();
const clearSchema = z.object({ accessId: ID }).strict();
const extendSchema = z.object({ accessId: ID, expiryDays: EXPIRY_DAYS, confirmNoExpiry: z.boolean() }).strict().refine(needsNoExpiryConfirm, NO_EXPIRY_MESSAGE);

const HOST_RE = /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:\d{1,5})?$/;
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

function envOrigin(): string | null {
  for (const v of [process.env.NEXT_PUBLIC_APP_URL, process.env.AUTH_URL, process.env.NEXTAUTH_URL]) {
    if (!v) continue;
    try {
      const u = new URL(v);
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch { /* try the next one */ }
  }
  return null;
}

/** Origin the admin reached the app on, else the configured one; null when neither is usable. */
async function publicOrigin(): Promise<string | null> {
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
    if (host && HOST_RE.test(host)) {
      const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim();
      const scheme = proto === "http" || proto === "https" ? proto : LOCAL_HOST_RE.test(host) ? "http" : "https";
      return `${scheme}://${host}`;
    }
  } catch { /* fall through to the configured origin */ }
  return envOrigin();
}

/** The only place a plain token leaves the server: the result of the call that minted it. */
async function issued(token: string, accessId: string, expiresAt: Date | null) {
  const path = `/p/${token}`;
  const origin = await publicOrigin();
  const url = origin ? `${origin}${path}` : null;
  let qrSvg: string | null = null;
  if (url) {
    try { qrSvg = await renderQrSvg(url, { size: 200, margin: 1 }); } catch { qrSvg = null; }
  }
  return {
    accessId,
    displayId: tokenFingerprint(token),
    path,
    url,
    qrSvg,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };
}

const revalidateDeal = (dealId: string) => revalidatePath(`/partners/deals/${dealId}`);

const accessSelect = { id: true, dealId: true, revokedAt: true, expiresAt: true, deal: { select: { code: true } } } as const;

export async function createPartnerAccess(input: z.input<typeof createSchema>): Promise<
  | ({ ok: true } & Awaited<ReturnType<typeof issued>>)
  | Fail
> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const gate = await authorise();
  if (!gate.ok) return gate;
  const v = parsed.data;
  try {
    const expiresAt = v.expiryDays === null ? null : new Date(Date.now() + v.expiryDays * DAY_MS);
    const created = await createAccess({ dealId: v.dealId, label: v.label || undefined, expiresAt, password: v.password }, gate.actor);
    revalidateDeal(v.dealId);
    return { ok: true, ...(await issued(created.token, created.id, expiresAt)) };
  } catch (e) {
    return fail(describe(e));
  }
}

export async function rotatePartnerAccess(input: z.input<typeof rotateSchema>): Promise<
  | ({ ok: true } & Awaited<ReturnType<typeof issued>>)
  | Fail
> {
  const parsed = rotateSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const gate = await authorise();
  if (!gate.ok) return gate;
  try {
    const old = await prisma.partnerAccess.findUnique({ where: { id: parsed.data.accessId }, select: accessSelect });
    if (!old) return fail("Access link not found");
    if (old.revokedAt) return fail("This link is already revoked. Create a new link instead.");
    const created = await rotateAccess(old.id, gate.actor);
    const fresh = await prisma.partnerAccess.findUnique({ where: { id: created.id }, select: { expiresAt: true } });
    revalidateDeal(old.dealId);
    return { ok: true, ...(await issued(created.token, created.id, fresh?.expiresAt ?? null)) };
  } catch (e) {
    return fail(describe(e));
  }
}

export async function revokePartnerAccess(input: z.input<typeof revokeSchema>): Promise<{ ok: true } | Fail> {
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const gate = await authorise();
  if (!gate.ok) return gate;
  try {
    const row = await prisma.partnerAccess.findUnique({ where: { id: parsed.data.accessId }, select: accessSelect });
    if (!row) return fail("Access link not found");
    await revokeAccess(row.id, gate.actor, { reason: parsed.data.reason || undefined });
    revalidateDeal(row.dealId);
    return { ok: true };
  } catch (e) {
    return fail(describe(e));
  }
}

export async function setAccessPassword(input: z.input<typeof passwordSchema>): Promise<{ ok: true } | Fail> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const gate = await authorise();
  if (!gate.ok) return gate;
  try {
    const row = await prisma.partnerAccess.findUnique({ where: { id: parsed.data.accessId }, select: accessSelect });
    if (!row) return fail("Access link not found");
    await storeAccessPassword(row.id, parsed.data.password, gate.actor);
    revalidateDeal(row.dealId);
    return { ok: true };
  } catch (e) {
    return fail(describe(e));
  }
}

export async function clearAccessPassword(input: z.input<typeof clearSchema>): Promise<{ ok: true } | Fail> {
  const parsed = clearSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const gate = await authorise();
  if (!gate.ok) return gate;
  try {
    const row = await prisma.partnerAccess.findUnique({ where: { id: parsed.data.accessId }, select: accessSelect });
    if (!row) return fail("Access link not found");
    await storeAccessPassword(row.id, null, gate.actor);
    revalidateDeal(row.dealId);
    return { ok: true };
  } catch (e) {
    return fail(describe(e));
  }
}

/** Pushes the expiry later (or removes it); it never shortens a link, and a revoked link cannot be revived. */
export async function extendAccess(input: z.input<typeof extendSchema>): Promise<{ ok: true; expiresAt: string | null } | Fail> {
  const parsed = extendSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const gate = await authorise();
  if (!gate.ok) return gate;
  const { accessId, expiryDays } = parsed.data;
  try {
    const row = await prisma.partnerAccess.findUnique({ where: { id: accessId }, select: accessSelect });
    if (!row) return fail("Access link not found");
    if (row.revokedAt) return fail("This link is revoked. Create a new link instead.");
    if (row.expiresAt === null) return fail("This link never expires.");
    const next = expiryDays === null ? null : new Date(Date.now() + expiryDays * DAY_MS);
    if (next !== null && next.getTime() <= row.expiresAt.getTime()) return fail("The new expiry must be later than the current one. Pick a longer period.");
    const previous = row.expiresAt;
    await prisma.$transaction(async (tx) => {
      // Compare-and-swap on the value just read, so two admins extending at once cannot overwrite each other.
      const res = await tx.partnerAccess.updateMany({ where: { id: row.id, revokedAt: null, expiresAt: previous }, data: { expiresAt: next } });
      if (res.count !== 1) throw new PartnerAccessError("The link was changed by someone else. Reload and try again.");
      await writeAudit({
        userId: gate.actor.id,
        userName: gate.actor.name,
        entity: "PartnerAccess",
        entityId: row.id,
        entityCode: row.deal.code,
        action: "UPDATE",
        newValue: next ? `Access link expiry extended for ${row.deal.code}` : `Access link expiry removed for ${row.deal.code}`,
        metadata: { accessId: row.id, dealId: row.dealId, previousExpiresAt: previous.toISOString(), expiresAt: next ? next.toISOString() : null },
      }, tx);
    }, { timeout: 30_000 });
    revalidateDeal(row.dealId);
    return { ok: true, expiresAt: next ? next.toISOString() : null };
  } catch (e) {
    return fail(describe(e));
  }
}
