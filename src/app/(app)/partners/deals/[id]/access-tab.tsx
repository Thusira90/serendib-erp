import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, Info, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, requireCapability } from "@/lib/rbac";
import { EARN_ON, PAYOUT_METHODS, type EarnOn, type PayoutMethod } from "@/lib/enums";
import { normalizeVisibility, parseVisibility, type PartnerVisibility, type VisibilityKey } from "@/lib/partner-visibility";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccessLogTable, type AccessLogRow } from "./access-log-table";
import { AccessRowActions, type AccessRowInfo } from "./access-row-actions";
import { AccessTime } from "./access-time";
import { CreateAccessDialog } from "./create-access-dialog";

type Status = AccessRowInfo["status"];

const STATUS_BADGE: Record<Status, { label: string; variant: BadgeProps["variant"] }> = {
  ACTIVE: { label: "Active", variant: "success" },
  LOCKED: { label: "Locked out", variant: "warning" },
  EXPIRED: { label: "Expired", variant: "muted" },
  REVOKED: { label: "Revoked", variant: "danger" },
};

const FINANCIAL: [VisibilityKey, string][] = [
  ["salePrice", "sale prices"],
  ["purchaseCost", "purchase cost"],
  ["costBreakdown", "cost breakdown"],
  ["supplierIdentity", "supplier names"],
  ["receipts", "bill receipts"],
  ["paymentsReceived", "buyer payments"],
  ["profitFigures", "profit figures"],
  ["askingPrice", "asking prices"],
];
const REVEALS_FINANCES: VisibilityKey[] = ["salePrice", "purchaseCost", "costBreakdown", "supplierIdentity", "receipts"];
const STONE_INFO: VisibilityKey[] = [
  "stoneIdentity", "stoneSpecs", "provenance", "timeline", "media", "processMedia", "mediaCaptions", "cgi", "certificates", "certificateFiles",
];

const LOG_LIMIT = 200;
const WEEK_ANOMALY = { networks: 5, countries: 3 } as const;

const isMethod = (m: string): m is PayoutMethod => (PAYOUT_METHODS as readonly string[]).includes(m);
const isEarnOn = (e: string): e is EarnOn => (EARN_ON as readonly string[]).includes(e);

function joinList(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** What the partner actually sees, from the visibility flags after the forced-on rules. */
function describeVisibility(flags: PartnerVisibility): { shows: string; showsFinancials: boolean } {
  const parts = ["the account statement", ...FINANCIAL.filter(([k]) => flags[k]).map(([, label]) => label)];
  if (STONE_INFO.some((k) => flags[k])) parts.push("stone details");
  return { shows: joinList(parts), showsFinancials: REVEALS_FINANCES.some((k) => flags[k]) };
}

export default async function AccessTab({ dealId }: { dealId: string }) {
  const session = await requireCapability("partner:read");
  const canWrite = can(session.user, "partner:write");

  const deal = await prisma.partnerDeal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      status: true,
      method: true,
      earnOn: true,
      visibility: true,
      partner: { select: { name: true, active: true } },
      _count: { select: { stones: { where: { removedAt: null } } } },
    },
  });
  if (!deal) notFound();

  const [accesses, stats, logRows] = await Promise.all([
    prisma.partnerAccess.findMany({
      where: { dealId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        tokenHash: true,
        passwordHash: true,
        expiresAt: true,
        revokedAt: true,
        lockedUntil: true,
        viewCount: true,
        lastViewedAt: true,
        createdAt: true,
        createdByName: true,
      },
    }),
    prisma.$queryRaw<{ accessId: string; networks: number; countries: string[] | null }[]>`
      SELECT "accessId", COUNT(DISTINCT "ipHash")::int AS networks, array_remove(array_agg(DISTINCT "country"), NULL) AS countries
      FROM "PartnerAccessLog"
      WHERE "dealId" = ${dealId} AND "accessId" IS NOT NULL AND "outcome" = 'OK'
        AND "at" > timezone('utc', now()) - interval '7 days'
      GROUP BY "accessId"`,
    prisma.partnerAccessLog.findMany({
      where: { dealId },
      orderBy: { at: "desc" },
      take: LOG_LIMIT,
      select: { id: true, accessId: true, at: true, outcome: true, path: true, tokenFp: true, ipHash: true, country: true, uaClass: true, detail: true },
    }),
  ]);

  const flags = parseVisibility(deal.visibility);
  const effective = isMethod(deal.method) && isEarnOn(deal.earnOn) ? normalizeVisibility(flags, deal.method, deal.earnOn).effective : flags;
  const { shows, showsFinancials } = describeVisibility(effective);

  const now = Date.now();
  const statByAccess = new Map(stats.map((s) => [s.accessId, s] as const));
  const rows = accesses
    .map((a) => {
      const status: Status = a.revokedAt
        ? "REVOKED"
        : a.expiresAt && a.expiresAt.getTime() <= now
          ? "EXPIRED"
          : a.lockedUntil && a.lockedUntil.getTime() > now
            ? "LOCKED"
            : "ACTIVE";
      const s = statByAccess.get(a.id);
      const countries = s?.countries ?? [];
      const networks = s?.networks ?? 0;
      return {
        id: a.id,
        displayId: a.tokenHash.slice(0, 8),
        label: a.label,
        status,
        hasPassword: a.passwordHash !== null,
        expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
        createdAt: a.createdAt.toISOString(),
        createdByName: a.createdByName,
        viewCount: a.viewCount,
        lastViewedAt: a.lastViewedAt ? a.lastViewedAt.toISOString() : null,
        networks,
        countries,
        unusual: status !== "REVOKED" && (networks >= WEEK_ANOMALY.networks || countries.length >= WEEK_ANOMALY.countries),
      };
    })
    .sort((x, y) => Number(x.status === "REVOKED") - Number(y.status === "REVOKED"));

  const displayIdOf = new Map(accesses.map((a) => [a.id, a.tokenHash.slice(0, 8)] as const));
  const log: AccessLogRow[] = logRows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    outcome: r.outcome,
    path: r.path,
    tokenFp: r.tokenFp,
    network: r.ipHash ? r.ipHash.slice(0, 8) : null,
    country: r.country,
    device: r.uaClass,
    detail: r.detail,
    linkId: r.accessId ? displayIdOf.get(r.accessId) ?? null : null,
  }));
  const logLinks = rows.map((r) => ({ id: r.displayId, label: `${r.label ?? "Unlabelled"} (${r.displayId})` }));

  const disabledReason = deal.status === "CANCELLED"
    ? "A cancelled deal cannot have links."
    : !deal.partner.active
      ? "The partner is inactive."
      : null;
  const unusual = rows.filter((r) => r.unusual);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-serif text-lg">Access links</h2>
          <p className="text-sm text-muted-foreground">
            Private links that give {deal.partner.name} a read-only statement of this deal. No sign-in is needed, so anyone holding a link can open it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/partners/deals/${deal.id}/preview`}><Eye className="h-4 w-4" /> View as partner</Link>
          </Button>
          {canWrite && (
            <CreateAccessDialog
              dealId={deal.id}
              partnerName={deal.partner.name}
              stoneCount={deal._count.stones}
              shows={shows}
              showsFinancials={showsFinancials}
              disabledReason={disabledReason}
            />
          )}
        </div>
      </div>

      {deal.status !== "ACTIVE" && deal.status !== "CLOSED" && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            This deal is {deal.status === "DRAFT" ? "a draft" : "cancelled"}. Links only open while the deal is Active or Closed; until then the partner sees a
            &quot;not available&quot; page.
          </span>
        </div>
      )}

      {unusual.map((r) => (
        <div key={r.id} role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Link {r.displayId} was opened from {r.networks} {r.networks === 1 ? "network" : "networks"} in {r.countries.length}{" "}
            {r.countries.length === 1 ? "country" : "countries"} in the last 7 days. If that is unexpected, rotate the link and check the access log below.
          </span>
        </div>
      ))}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No access links yet.{canWrite ? " Create a link to share this deal's statement with the partner." : ""}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Link</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Password</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead>Last viewed</TableHead>
              <TableHead>Last 7 days</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={r.status === "REVOKED" || r.status === "EXPIRED" ? "text-muted-foreground" : undefined}>
                <TableCell className="py-3">
                  <div className="text-sm font-medium">{r.label ?? "Unlabelled"}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.displayId}</div>
                  {r.createdByName && <div className="text-[11px] text-muted-foreground">by {r.createdByName}</div>}
                </TableCell>
                <TableCell className="py-3">
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge>
                    {r.unusual && <Badge variant="danger">Unusual activity</Badge>}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap py-3 text-xs"><AccessTime iso={r.createdAt} dateOnly /></TableCell>
                <TableCell className="whitespace-nowrap py-3 text-xs"><AccessTime iso={r.expiresAt} dateOnly empty="Never" /></TableCell>
                <TableCell className="py-3">
                  <Badge variant={r.hasPassword ? "teal" : "muted"}>{r.hasPassword ? "Yes" : "No"}</Badge>
                </TableCell>
                <TableCell className="num py-3 text-right tabular-nums">{r.viewCount}</TableCell>
                <TableCell className="whitespace-nowrap py-3 text-xs"><AccessTime iso={r.lastViewedAt} empty="Never" /></TableCell>
                <TableCell className="whitespace-nowrap py-3 text-xs">
                  <div>{r.networks} {r.networks === 1 ? "network" : "networks"}</div>
                  <div className="text-muted-foreground">{r.countries.length > 0 ? r.countries.join(", ") : "no country"}</div>
                </TableCell>
                <TableCell className="min-w-[230px] py-3">
                  {canWrite ? (
                    <AccessRowActions
                      access={{ id: r.id, displayId: r.displayId, status: r.status, hasPassword: r.hasPassword, expiresAt: r.expiresAt }}
                      partnerName={deal.partner.name}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">View only</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Revoking a link stops the statement opening. It cannot recall photos or files already saved, and image and document addresses already seen stay
          reachable. Links also appear in hosting request logs, so limit who can read those. Only the first 8 characters of a link&apos;s fingerprint are
          shown here; the full link cannot be recovered, so use Rotate if it is lost.
        </span>
      </p>

      <section className="space-y-3">
        <div>
          <h3 className="font-serif text-base">Access log</h3>
          <p className="text-xs text-muted-foreground">
            The last {LOG_LIMIT} events for this deal. Networks are anonymous keyed hashes that change each month; no address is stored.
          </p>
        </div>
        <AccessLogTable rows={log} links={logLinks} />
      </section>
    </div>
  );
}
