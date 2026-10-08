"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { TreatmentDialog } from "@/components/treatment-dialog";
import { setTreatmentStatus } from "@/app/(app)/treatments/actions";
import type { PickerOption } from "@/components/entity-picker";
import {
  PROVIDER_KINDS, TREATMENT_STATUS_BADGE, TREATMENT_STATUS_LABEL, treatmentDays,
  type TreatmentRow,
} from "@/lib/treatment-types";

const providerKindLabel = (k: string | null) => PROVIDER_KINDS.find((p) => p.value === k)?.label ?? null;

export function TreatmentsTable({
  rows, canWrite, vocab, showStone = true, stones,
}: {
  rows: TreatmentRow[];
  canWrite: boolean;
  vocab: { types: string[]; providers: string[] };
  /** The Treatments page lists the stone; a stone's own tab does not need to. */
  showStone?: boolean;
  stones?: { rough: PickerOption[]; gems: PickerOption[] };
}) {
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setStatus(id: string, status: string) {
    setBusyId(id);
    setError(null);
    start(async () => {
      try { await setTreatmentStatus(id, status); }
      catch (e) { setError((e as Error).message); }
      finally { setBusyId(null); }
    });
  }

  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground p-8 text-center border rounded-lg">No treatments recorded yet.</div>;
  }

  // Totals per currency, since a treatment may be paid in another currency.
  const totals = new Map<string, number>();
  for (const r of rows) if (r.status !== "CANCELLED") totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.cost);

  return (
    <div className="space-y-2">
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Treatment</TableHead>
            {showStone && <TableHead>Stone</TableHead>}
            <TableHead>Done by</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead className="text-right">Days</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead>Status</TableHead>
            {canWrite && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const days = treatmentDays(r.startDate, r.endDate, r.status);
            const weightChange = r.weightBeforeCt != null && r.weightAfterCt != null ? r.weightAfterCt - r.weightBeforeCt : null;
            return (
              <TableRow key={r.id} className={r.status === "CANCELLED" ? "opacity-60" : ""}>
                <TableCell>
                  <div className="text-sm font-medium">{r.type}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{r.code}</div>
                  {weightChange != null && (
                    <div className="text-[11px] text-muted-foreground">
                      {r.weightBeforeCt!.toFixed(2)} → {r.weightAfterCt!.toFixed(2)} ct ({weightChange >= 0 ? "+" : ""}{weightChange.toFixed(2)})
                    </div>
                  )}
                </TableCell>
                {showStone && (
                  <TableCell>
                    <Link
                      href={r.kind === "ROUGH" ? `/rough/${r.stoneId}` : `/gemstones/${r.stoneId}`}
                      className="font-mono text-xs text-sgs-teal-700 hover:underline"
                    >
                      {r.stoneCode}
                    </Link>
                    <div className="text-xs text-muted-foreground">{r.kind === "ROUGH" ? "Rough" : "Cut & polished"} · {r.stoneLabel}</div>
                  </TableCell>
                )}
                <TableCell>
                  <div className="text-sm">{r.providerName ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {[providerKindLabel(r.providerKind), r.providerContact].filter(Boolean).join(" · ")}
                  </div>
                </TableCell>
                <TableCell className="text-xs num">
                  {r.startDate ? formatDate(r.startDate) : "—"}
                  {" → "}
                  {r.endDate ? formatDate(r.endDate) : r.status === "IN_PROGRESS" ? "ongoing" : "—"}
                </TableCell>
                <TableCell className="text-right num text-sm">{days != null ? days : "—"}</TableCell>
                <TableCell className="text-right num text-sm">{r.cost > 0 ? formatCurrency(r.cost, r.currency) : "—"}</TableCell>
                <TableCell><Badge variant={TREATMENT_STATUS_BADGE[r.status]}>{TREATMENT_STATUS_LABEL[r.status]}</Badge></TableCell>
                {canWrite && (
                  <TableCell className="text-right whitespace-nowrap">
                    {r.status === "PLANNED" && (
                      <Button size="sm" variant="ghost" disabled={pending && busyId === r.id} onClick={() => setStatus(r.id, "IN_PROGRESS")}>Start</Button>
                    )}
                    {r.status === "IN_PROGRESS" && (
                      <Button size="sm" variant="ghost" disabled={pending && busyId === r.id} onClick={() => setStatus(r.id, "COMPLETED")}>Complete</Button>
                    )}
                    {(r.status === "PLANNED" || r.status === "IN_PROGRESS") && (
                      <Button
                        size="sm" variant="ghost" disabled={pending && busyId === r.id}
                        onClick={() => { if (confirm(`Cancel ${r.code}?`)) setStatus(r.id, "CANCELLED"); }}
                      >Cancel</Button>
                    )}
                    <TreatmentDialog treatment={r} vocab={vocab} stones={stones} />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {totals.size > 0 && (
        <div className="text-xs text-muted-foreground text-right">
          Total cost (excluding cancelled): {Array.from(totals.entries()).map(([c, v]) => formatCurrency(v, c)).join(" + ")}
        </div>
      )}
    </div>
  );
}
