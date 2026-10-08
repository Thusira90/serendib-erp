import "server-only";
import { headers } from "next/headers";

/**
 * The site's public origin, for links that leave the app (QR codes, labels).
 * A QR code must hold a full address: a bare "/verify/…" is just text to a
 * phone's scanner. Order: an explicit setting, Vercel's production domain, then
 * whatever host the current request came in on.
 */
export async function publicOrigin(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|192\.168\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
