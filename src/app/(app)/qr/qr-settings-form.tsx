"use client";

import { useMemo, useState, useTransition } from "react";
import { ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QR_FIELDS, QR_PRESETS, type QrKind } from "@/lib/qr-fields";
import { saveQrProfile } from "./actions";

export function QrSettingsForm({
  kind, title, blurb, initial, sampleCode, canWrite,
}: {
  kind: QrKind;
  title: string;
  blurb: string;
  initial: Record<string, boolean>;
  sampleCode: string | null;
  canWrite: boolean;
}) {
  const [values, setValues] = useState<Record<string, boolean>>(initial);
  const [saved, setSaved] = useState<Record<string, boolean>>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const fields = QR_FIELDS[kind];
  const groups = useMemo(() => {
    const map = new Map<string, typeof fields>();
    for (const f of fields) map.set(f.group, [...(map.get(f.group) ?? []), f]);
    return Array.from(map.entries());
  }, [fields]);

  const dirty = fields.some((f) => values[f.key] !== saved[f.key]);
  const shownCount = fields.filter((f) => values[f.key]).length;

  function applyPreset(keys: string[]) {
    setValues(Object.fromEntries(fields.map((f) => [f.key, keys.includes(f.key)])));
    setJustSaved(false);
  }

  function save() {
    start(async () => {
      setError(null);
      try {
        await saveQrProfile(kind, values);
        setSaved(values);
        setJustSaved(true);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>{title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">{blurb}</p>
          </div>
          {sampleCode && (
            <a
              href={`/verify/${encodeURIComponent(sampleCode)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-sgs-teal-700 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open a sample scan page ({sampleCode})
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Start from:</span>
          {QR_PRESETS[kind].map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant="outline"
              disabled={!canWrite}
              title={p.hint}
              onClick={() => applyPreset(p.keys)}
            >
              {p.label}
            </Button>
          ))}
          <span className="text-[11px] text-muted-foreground ml-1">
            {QR_PRESETS[kind].map((p) => `${p.label}: ${p.hint}`).join(" · ")}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          {groups.map(([group, items]) => (
            <fieldset key={group} className="space-y-2">
              <legend className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{group}</legend>
              {items.map((f) => (
                <label key={f.key} className="flex items-start gap-2.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-sgs-teal-500"
                    checked={!!values[f.key]}
                    disabled={!canWrite}
                    onChange={(e) => { setValues((v) => ({ ...v, [f.key]: e.target.checked })); setJustSaved(false); }}
                  />
                  <span>
                    {f.label}
                    {f.hint && <span className="block text-[11px] text-muted-foreground">{f.hint}</span>}
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>

        {shownCount === 0 && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Nothing is switched on, so a scan will show only the company header.
          </div>
        )}
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

        <div className="flex items-center justify-between gap-3 pt-3 border-t">
          <div className="text-xs text-muted-foreground">
            {shownCount} of {fields.length} details shown
            {dirty && " · unsaved changes"}
          </div>
          <div className="flex items-center gap-3">
            {justSaved && !dirty && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" /> Saved</span>
            )}
            {canWrite ? (
              <Button type="button" onClick={save} disabled={pending || !dirty}>
                {pending ? "Saving…" : "Save"}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">You can view these settings but not change them.</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
