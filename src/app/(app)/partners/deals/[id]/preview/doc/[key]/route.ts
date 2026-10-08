import { readFile, stat } from "node:fs/promises";
import { tryPartnerCapability } from "@/lib/partner-auth";
import { buildPartnerPortalDto, resolvePartnerDocument, type AdminPreview } from "@/lib/partner-view";
import { classifyStoredUrl } from "./doc-target";

// Admin twin of the partner document proxy (spec 7.7): same document list and the same URL checks, but it logs nothing and counts nothing.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KEY_RE = /^[A-Za-z0-9_-]{16}$/;
const TYPES: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const ALLOWED_TYPES = new Set(Object.values(TYPES));

const BASE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
} as const;

const plain = (status: number, body: string) => new Response(body, { status, headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
const notFound = () => plain(404, "Not found");

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

function fileHeaders(type: string | null, ext: string, n: number): Record<string, string> {
  const name = `document-${n}${ext && /^[a-z0-9]{1,5}$/.test(ext) ? `.${ext}` : ""}`;
  return {
    ...BASE_HEADERS,
    "Content-Type": type ?? "application/octet-stream",
    "Content-Disposition": `${type ? "inline" : "attachment"}; filename="${name}"`,
    "Content-Security-Policy": "sandbox; default-src 'none'",
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; key: string }> }) {
  const gate = await tryPartnerCapability("partner:read");
  if (!gate.ok) return plain(gate.error.startsWith("Your session") ? 401 : 403, gate.error);

  const { id, key } = await params;
  if (!ID_RE.test(id) || !KEY_RE.test(key)) return notFound();

  // Same rule as the partner route: the key must be in the document list the partner's visibility flags produce right now.
  const viewer: AdminPreview = { kind: "ADMIN_PREVIEW", dealId: id };
  let index = -1;
  try {
    const dto = await buildPartnerPortalDto({ dealId: id, viewer });
    index = (dto.documents ?? []).findIndex((d) => d.key === key);
  } catch {
    return notFound();
  }
  if (index < 0) return notFound();

  let stored: string | null = null;
  try {
    stored = (await resolvePartnerDocument({ dealId: id, viewer, key }))?.url ?? null;
  } catch {
    return notFound();
  }
  const target = stored ? classifyStoredUrl(stored) : null;
  if (!target) return notFound();
  const n = index + 1;

  if (target.kind === "local") {
    try {
      const info = await stat(target.file);
      if (!info.isFile()) return notFound();
      if (info.size > MAX_BYTES) return plain(413, "Document is too large to preview");
      const bytes = await readFile(target.file);
      return new Response(new Uint8Array(bytes), { headers: fileHeaders(TYPES[target.ext] ?? null, target.ext, n) });
    } catch {
      return notFound();
    }
  }

  try {
    const upstream = await fetch(target.url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!upstream.ok || !upstream.body) return notFound();
    const length = Number(upstream.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > MAX_BYTES) return plain(413, "Document is too large to preview");
    const upstreamType = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const type = TYPES[target.ext] ?? (ALLOWED_TYPES.has(upstreamType) ? upstreamType : null);
    return new Response(capped(upstream.body, MAX_BYTES), { headers: fileHeaders(type, target.ext, n) });
  } catch {
    return plain(502, "The document could not be fetched");
  }
}
