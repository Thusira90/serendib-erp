"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import Link from "next/link";

/**
 * Opens the printable-label route in a new tab.
 * - `codes` (array) triggers sheet mode by default (multi-label A4 grid).
 * - `code`  (single) triggers sticker mode by default (60×40 mm).
 * - Callers can override with `layout`.
 */
export function QrPrintButton({
  code, codes, kind, layout, size = "sm", label,
}: {
  code?: string;
  codes?: string[];
  kind: "gemstone" | "rough";
  layout?: "sticker" | "sheet";
  size?: "sm" | "default" | "lg";
  label?: string;
}) {
  const list = codes && codes.length > 0 ? codes : (code ? [code] : []);
  if (list.length === 0) return null;

  const params = new URLSearchParams();
  params.set("codes", list.join(","));
  params.set("kind", kind);
  if (layout) params.set("layout", layout);

  const suggested = list.length > 1
    ? `Print ${list.length} labels`
    : "Print label";

  return (
    <Button asChild size={size} variant="outline">
      <Link href={`/qr/print?${params.toString()}`} target="_blank" rel="noreferrer">
        <Printer className="h-4 w-4" /> {label ?? suggested}
      </Link>
    </Button>
  );
}
