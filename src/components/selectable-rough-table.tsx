"use client";

import { useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { formatCarat, formatCurrency } from "@/lib/utils";
import { QrPrintButton } from "@/components/qr-print-button";
import { TimedShareButton } from "@/components/timed-share-button";
import { X, CheckSquare, Square } from "lucide-react";

export type RoughRow = {
  id: string;
  code: string;
  gemType: string;
  variety: string | null;
  origin: string | null;
  weightCt: number;
  purchasePrice: number;
  currency: string;
  supplierName: string | null;
  locationName: string | null;
  status: string;
  yielded: number;
  /** Non-empty when critical provenance fields are missing on the record. */
  provenanceGaps: string[];
};

/**
 * Rough table with per-row checkboxes and a floating action bar for
 * multi-share / multi-print. Behaviour mirrors the cut-stone grid so
 * sales can hand-pick a subset of rough and send a timed link with
 * broker mode etc.
 */
export function SelectableRoughTable({
  rows, sharerName, sharerEmail,
}: {
  rows: RoughRow[];
  sharerName: string;
  sharerEmail: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }
  const clear = () => setSelected(new Set());
  const selectAll = () =>
    setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.code)));

  const codes = Array.from(selected);
  const anySelected = codes.length > 0;
  const allSelected = codes.length === rows.length && rows.length > 0;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[36px]">
              <button
                type="button"
                onClick={selectAll}
                aria-label={allSelected ? "Deselect all" : "Select all"}
                className="inline-flex items-center justify-center h-6 w-6 hover:bg-secondary rounded"
              >
                {allSelected ? <CheckSquare className="h-4 w-4 text-sgs-teal-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
              </button>
            </TableHead>
            <TableHead>Rough ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead className="text-right">Weight</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Yielded</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const isSel = selected.has(r.code);
            return (
              <TableRow key={r.id} className={isSel ? "bg-sgs-teal-50/40" : ""}>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => toggle(r.code)}
                    aria-label={isSel ? `Deselect ${r.code}` : `Select ${r.code}`}
                    className="inline-flex items-center justify-center h-6 w-6 hover:bg-secondary rounded"
                  >
                    {isSel ? <CheckSquare className="h-4 w-4 text-sgs-teal-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link href={`/rough/${r.id}`} className="font-mono text-xs text-sgs-teal-700 hover:underline">{r.code}</Link>
                    {r.provenanceGaps.length > 0 && (
                      <span
                        title={`Missing: ${r.provenanceGaps.join(", ")}`}
                        className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
                        aria-label="Provenance incomplete"
                      />
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{r.gemType}</div>
                  {r.variety && <div className="text-xs text-muted-foreground">{r.variety}</div>}
                </TableCell>
                <TableCell className={`text-sm ${!r.origin ? "text-amber-700" : ""}`}>{r.origin ?? "—"}</TableCell>
                <TableCell className="text-right num">{formatCarat(r.weightCt)}</TableCell>
                <TableCell className="text-right num">{formatCurrency(r.purchasePrice, r.currency)}</TableCell>
                <TableCell className="text-sm">{r.supplierName ?? "—"}</TableCell>
                <TableCell className="text-sm">{r.locationName ?? "—"}</TableCell>
                <TableCell><StatusBadge status={r.status} kind="rough" /></TableCell>
                <TableCell className="text-right">
                  {r.yielded > 0 ? <Badge variant="purple">{r.yielded}</Badge> : <span className="text-muted-foreground text-sm">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  <QrPrintButton code={r.code} kind="rough" label="Label" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {anySelected && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-full border bg-card shadow-luxe-lg px-3 py-2 flex items-center gap-2">
          <span className="text-xs font-medium px-2">
            {codes.length} rough{codes.length === 1 ? "" : "s"}
          </span>
          <span className="h-4 w-px bg-border" />
          <TimedShareButton
            scope="ROUGHS"
            roughCodes={codes}
            label={`Share ${codes.length} with expiry`}
            sharerDefaults={{ name: sharerName, email: sharerEmail }}
          />
          <QrPrintButton codes={codes} kind="rough" layout="sheet" label={`Print ${codes.length} labels`} />
          <button
            type="button"
            onClick={clear}
            aria-label="Clear selection"
            className="h-8 w-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
