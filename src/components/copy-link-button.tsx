"use client";

import { useEffect, useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

/**
 * Small copyable-link row: shows the URL, has a Copy button, and an external
 * open button. `path` may be absolute or relative — when relative we resolve
 * it against window.location.origin so the copied value is a full shareable
 * URL. The origin is read after mount: reading window during render makes the
 * server HTML differ from the first client render (hydration mismatch).
 */
export function CopyLinkButton({
  path,
  public: isPublic = false,
  label = "Link",
}: {
  path: string;
  public?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const isAbsolute = /^https?:\/\//i.test(path);
  const href = isAbsolute
    ? path
    : origin + (path.startsWith("/") ? path : `/${path}`);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="rounded-md border bg-secondary/30 p-2 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {isPublic ? <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /> : <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />}
        {label}{isPublic ? " · public" : " · sign-in required"}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          readOnly
          value={href}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 h-7 rounded border border-input bg-background px-2 text-[11px] font-mono outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 h-7 px-2 rounded border border-input bg-background text-[11px] hover:bg-secondary"
        >
          {copied ? <><Check className="h-3 w-3 text-emerald-600" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 h-7 px-2 rounded border border-input bg-background text-[11px] hover:bg-secondary"
        >
          <ExternalLink className="h-3 w-3" /> Open
        </a>
      </div>
    </div>
  );
}
