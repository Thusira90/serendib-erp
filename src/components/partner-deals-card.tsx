import { Suspense } from "react";
import Link from "next/link";
import { Handshake, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, type Principal } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { minorToMajor, type Minor } from "@/lib/partner-money";
import { listDealsForStone, type StoneDeal } from "@/lib/partner-queries";
import { checkObligations } from "@/lib/partner-ledger";

type Kind = "ROUGH" | "GEM";
type Obligations = Awaited<ReturnType<typeof checkObligations>>;

const METHOD_LABEL: Record<string, string> = {
  PROFIT_SHARE: "Profit share",
  SALE_COMMISSION: "Sale commission",
  FIXED_FEE: "Fixed fee",
  INVESTMENT: "Investment",
};
const STATUS_VARIANT: Record<string, "success" | "muted" | "secondary"> = {
  ACTIVE: "success",
  DRAFT: "muted",
  CLOSED: "secondary",
};
/** Each check gathers the deal and its co-partner deals, so only the first few open deals are checked. */
const MAX_OBLIGATION_CHECKS = 5;

type DealMeta = { currency: string; scope: string; fixedFee: number | null; direct: boolean };

const money = (m: Minor | null, currency: string | null): string =>
  m === null || currency === null ? "—" : formatCurrency(minorToMajor(m), currency);

function methodText(d: StoneDeal, meta: DealMeta | undefined): string {
  const label = METHOD_LABEL[d.method] ?? d.method.replaceAll("_", " ").toLowerCase();
  if (d.ratePct !== null) return `${label} ${d.ratePct}%`;
  if (d.method === "FIXED_FEE" && meta?.fixedFee != null) return `${label} ${formatCurrency(meta.fixedFee, meta.currency)}`;
  return label;
}

function coverage(kind: Kind, d: StoneDeal, meta: DealMeta | undefined): string | null {
  if (!meta || meta.direct) return null;
  if (kind === "GEM") return d.viaRough ? "via parent rough" : null;
  return "via cut gems";
}

function ObligationStatus({ deal, ob, currency }: { deal: StoneDeal; ob: Obligations | null; currency: string | null }) {
  if (deal.status === "CLOSED") return <span className="text-muted-foreground">—</span>;
  if (!ob) return <span className="text-muted-foreground">Not calculated</span>;
  const detail =
    currency === null
      ? undefined
      : `Obligations ${money(ob.obligationsMinor, currency)} against revenue ${money(ob.revenueMinor, currency)}`;
  if (ob.blocked) return <Badge variant="danger" title={detail}>Exceed revenue</Badge>;
  if (ob.exceedsProfit) return <Badge variant="warning" title={detail}>Exceed profit</Badge>;
  if (ob.obligationsMinor === 0) return <Badge variant="muted" title={detail}>None yet</Badge>;
  return <Badge variant="success" title={detail}>Covered</Badge>;
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="num text-sm font-medium">{children}</div>
    </div>
  );
}

function Shell({ kind, stoneId, canWrite, children }: { kind: Kind; stoneId: string; canWrite: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-4 w-4 text-sgs-teal-500" /> Partner deals
          </CardTitle>
          <div className="text-xs text-muted-foreground mt-1">
            Deals that cover this stone, directly or through its {kind === "GEM" ? "parent rough" : "cut gems"}.
          </div>
        </div>
        {canWrite && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/partners/deals/new?stone=${kind === "GEM" ? "gem" : "rough"}:${encodeURIComponent(stoneId)}`}>
              <Plus className="h-3 w-3" /> Add to partner deal
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

async function DealsBody({ kind, stoneId, user }: { kind: Kind; stoneId: string; user: Principal }) {
  const canWrite = can(user, "partner:write");
  const deals = await listDealsForStone(prisma, { kind, id: stoneId });

  if (deals.length === 0) {
    return (
      <Shell kind={kind} stoneId={stoneId} canWrite={canWrite}>
        <div className="text-sm text-muted-foreground text-center py-6 border rounded-md">
          No partner deal covers this {kind === "GEM" ? "gemstone" : "rough stone"} yet.
          {canWrite && <> Use <span className="font-medium">Add to partner deal</span> to start one.</>}
        </div>
      </Shell>
    );
  }

  const open = deals.filter((d) => d.status === "ACTIVE" || d.status === "DRAFT").slice(0, MAX_OBLIGATION_CHECKS);
  const [metaRows, checks] = await Promise.all([
    prisma.partnerDeal.findMany({
      where: { id: { in: deals.map((d) => d.dealId) } },
      select: {
        id: true,
        currency: true,
        scope: true,
        fixedFee: true,
        stones: {
          where: { removedAt: null, ...(kind === "GEM" ? { gemstoneId: stoneId } : { roughStoneId: stoneId }) },
          select: { id: true },
          take: 1,
        },
      },
    }),
    Promise.all(
      open.map(async (d): Promise<[string, Obligations | null]> => {
        try {
          return [d.dealId, await checkObligations(prisma, d.dealId)];
        } catch {
          return [d.dealId, null];
        }
      }),
    ),
  ]);
  const meta = new Map<string, DealMeta>(
    metaRows.map((m) => [
      m.id,
      { currency: m.currency, scope: m.scope, fixedFee: m.fixedFee === null ? null : Number(m.fixedFee.toString()), direct: m.stones.length > 0 },
    ]),
  );
  const obligations = new Map<string, Obligations | null>(checks);

  return (
    <Shell kind={kind} stoneId={stoneId} canWrite={canWrite}>
      <ul className="divide-y border rounded-md">
        {deals.map((d) => {
          const m = meta.get(d.dealId);
          const currency = m?.currency ?? null;
          const via = coverage(kind, d, m);
          const pooled = m?.scope === "POOLED";
          return (
            <li key={d.dealId} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/partners/deals/${d.dealId}`} className="font-mono text-sm text-sgs-teal-700 hover:underline">
                      {d.dealCode}
                    </Link>
                    <Badge variant={STATUS_VARIANT[d.status] ?? "muted"}>{d.status.charAt(0) + d.status.slice(1).toLowerCase()}</Badge>
                    {via && <Badge variant="outline">{via}</Badge>}
                  </div>
                  <div className="text-sm mt-0.5">{d.partnerName}</div>
                  <div className="text-xs text-muted-foreground">
                    {methodText(d, m)}
                    {m && ` · ${pooled ? "pooled" : "per stone"}`}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-right">
                  <Figure label="Stone estimate">
                    {d.estimateMinor !== null ? (
                      money(d.estimateMinor, currency)
                    ) : (
                      <span className="text-muted-foreground font-normal text-xs">{pooled ? "Pooled deal" : "—"}</span>
                    )}
                  </Figure>
                  <Figure label="Deal balance">
                    {d.balanceMinor === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={d.balanceMinor < 0 ? "text-red-700" : undefined} title={d.balanceMinor < 0 ? "Carried forward against the partner" : undefined}>
                        {money(d.balanceMinor, currency)}
                      </span>
                    )}
                  </Figure>
                  <Figure label="Obligations">
                    <ObligationStatus deal={d} ob={obligations.get(d.dealId) ?? null} currency={currency} />
                  </Figure>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        The estimate is live for this stone only and can change until it is settled. The balance covers the whole deal
        (settled plus adjustments less payouts). Cancelled deals are not listed.
      </p>
    </Shell>
  );
}

/**
 * Partner deals covering one stone. Self-fetching; renders nothing for a user without partner:read, so the page never
 * loads deal costs for them. Streams behind Suspense because each deal's estimate and obligation check is a full gather.
 */
export function PartnerDealsCard({ kind, stoneId, user }: { kind: Kind; stoneId: string; user: Principal }) {
  if (!can(user, "partner:read")) return null;
  return (
    <Suspense
      fallback={
        <Shell kind={kind} stoneId={stoneId} canWrite={can(user, "partner:write")}>
          <div className="text-sm text-muted-foreground text-center py-6 border rounded-md">Loading partner deals...</div>
        </Shell>
      }
    >
      <DealsBody kind={kind} stoneId={stoneId} user={user} />
    </Suspense>
  );
}
