"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type ExtraInfo = { label: string; value: string };

/**
 * Free-form "label: value" details (language, birthday, referred by, ...).
 * Posts one hidden JSON field, so a customer can carry any extra information
 * without the form needing a column for each.
 */
export function ExtraInfoField({
  name, defaultValue = [], suggestions,
}: {
  name: string;
  defaultValue?: ExtraInfo[];
  suggestions: string[];
}) {
  const [rows, setRows] = useState<Array<ExtraInfo & { id: number }>>(
    defaultValue.map((r, i) => ({ ...r, id: i })),
  );
  const [nextId, setNextId] = useState(defaultValue.length);
  const posted = JSON.stringify(rows.filter((r) => r.label.trim() && r.value.trim()).map(({ label, value }) => ({ label: label.trim(), value: value.trim() })));

  const update = (id: number, patch: Partial<ExtraInfo>) => setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2 md:col-span-2">
      <input type="hidden" name={name} value={posted} />
      <datalist id={`${name}-labels`}>
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">Nothing added yet. Use it for anything worth remembering about this customer.</p>
      )}
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-start">
          <Input
            list={`${name}-labels`}
            value={r.label}
            onChange={(e) => update(r.id, { label: e.target.value })}
            placeholder="Label, e.g. Language"
          />
          <Input value={r.value} onChange={(e) => update(r.id, { value: e.target.value })} placeholder="Details" />
          <button
            type="button"
            aria-label="Remove"
            onClick={() => setRows((cur) => cur.filter((x) => x.id !== r.id))}
            className="mt-2 text-muted-foreground hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => { setRows((cur) => [...cur, { id: nextId, label: "", value: "" }]); setNextId((n) => n + 1); }}
      >
        <Plus className="h-4 w-4" /> Add information
      </Button>
    </div>
  );
}
