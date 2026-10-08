"use client";

import { useMemo, useState } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACCESS_OUTCOMES } from "@/lib/enums";
import { AccessTime } from "./access-time";

export type AccessLogRow = {
  id: string;
  at: string;
  outcome: string;
  path: string;
  tokenFp: string | null;
  /** First 8 characters of the keyed IP hash; the raw address is never stored. */
  network: string | null;
  country: string | null;
  device: string | null;
  detail: string | null;
  /** Display id of the link the row belongs to, null when it could not be matched to one. */
  linkId: string | null;
};

export type AccessLogLink = { id: string; label: string };

const PAGE_SIZE = 50;

const OUTCOME: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  OK: { label: "Viewed", variant: "success" },
  UNLOCKED: { label: "Password accepted", variant: "success" },
  DOC_OK: { label: "Document opened", variant: "success" },
  PASSWORD_REQUIRED: { label: "Password page shown", variant: "muted" },
  BAD_PASSWORD: { label: "Wrong password", variant: "danger" },
  LOCKED: { label: "Locked out", variant: "danger" },
  DOC_DENIED: { label: "Document refused", variant: "danger" },
  NOT_FOUND: { label: "Unknown link", variant: "warning" },
  EXPIRED: { label: "Expired link opened", variant: "warning" },
  REVOKED: { label: "Revoked link opened", variant: "warning" },
  INACTIVE: { label: "Deal or partner inactive", variant: "warning" },
  RATE_LIMITED: { label: "Rate limited", variant: "warning" },
  RESALE_CREATED: { label: "Resale link created", variant: "muted" },
  RESALE_DENIED: { label: "Resale refused", variant: "danger" },
  RESALE_REVOKED: { label: "Resale link revoked", variant: "muted" },
  RESALE_VIEW: { label: "Resale link viewed", variant: "muted" },
};

const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

export function AccessLogTable({ rows, links }: { rows: AccessLogRow[]; links: AccessLogLink[] }) {
  const [link, setLink] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [page, setPage] = useState(0);

  const outcomes = useMemo(() => {
    const present = new Set(rows.map((r) => r.outcome));
    return ACCESS_OUTCOMES.filter((o) => present.has(o));
  }, [rows]);

  const filtered = useMemo(
    () => rows.filter((r) => (link === "all" || r.linkId === link) && (outcome === "all" || r.outcome === outcome)),
    [rows, link, outcome],
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : current * PAGE_SIZE + 1;
  const to = current * PAGE_SIZE + slice.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Link
          <select value={link} onChange={(e) => { setLink(e.target.value); setPage(0); }} className={SELECT_CLASS}>
            <option value="all">All links</option>
            {links.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Event
          <select value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(0); }} className={SELECT_CLASS}>
            <option value="all">All events</option>
            {outcomes.map((o) => <option key={o} value={o}>{OUTCOME[o]?.label ?? o}</option>)}
          </select>
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{from}-{to} of {filtered.length}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? "No visits have been logged yet." : "No log rows match these filters."}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Network</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap py-2 text-xs"><AccessTime iso={r.at} /></TableCell>
                <TableCell className="py-2 font-mono text-xs">{r.linkId ?? r.tokenFp ?? "—"}</TableCell>
                <TableCell className="py-2">
                  <Badge variant={OUTCOME[r.outcome]?.variant ?? "muted"} title={r.outcome}>{OUTCOME[r.outcome]?.label ?? r.outcome}</Badge>
                </TableCell>
                <TableCell className="py-2 font-mono text-xs">{r.path}</TableCell>
                <TableCell className="py-2 font-mono text-xs">{r.network ?? "—"}</TableCell>
                <TableCell className="py-2 text-xs">{r.country ?? "—"}</TableCell>
                <TableCell className="py-2 text-xs">{r.device ?? "—"}</TableCell>
                <TableCell className="py-2 font-mono text-xs">{r.detail ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {current + 1} of {pages}</span>
          <Button type="button" variant="outline" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
