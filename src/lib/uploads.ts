import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const PUBLIC_PREFIX = "/uploads";

const ALLOWED = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
  "application/pdf",
  "video/mp4", "video/webm", "video/quicktime",
  "model/gltf-binary", "model/gltf+json",
  "application/octet-stream",
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export type SavedFile = {
  url: string;
  contentType: string;
  originalName: string;
  size: number;
};

/**
 * Persist an uploaded File to public/uploads/<subdir>/<hash>.<ext> and
 * return the metadata to store alongside the referring record.
 * Returns null if the file field was empty (browser sends an empty File).
 */
export async function saveUpload(file: File | null | undefined, subdir = "misc"): Promise<SavedFile | null> {
  if (!file || file.size === 0 || !file.name) return null;
  if (file.size > MAX_BYTES) throw new Error(`Upload exceeds ${MAX_BYTES / 1024 / 1024}MB limit.`);
  const ct = file.type || "application/octet-stream";
  if (!ALLOWED.has(ct)) throw new Error(`Unsupported content type: ${ct}`);

  const safeSub = subdir.replace(/[^a-z0-9-]/gi, "");
  const dir = path.join(UPLOAD_ROOT, safeSub);
  await mkdir(dir, { recursive: true });

  const ext = path.extname(file.name).toLowerCase().replace(/[^a-z0-9.]/g, "") || extForType(ct);
  const name = `${randomBytes(12).toString("hex")}${ext}`;
  const abs = path.join(dir, name);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(abs, buf);
  return {
    url: `${PUBLIC_PREFIX}/${safeSub}/${name}`,
    contentType: ct,
    originalName: file.name,
    size: file.size,
  };
}

function extForType(ct: string) {
  switch (ct) {
    case "image/jpeg": return ".jpg";
    case "image/png":  return ".png";
    case "image/webp": return ".webp";
    case "image/gif":  return ".gif";
    case "image/svg+xml": return ".svg";
    case "application/pdf": return ".pdf";
    case "video/mp4":  return ".mp4";
    case "video/webm": return ".webm";
    case "video/quicktime": return ".mov";
    default: return "";
  }
}
