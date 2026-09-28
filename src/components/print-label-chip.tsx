"use client";

import { Printer } from "lucide-react";

/**
 * Compact print-label chip meant to sit inside another <a>/Link (e.g. a
 * clickable gemstone card). Uses a real <button> and stopPropagation so the
 * enclosing link doesn't also fire, and opens the print route in a new tab.
 */
export function PrintLabelChip({
  code, kind, layout,
}: {
  code: string;
  kind: "rough" | "gemstone";
  layout?: "sticker" | "sheet";
}) {
  const params = new URLSearchParams();
  params.set("codes", code);
  params.set("kind", kind);
  if (layout) params.set("layout", layout);
  const href = `/qr/print?${params.toString()}`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }}
      className="inline-flex items-center gap-1 h-7 px-2 rounded border border-input bg-background/80 backdrop-blur text-[11px] hover:bg-secondary text-foreground"
      title="Print label"
    >
      <Printer className="h-3 w-3" /> Label
    </button>
  );
}
