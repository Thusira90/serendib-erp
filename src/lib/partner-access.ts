import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { ACCESS_OUTCOMES } from "@/lib/enums";

// Bearer-token access to a partner deal statement: spec section 7 of docs/partner-deals-spec.md.
// Only the SHA-256 of a token is stored; a raw token or raw IP never reaches a table, a log row or an audit row.

type Db = PrismaClient | Prisma.TransactionClient;

export type AccessActor = { id: string; name: string | null };

export type RequestCtx = {
  ipHash: string | null;
  country: string | null;
  uaClass: string;
  bot: boolean;
};

export type ResolvedAccess = { readonly __brand: "ResolvedAccess"; accessId: string; dealId: string; partnerId: string; needsPassword: boolean };

export type AccessFailure = "NOT_FOUND" | "EXPIRED" | "REVOKED" | "INACTIVE" | "LOCKED" | "RATE_LIMITED" | "BOT";

export type UnlockError = "UNAVAILABLE" | "RATE_LIMITED" | "LOCKED" | "BAD_PASSWORD";

export class PartnerAccessError extends Error {}

const MIN = 60_000;
const HOUR = 60 * MIN;
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const ROUTE = "/p/[code]";
const DEFAULT_EXPIRY_DAYS = 90;
const MAX_EXPIRY_DAYS = 3650;
const BCRYPT_COST = 12;
const PASSWORD_MIN = 10;
const PASSWORD_MAX_BYTES = 72;
const PASSWORD_INPUT_MAX = 256;
const COOKIE_MAX_MS = 12 * HOUR;
const LIVE_DEAL_STATUSES = new Set(["ACTIVE", "CLOSED"]);
const OUTCOMES: ReadonlySet<string> = new Set(ACCESS_OUTCOMES);

export const RATE_LIMITS = {
  ipAny: { limit: 120, windowMs: 10 * MIN },
  ipFail: { limit: 10, windowMs: 10 * MIN },
  doc: { limit: 60, windowMs: 10 * MIN },
  mint: { limit: 5, windowMs: HOUR },
  mintDeal: { limit: 10, windowMs: HOUR },
} as const;

export const rateKey = {
  ipAny: (ipHash: string) => `ip:any:${ipHash}`,
  ipFail: (ipHash: string) => `ip:fail:${ipHash}`,
  doc: (accessId: string) => `doc:${accessId}`,
  mint: (accessId: string) => `mint:${accessId}`,
  mintDeal: (dealId: string) => `mintdeal:${dealId}`,
};

// ── secrets and hashing ──────────────────────────────────────────────────────

function authSecret(): string | null {
  const s = process.env.AUTH_SECRET;
  return s && s.trim() ? s : null;
}

// Domain-separated keys: a value signed for one purpose can never verify for another.
function derivedKey(label: string): Buffer | null {
  const s = authSecret();
  return s ? createHmac("sha256", s).update(label).digest() : null;
}

function sha256Hex(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const hashToken = (t: string): string => sha256Hex(t);

export function generateAccessToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** First 8 hex of the token hash: groups repeated probes in the log and is the admin-visible access id. */
export const tokenFingerprint = (token: string): string => hashToken(token).slice(0, 8);

// ── request context ──────────────────────────────────────────────────────────

const BOT_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|embedly|vkshare|pinterest|skype|curl|wget|python|node-fetch|undici|axios|okhttp|go-http|java\/|libwww|httpclient|headless|lighthouse|pagespeed|monitor|uptime|scanner|validator|fetcher|archiver|https?:\/\//i;

function classifyUserAgent(ua: string): { uaClass: string; bot: boolean } {
  if (ua.length < 10 || BOT_RE.test(ua)) return { uaClass: "bot", bot: true };
  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone|ipod/i.test(ua) ? "mobile" : "desktop";
  const browser = /edg(e|a|ios)?\//i.test(ua) ? "edge"
    : /opr\/|opera/i.test(ua) ? "opera"
    : /samsungbrowser/i.test(ua) ? "samsung"
    : /firefox|fxios/i.test(ua) ? "firefox"
    : /chrome|crios|chromium/i.test(ua) ? "chrome"
    : /safari/i.test(ua) ? "safari"
    : "other";
  return { uaClass: `${device}/${browser}`, bot: false };
}

function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  if (s.includes(".")) {
    const i = s.lastIndexOf(":");
    const p = s.slice(i + 1).split(".").map(Number);
    if (p.length !== 4 || p.some((n) => !(n >= 0 && n <= 255))) return null;
    s = `${s.slice(0, i + 1)}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  }
  const nums = groups.map((g) => parseInt(g, 16));
  return nums.length === 8 && nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? nums : null;
}

/** Canonical key of a client address: IPv4 as is, IPv6 reduced to its /64; null when it is not a valid address. */
function ipKeyOf(raw: string): string | null {
  let ip = raw.trim();
  if (!ip || ip.length > 64) return null;
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracket) ip = bracket[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  ip = ip.split("%")[0];
  const family = isIP(ip);
  if (family === 4) return ip;
  if (family !== 6) return null;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  const g = expandV6(ip);
  return g ? `v6:${g.slice(0, 4).map((n) => n.toString(16)).join(":")}` : null;
}

export function requestContext(h: Headers): RequestCtx {
  const { uaClass, bot } = classifyUserAgent(h.get("user-agent") ?? "");
  const xff = h.get("x-forwarded-for");
  const first = xff ? xff.split(",")[0] : "";
  const ipKey = ipKeyOf(first) ?? ipKeyOf(h.get("x-real-ip") ?? "");
  const key = derivedKey("partner-ip-v1");
  const ipHash = ipKey && key
    ? createHmac("sha256", key).update(`${ipKey}:${new Date().toISOString().slice(0, 7)}`).digest("hex").slice(0, 16)
    : null;
  const c = (h.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  return { ipHash, country: /^[A-Z]{2}$/.test(c) ? c : null, uaClass, bot };
}

// ── rate limits (database-atomic) ────────────────────────────────────────────

function windowStartOf(windowMs: number, now: number): Date {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new RangeError("windowMs must be positive");
  return new Date(Math.floor(now / windowMs) * windowMs);
}

export async function rateHit(key: string, windowMs: number, db: Db = prisma, now: number = Date.now()): Promise<number> {
  const windowStart = windowStartOf(windowMs, now);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "PartnerRateLimit" ("key","windowStart","count") VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key","windowStart") DO UPDATE SET "count" = "PartnerRateLimit"."count" + 1
    RETURNING "count"`;
  return rows[0]?.count ?? Number.MAX_SAFE_INTEGER;
}

/** Read-only view of a counter; a missing row is 0. */
export async function rateCount(key: string, windowMs: number, db: Db = prisma, now: number = Date.now()): Promise<number> {
  const windowStart = windowStartOf(windowMs, now);
  const rows = await db.$queryRaw<{ count: number }[]>`
    SELECT "count" FROM "PartnerRateLimit" WHERE "key" = ${key} AND "windowStart" = ${windowStart}`;
  return rows[0]?.count ?? 0;
}

// Runs after the response when a request scope exists, otherwise awaits, so a write is never a dropped promise.
async function defer(fn: () => Promise<unknown>): Promise<void> {
  const safe = async () => {
    try { await fn(); } catch { console.error("partner-access: deferred task failed"); }
  };
  try { after(safe); } catch { await safe(); }
}

// ── access rows ──────────────────────────────────────────────────────────────

const accessSelect = {
  id: true,
  dealId: true,
  passwordHash: true,
  unlockVersion: true,
  expiresAt: true,
  revokedAt: true,
  lockedUntil: true,
  deal: { select: { code: true, status: true, partnerId: true, partner: { select: { active: true } } } },
} satisfies Prisma.PartnerAccessSelect;

type AccessRow = Prisma.PartnerAccessGetPayload<{ select: typeof accessSelect }>;

function classify(row: AccessRow, now: Date): "OK" | "REVOKED" | "EXPIRED" | "INACTIVE" {
  if (row.revokedAt) return "REVOKED";
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  if (!LIVE_DEAL_STATUSES.has(row.deal.status) || !row.deal.partner.active) return "INACTIVE";
  return "OK";
}

// Only resolvePartnerAccess mints these, so a preview viewer or a hand-built object cannot pass for a real visit.
const issued = new WeakSet<object>();

function issue(row: AccessRow): ResolvedAccess {
  const access = Object.freeze({
    accessId: row.id,
    dealId: row.dealId,
    partnerId: row.deal.partnerId,
    needsPassword: row.passwordHash !== null,
  }) as ResolvedAccess;
  issued.add(access);
  return access;
}

export function isIssuedAccess(x: unknown): x is ResolvedAccess {
  return typeof x === "object" && x !== null && issued.has(x);
}

type ResolveResult = { ok: true; access: ResolvedAccess } | { ok: false; reason: AccessFailure };

// Unknown, expired, revoked and inactive all look the same from outside; the real outcome goes to the log.
const NOT_FOUND: ResolveResult = Object.freeze({ ok: false, reason: "NOT_FOUND" }) as ResolveResult;

export async function resolvePartnerAccess(token: string, ctx: RequestCtx, db: Db = prisma): Promise<ResolveResult> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return NOT_FOUND;
  if (ctx.bot) return { ok: false, reason: "BOT" };

  const hash = hashToken(token);
  const fp = hash.slice(0, 8);
  // One round trip: the limiter checks and the lookup are independent, and a limited request discards the row.
  const [limits, row] = await Promise.all([
    ctx.ipHash
      ? Promise.all([
          rateHit(rateKey.ipAny(ctx.ipHash), RATE_LIMITS.ipAny.windowMs, db),
          rateCount(rateKey.ipFail(ctx.ipHash), RATE_LIMITS.ipFail.windowMs, db),
        ])
      : null,
    db.partnerAccess.findUnique({ where: { tokenHash: hash }, select: accessSelect }),
  ]);
  if (limits && (limits[0] > RATE_LIMITS.ipAny.limit || limits[1] >= RATE_LIMITS.ipFail.limit)) return { ok: false, reason: "RATE_LIMITED" };

  if (!row) {
    if (ctx.ipHash) await rateHit(rateKey.ipFail(ctx.ipHash), RATE_LIMITS.ipFail.windowMs, db);
    await defer(() => writeAccessLog({ accessId: null, dealId: null, outcome: "NOT_FOUND", path: ROUTE, tokenFp: fp, ctx }, db));
    return NOT_FOUND;
  }

  const now = new Date();
  const state = classify(row, now);
  if (state !== "OK") {
    await defer(() => writeAccessLog({ accessId: row.id, dealId: row.dealId, outcome: state, path: ROUTE, tokenFp: fp, ctx }, db));
    return NOT_FOUND;
  }
  if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
    await defer(() => writeAccessLog({ accessId: row.id, dealId: row.dealId, outcome: "LOCKED", path: ROUTE, tokenFp: fp, ctx }, db));
    return { ok: false, reason: "LOCKED" };
  }
  return { ok: true, access: issue(row) };
}

// ── unlock cookie ────────────────────────────────────────────────────────────

export const unlockCookieName = (accessId: string): string => `pa_${sha256Hex(accessId).slice(0, 12)}`;

function unlockMac(accessId: string, exp: number, version: number): string | null {
  const key = derivedKey("partner-cookie-v1");
  return key ? createHmac("sha256", key).update(`v1|${accessId}|${exp}|${version}`).digest("base64url") : null;
}

export function signUnlockCookie(accessId: string, exp: number, version: number): string | null {
  const mac = unlockMac(accessId, exp, version);
  return mac ? `v1.${accessId}.${exp}.${version}.${mac}` : null;
}

export function verifyUnlockCookie(value: string | undefined, want: { accessId: string; unlockVersion: number; nowSec: number }): boolean {
  if (!value || value.length > 300) return false;
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== "v1" || parts[1] !== want.accessId) return false;
  if (!/^\d{1,12}$/.test(parts[2]) || !/^\d{1,9}$/.test(parts[3])) return false;
  const exp = Number(parts[2]);
  const version = Number(parts[3]);
  if (version !== want.unlockVersion || exp <= want.nowSec) return false;
  const mac = unlockMac(want.accessId, exp, version);
  return mac !== null && safeEqual(parts[4], mac);
}

/** The row is re-read on every check, so a revoke, expiry or password change takes effect at once. */
export async function checkUnlockWithCookie(access: ResolvedAccess, cookieValue: string | undefined, db: Db = prisma, now: Date = new Date()): Promise<boolean> {
  if (!access.needsPassword) return true;
  const row = await db.partnerAccess.findUnique({ where: { id: access.accessId }, select: accessSelect });
  if (!row || row.passwordHash === null || classify(row, now) !== "OK") return false;
  return verifyUnlockCookie(cookieValue, { accessId: row.id, unlockVersion: row.unlockVersion, nowSec: Math.floor(now.getTime() / 1000) });
}

export async function checkUnlock(access: ResolvedAccess): Promise<boolean> {
  if (!access.needsPassword) return true;
  try {
    const value = (await cookies()).get(unlockCookieName(access.accessId))?.value;
    return await checkUnlockWithCookie(access, value);
  } catch {
    return false;
  }
}

// ── password unlock ──────────────────────────────────────────────────────────

type UnlockResult =
  | { ok: true; cookie: { name: string; value: string; maxAge: number } }
  | { ok: false; error: UnlockError };

const fail = (error: UnlockError): UnlockResult => ({ ok: false, error });

/** Core of the unlock flow; the exported action wraps it and sets the cookie. */
export async function attemptUnlock(token: string, password: string, ctx: RequestCtx, db: Db = prisma): Promise<UnlockResult> {
  if (typeof token !== "string" || !TOKEN_RE.test(token) || ctx.bot || !authSecret()) return fail("UNAVAILABLE");
  if (typeof password !== "string" || password.length === 0 || password.length > PASSWORD_INPUT_MAX) return fail("BAD_PASSWORD");

  if (ctx.ipHash) {
    const [hits, fails] = await Promise.all([
      rateHit(rateKey.ipAny(ctx.ipHash), RATE_LIMITS.ipAny.windowMs, db),
      rateHit(rateKey.ipFail(ctx.ipHash), RATE_LIMITS.ipFail.windowMs, db), // counted before the compare, as the spec requires
    ]);
    if (hits > RATE_LIMITS.ipAny.limit || fails > RATE_LIMITS.ipFail.limit) return fail("RATE_LIMITED");
  }

  const hash = hashToken(token);
  const fp = hash.slice(0, 8);
  const row = await db.partnerAccess.findUnique({ where: { tokenHash: hash }, select: accessSelect });
  const now = new Date();
  if (!row || row.passwordHash === null || classify(row, now) !== "OK") return fail("UNAVAILABLE");

  const reserved = await db.$queryRaw<{ failedAttempts: number }[]>`
    UPDATE "PartnerAccess" SET
      "failedAttempts" = CASE WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" <= timezone('utc', now()) THEN 1 ELSE "failedAttempts" + 1 END,
      "lastFailedAt" = timezone('utc', now()),
      "lockedUntil" = CASE WHEN (CASE WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" <= timezone('utc', now()) THEN 1 ELSE "failedAttempts" + 1 END) >= 5
                           THEN timezone('utc', now()) + interval '15 minutes' ELSE NULL END
    WHERE "id" = ${row.id} AND ("lockedUntil" IS NULL OR "lockedUntil" <= timezone('utc', now()))
    RETURNING "failedAttempts"`;
  if (reserved.length === 0) {
    await writeAccessLog({ accessId: row.id, dealId: row.dealId, outcome: "LOCKED", path: ROUTE, tokenFp: fp, ctx }, db);
    return fail("LOCKED");
  }
  const attempts = reserved[0].failedAttempts;

  let match = false;
  try { match = await bcrypt.compare(password, row.passwordHash); } catch { match = false; }

  if (!match) {
    await writeAccessLog({ accessId: row.id, dealId: row.dealId, outcome: "BAD_PASSWORD", path: ROUTE, tokenFp: fp, ctx }, db);
    if (attempts === 5) {
      await defer(() => notify({
        type: "PARTNER_ACTIVITY",
        title: "Partner link locked",
        body: `Link ${fp} on ${row.deal.code} was locked after repeated wrong passwords. Rotate the link or set a new password to restore access.`,
        entity: "PartnerDeal",
        entityId: row.dealId,
        entityCode: row.deal.code,
        url: `/partners/deals/${row.dealId}`,
        extraRoles: ["SUPER_ADMIN"],
      }, db));
      return fail("LOCKED");
    }
    return fail("BAD_PASSWORD");
  }

  const untilExpiry = row.expiresAt ? row.expiresAt.getTime() - now.getTime() : Infinity;
  const maxAge = Math.floor(Math.min(COOKIE_MAX_MS, untilExpiry) / 1000);
  const exp = Math.floor(now.getTime() / 1000) + maxAge;
  const value = maxAge > 0 ? signUnlockCookie(row.id, exp, row.unlockVersion) : null;
  if (!value) return fail("UNAVAILABLE");

  await db.partnerAccess.update({ where: { id: row.id }, data: { failedAttempts: 0, lockedUntil: null } });
  await writeAccessLog({ accessId: row.id, dealId: row.dealId, outcome: "UNLOCKED", path: ROUTE, tokenFp: fp, ctx }, db);
  return { ok: true, cookie: { name: unlockCookieName(row.id), value, maxAge } };
}

export async function verifyPasswordAndUnlock(token: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let ctx: RequestCtx;
  try { ctx = requestContext(await headers()); } catch { return { ok: false, error: "UNAVAILABLE" }; }
  try {
    const res = await attemptUnlock(token, password, ctx);
    if (!res.ok) return res;
    (await cookies()).set(res.cookie.name, res.cookie.value, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/p", maxAge: res.cookie.maxAge,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "UNAVAILABLE" };
  }
}

// ── access log, counters, anomaly, retention ─────────────────────────────────

export type AccessLogEntry = {
  accessId: string | null;
  dealId: string | null;
  outcome: string;
  path: string;
  tokenFp?: string;
  ctx: RequestCtx;
  detail?: string;
  /** Pass the viewer when one exists: anything that is not a resolved access (an admin preview) is refused. */
  viewer?: unknown;
};

function safePath(p: string): string {
  return p.split(/[?#]/)[0].split("/").map((s) => (/^[A-Za-z0-9_-]{20,}$/.test(s) ? "[code]" : s)).join("/").slice(0, 80);
}

function safeDetail(d: string | undefined): string | null {
  if (!d) return null;
  const s = d.replace(/[^A-Za-z0-9_=,|-]/g, "").slice(0, 120);
  return s && !/[A-Za-z0-9_-]{24,}/.test(s) ? s : null;
}

async function allowedByCaps(e: AccessLogEntry, fp: string | null, db: Db): Promise<boolean> {
  const who = e.ctx.ipHash ?? `fp:${fp ?? "-"}`;
  switch (e.outcome) {
    case "NOT_FOUND":
      if ((await rateHit(`lognf:${who}`, 10 * MIN, db)) > 1) return false;
      return (await rateHit("lognf:all", MIN, db)) <= 120;
    case "OK":
      return (await rateHit(`logok:${e.accessId}`, 2 * MIN, db)) === 1;
    case "EXPIRED":
    case "REVOKED":
    case "INACTIVE":
    case "LOCKED":
    case "PASSWORD_REQUIRED":
      return (await rateHit(`logd:${e.outcome}:${e.accessId ?? "-"}:${who}`, 10 * MIN, db)) === 1;
    case "RESALE_VIEW":
      return (await rateHit(`logrv:${who}:${safeDetail(e.detail) ?? "-"}`, 10 * MIN, db)) === 1;
    default:
      return (await rateHit(`logx:${e.outcome}:${e.accessId ?? who}`, 10 * MIN, db)) <= 60;
  }
}

async function bumpViewCounters(db: Db, accessId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "PartnerAccess" SET
      "viewCount" = "viewCount" + 1,
      "firstViewedAt" = COALESCE("firstViewedAt", timezone('utc', now())),
      "lastViewedAt" = timezone('utc', now())
    WHERE "id" = ${accessId}`;
}

async function checkAnomaly(db: Db, accessId: string, dealId: string, fp: string | null): Promise<void> {
  const rows = await db.$queryRaw<{ ips: number; countries: number }[]>`
    SELECT COUNT(DISTINCT "ipHash")::int AS ips, COUNT(DISTINCT "country")::int AS countries
    FROM "PartnerAccessLog"
    WHERE "accessId" = ${accessId} AND "outcome" = 'OK' AND "at" > timezone('utc', now()) - interval '7 days'`;
  const ips = rows[0]?.ips ?? 0;
  const countries = rows[0]?.countries ?? 0;
  if (ips < 5 && countries < 3) return;
  const claimed = await db.$queryRaw<{ id: string }[]>`
    UPDATE "PartnerAccess" SET "anomalyNotifiedAt" = timezone('utc', now())
    WHERE "id" = ${accessId} AND "anomalyNotifiedAt" IS NULL RETURNING "id"`;
  if (claimed.length === 0) return;
  const deal = await db.partnerDeal.findUnique({ where: { id: dealId }, select: { code: true } });
  await notify({
    type: "PARTNER_ACTIVITY",
    title: "Partner link opened from several places",
    body: `Link ${fp ?? "-"} on ${deal?.code ?? "a deal"} was opened from ${ips} networks in ${countries} countries in the last 7 days. Check the access log and rotate the link if this is unexpected.`,
    entity: "PartnerDeal",
    entityId: dealId,
    entityCode: deal?.code ?? null,
    url: `/partners/deals/${dealId}`,
    extraRoles: ["SUPER_ADMIN"],
  }, db);
}

/** Whoever inserts the hour's marker row runs the cleanup, so it happens at most once per hour. */
export async function maybeRunRetention(db: Db = prisma, now: Date = new Date()): Promise<boolean> {
  const hour = new Date(Math.floor(now.getTime() / HOUR) * HOUR);
  const won = await db.$queryRaw<{ key: string }[]>`
    INSERT INTO "PartnerRateLimit" ("key","windowStart","count") VALUES ('retention', ${hour}, 1)
    ON CONFLICT DO NOTHING RETURNING "key"`;
  if (won.length === 0) return false;
  await db.$executeRaw`DELETE FROM "PartnerRateLimit" WHERE "windowStart" < timezone('utc', now()) - interval '1 day'`;
  await db.$executeRaw`DELETE FROM "PartnerAccessLog" WHERE "at" < timezone('utc', now()) - interval '90 days'`;
  return true;
}

/**
 * Appends one access-log row, subject to the caps of spec 7.2 and 7.4. Never throws.
 * An "OK" outcome also bumps the view counters and may raise the anomaly notification, so callers must not count views themselves.
 */
export async function writeAccessLog(e: AccessLogEntry, db: Db = prisma): Promise<void> {
  try {
    if (e.viewer !== undefined && !isIssuedAccess(e.viewer)) return;
    if (e.ctx.bot || e.outcome === "RATE_LIMITED" || !OUTCOMES.has(e.outcome)) return;
    if (e.outcome === "OK" && !e.accessId) return;

    const fp = e.tokenFp && /^[0-9a-f]{8}$/.test(e.tokenFp) ? e.tokenFp : null;
    const [, allowed] = await Promise.all([
      e.outcome === "OK" && e.accessId ? bumpViewCounters(db, e.accessId) : null,
      allowedByCaps(e, fp, db),
    ]);
    if (!allowed) return;

    await db.partnerAccessLog.create({
      data: {
        accessId: e.accessId,
        dealId: e.dealId,
        outcome: e.outcome,
        path: safePath(e.path),
        tokenFp: fp,
        ipHash: e.ctx.ipHash,
        country: e.ctx.country,
        uaClass: e.ctx.uaClass,
        detail: safeDetail(e.detail),
      },
    });
    await defer(async () => {
      await maybeRunRetention(db);
      if (e.outcome === "OK" && e.accessId && e.dealId) await checkAnomaly(db, e.accessId, e.dealId, fp);
    });
  } catch {
    console.error("partner-access: access log write failed");
  }
}

// ── admin operations ─────────────────────────────────────────────────────────

function inTx<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  return "$transaction" in db ? db.$transaction((tx) => fn(tx), { timeout: 30_000 }) : fn(db);
}

function cleanLabel(label: string | undefined): string | null {
  const s = (label ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (s.length > 80) throw new PartnerAccessError("Label is too long (80 characters at most)");
  return s || null;
}

function checkExpiry(expiresAt: Date | null | undefined, now: Date): Date | null {
  if (expiresAt === undefined) return new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 86_400_000);
  if (expiresAt === null) return null;
  const t = expiresAt instanceof Date ? expiresAt.getTime() : NaN;
  if (!Number.isFinite(t) || t <= now.getTime()) throw new PartnerAccessError("Expiry must be in the future");
  if (t > now.getTime() + MAX_EXPIRY_DAYS * 86_400_000) throw new PartnerAccessError("Expiry is too far away");
  return expiresAt;
}

async function hashNewPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    throw new PartnerAccessError(`Password must be at least ${PASSWORD_MIN} characters`);
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    throw new PartnerAccessError(`Password must be at most ${PASSWORD_MAX_BYTES} bytes`);
  }
  return bcrypt.hash(password, BCRYPT_COST);
}

async function loadUsableDeal(db: Db, dealId: string): Promise<{ id: string; code: string }> {
  const deal = await db.partnerDeal.findUnique({
    where: { id: dealId },
    select: { id: true, code: true, status: true, partner: { select: { active: true } } },
  });
  if (!deal) throw new PartnerAccessError("Deal not found");
  if (deal.status === "CANCELLED") throw new PartnerAccessError("A cancelled deal cannot have access links");
  if (!deal.partner.active) throw new PartnerAccessError("The partner is inactive");
  return { id: deal.id, code: deal.code };
}

/** The plain token is returned here and nowhere else; only its hash is stored. */
export async function createAccess(
  i: { dealId: string; label?: string; expiresAt?: Date | null; password?: string },
  actor: AccessActor,
  db: Db = prisma,
): Promise<{ id: string; token: string }> {
  const label = cleanLabel(i.label);
  const expiresAt = checkExpiry(i.expiresAt, new Date());
  const passwordHash = i.password ? await hashNewPassword(i.password) : null;
  const { token, hash } = generateAccessToken();
  return inTx(db, async (tx) => {
    const deal = await loadUsableDeal(tx, i.dealId);
    const row = await tx.partnerAccess.create({
      data: {
        dealId: deal.id,
        label,
        tokenHash: hash,
        passwordHash,
        passwordSetAt: passwordHash ? new Date() : null,
        expiresAt,
        createdById: actor.id,
        createdByName: actor.name,
      },
      select: { id: true },
    });
    await writeAudit({
      userId: actor.id,
      userName: actor.name,
      entity: "PartnerAccess",
      entityId: row.id,
      entityCode: deal.code,
      action: "ACCESS_CREATED",
      newValue: `Access link created for ${deal.code}`,
      metadata: { accessId: row.id, dealId: deal.id, fingerprint: hash.slice(0, 8), label, expiresAt: expiresAt?.toISOString() ?? null, hasPassword: passwordHash !== null },
    }, tx);
    return { id: row.id, token };
  });
}

async function revokeRow(tx: Db, accessId: string, actor: AccessActor, reason: string | null): Promise<boolean> {
  const res = await tx.partnerAccess.updateMany({
    where: { id: accessId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason, revokedByName: actor.name, unlockVersion: { increment: 1 } },
  });
  return res.count === 1;
}

export async function revokeAccess(
  accessId: string,
  actor: AccessActor,
  opts: { reason?: string; alsoRevokeResale?: boolean } = {},
  db: Db = prisma,
): Promise<{ revokedResaleLinks: number }> {
  const reason = opts.reason?.trim().slice(0, 200) || null;
  await inTx(db, async (tx) => {
    const row = await tx.partnerAccess.findUnique({ where: { id: accessId }, select: { id: true, dealId: true, deal: { select: { code: true } } } });
    if (!row) throw new PartnerAccessError("Access link not found");
    if (!(await revokeRow(tx, row.id, actor, reason))) return;
    await writeAudit({
      userId: actor.id,
      userName: actor.name,
      entity: "PartnerAccess",
      entityId: row.id,
      entityCode: row.deal.code,
      action: "ACCESS_REVOKED",
      newValue: `Access link revoked for ${row.deal.code}`,
      metadata: { accessId: row.id, dealId: row.dealId, reason, alsoRevokeResale: opts.alsoRevokeResale === true },
    }, tx);
  });
  // Resale links are not built, so a link has nothing minted under it to revoke.
  return { revokedResaleLinks: 0 };
}

/** New link first, old link revoked in the same transaction; the password hash and expiry carry over. */
export async function rotateAccess(
  accessId: string,
  actor: AccessActor,
  opts: { expiresAt?: Date | null } = {},
  db: Db = prisma,
): Promise<{ id: string; token: string }> {
  const { token, hash } = generateAccessToken();
  return inTx(db, async (tx) => {
    const old = await tx.partnerAccess.findUnique({
      where: { id: accessId },
      select: { id: true, dealId: true, label: true, expiresAt: true, passwordHash: true, passwordSetAt: true, revokedAt: true },
    });
    if (!old) throw new PartnerAccessError("Access link not found");
    const deal = await loadUsableDeal(tx, old.dealId);
    const now = new Date();
    const keep = old.expiresAt && old.expiresAt.getTime() > now.getTime() ? old.expiresAt : undefined;
    const expiresAt = checkExpiry(opts.expiresAt !== undefined ? opts.expiresAt : old.expiresAt === null ? null : keep, now);
    const row = await tx.partnerAccess.create({
      data: {
        dealId: old.dealId,
        label: old.label,
        tokenHash: hash,
        passwordHash: old.passwordHash,
        passwordSetAt: old.passwordSetAt,
        expiresAt,
        createdById: actor.id,
        createdByName: actor.name,
      },
      select: { id: true },
    });
    if (!old.revokedAt && !(await revokeRow(tx, old.id, actor, "Rotated"))) {
      throw new PartnerAccessError("The link was changed by someone else; try again");
    }
    await writeAudit({
      userId: actor.id,
      userName: actor.name,
      entity: "PartnerAccess",
      entityId: row.id,
      entityCode: deal.code,
      action: "ACCESS_ROTATED",
      newValue: `Access link replaced for ${deal.code}`,
      metadata: { accessId: row.id, replacedAccessId: old.id, dealId: deal.id, fingerprint: hash.slice(0, 8), expiresAt: expiresAt?.toISOString() ?? null },
    }, tx);
    return { id: row.id, token };
  });
}

/** Set or clear (null) the password; either way old unlock cookies stop working and a lockout is lifted. */
export async function setAccessPassword(accessId: string, password: string | null, actor: AccessActor, db: Db = prisma): Promise<void> {
  const passwordHash = password === null ? null : await hashNewPassword(password);
  await inTx(db, async (tx) => {
    const row = await tx.partnerAccess.findUnique({ where: { id: accessId }, select: { id: true, dealId: true, revokedAt: true, deal: { select: { code: true } } } });
    if (!row) throw new PartnerAccessError("Access link not found");
    if (row.revokedAt) throw new PartnerAccessError("The link is revoked");
    await tx.partnerAccess.update({
      where: { id: row.id },
      data: { passwordHash, passwordSetAt: new Date(), unlockVersion: { increment: 1 }, failedAttempts: 0, lastFailedAt: null, lockedUntil: null },
    });
    await writeAudit({
      userId: actor.id,
      userName: actor.name,
      entity: "PartnerAccess",
      entityId: row.id,
      entityCode: row.deal.code,
      action: "ACCESS_PASSWORD_SET",
      newValue: passwordHash ? "Access password updated" : "Access password removed",
      metadata: { accessId: row.id, dealId: row.dealId, hasPassword: passwordHash !== null },
    }, tx);
  });
}
