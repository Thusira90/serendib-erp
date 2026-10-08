import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CornerDownRight, Gem, Video } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, requireCapability } from "@/lib/rbac";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { derivedGemIdsByRough, unitKeyOf, type GatherFlag } from "@/lib/partner-gather";
import { decimalToMinor, minorToDecimalString, type Minor } from "@/lib/partner-money";
import { normalizeVisibility, parseVisibility } from "@/lib/partner-visibility";
import type { EarnOn, PayoutMethod } from "@/lib/enums";
import { FLAG_INFO, type StoneRef } from "../deal-shared";
import { loadDealFacts } from "./overview-tab";
import { StonePicker } from "./stone-picker";
import { AllocatorPanel, MediaHideToggle, RemoveStoneButton, WriteOffStoneButton, type AllocParcel, type AllocStone } from "./stone-actions";

/** Same positive whitelist the partner page uses: anything else is never shown. */
const MEDIA_KINDS: readonly string[] = ["ROUGH_PHOTO", "FINISHED_PHOTO", "MACRO_PHOTO", "INSPECTION_PHOTO", "VIDEO", "CATALOGUE_IMAGE"];
const MEDIA_LIMIT = 200;

const money = (m: Minor, currency: string): string => formatCurrency(Number(minorToDecimalString(m)), currency);
const decimalText = (v: { toString(): string } | null): string | null => (v === null ? null : minorToDecimalString(decimalToMinor(v)));
const ct = (v: { toString(): string } | null): string => (v === null ? "-" : `${Number(v.toString()).toFixed(2)} ct`);
const milliCt = (m: number): string => `${(m / 1000).toFixed(2)} ct`;
const statusText = (s: string): string => s.replaceAll("_", " ").toLowerCase();
const SEVERITY_VARIANT = { BLOCK: "danger", ACK: "warning", INFO: "muted" } as const;

export async function StonesTab({ dealId, preselect }: { dealId: string; preselect: StoneRef | null }) {
  const session = await requireCapability("partner:read");
  const canWrite = can(session.user, "partner:write");
  const canRough = can(session.user, "rough:read");
  const canGem = can(session.user, "gemstone:read");
  const canSettle = can(session.user, "partner:settle");

  const deal = await prisma.partnerDeal.findUnique({
    where: { id: dealId },
    select: { id: true, code: true, status: true, method: true, scope: true, earnOn: true, currency: true, invested: true, visibility: true },
  });
  if (!deal) notFound();
  const method = deal.method as PayoutMethod;
  const earnOn = deal.earnOn as EarnOn;
  const open = deal.status === "DRAFT" || deal.status === "ACTIVE";
  const cur = deal.currency;
  const showCost = method === "PROFIT_SHARE" || method === "INVESTMENT";

  const rows = await prisma.partnerDealStone.findMany({
    where: { dealId, removedAt: null },
    orderBy: [{ addedAt: "asc" }, { id: "asc" }],
    select: {
      id: true, weightMilli: true, acquisitionOverride: true, acquisitionCurrency: true, acquisitionSource: true, investedAlloc: true,
      countSalesFrom: true, writtenOffAt: true, addedAt: true,
      roughStone: {
        select: {
          id: true, code: true, gemType: true, variety: true, status: true, weightCt: true, purchasePrice: true, currency: true, parcelId: true,
          parcel: { select: { id: true, code: true, totalCost: true, currency: true, _count: { select: { roughStones: true } } } },
        },
      },
      gemstone: { select: { id: true, code: true, gemType: true, variety: true, status: true, weightCt: true } },
    },
  });
  const roughIds = rows.map((r) => r.roughStone?.id).filter((x): x is string => !!x);
  const derived = await derivedGemIdsByRough(prisma, roughIds);
  const derivedIds = [...new Set([...derived.values()].flat())];
  const derivedGems = derivedIds.length
    ? await prisma.gemstone.findMany({ where: { id: { in: derivedIds } }, select: { id: true, code: true, gemType: true, variety: true, status: true, weightCt: true } })
    : [];
  const gemById = new Map(derivedGems.map((g) => [g.id, g] as const));

  const [settlementCount, factsResult] = await Promise.all([prisma.partnerSettlement.count({ where: { dealId } }), loadDealFacts(dealId)]);
  const facts = factsResult.ok ? factsResult.facts : null;
  const frozenKind = method === "INVESTMENT" || (method === "FIXED_FEE" && deal.scope === "POOLED");
  const membershipFrozen = settlementCount > 0 && frozenKind;
  const pooledBucket = facts?.result.buckets.find((b) => b.bucketKey === "POOL") ?? null;

  // Media owned by the deal's stones, derived gems and the cutting jobs of its roughs.
  const jobs = roughIds.length ? await prisma.cuttingJob.findMany({ where: { roughStoneId: { in: roughIds } }, select: { id: true, roughStoneId: true } }) : [];
  const gemIdsAll = [...new Set([...rows.map((r) => r.gemstone?.id).filter((x): x is string => !!x), ...derivedIds])];
  const assets =
    gemIdsAll.length + roughIds.length + jobs.length > 0
      ? await prisma.digitalAsset.findMany({
          where: { OR: [{ gemstoneId: { in: gemIdsAll } }, { roughStoneId: { in: roughIds } }, { cuttingJobId: { in: jobs.map((j) => j.id) } }] },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: MEDIA_LIMIT,
          select: { id: true, kind: true, stage: true, url: true, isPrimary: true, partnerHidden: true, createdAt: true, gemstoneId: true, roughStoneId: true, cuttingJobId: true },
        })
      : [];
  const codeOfStone = new Map<string, string>();
  for (const r of rows) {
    if (r.roughStone) codeOfStone.set(r.roughStone.id, r.roughStone.code);
    if (r.gemstone) codeOfStone.set(r.gemstone.id, r.gemstone.code);
  }
  for (const g of derivedGems) codeOfStone.set(g.id, g.code);
  const roughOfJob = new Map(jobs.map((j) => [j.id, j.roughStoneId] as const));
  const eff = normalizeVisibility(parseVisibility(deal.visibility), method, earnOn).effective;

  function mediaState(a: (typeof assets)[number]): { shown: boolean; note: string } {
    if (a.partnerHidden === true) return { shown: false, note: "Hidden by you" };
    if (a.stage === "CERTIFICATION" || !MEDIA_KINDS.includes(a.kind)) return { shown: false, note: "Never shown (documents and unknown types)" };
    const process = a.cuttingJobId !== null;
    if (process ? !eff.processMedia : !eff.media) return { shown: false, note: `Off: ${process ? "cutting process media" : "photos and videos"} is switched off` };
    if (a.stage === "ROUGH_INTAKE" && !eff.supplierIdentity) return { shown: false, note: "Intake photos stay hidden while the supplier name is hidden" };
    return { shown: true, note: process ? "Shown (cutting process)" : "Shown" };
  }

  const flagsFor = (unitKeys: Set<string>, bucketKey: string): GatherFlag[] =>
    (facts?.flags ?? []).filter((f) => f.severity !== "INFO" && (f.bucketKey === bucketKey || (f.unitKey !== undefined && unitKeys.has(f.unitKey))));

  const allocStones: AllocStone[] = rows.map((r) => ({
    dealStoneId: r.id,
    code: r.roughStone?.code ?? r.gemstone?.code ?? "Stone",
    kind: r.roughStone ? "ROUGH" : "GEM",
    priceText: r.roughStone ? decimalText(r.roughStone.purchasePrice) : null,
    priceCurrency: r.roughStone?.currency ?? null,
    overrideText: decimalText(r.acquisitionOverride),
    investedText: decimalText(r.investedAlloc),
    parcelId: r.roughStone?.parcelId ?? null,
  }));
  const parcelMap = new Map<string, AllocParcel>();
  for (const r of rows) {
    const p = r.roughStone?.parcel;
    if (!p) continue;
    const have = parcelMap.get(p.id);
    if (have) have.inDeal += 1;
    else parcelMap.set(p.id, { id: p.id, code: p.code, inDeal: 1, total: p._count.roughStones, totalCostText: decimalText(p.totalCost) ?? "0.00", currency: p.currency });
  }

  const preselectChip = await (async () => {
    if (!preselect || !open || !canWrite) return null;
    if (rows.some((r) => (preselect.kind === "ROUGH" ? r.roughStone?.id : r.gemstone?.id) === preselect.id)) return null;
    if (preselect.kind === "ROUGH" && canRough) {
      const r = await prisma.roughStone.findUnique({ where: { id: preselect.id }, select: { id: true, code: true } });
      return r ? { kind: "ROUGH" as const, id: r.id, code: r.code } : null;
    }
    if (preselect.kind === "GEM" && canGem) {
      const g = await prisma.gemstone.findUnique({ where: { id: preselect.id }, select: { id: true, code: true } });
      return g ? { kind: "GEM" as const, id: g.id, code: g.code } : null;
    }
    return null;
  })();

  return (
    <div className="space-y-6">
      {!factsResult.ok && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          Per-stone figures are not available yet. <span className="text-xs">{factsResult.error}</span>
        </div>
      )}

      {open && canWrite && (canRough || canGem) && (
        <StonePicker dealId={deal.id} method={method} preselect={preselectChip} canRough={canRough} canGem={canGem} />
      )}
      {open && canWrite && membershipFrozen && (
        <p className="rounded-lg border bg-secondary/30 p-3 text-xs text-muted-foreground">
          Stones cannot be added or removed after the first settlement on this kind of deal: it would change how the amounts are shared.
        </p>
      )}

      {pooledBucket && showCost && (
        <p className="text-sm text-muted-foreground">
          Pooled: revenue {money(pooledBucket.revenueMinor, cur)}, cost {money(pooledBucket.costMinor, cur)}, profit {money(pooledBucket.profitMinor, cur)}, partner {money(pooledBucket.amountMinor, cur)}.
        </p>
      )}
      {pooledBucket && !showCost && (
        <p className="text-sm text-muted-foreground">Pooled: revenue {money(pooledBucket.revenueMinor, cur)}, partner {money(pooledBucket.amountMinor, cur)}.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Deal stones ({rows.length})</CardTitle>
          <CardDescription>
            A rough is one lot; the gems cut from it sit under it and follow it. The frozen weight is the stone&apos;s weight when it joined the deal.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState icon={Gem} title="No stones yet" description={open && canWrite ? "Search above to add the first stone or rough." : "No stones were added to this deal."} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stone</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead>Cost basis</TableHead>
                    {method === "INVESTMENT" && <TableHead className="text-right">Invested</TableHead>}
                    <TableHead className="text-right">{deal.scope === "PER_STONE" ? "Realised" : "Realised (pooled above)"}</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const stone = r.roughStone ?? r.gemstone!;
                    const isRough = r.roughStone !== null;
                    const bucketKey = deal.scope === "POOLED" ? "POOL" : r.id;
                    const bucket = deal.scope === "PER_STONE" ? facts?.result.buckets.find((b) => b.bucketKey === r.id) ?? null : null;
                    const units = facts?.evidence.units.filter((u) => u.dealStoneId === r.id) ?? [];
                    const unitKeys = new Set(units.map((u) => u.unitKey));
                    unitKeys.add(unitKeyOf(isRough ? "ROUGH" : "GEM", stone.id));
                    const flags = flagsFor(unitKeys, bucketKey);
                    const gems = isRough ? (derived.get(stone.id) ?? []).map((id) => gemById.get(id)).filter((g): g is NonNullable<typeof g> => !!g) : [];
                    const href = isRough ? `/rough/${stone.id}` : `/gemstones/${stone.id}`;
                    const soldUnits = units.filter((u) => u.order !== null).length;
                    const changed = r.weightMilli > 0 && Math.abs(r.weightMilli - Math.round(Number(stone.weightCt.toString()) * 1000)) > 0;
                    return (
                      <Fragment key={r.id}>
                        <TableRow>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link href={href} className="font-mono text-xs text-sgs-teal-700 hover:underline">{stone.code}</Link>
                              <Badge variant={isRough ? "teal" : "purple"}>{isRough ? "Rough" : "Gem"}</Badge>
                              {r.writtenOffAt && <Badge variant="danger">Capital written off</Badge>}
                              {r.countSalesFrom && <Badge variant="muted" title="Sales before this date are ignored">Counts sales from {formatDate(r.countSalesFrom)}</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground">{stone.variety ?? stone.gemType}</div>
                          </TableCell>
                          <TableCell className="num text-right">
                            {ct(stone.weightCt)}
                            <div className={`text-[11px] ${changed ? "text-amber-800" : "text-muted-foreground"}`}>frozen {r.weightMilli > 0 ? milliCt(r.weightMilli) : "unknown"}</div>
                          </TableCell>
                          <TableCell><Badge variant="muted">{statusText(stone.status)}</Badge></TableCell>
                          <TableCell className="num text-right">{facts ? `${soldUnits} of ${units.length} sold` : "-"}</TableCell>
                          <TableCell className="text-xs">
                            {r.acquisitionOverride !== null ? (
                              <>
                                <Badge variant="teal">Allocated</Badge>
                                <div className="mt-0.5">{formatCurrency(Number(r.acquisitionOverride.toString()), r.acquisitionCurrency ?? cur)}</div>
                                <div className="text-muted-foreground">{(r.acquisitionSource ?? "").replaceAll("_", " ").toLowerCase()}</div>
                              </>
                            ) : (
                              <span className="text-muted-foreground">Its own price</span>
                            )}
                          </TableCell>
                          {method === "INVESTMENT" && (
                            <TableCell className="num text-right">{r.investedAlloc === null ? <span className="text-amber-800">not set</span> : money(decimalToMinor(r.investedAlloc), cur)}</TableCell>
                          )}
                          <TableCell className="num text-right text-xs">
                            {bucket ? (
                              <>
                                <div>Revenue {money(bucket.revenueMinor, cur)}</div>
                                {showCost && <div>Cost {money(bucket.costMinor, cur)}</div>}
                                <div className="font-medium text-sm">Partner {money(bucket.amountMinor, cur)}</div>
                              </>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              {method === "INVESTMENT" && deal.status === "ACTIVE" && canSettle && r.writtenOffAt === null && (
                                <WriteOffStoneButton dealId={deal.id} dealStoneId={r.id} code={stone.code} />
                              )}
                              {canWrite && open && !membershipFrozen && (
                                <RemoveStoneButton dealId={deal.id} dealStoneId={r.id} code={stone.code} needsReason={deal.status === "ACTIVE"} />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {gems.map((g) => {
                          const u = units.find((x) => x.id === g.id);
                          return (
                            <TableRow key={g.id} className="bg-secondary/20">
                              <TableCell colSpan={2}>
                                <div className="flex items-center gap-1.5 pl-4">
                                  <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                                  <Link href={`/gemstones/${g.id}`} className="font-mono text-xs text-sgs-teal-700 hover:underline">{g.code}</Link>
                                  <span className="text-xs text-muted-foreground">{g.variety ?? g.gemType} · {ct(g.weightCt)}</span>
                                </div>
                              </TableCell>
                              <TableCell><Badge variant="muted">{statusText(g.status)}</Badge></TableCell>
                              <TableCell className="text-right text-xs">{u?.order ? <Badge variant="success">sold {formatDate(u.order.saleDate)}</Badge> : <span className="text-muted-foreground">unsold</span>}</TableCell>
                              <TableCell colSpan={method === "INVESTMENT" ? 4 : 3} />
                            </TableRow>
                          );
                        })}
                        {flags.length > 0 && (
                          <TableRow className="bg-background">
                            <TableCell colSpan={method === "INVESTMENT" ? 8 : 7} className="py-2">
                              <div className="flex flex-wrap gap-1.5">
                                {flags.map((f, i) => {
                                  const info = Object.prototype.hasOwnProperty.call(FLAG_INFO, f.code) ? FLAG_INFO[f.code as keyof typeof FLAG_INFO] : null;
                                  return (
                                    <Badge key={`${f.code}-${i}`} variant={SEVERITY_VARIANT[f.severity]} title={info ? `${info.label}. Fix: ${info.fix}` : f.detail}>
                                      {info?.label ?? f.code.replaceAll("_", " ").toLowerCase()}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {open && canWrite && rows.length > 0 && (
        <AllocatorPanel
          dealId={deal.id}
          method={method}
          scope={deal.scope}
          currency={cur}
          investedText={decimalText(deal.invested)}
          investmentLocked={settlementCount > 0}
          stones={allocStones}
          parcels={[...parcelMap.values()]}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Media shown to the partner</CardTitle>
          <CardDescription>
            Photos and videos of these stones, their gems and their cutting jobs. Hide one and it never appears for this partner, whatever the switches say. Documents and unknown types are never shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No photos or videos are attached to these stones.</p>
          ) : (
            <ul className="divide-y">
              {assets.map((a) => {
                const state = mediaState(a);
                const ownerId = a.gemstoneId ?? a.roughStoneId ?? (a.cuttingJobId ? roughOfJob.get(a.cuttingJobId) ?? null : null);
                const isVideo = a.kind === "VIDEO";
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    {isVideo ? (
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded bg-secondary" aria-label="Video"><Video className="h-5 w-5 text-muted-foreground" /></div>
                    ) : (
                      <img src={a.url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded object-cover" />
                    )}
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs">{ownerId ? codeOfStone.get(ownerId) ?? "Stone" : "Stone"}</span>
                        <Badge variant="muted">{a.kind.replaceAll("_", " ").toLowerCase()}</Badge>
                        {a.stage && <Badge variant="muted">{a.stage.replaceAll("_", " ").toLowerCase()}</Badge>}
                        {a.isPrimary && <Badge variant="teal">primary</Badge>}
                      </div>
                      <div className={`text-xs ${state.shown ? "text-emerald-700" : "text-muted-foreground"}`}>{state.note}</div>
                    </div>
                    <MediaHideToggle assetId={a.id} dealId={deal.id} hidden={a.partnerHidden === true} canWrite={canWrite} />
                  </li>
                );
              })}
            </ul>
          )}
          {assets.length === MEDIA_LIMIT && <p className="mt-2 text-xs text-muted-foreground">Showing the latest {MEDIA_LIMIT}.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
