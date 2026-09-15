import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const PUBLIC_PREFIX = "/uploads";

const ALLOWED = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
  "application/pdf",
  "video/mp4", "video/webm", "video/quicktime",
  "model/gltf-binary", "model/gltf+json",
  "application/octet-stream",
]);

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB — videos + high-res photos

export type SavedFile = {
  url: string;
  contentType: string;
  originalName: string;
  size: number;
};

// R2 is configured only when every var is present. If any is missing we
// silently fall back to the local-disk uploader so dev without R2 keys and
// CI runs still work end-to-end.
const R2 = (() => {
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !publicUrl || !accessKeyId || !secretAccessKey) return null;
  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket, publicUrl: publicUrl.replace(/\/$/, "") };
})();

export const uploadBackend = R2 ? "r2" : "local";

/**
 * Persist an uploaded File and return the metadata to store alongside the
 * referring record. Returns null if the field was empty (browsers send an
 * empty File when the input was left blank).
 *
 * When R2 is configured, the file is uploaded to the R2 bucket under
 * <subdir>/<yyyy>/<mm>/<random>.<ext> and served via the bucket's public
 * development URL (or the custom domain, if one is later attached).
 *
 * When R2 is not configured, we write to public/uploads/ on the local
 * filesystem — fine for dev but not for a scaled deploy (files disappear
 * on Vercel and don't share across instances).
 */
export async function saveUpload(file: File | null | undefined, subdir = "misc"): Promise<SavedFile | null> {
  if (!file || file.size === 0 || !file.name) return null;
  if (file.size > MAX_BYTES) throw new Error(`Upload exceeds ${MAX_BYTES / 1024 / 1024}MB limit.`);
  const ct = file.type || "application/octet-stream";
  if (!ALLOWED.has(ct)) throw new Error(`Unsupported content type: ${ct}`);

  const safeSub = subdir.replace(/[^a-z0-9-]/gi, "") || "misc";
  const ext = path.extname(file.name).toLowerCase().replace(/[^a-z0-9.]/g, "") || extForType(ct);
  const filename = `${randomBytes(12).toString("hex")}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  if (R2) {
    // Bucket keys use forward slashes on every OS, so we build them by hand
    // instead of going through path.join (which uses \\ on Windows).
    const now = new Date();
    const yyyy = now.getUTCFullYear().toString();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const key = `${safeSub}/${yyyy}/${mm}/${filename}`;
    await R2.client.send(new PutObjectCommand({
      Bucket: R2.bucket,
      Key: key,
      Body: buf,
      ContentType: ct,
      ContentLength: buf.length,
      // Aggressive caching is safe because our filenames are content-random
      // and therefore effectively immutable; any change is a new key.
      CacheControl: "public, max-age=31536000, immutable",
    }));
    return {
      url: `${R2.publicUrl}/${key}`,
      contentType: ct,
      originalName: file.name,
      size: file.size,
    };
  }

  // Local-disk fallback.
  const dir = path.join(UPLOAD_ROOT, safeSub);
  await mkdir(dir, { recursive: true });
  const abs = path.join(dir, filename);
  await writeFile(abs, buf);
  return {
    url: `${PUBLIC_PREFIX}/${safeSub}/${filename}`,
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
