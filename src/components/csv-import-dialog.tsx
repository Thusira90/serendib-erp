"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Download } from "lucide-react";

export type ImportResult = {
  created: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
};

/**
 * Reusable CSV import dialog. Accepts a server action `importAction(fd)` that
 * consumes a "csv" text field and returns an ImportResult. Also renders a
 * downloadable header-only template so the user can start with the right shape.
 */
export function CsvImportDialog({
  label = "Import CSV",
  title = "Import from CSV",
  columns,
  sample,
  importAction,
  templateFilename = "template.csv",
}: {
  label?: string;
  title?: string;
  columns: string[];
  sample?: string[][];
  importAction: (fd: FormData) => Promise<ImportResult>;
  templateFilename?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setCsv("");
      setResult(null);
    }
  }, [open]);

  const templateHref = () => {
    const rows: string[][] = [columns];
    if (sample) rows.push(...sample);
    const body = rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)).join(",")).join("\n");
    return `data:text/csv;charset=utf-8,${encodeURIComponent(body)}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="h-4 w-4" /> {label}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-secondary/40 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">Columns</span>
              <a
                href={templateHref()}
                download={templateFilename}
                className="inline-flex items-center gap-1 text-sgs-teal-700 hover:underline"
              >
                <Download className="h-3.5 w-3.5" /> Download template
              </a>
            </div>
            <div className="font-mono text-[11px] text-muted-foreground break-words">{columns.join(", ")}</div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Upload .csv</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="block text-xs"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setCsv(await f.text());
              }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">…or paste CSV directly</label>
            <Textarea
              rows={8}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={`${columns.join(",")}\n`}
              className="font-mono text-xs"
            />
          </div>

          {result && (
            <div className="rounded-md border p-3 text-sm space-y-2 bg-card">
              <div className="flex items-center gap-2 text-emerald-700">
                <FileText className="h-4 w-4" />
                <span className="font-medium">{result.created}</span> created
                {result.skipped > 0 && (
                  <span className="text-muted-foreground">· {result.skipped} skipped as duplicates</span>
                )}
              </div>
              {result.errors.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-red-700 mb-1">{result.errors.length} error(s):</div>
                  <ul className="text-xs text-red-700 space-y-0.5 max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        Row {e.row}: {e.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {result ? "Close" : "Cancel"}
            </Button>
            <Button
              disabled={pending || !csv.trim()}
              onClick={() => {
                setResult(null);
                start(async () => {
                  const fd = new FormData();
                  fd.set("csv", csv);
                  const r = await importAction(fd);
                  setResult(r);
                });
              }}
            >
              {pending ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
