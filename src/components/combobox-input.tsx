"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Check } from "lucide-react";

/**
 * Text input that suggests from prior values but always accepts free text.
 *
 * - `options` is the list of already-known values for this field (from prior
 *   records + a curated seed vocabulary).
 * - Any value the user types is submitted verbatim. When they submit a value
 *   that isn't in `options`, it becomes a NEW entry next time the page loads
 *   because the vocab loader picks it up from the DB — no separate save step.
 * - Keyboard: ↑/↓ walks the list, Enter selects, Esc closes.
 * - The <input> uses a native form field so `name` posts under the parent
 *   <form action=...>.
 */
export function ComboboxInput({
  name,
  defaultValue,
  placeholder,
  required,
  options,
  className = "",
  allowCustom = true,
}: {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
  options: string[];
  className?: string;
  allowCustom?: boolean;
}) {
  const [value, setValue] = useState<string>(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Only narrow the list once the user types; opening a filled field should still show every option.
  const [typed, setTyped] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const norm = typed ? value.trim().toLowerCase() : "";
  const exactNorm = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    const uniq = Array.from(new Set(options.filter(Boolean)));
    if (!norm) return uniq.slice(0, 40);
    const hits = uniq
      .map((o) => ({ o, idx: o.toLowerCase().indexOf(norm) }))
      .filter((x) => x.idx >= 0)
      .sort((a, b) => a.idx - b.idx || a.o.localeCompare(b.o))
      .slice(0, 40)
      .map((x) => x.o);
    return hits;
  }, [options, norm]);

  const exactMatch = options.some((o) => o.trim().toLowerCase() === exactNorm);
  const showAddNew = allowCustom && exactNorm.length > 0 && !exactMatch;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => { setHighlight(0); }, [norm, open]);

  const rows: Array<{ kind: "opt" | "new"; text: string }> = [
    ...(showAddNew ? [{ kind: "new" as const, text: value.trim() }] : []),
    ...filtered.map((o) => ({ kind: "opt" as const, text: o })),
  ];

  function commit(text: string) {
    setValue(text);
    setTyped(false);
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          name={name}
          required={required}
          placeholder={placeholder}
          value={value}
          autoComplete="off"
          onChange={(e) => { setValue(e.target.value); setTyped(true); setOpen(true); }}
          // Not on focus: a dialog auto-focuses its first field, which should not pop a list open by itself.
          onClick={() => { setTyped(false); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, rows.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && open && rows[highlight]) { e.preventDefault(); commit(rows[highlight].text); }
            else if (e.key === "Escape") setOpen(false);
          }}
          className={`flex h-9 w-full rounded-md border border-input bg-background pl-3 pr-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className}`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => { setTyped(false); setOpen((o) => !o); inputRef.current?.focus(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {open && rows.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {rows.map((r, i) => (
            <button
              type="button"
              key={`${r.kind}-${r.text}`}
              onMouseDown={(e) => { e.preventDefault(); commit(r.text); }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm ${
                i === highlight ? "bg-secondary" : ""
              }`}
            >
              {r.kind === "new" ? (
                <>
                  <Plus className="h-3.5 w-3.5 text-sgs-teal-600" />
                  <span>Add new: <span className="font-medium">{r.text}</span></span>
                </>
              ) : (
                <>
                  <Check className={`h-3.5 w-3.5 ${value.trim().toLowerCase() === r.text.toLowerCase() ? "text-sgs-teal-600" : "opacity-0"}`} />
                  <span>{r.text}</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
