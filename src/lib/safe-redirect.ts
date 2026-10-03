const ORIGIN = "http://same-site.invalid";

/** A post-login target that is guaranteed to stay on this site; anything else becomes "/". */
export function safeCallbackPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  // Browsers drop tabs and newlines and treat backslashes as slashes, so "/\t/evil.example" leaves the site.
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return "/";
  try {
    const url = new URL(raw, ORIGIN);
    return url.origin === ORIGIN ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}
