import "server-only";
import { runEngine, validateTerms, type TermsDraft } from "@/lib/partner-engine";
import {
  OPEN_DEAL_STATUSES,
  buildRateMap,
  collectCurrencies,
  derivedGemIdsByRough,
  evaluateCaps,
  findOverlappingDeals,
  footprintKeys,
  gatherDeal,
  unitKeyOf,
  type Db,
} from "@/lib/partner-gather";
import { bpFromPct, decimalToMinor, type Minor } from "@/lib/partner-money";

type StoneRef = { kind: "ROUGH" | "GEM"; id: string };

const uniqSorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();
const nonNull = (x: string | null): x is string => x !== null;
/** Deals above this many are listed without an estimate (each estimate is a full gather). */
const MAX_ESTIMATES = 10;

/** The live deal stones as ids: roughs, gems, and the gems cut from the deal's roughs. */
export async function getDealFootprint(
  db: Db,
  dealId: string,
): Promise<{ roughIds: string[]; gemIds: string[]; derivedGemIds: string[] }> {
  const rows = await db.partnerDealStone.findMany({
    where: { dealId, removedAt: null },
    select: { roughStoneId: true, gemstoneId: true },
  });
  const roughIds = uniqSorted(rows.map((r) => r.roughStoneId).filter(nonNull));
  const gemIds = uniqSorted(rows.map((r) => r.gemstoneId).filter(nonNull));
  const derived = await derivedGemIdsByRough(db, roughIds);
  return { roughIds, gemIds, derivedGemIds: uniqSorted([...derived.values()].flat()) };
}

export type DealUnit = { key: string; kind: "ROUGH" | "GEM"; id: string; code: string; status: string };

/**
 * The units the engine counts for a deal: a gem deal stone is itself, an uncut rough is itself,
 * a cut rough is its derived gems. A unit seen twice keeps its first deal stone (the gatherer flags the clash).
 */
export async function resolveDealUnits(db: Db, dealId: string): Promise<DealUnit[]> {
  const rows = await db.partnerDealStone.findMany({
    where: { dealId, removedAt: null },
    orderBy: [{ addedAt: "asc" }, { id: "asc" }],
    select: {
      roughStone: { select: { id: true, code: true, status: true, transformationsAsInput: { select: { transformationId: true } } } },
      gemstone: { select: { id: true, code: true, status: true } },
    },
  });
  const cutIds = rows.filter((r) => r.roughStone && r.roughStone.transformationsAsInput.length > 0).map((r) => r.roughStone!.id);
  const derived = cutIds.length
    ? await db.gemstone.findMany({
        where: { transformationsAsOutput: { some: { transformation: { inputs: { some: { roughStoneId: { in: cutIds } } } } } } },
        select: {
          id: true, code: true, status: true,
          transformationsAsOutput: { select: { transformation: { select: { inputs: { select: { roughStoneId: true } } } } } },
        },
      })
    : [];
  const out: DealUnit[] = [];
  const seen = new Set<string>();
  const push = (u: DealUnit) => {
    if (seen.has(u.key)) return;
    seen.add(u.key);
    out.push(u);
  };
  for (const r of rows) {
    if (r.gemstone) {
      push({ key: unitKeyOf("GEM", r.gemstone.id), kind: "GEM", id: r.gemstone.id, code: r.gemstone.code, status: r.gemstone.status });
      continue;
    }
    const rough = r.roughStone;
    if (!rough) continue;
    if (rough.transformationsAsInput.length === 0) {
      push({ key: unitKeyOf("ROUGH", rough.id), kind: "ROUGH", id: rough.id, code: rough.code, status: rough.status });
      continue;
    }
    const gems = derived
      .filter((g) => g.transformationsAsOutput.some((o) => o.transformation.inputs.some((i) => i.roughStoneId === rough.id)))
      .sort((a, b) => a.code.localeCompare(b.code));
    for (const g of gems) push({ key: unitKeyOf("GEM", g.id), kind: "GEM", id: g.id, code: g.code, status: g.status });
  }
  return out;
}

/** settled + adjustments - net paid, in the deal currency (the ledger's definition of the balance). */
async function dealBalance(db: Db, dealId: string): Promise<Minor> {
  const minor = (v: { toString(): string } | null | undefined): Minor => (v === null || v === undefined ? 0 : decimalToMinor(v));
  const settled = await db.partnerSettlement.aggregate({ where: { dealId }, _sum: { amount: true } });
  const adjusted = await db.partnerAdjustment.aggregate({ where: { dealId }, _sum: { amount: true } });
  const payouts = await db.partnerPayout.groupBy({ by: ["direction"], where: { dealId }, _sum: { amount: true } });
  const paid = payouts.filter((p) => p.direction === "PAID").reduce((s, p) => s + minor(p._sum.amount), 0);
  const received = payouts.filter((p) => p.direction === "RECEIVED").reduce((s, p) => s + minor(p._sum.amount), 0);
  return minor(settled._sum.amount) + minor(adjusted._sum.amount) - (paid - received);
}

/** Estimate for the matched deal stones of a PER_STONE deal; null for a pooled deal (no stone-level figure) or on any failure. */
async function stoneEstimate(
  db: Db,
  deal: { id: string; scope: string; currency: string; rateOverrides: string | null },
  dealStoneIds: ReadonlySet<string>,
): Promise<Minor | null> {
  if (deal.scope !== "PER_STONE") return null;
  try {
    const rates = await buildRateMap(deal, await collectCurrencies(db, deal.id));
    const gathered = await gatherDeal(db, deal.id, { asOf: new Date(), rates, crossDeal: false });
    const result = runEngine(gathered.input);
    return result.buckets.filter((b) => dealStoneIds.has(b.bucketKey)).reduce((s, b) => s + b.amountMinor, 0);
  } catch {
    return null;
  }
}

export type StoneDeal = {
  dealId: string;
  dealCode: string;
  partnerName: string;
  method: string;
  ratePct: number | null;
  status: string;
  viaRough: boolean;
  estimateMinor: Minor | null;
  balanceMinor: Minor | null;
};

const STATUS_ORDER: Record<string, number> = { ACTIVE: 0, DRAFT: 1, CLOSED: 2 };

/**
 * Deals covering a stone directly, through its parent rough (a gem) or through its derived gems (a rough).
 * `viaRough` is true only when a gem is covered by a deal on its parent rough. Cancelled deals are left out.
 */
export async function listDealsForStone(db: Db, stone: StoneRef): Promise<StoneDeal[]> {
  let roughIds: string[] = [];
  let gemIds: string[] = [];
  if (stone.kind === "GEM") {
    gemIds = [stone.id];
    const parents = await db.transformationOutput.findMany({
      where: { gemstoneId: stone.id },
      select: { transformation: { select: { inputs: { select: { roughStoneId: true } } } } },
    });
    roughIds = uniqSorted(parents.flatMap((p) => p.transformation.inputs.map((i) => i.roughStoneId)));
  } else {
    roughIds = [stone.id];
    gemIds = (await derivedGemIdsByRough(db, [stone.id])).get(stone.id) ?? [];
  }
  const rows = await db.partnerDealStone.findMany({
    where: {
      removedAt: null,
      deal: { status: { not: "CANCELLED" } },
      OR: [{ roughStoneId: { in: roughIds } }, { gemstoneId: { in: gemIds } }],
    },
    select: {
      id: true,
      roughStoneId: true,
      gemstoneId: true,
      deal: {
        select: {
          id: true, code: true, status: true, method: true, scope: true, ratePct: true, currency: true, rateOverrides: true,
          partner: { select: { name: true } },
        },
      },
    },
  });
  const byDeal = new Map<string, { deal: (typeof rows)[number]["deal"]; ids: Set<string>; viaRough: boolean }>();
  for (const r of rows) {
    const entry = byDeal.get(r.deal.id) ?? { deal: r.deal, ids: new Set<string>(), viaRough: false };
    entry.ids.add(r.id);
    if (stone.kind === "GEM" && r.roughStoneId !== null) entry.viaRough = true;
    byDeal.set(r.deal.id, entry);
  }
  const sorted = [...byDeal.values()].sort(
    (a, b) => (STATUS_ORDER[a.deal.status] ?? 9) - (STATUS_ORDER[b.deal.status] ?? 9) || a.deal.code.localeCompare(b.deal.code),
  );
  const out: StoneDeal[] = [];
  let estimates = 0;
  for (const e of sorted) {
    const open = OPEN_DEAL_STATUSES.includes(e.deal.status);
    let estimateMinor: Minor | null = null;
    if (open && estimates < MAX_ESTIMATES) {
      estimates++;
      estimateMinor = await stoneEstimate(db, e.deal, e.ids);
    }
    let balanceMinor: Minor | null = null;
    if (e.deal.status === "ACTIVE" || e.deal.status === "CLOSED") {
      try {
        balanceMinor = await dealBalance(db, e.deal.id);
      } catch {
        balanceMinor = null;
      }
    }
    out.push({
      dealId: e.deal.id,
      dealCode: e.deal.code,
      partnerName: e.deal.partner.name,
      method: e.deal.method,
      ratePct: e.deal.ratePct === null ? null : Number(e.deal.ratePct.toString()),
      status: e.deal.status,
      viaRough: e.viaRough,
      estimateMinor,
      balanceMinor,
    });
  }
  return out;
}

/**
 * Co-partner caps (spec 4.5) for the given stones across every other DRAFT or ACTIVE deal: per footprint unit the
 * profit-style rates (M1 + M4) and commission rates (M2) may not exceed 100%, and one partner may not hold two open
 * deals on the same stone. The rate itself is checked with the engine's validateTerms.
 */
export async function validateCoPartnerCaps(
  db: Db,
  a: { dealId: string; method: string; ratePct: number | null; stones: StoneRef[] },
): Promise<{ errors: string[]; warnings: string[] }> {
  const draft: TermsDraft = {
    method: a.method,
    scope: "PER_STONE",
    earnOn: "SALE",
    currency: "LKR",
    ratePct: a.ratePct,
    // Placeholders keep validateTerms about the rate: every other term is valid here.
    fixedFee: a.method === "FIXED_FEE" ? "1" : null,
    invested: a.method === "INVESTMENT" ? "1" : null,
  };
  const termErrors = validateTerms(draft);
  if (termErrors.length > 0) return { errors: termErrors, warnings: [] };

  const own = await db.partnerDeal.findUnique({ where: { id: a.dealId }, select: { partnerId: true } });
  if (!own) return { errors: ["The deal was not found."], warnings: [] };
  if (a.stones.length === 0) return { errors: [], warnings: [] };

  const keys = await footprintKeys(db, a.stones);
  const overlaps = await findOverlappingDeals(db, { excludeDealId: a.dealId, keys, statuses: OPEN_DEAL_STATUSES });
  if (overlaps.length === 0) return { errors: [], warnings: [] };

  const roughIds = [...keys].filter((k) => k.startsWith("R:")).map((k) => k.slice(2));
  const gemIds = [...keys].filter((k) => k.startsWith("G:")).map((k) => k.slice(2));
  const [roughs, gems] = await Promise.all([
    roughIds.length ? db.roughStone.findMany({ where: { id: { in: roughIds } }, select: { id: true, code: true } }) : [],
    gemIds.length ? db.gemstone.findMany({ where: { id: { in: gemIds } }, select: { id: true, code: true } }) : [],
  ]);
  const codes = new Map<string, string>([
    ...roughs.map((r) => [unitKeyOf("ROUGH", r.id), r.code] as const),
    ...gems.map((g) => [unitKeyOf("GEM", g.id), g.code] as const),
  ]);
  const toBp = (v: string | number | null): number | null => {
    if (v === null) return null;
    try {
      return bpFromPct(v);
    } catch {
      return null;
    }
  };
  return evaluateCaps(
    { partnerId: own.partnerId, method: a.method, rateBp: toBp(a.ratePct) },
    keys,
    overlaps.map((o) => ({ code: o.code, partnerId: o.partnerId, method: o.method, rateBp: toBp(o.ratePct), overlap: o.overlap })),
    (k) => codes.get(k) ?? k,
  );
}
