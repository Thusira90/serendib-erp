import { readFile, stat } from "node:fs/promises";
import { cookies, headers } from "next/headers";
import { classifyStoredUrl } from "@/app/(app)/partners/deals/[id]/preview/doc/[key]/doc-target";
import { checkUnlockWithCookie, requestContext, resolvePartnerAccess, tokenFingerprint, unlockCookieName, writeAccessLog } from "@/lib/partner-access";
import { resolvePartnerDocument } from "@/lib/partner-view";

// Documents are served only through this proxy: the stored address is never given to the partner (spec 7.7).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;
const KEY_RE = /^[A-Za-z0-9_-]{16}$/;
const TYPES: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const ALLOWED_TYPES = new Set(Object.values(TYPES));

const BASE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

// One answer for every refusal, so a probe learns nothing about which links or documents exist.
const notFound = () => new Response("Not found", { status: 404, headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });

function capped(body: ReadableStream<Uint8Array>, limit: number): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > limit) controller.error(new Error("document too large"));
      else controller.enqueue(chunk);
    },
  }));
}

function fileHeaders(type: string | null, ext: string): Record<string, string> {
  const name = `document${ext && /^[a-z0-9]{1,5}$/.test(ext) ? `.${ext}` : ""}`;
  return {
    ...BASE_HEADERS,
    "Content-Type": type ?? "application/octet-stream",
    "Content-Disposition": `${type ? "inline" : "attachment"}; filename="${name}"`,
    "Content-Security-Policy": "sandbox; default-src 'none'",
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ code: string; key: string }> }) {
  const { code, key } = await params;
  if (!KEY_RE.test(key)) return notFound();

  const ctx = requestContext(await headers());
  const resolved = await resolvePartnerAccess(code, ctx);
  if (!resolved.ok) return notFound();
  const access = resolved.access;
  const fp = tokenFingerprint(code);
  const log = (outcome: "DOC_OK" | "DOC_DENIED") =>
    writeAccessLog({ accessId: access.accessId, dealId: access.dealId, outcome, path: "/p/[code]/doc/[key]", tokenFp: fp, ctx, viewer: access });

  if (access.needsPassword) {
    const cookie = (await cookies()).get(unlockCookieName(access.accessId))?.value;
    if (!(await checkUnlockWithCookie(access, cookie))) return notFound();
  }

  let stored: string | null = null;
  try {
    stored = (await resolvePartnerDocument({ dealId: access.dealId, viewer: access, key }))?.url ?? null;
  } catch {
    return notFound();
  }
  const target = stored ? classifyStoredUrl(stored) : null;
  if (!target) {
    await log("DOC_DENIED");
    return notFound();
  }

  if (target.kind === "local") {
    try {
      const info = await stat(target.file);
      if (!info.isFile() || info.size > MAX_BYTES) return notFound();
      const bytes = await readFile(target.file);
      await log("DOC_OK");
      return new Response(new Uint8Array(bytes), { headers: fileHeaders(TYPES[target.ext] ?? null, target.ext) });
    } catch {
      return notFound();
    }
  }

  try {
    const upstream = await fetch(target.url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!upstream.ok || !upstream.body) return notFound();
    const length = Number(upstream.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > MAX_BYTES) return notFound();
    const upstreamType = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const type = TYPES[target.ext] ?? (ALLOWED_TYPES.has(upstreamType) ? upstreamType : null);
    await log("DOC_OK");
    return new Response(capped(upstream.body, MAX_BYTES), { headers: fileHeaders(type, target.ext) });
  } catch {
    return notFound();
  }
}
