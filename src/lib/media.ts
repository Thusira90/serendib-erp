// Safe to import from server and client code: no node or server-only dependencies.

const VIDEO_EXT = new Set([".mp4", ".m4v", ".mov", ".webm", ".ogv"]);

const TYPE_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
};

function extOf(nameOrUrl: string | null | undefined): string {
  if (!nameOrUrl) return "";
  const path = nameOrUrl.split(/[?#]/)[0];
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot).toLowerCase();
}

/**
 * Browsers report an empty or generic type for formats the OS has no handler
 * for (a .mov on a Windows PC without QuickTime is the usual case). Fall back
 * to the extension so the file is stored, and later rendered, as what it is.
 */
export function resolveContentType(declared: string | null | undefined, fileName: string | null | undefined): string {
  const type = declared?.trim().toLowerCase() ?? "";
  if (type && type !== "application/octet-stream") return type;
  return TYPE_BY_EXT[extOf(fileName)] ?? (type || "application/octet-stream");
}

/**
 * Whether a stored asset is a video. The content type is the best signal, but
 * older rows can carry none (external URL) or a generic one, so the asset kind
 * and the file extension are checked as well.
 */
export function isVideoAsset(a: { contentType?: string | null; kind?: string | null; url?: string | null }): boolean {
  const type = a.contentType?.toLowerCase() ?? "";
  if (type.startsWith("video/")) return true;
  if (type.startsWith("image/")) return false;
  return a.kind === "VIDEO" || VIDEO_EXT.has(extOf(a.url));
}
