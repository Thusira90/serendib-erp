"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Check, X } from "lucide-react";

/**
 * Pick several values from a list, or add your own. Chosen values show as chips;
 * a hidden input named `name` posts them comma-joined (the format the customer
 * preference fields already use), so no server code changes.
 */
export function MultiComboboxInput({
  name, defaultValue = [], options, placeholder = "Select or type to add…",
}: {
  name: string;
  defaultValue?: string[];
  options: string[];
  placeholder?: string;
}) {
  const [chosen, setChosen] = useState<string[]>(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const has = (v: string) => chosen.some((c) => c.toLowerCase() === v.toLowerCase());
  const q = query.trim().toLowerCase();
  const pool = useMemo(() => Array.from(new Set([...options, ...chosen].filter(Boolean))).sort((a, b) => a.localeCompare(b)), [options, chosen]);
  const filtered = useMemo(() => pool.filter((o) => !q || o.toLowerCase().includes(q)).slice(0, 60), [pool, q]);
  // Commas separate values in what is posted, so they cannot be part of one.
  const typed = query.replace(/,/g, " ").trim();
  const canAdd = typed.length > 0 && !pool.some((o) => o.toLowerCase() === typed.toLowerCase());
  const rows: Array<{ kind: "add" | "opt"; text: string }> = [
    ...(canAdd ? [{ kind: "add" as const, text: typed }] : []),
    ...filtered.map((o) => ({ kind: "opt" as const, text: o })),
  ];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) { setOpen(false); setQuery(""); } };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => { setHighlight(0); }, [q, open]);

  function toggle(v: string) {
    setChosen((cur) => (cur.some((c) => c.toLowerCase() === v.toLowerCase()) ? cur.filter((c) => c.toLowerCase() !== v.toLowerCase()) : [...cur, v]));
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div ref={wrapRef} className="relative">
      <input type="hidden" name={name} value={chosen.join(", ")} />
      <div
        className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 pr-8 text-sm shadow-sm focus-within:ring-1 focus-within:ring-ring"
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {chosen.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-full bg-sgs-teal-100 text-sgs-teal-800 px-2 py-0.5 text-xs">
            {c}
            <button type="button" aria-label={`Remove ${c}`} onClick={(e) => { e.stopPropagation(); toggle(c); }} className="hover:text-red-600">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          placeholder={chosen.length === 0 ? placeholder : ""}
          autoComplete="off"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, rows.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if ((e.key === "Enter" || e.key === ",") && open && rows[highlight]) { e.preventDefault(); toggle(rows[highlight].text); }
            else if (e.key === "Backspace" && !query && chosen.length) setChosen((cur) => cur.slice(0, -1));
            else if (e.key === "Escape") { setOpen(false); setQuery(""); }
          }}
          className="min-w-[8ch] flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show options"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); inputRef.current?.focus(); }}
          className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
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
              onMouseDown={(e) => { e.preventDefault(); toggle(r.text); }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm ${i === highlight ? "bg-secondary" : ""}`}
            >
              {r.kind === "add" ? (
                <><Plus className="h-3.5 w-3.5 text-sgs-teal-600" /><span>Add new: <span className="font-medium">{r.text}</span></span></>
              ) : (
                <><Check className={`h-3.5 w-3.5 ${has(r.text) ? "text-sgs-teal-600" : "opacity-0"}`} /><span>{r.text}</span></>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
