import path from "node:path";

export type DocTarget = { kind: "remote"; url: string; ext: string } | { kind: "local"; file: string; ext: string };

export type DocTargetEnv = { r2PublicUrl: string | undefined; uploadRoot: string };

const LOCAL_ORIGIN = "http://local.invalid";

const defaultEnv = (): DocTargetEnv => ({
  r2PublicUrl: process.env.R2_PUBLIC_URL,
  uploadRoot: path.join(process.cwd(), "public", "uploads"),
});

/** Slash-separated path with no empty, dot, dot-dot, backslash, percent-escape or control-character parts. */
function plainPath(p: string): boolean {
  if (!p.startsWith("/") || /[\u0000-\u001f\u007f\\%]/.test(p)) return false;
  return p.split("/").slice(1).every((s) => s.length > 0 && s !== "." && s !== "..");
}

const extOf = (p: string): string => path.extname(p).slice(1).toLowerCase();

function r2Origin(raw: string | undefined): URL | null {
  try { return raw ? new URL(raw) : null; }
  catch { return null; }
}

/** The stored address must be the media bucket's public host (https) or a file under /uploads; anything else is refused. */
export function classifyStoredUrl(stored: string, env: DocTargetEnv = defaultEnv()): DocTarget | null {
  const raw = stored.trim();
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    let u: URL;
    try { u = new URL(raw, LOCAL_ORIGIN); } catch { return null; }
    if (u.origin !== LOCAL_ORIGIN || u.search || u.hash) return null;
    if (!u.pathname.startsWith("/uploads/") || !plainPath(u.pathname)) return null;
    const file = path.resolve(env.uploadRoot, u.pathname.slice("/uploads/".length));
    if (!file.startsWith(env.uploadRoot + path.sep)) return null;
    return { kind: "local", file, ext: extOf(u.pathname) };
  }
  const base = r2Origin(env.r2PublicUrl);
  if (!base || base.protocol !== "https:") return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" || u.host !== base.host || u.username || u.password || u.search || u.hash) return null;
  const prefix = base.pathname.replace(/\/+$/, "");
  if (!plainPath(u.pathname) || (prefix && !u.pathname.startsWith(`${prefix}/`))) return null;
  return { kind: "remote", url: `${u.origin}${u.pathname}`, ext: extOf(u.pathname) };
}
