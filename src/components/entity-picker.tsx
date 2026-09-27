"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, Plus, Check } from "lucide-react";

export type PickerOption = { id: string; label: string; hint?: string };

/**
 * Foreign-key picker with type-to-filter + inline "+ Add new" that calls a
 * server action, adds the created row to the local list, and selects it.
 *
 * Renders a hidden <input name={name}> so the parent <form> submits the id.
 * `onQuickCreate(name)` returns the new record — pass one that maps your
 * server action's result to `PickerOption`.
 */
export function EntityPicker({
  name,
  emptyLabel = "— None —",
  options,
  defaultValue = "",
  onQuickCreate,
  createLabel = "Add new",
  createPlaceholder = "Name…",
}: {
  name: string;
  emptyLabel?: string;
  options: PickerOption[];
  defaultValue?: string;
  onQuickCreate?: (name: string) => Promise<PickerOption>;
  createLabel?: string;
  createPlaceholder?: string;
}) {
  const [items, setItems] = useState<PickerOption[]>(options);
  const [selectedId, setSelectedId] = useState<string>(defaultValue);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [newName, setNewName] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find((o) => o.id === selectedId) ?? null;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) { setOpen(false); setFilter(""); }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((o) =>
      o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q),
    );
  }, [items, filter]);

  useEffect(() => { setHighlight(0); }, [filter, open]);

  function commit(id: string) {
    setSelectedId(id);
    setOpen(false);
    setFilter("");
  }

  async function handleCreate() {
    if (!onQuickCreate) return;
    const nm = newName.trim();
    if (!nm) return;
    setErr(null);
    start(async () => {
      try {
        const created = await onQuickCreate(nm);
        setItems((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
        setSelectedId(created.id);
        setNewName("");
        setOpen(false);
        setFilter("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to add");
      }
    });
  }

  return (
    <div ref={wrapRef} className="relative">
      <input type="hidden" name={name} value={selectedId} />
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 0); }}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm hover:bg-secondary/40"
      >
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? selected.label : emptyLabel}
          {selected?.hint ? <span className="text-xs text-muted-foreground ml-1">· {selected.hint}</span> : null}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, -1)); }
                else if (e.key === "Enter") {
                  e.preventDefault();
                  if (highlight === -1) commit("");
                  else if (filtered[highlight]) commit(filtered[highlight].id);
                }
                else if (e.key === "Escape") { setOpen(false); setFilter(""); }
              }}
              placeholder="Type to filter…"
              className="w-full h-8 rounded border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="max-h-56 overflow-auto py-1">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commit(""); }}
              onMouseEnter={() => setHighlight(-1)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm ${highlight === -1 ? "bg-secondary" : ""}`}
            >
              <Check className={`h-3.5 w-3.5 ${selectedId === "" ? "text-sgs-teal-600" : "opacity-0"}`} />
              <span className="text-muted-foreground italic">{emptyLabel}</span>
            </button>
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No matches.</div>
            )}
            {filtered.map((o, i) => (
              <button
                type="button"
                key={o.id}
                onMouseDown={(e) => { e.preventDefault(); commit(o.id); }}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm ${i === highlight ? "bg-secondary" : ""}`}
              >
                <Check className={`h-3.5 w-3.5 ${selectedId === o.id ? "text-sgs-teal-600" : "opacity-0"}`} />
                <span>{o.label}</span>
                {o.hint && <span className="text-xs text-muted-foreground ml-1">· {o.hint}</span>}
              </button>
            ))}
          </div>
          {onQuickCreate && (
            <div className="border-t p-2 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Plus className="h-3 w-3" /> {createLabel}
              </div>
              <div className="flex gap-1.5">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
                  placeholder={createPlaceholder}
                  className="flex-1 h-8 rounded border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  disabled={pending || !newName.trim()}
                  onClick={handleCreate}
                  className="h-8 px-3 rounded bg-sgs-teal-500 text-white text-xs font-medium hover:bg-sgs-teal-600 disabled:opacity-50"
                >
                  {pending ? "…" : "Add"}
                </button>
              </div>
              {err && <div className="text-xs text-red-600">{err}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
