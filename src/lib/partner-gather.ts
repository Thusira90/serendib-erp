import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { COST_TYPES, EXPENSE_CATEGORIES, type EarnOn, type FlagCode } from "@/lib/enums";
import { getExchangeRates } from "@/lib/exchange-rates";
import {
  ENGINES,
  runEngine,
  type BaseUnit,
  type CostUnit,
  type EngineInput,
  type GatherFlag,
  type Group,
  type SaleInput,
  type Severity,
  type Terms,
} from "@/lib/partner-engine";
import {
  allocateMinor,
  bpFromPct,
  convertMinor,
  decimalToMinor,
  microFromRates,
  mulFrac,
  parseScaled,
  toSafeInt,
  type Minor,
  type RateMap,
  type RateSource,
} from "@/lib/partner-money";

export type { GatherFlag, RateMap, RateSource, Severity };
export type Db = PrismaClient | Prisma.TransactionClient;

type Num = { toString(): string };
type StoneKind = "ROUGH" | "GEM";

/** Sale statuses that count as a live sale; never "not CANCELLED", which would include DRAFT. */
const LIVE_SO: readonly string[] = ["CONFIRMED", "INVOICED", "PARTIAL", "PAID", "SHIPPED", "DELIVERED"];
export const OPEN_DEAL_STATUSES: readonly string[] = ["DRAFT", "ACTIVE"];
const KNOWN_COST_TYPES: ReadonlySet<string> = new Set<string>([...COST_TYPES, ...EXPENSE_CATEGORIES]);
const DEFAULT_EXCLUDED_TYPES: readonly string[] = ["RENT", "SALARIES", "TAX"];
/** Drift and rounding tolerance for the consistency flags: 1.00 in minor units. */
const TOLERANCE_MINOR = 100;

export class PartnerGatherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartnerGatherError";
  }
}

export interface EvidenceCostLine {
  id: string;
  type: string;
  amountOriginalMinor: Minor | null;
  currency: string;
  convertedMinor: Minor | null;
  createdAt: string;
  excluded?: "REJECTED" | "EXCLUDED_TYPE" | "OVERRIDDEN" | "PRE_CUT" | "COPIED_TO_GEMS";
}
export interface EvidencePayment {
  id: string;
  receivedAt: string;
  amountOriginalMinor: Minor | null;
  currency: string;
  /** In the sale's own currency. */
  convertedMinor: Minor | null;
}
export interface EvidenceOrder {
  id: string;
  status: string;
  saleDate: string;
  priceOriginalMinor: Minor | null;
  currency: string;
  totalMinor: Minor | null;
  priceConvertedMinor: Minor | null;
  payments: EvidencePayment[];
}
export interface EvidenceIgnoredOrder {
  id: string;
  status: string;
  reason: "CANCELLED" | "AFTER_AS_OF" | "BEFORE_COUNT_FROM" | "MULTIPLE_LIVE";
}
export interface EvidenceUnit {
  unitKey: string;
  kind: StoneKind;
  id: string;
  code: string;
  dealStoneId: string;
  weightMilli: number;
  basisMinor: Minor | null;
  lateShareMinor: Minor;
  costMinor: Minor | null;
  costLines: EvidenceCostLine[];
  order: EvidenceOrder | null;
  ignoredOrders: EvidenceIgnoredOrder[];
  ignoredPaymentIds: string[];
}
export interface EvidenceDealStone {
  dealStoneId: string;
  bucketKey: string;
  kind: StoneKind;
  id: string;
  code: string;
  frozenWeightMilli: number;
  currentWeightMilli: number;
  acquisitionOverrideMinor: Minor | null;
  unitKeys: string[];
  roughLines: EvidenceCostLine[];
  lateRoughLines: EvidenceCostLine[];
  lateShares: { unitKey: string; minor: Minor }[];
}
/** INTERNAL: stored in settlement snapshots; never copy any of it into a partner-facing DTO. No free text is ever held here. */
export interface Evidence {
  dealId: string;
  currenciesUsed: string[];
  dealStones: EvidenceDealStone[];
  units: EvidenceUnit[];
}
export interface GatherResult {
  input: EngineInput;
  flags: GatherFlag[];
  rates: RateMap;
  asOf: string;
  evidence: Evidence;
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

export const unitKeyOf = (kind: StoneKind, id: string): string => `${kind === "ROUGH" ? "R" : "G"}:${id}`;

/** Decimal to minor units, or null when the value cannot be represented exactly as a safe integer. */
function safeMinor(v: Num | null | undefined): Minor | null {
  if (v === null || v === undefined) return null;
  try {
    return decimalToMinor(v);
  } catch {
    return null;
  }
}

function weightMilliOf(ct: Num | null | undefined): number {
  if (ct === null || ct === undefined) return 0;
  try {
    return Math.max(0, toSafeInt(parseScaled(ct.toString(), 3), "weight"));
  } catch {
    return 0;
  }
}

const iso = (d: Date): string => d.toISOString();
const uniq = <T>(xs: Iterable<T>): T[] => [...new Set(xs)];
const usesCost = (method: string): boolean => method === "PROFIT_SHARE" || method === "INVESTMENT";
const bucketKeyOf = (scope: string, dealStoneId: string): string => (scope === "POOLED" ? "POOL" : dealStoneId);

const COMMISSION_WORDS = /\b(commission|brokerage|broker'?s? fee|finder'?s? fee|profit[- ]?shar(?:e|ing)|payout)\b/i;
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The ONLY consumer of CostAllocation.description. It answers one yes/no question for the
 * POSSIBLE_PARTNER_PAYOUT_BILL flag; the text itself is dropped by the caller and never stored.
 */
export function looksLikePartnerPayout(text: string | null | undefined, partnerNames: readonly string[]): boolean {
  if (!text) return false;
  if (COMMISSION_WORDS.test(text)) return true;
  const hay = text.toLowerCase();
  for (const raw of partnerNames) {
    const name = raw.trim().toLowerCase();
    if (name.length < 4) continue;
    if (new RegExp(`(^|[^a-z0-9])${escapeRe(name)}([^a-z0-9]|$)`).test(hay)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

const MAX_SAFE_BIG = BigInt(Number.MAX_SAFE_INTEGER);
const microString = (v: bigint): string => `${v / 1_000_000n}.${(v % 1_000_000n).toString().padStart(6, "0")}`;
const rateString = (x: number): string => (Math.round(x * 1e6) / 1e6).toFixed(6);

function parseOverrides(json: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!json) return out;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return out;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [ccy, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[A-Z]{3}$/.test(ccy) || ccy === "LKR") continue;
    if (typeof v !== "string" && typeof v !== "number") continue;
    try {
      const micro = parseScaled(String(v), 6);
      if (micro > 0n && micro <= MAX_SAFE_BIG) out.set(ccy, microString(micro));
    } catch {
      // an unusable override counts as absent
    }
  }
  return out;
}

/**
 * Rate per needed currency: the deal's manual (and frozen) rate, else the live feed, else the cached fallback table.
 * A currency with no usable rate is simply absent, so every conversion that needs it returns null.
 * `fetchedAt` is when this map was assembled (the ledger's 15 minute freshness check reads it).
 */
export async function buildRateMap(
  deal: { currency: string; rateOverrides: string | null },
  needed: Iterable<string>,
): Promise<RateMap> {
  const wanted = new Set<string>();
  for (const c of needed) if (c && c !== "LKR") wanted.add(c);
  if (deal.currency !== "LKR") wanted.add(deal.currency);
  const overrides = parseOverrides(deal.rateOverrides);
  const sorted = [...wanted].sort();
  const live = sorted.some((c) => !overrides.has(c)) ? await getExchangeRates() : null;
  const perUnit: RateMap["perUnit"] = {};
  for (const c of sorted) {
    const manual = overrides.get(c);
    if (manual !== undefined) {
      perUnit[c] = { rate: manual, source: "MANUAL" };
      continue;
    }
    const per = live?.perUnit[c];
    if (live && typeof per === "number" && Number.isFinite(per) && per > 0) {
      const rate = rateString(per);
      if (Number(rate) > 0) perUnit[c] = { rate, source: live.source === "fallback" ? "FALLBACK" : "LIVE" };
    }
  }
  return { base: "LKR", fetchedAt: new Date().toISOString(), perUnit };
}

/** Every currency the deal's cost, sale, payment and acquisition data is held in, in one pass. */
export async function collectCurrencies(db: Db, dealId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ currency: string | null }[]>`
    WITH ds AS (
      SELECT "roughStoneId" AS rid, "gemstoneId" AS gid, "acquisitionCurrency" AS acur
      FROM "PartnerDealStone" WHERE "dealId" = ${dealId} AND "removedAt" IS NULL
    ), roughs AS (
      SELECT rid AS id FROM ds WHERE rid IS NOT NULL
    ), derived AS (
      SELECT DISTINCT o."gemstoneId" AS id
      FROM "TransformationInput" i JOIN "TransformationOutput" o ON o."transformationId" = i."transformationId"
      WHERE i."roughStoneId" IN (SELECT id FROM roughs)
    ), gems AS (
      SELECT gid AS id FROM ds WHERE gid IS NOT NULL UNION SELECT id FROM derived
    )
    SELECT "currency" AS currency FROM "PartnerDeal" WHERE "id" = ${dealId}
    UNION SELECT acur FROM ds WHERE acur IS NOT NULL
    UNION SELECT "currency" FROM "RoughStone" WHERE "id" IN (SELECT id FROM roughs)
    UNION SELECT p."currency" FROM "Parcel" p
      WHERE p."id" IN (SELECT "parcelId" FROM "RoughStone" WHERE "id" IN (SELECT id FROM roughs) AND "parcelId" IS NOT NULL)
    UNION SELECT "currency" FROM "CostAllocation"
      WHERE "roughStoneId" IN (SELECT id FROM roughs) OR "gemstoneId" IN (SELECT id FROM gems)
    UNION SELECT "currency" FROM "Gemstone" WHERE "id" IN (SELECT id FROM gems)
    UNION SELECT "currency" FROM "SalesOrder" WHERE "gemstoneId" IN (SELECT id FROM gems)
    UNION SELECT pay."currency" FROM "Payment" pay JOIN "SalesOrder" so ON so."id" = pay."salesOrderId"
      WHERE so."gemstoneId" IN (SELECT id FROM gems)
    UNION SELECT "currency" FROM "Reservation" WHERE "gemstoneId" IN (SELECT id FROM gems) AND "deposit" > 0
  `;
  return uniq(rows.map((r) => r.currency).filter((c): c is string => typeof c === "string" && c !== "")).sort();
}

// ---------------------------------------------------------------------------
// Footprints and overlap with other deals (shared with partner-queries.ts)
// ---------------------------------------------------------------------------

/** The gems each rough was cut into (depth is exactly one: only roughs are transformation inputs). */
export async function derivedGemIdsByRough(db: Db, roughIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (roughIds.length === 0) return out;
  const rows = await db.transformationInput.findMany({
    where: { roughStoneId: { in: roughIds } },
    select: { roughStoneId: true, transformation: { select: { outputs: { select: { gemstoneId: true } } } } },
  });
  for (const r of rows) {
    const list = out.get(r.roughStoneId) ?? [];
    for (const o of r.transformation.outputs) if (!list.includes(o.gemstoneId)) list.push(o.gemstoneId);
    out.set(r.roughStoneId, list);
  }
  return out;
}

/** A stone's footprint keys: a rough is itself plus its derived gems, a gem is itself. */
export async function footprintKeys(db: Db, stones: { kind: StoneKind; id: string }[]): Promise<Set<string>> {
  const keys = new Set<string>();
  const roughIds: string[] = [];
  for (const s of stones) {
    keys.add(unitKeyOf(s.kind, s.id));
    if (s.kind === "ROUGH") roughIds.push(s.id);
  }
  for (const gems of (await derivedGemIdsByRough(db, uniq(roughIds))).values()) {
    for (const g of gems) keys.add(unitKeyOf("GEM", g));
  }
  return keys;
}

export interface OverlappingDeal {
  dealId: string;
  code: string;
  status: string;
  method: string;
  ratePct: string | null;
  currency: string;
  partnerId: string;
  partnerName: string;
  /** Footprint keys this deal shares with the queried footprint. */
  overlap: string[];
}

/** Other deals (by status) whose deal stones share a footprint key with `keys`. */
export async function findOverlappingDeals(
  db: Db,
  a: { excludeDealId?: string; keys: ReadonlySet<string>; statuses: readonly string[] },
): Promise<OverlappingDeal[]> {
  const roughIds: string[] = [];
  const gemIds: string[] = [];
  for (const k of a.keys) (k.startsWith("R:") ? roughIds : gemIds).push(k.slice(2));
  if (roughIds.length + gemIds.length === 0) return [];
  // A deal on a parent rough covers its gems, so the queried gems' parents are candidates too.
  const parents = gemIds.length
    ? await db.transformationOutput.findMany({
        where: { gemstoneId: { in: gemIds } },
        select: { transformation: { select: { inputs: { select: { roughStoneId: true } } } } },
      })
    : [];
  const parentIds = uniq(parents.flatMap((p) => p.transformation.inputs.map((i) => i.roughStoneId)));
  const candidates = await db.partnerDealStone.findMany({
    where: {
      removedAt: null,
      ...(a.excludeDealId ? { dealId: { not: a.excludeDealId } } : {}),
      deal: { status: { in: [...a.statuses] } },
      OR: [{ roughStoneId: { in: uniq([...roughIds, ...parentIds]) } }, { gemstoneId: { in: gemIds } }],
    },
    select: {
      roughStoneId: true,
      gemstoneId: true,
      deal: {
        select: {
          id: true, code: true, status: true, method: true, ratePct: true, currency: true, partnerId: true,
          partner: { select: { name: true } },
        },
      },
    },
  });
  const candidateRoughs = uniq(candidates.map((c) => c.roughStoneId).filter((x): x is string => x !== null));
  const derived = await derivedGemIdsByRough(db, candidateRoughs);
  const byDeal = new Map<string, OverlappingDeal>();
  for (const c of candidates) {
    const fp: string[] = [];
    if (c.roughStoneId) {
      fp.push(unitKeyOf("ROUGH", c.roughStoneId));
      for (const g of derived.get(c.roughStoneId) ?? []) fp.push(unitKeyOf("GEM", g));
    }
    if (c.gemstoneId) fp.push(unitKeyOf("GEM", c.gemstoneId));
    const shared = fp.filter((k) => a.keys.has(k));
    if (shared.length === 0) continue;
    const row = byDeal.get(c.deal.id) ?? {
      dealId: c.deal.id,
      code: c.deal.code,
      status: c.deal.status,
      method: c.deal.method,
      ratePct: c.deal.ratePct === null ? null : c.deal.ratePct.toString(),
      currency: c.deal.currency,
      partnerId: c.deal.partnerId,
      partnerName: c.deal.partner.name,
      overlap: [],
    };
    row.overlap = uniq([...row.overlap, ...shared]).sort();
    byDeal.set(c.deal.id, row);
  }
  return [...byDeal.values()].sort((x, y) => x.code.localeCompare(y.code));
}

export interface CapOwn { partnerId: string; method: string; rateBp: number | null }
export interface CapOther { code: string; partnerId: string; method: string; rateBp: number | null; overlap: readonly string[] }

const pctText = (bp: number): string => (bp / 100).toFixed(2).replace(/\.00$/, "");
const family = (method: string): "PROFIT" | "REVENUE" | null =>
  method === "PROFIT_SHARE" || method === "INVESTMENT" ? "PROFIT" : method === "SALE_COMMISSION" ? "REVENUE" : null;

/** Per footprint key: profit-style rates (M1 + M4) and commission rates (M2) of every open deal covering it, plus same-partner duplicates. */
export function evaluateCaps(
  own: CapOwn,
  footprint: Iterable<string>,
  others: readonly CapOther[],
  label: (key: string) => string,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const groups = new Map<string, { keys: string[]; profit: number; revenue: number; covering: CapOther[] }>();
  const ownFamily = family(own.method);
  for (const key of footprint) {
    const covering = others.filter((o) => o.overlap.includes(key));
    if (covering.length === 0) continue;
    const sum = (fam: "PROFIT" | "REVENUE") =>
      (ownFamily === fam ? own.rateBp ?? 0 : 0) +
      covering.reduce((s, o) => s + (family(o.method) === fam ? o.rateBp ?? 0 : 0), 0);
    const profit = sum("PROFIT");
    const revenue = sum("REVENUE");
    const sig = `${profit}|${revenue}|${covering.map((c) => c.code).sort().join(",")}`;
    const g = groups.get(sig) ?? { keys: [], profit, revenue, covering };
    g.keys.push(key);
    groups.set(sig, g);
  }
  for (const g of groups.values()) {
    const first = label(g.keys[0]);
    const where = g.keys.length > 1 ? `${first} and ${g.keys.length - 1} more` : first;
    const others_ = g.covering.map((c) => `${c.code}${c.rateBp ? ` ${pctText(c.rateBp)}%` : ""}`).join(", ");
    if (g.profit > 10000) {
      errors.push(`${where}: profit-share and investment rates add up to ${pctText(g.profit)}% (limit 100%) with ${others_}.`);
    } else if (g.profit > 9000) {
      warnings.push(`${where}: profit-share and investment rates add up to ${pctText(g.profit)}%, above the 90% company floor (${others_}).`);
    } else if (g.profit > 5000) {
      warnings.push(`${where}: profit-share and investment rates add up to ${pctText(g.profit)}% (${others_}).`);
    }
    if (g.revenue > 10000) {
      errors.push(`${where}: commission rates add up to ${pctText(g.revenue)}% of revenue (limit 100%) with ${others_}.`);
    } else if (g.revenue > 2500) {
      warnings.push(`${where}: commission rates add up to ${pctText(g.revenue)}% of revenue (${others_}).`);
    }
    for (const c of g.covering) {
      if (c.partnerId === own.partnerId) {
        errors.push(`${where}: this partner already has the open deal ${c.code} on the same stone.`);
      }
    }
  }
  return { errors: uniq(errors), warnings: uniq(warnings) };
}

// ---------------------------------------------------------------------------
// Flag collection
// ---------------------------------------------------------------------------

const BLOCK_CODES: ReadonlySet<FlagCode> = new Set<FlagCode>([
  "DUPLICATE_UNIT", "OVERLAP_ROUGH_GEM", "MULTIPLE_LIVE_SALES", "APPROX_RATES_USED", "CO_PARTNER_CAP_EXCEEDED",
  "CO_PARTNER_TOTAL_EXCEEDS_REVENUE", "INVESTED_MISMATCH", "INVESTED_EXCEEDS_BASIS", "ALLOCATION_INCOMPLETE", "NEGATIVE_AMOUNT",
]);
const ACK_CODES: ReadonlySet<FlagCode> = new Set<FlagCode>([
  "NEEDS_RATE_COST", "NEEDS_RATE_SALE", "NEEDS_RATE_PAYMENT", "COST_MISSING", "ZERO_PRICE_SALE", "ROUGH_SOLD_NO_PROCEEDS",
  "MULTIPLE_CUTS", "REJECTED_BILL_IN_CUT", "COST_DRIFT", "PURCHASE_DRIFT", "PARCEL_DRIFT", "STATUS_MISMATCH",
  "DEPOSIT_NOT_RECORDED", "UNKNOWN_COST_TYPE", "WEIGHT_CHANGED", "LATE_BILL_UNALLOCATED", "NEGATIVE_COST_LINE",
  "POSSIBLE_PARTNER_PAYOUT_BILL", "FEE_EXCEEDS_REVENUE", "COST_BASIS_DIVERGES_ACROSS_DEALS",
]);
/** Flags about cost data only: informational when the method never reads a cost (the spec does this for NEEDS_RATE_COST). */
const COST_ONLY_CODES: ReadonlySet<FlagCode> = new Set<FlagCode>([
  "NEEDS_RATE_COST", "COST_MISSING", "NEGATIVE_COST_LINE", "COST_DRIFT", "PURCHASE_DRIFT", "PARCEL_DRIFT",
  "LATE_BILL_UNALLOCATED", "REJECTED_BILL_IN_CUT", "UNKNOWN_COST_TYPE", "POSSIBLE_PARTNER_PAYOUT_BILL",
]);

function severityOf(code: FlagCode, method: string): Severity {
  if (BLOCK_CODES.has(code)) return "BLOCK";
  if (code === "STONE_ALREADY_SOLD") return method === "INVESTMENT" ? "BLOCK" : "ACK";
  if (ACK_CODES.has(code)) return !usesCost(method) && COST_ONLY_CODES.has(code) ? "INFO" : "ACK";
  return "INFO";
}

const SEVERITY_RANK: Record<Severity, number> = { BLOCK: 0, ACK: 1, INFO: 2 };

class FlagSink {
  private readonly list: GatherFlag[] = [];
  private readonly seen = new Set<string>();
  constructor(private readonly method: string) {}

  add(code: FlagCode, detail: string, where: { unitKey?: string; bucketKey?: string } = {}): void {
    const key = `${code}|${where.unitKey ?? ""}|${where.bucketKey ?? ""}|${detail}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const flag: GatherFlag = { code, severity: severityOf(code, this.method), detail };
    if (where.unitKey) flag.unitKey = where.unitKey;
    if (where.bucketKey) flag.bucketKey = where.bucketKey;
    this.list.push(flag);
  }

  sorted(): GatherFlag[] {
    const cmp = (a: string | undefined, b: string | undefined) => (a ?? "").localeCompare(b ?? "");
    return [...this.list].sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        cmp(a.code, b.code) || cmp(a.unitKey, b.unitKey) || cmp(a.bucketKey, b.bucketKey) || cmp(a.detail, b.detail),
    );
  }
}

// ---------------------------------------------------------------------------
// Sale and realisation fraction of one unit (pure; exported so every branch can be tested without a database)
// ---------------------------------------------------------------------------

export interface SaleOrderRow {
  id: string;
  status: string;
  saleDate: Date;
  createdAt: Date;
  agreedPrice: Num;
  totalAmount: Num;
  currency: string;
  payments: { id: string; amount: Num; currency: string; orderCurrencyAmount: Num | null; receivedAt: Date }[];
}
export interface SaleEvalArgs {
  /** Live-status orders of the gem. */
  orders: readonly SaleOrderRow[];
  earnOn: string;
  asOf: Date;
  countSalesFrom: Date | null;
  addedAt: Date;
  dealCurrency: string;
  conv: (amount: Minor, from: string, to: string) => Minor | null;
  lack: (from: string, to: string) => string;
}
export interface SaleEval {
  sale: SaleInput | null;
  flags: { code: FlagCode; detail: string }[];
  order: EvidenceOrder | null;
  ignoredOrders: EvidenceIgnoredOrder[];
  ignoredPaymentIds: string[];
  /** The live order that was counted (or would have been, were the sale not unusable). */
  counted: SaleOrderRow | null;
}

export function evaluateSale(a: SaleEvalArgs): SaleEval {
  const flags: SaleEval["flags"] = [];
  const ignoredOrders: EvidenceIgnoredOrder[] = [];
  const ignoredPaymentIds: string[] = [];
  const empty: SaleEval = { sale: null, flags, order: null, ignoredOrders, ignoredPaymentIds, counted: null };

  const candidates: SaleOrderRow[] = [];
  const sorted = [...a.orders].sort((x, y) => x.saleDate.getTime() - y.saleDate.getTime() || x.id.localeCompare(y.id));
  for (const o of sorted) {
    if (o.saleDate.getTime() > a.asOf.getTime()) {
      flags.push({ code: "FUTURE_SALE", detail: "sale dated after the calculation date is ignored" });
      ignoredOrders.push({ id: o.id, status: o.status, reason: "AFTER_AS_OF" });
    } else if (a.countSalesFrom && o.saleDate.getTime() < a.countSalesFrom.getTime()) {
      flags.push({ code: "PRE_DEAL_SALE_IGNORED", detail: "sale dated before the count-from date is ignored" });
      ignoredOrders.push({ id: o.id, status: o.status, reason: "BEFORE_COUNT_FROM" });
    } else {
      candidates.push(o);
    }
  }
  if (!a.countSalesFrom) {
    for (const c of candidates) {
      if (c.saleDate.getTime() < a.addedAt.getTime() || c.createdAt.getTime() < a.addedAt.getTime()) {
        flags.push({ code: "STONE_ALREADY_SOLD", detail: "the stone was sold before it joined the deal and no count-from date is set" });
      }
    }
  }
  if (candidates.length > 1) {
    flags.push({ code: "MULTIPLE_LIVE_SALES", detail: `${candidates.length} live sales on one stone` });
    for (const c of candidates) ignoredOrders.push({ id: c.id, status: c.status, reason: "MULTIPLE_LIVE" });
    return empty;
  }
  if (candidates.length === 0) return empty;

  const o = candidates[0];
  empty.counted = o;
  const agreed = safeMinor(o.agreedPrice);
  const total = safeMinor(o.totalAmount);
  if (agreed === null || total === null) {
    flags.push({ code: "NEGATIVE_AMOUNT", detail: "sale amount is not representable" });
    return empty;
  }
  if (agreed < 0) flags.push({ code: "NEGATIVE_AMOUNT", detail: "negative sale price" });
  if (agreed === 0) flags.push({ code: "ZERO_PRICE_SALE", detail: "sale price is zero" });
  const price = a.conv(agreed, o.currency, a.dealCurrency);
  if (price === null) flags.push({ code: "NEEDS_RATE_SALE", detail: `no rate for ${a.lack(o.currency, a.dealCurrency)}` });

  let num: number | null = 1;
  let den = 1;
  const paymentsEvidence: EvidencePayment[] = [];
  if (a.earnOn === "PAYMENT") {
    den = total > 0 ? total : agreed;
    // Nothing to collect: a zero price is already flagged above and a negative one as NEGATIVE_AMOUNT.
    if (den <= 0) return empty;
    let paid = 0;
    let bad = false;
    const payments = [...o.payments].sort((x, y) => x.receivedAt.getTime() - y.receivedAt.getTime() || x.id.localeCompare(y.id));
    for (const p of payments) {
      if (p.receivedAt.getTime() > a.asOf.getTime()) {
        ignoredPaymentIds.push(p.id);
        continue;
      }
      const original = safeMinor(p.amount);
      const stored = p.orderCurrencyAmount === null ? null : safeMinor(p.orderCurrencyAmount);
      // The amount stored at receipt time wins; legacy rows convert at the deal's rate.
      const v = p.orderCurrencyAmount !== null ? stored : original === null ? null : a.conv(original, p.currency, o.currency);
      paymentsEvidence.push({ id: p.id, receivedAt: iso(p.receivedAt), amountOriginalMinor: original, currency: p.currency, convertedMinor: v });
      if (v === null) {
        bad = true;
        flags.push({ code: "NEEDS_RATE_PAYMENT", detail: `no rate for ${a.lack(p.currency, o.currency)}` });
        continue;
      }
      paid += v;
    }
    if (bad) num = null;
    else {
      if (paid > den) flags.push({ code: "OVERPAID", detail: "payments exceed the sale total" });
      num = Math.max(0, Math.min(paid, den));
    }
  } else {
    for (const p of o.payments) {
      if (p.receivedAt.getTime() > a.asOf.getTime()) ignoredPaymentIds.push(p.id);
    }
  }

  empty.order = {
    id: o.id,
    status: o.status,
    saleDate: iso(o.saleDate),
    priceOriginalMinor: agreed,
    currency: o.currency,
    totalMinor: total,
    priceConvertedMinor: price,
    payments: paymentsEvidence,
  };
  empty.sale = { orderId: o.id, priceMinor: price, fracNum: num, fracDen: den };
  return empty;
}

// ---------------------------------------------------------------------------
// Internal models
// ---------------------------------------------------------------------------

interface LineRow {
  id: string;
  type: string;
  amount: Minor | null;
  currency: string;
  createdAt: Date;
  expenseRejected: boolean;
  sourceId: string | null;
  suspect: boolean;
}

interface RawLine {
  id: string;
  type: string;
  amount: Num;
  currency: string;
  description: string | null;
  createdAt: Date;
  sourceAllocationId?: string | null;
  expense: { status: string } | null;
}

/** Maps a stored line and drops its free text immediately; only the yes/no heuristic survives. */
function toLine(r: RawLine, partnerNames: readonly string[]): LineRow {
  return {
    id: r.id,
    type: r.type,
    amount: safeMinor(r.amount),
    currency: r.currency,
    createdAt: r.createdAt,
    expenseRejected: r.expense?.status === "REJECTED",
    sourceId: r.sourceAllocationId ?? null,
    suspect: looksLikePartnerPayout(r.description, partnerNames),
  };
}

const byCreated = (a: LineRow, b: LineRow): number => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

interface RichUnit {
  key: string;
  kind: StoneKind;
  id: string;
  code: string;
  status: string;
  dsId: string;
  origin: "DIRECT" | "DERIVED" | "ROUGH";
  weightMilli: number;
  outputMilli: number | null;
  gemCurrency: string | null;
  storedTotal: Minor | null;
  lines: LineRow[];
  // results
  costMinor: Minor | null;
  basisMinor: Minor | null;
  lateShare: Minor;
  costLines: EvidenceCostLine[];
  sale: SaleInput | null;
  priceMinor: Minor | null;
  order: EvidenceOrder | null;
  ignoredOrders: EvidenceIgnoredOrder[];
  ignoredPaymentIds: string[];
}

interface DsModel {
  id: string;
  kind: StoneKind;
  stoneId: string;
  code: string;
  status: string;
  addedAt: Date;
  frozenMilli: number;
  currentMilli: number;
  acquisitionOverride: Num | null;
  acquisitionCurrency: string | null;
  investedAlloc: Num | null;
  countSalesFrom: Date | null;
  writtenOff: boolean;
  parcelId: string | null;
  purchasePrice: Num | null;
  roughCurrency: string | null;
  purchaseDate: Date | null;
  roughLines: LineRow[];
  cutCount: number;
  cutAt: Date | null;
  units: RichUnit[];
  overrideMinor: Minor | null;
  lateRoughLines: EvidenceCostLine[];
  lateShares: { unitKey: string; minor: Minor }[];
  roughLineEvidence: EvidenceCostLine[];
}

interface DerivedGem {
  id: string;
  code: string;
  status: string;
  weightMilli: number;
  currency: string;
  storedTotal: Minor | null;
  outputMilli: number;
}

function termsOf(deal: {
  code: string; method: string; scope: string; ratePct: Num | null; fixedFee: Num | null; invested: Num | null; capitalProtected: boolean;
}): Terms {
  const scope = deal.scope;
  if (scope !== "PER_STONE" && scope !== "POOLED") throw new PartnerGatherError(`Deal ${deal.code} has an unknown scope.`);
  const rate = (): number => {
    if (deal.ratePct === null) throw new PartnerGatherError(`Deal ${deal.code} has no percentage rate yet.`);
    try {
      return bpFromPct(deal.ratePct.toString());
    } catch {
      throw new PartnerGatherError(`Deal ${deal.code} has an invalid percentage rate.`);
    }
  };
  const money = (v: Num | null, what: string): Minor => {
    const m = safeMinor(v);
    if (m === null || m <= 0) throw new PartnerGatherError(`Deal ${deal.code} has no valid ${what}.`);
    return m;
  };
  switch (deal.method) {
    case "PROFIT_SHARE": return { method: "PROFIT_SHARE", scope, rateBp: rate() };
    case "SALE_COMMISSION": return { method: "SALE_COMMISSION", scope, rateBp: rate() };
    case "FIXED_FEE": return { method: "FIXED_FEE", scope, feeMinor: money(deal.fixedFee, "fixed fee") };
    case "INVESTMENT":
      return { method: "INVESTMENT", scope, rateBp: rate(), investedMinor: money(deal.invested, "invested amount"), capitalProtected: deal.capitalProtected };
    default:
      throw new PartnerGatherError(`Deal ${deal.code} has an unknown payout method.`);
  }
}

function unknownEarnOn(code: string): never {
  throw new PartnerGatherError(`Deal ${code} has an unknown earn-on setting.`);
}

function parseExcluded(json: string): Set<string> {
  try {
    const v: unknown = JSON.parse(json);
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return new Set(v as string[]);
  } catch {
    // fall through to the default
  }
  return new Set(DEFAULT_EXCLUDED_TYPES);
}

// ---------------------------------------------------------------------------
// The gatherer
// ---------------------------------------------------------------------------

/** `crossDeal: false` skips the comparison with other open deals on the same stones (caps, diverging cost); amounts are unaffected. */
export async function gatherDeal(
  db: Db,
  dealId: string,
  opts: { asOf: Date; rates: RateMap; crossDeal?: boolean },
): Promise<GatherResult> {
  return gatherCore(db, dealId, opts, opts.crossDeal !== false);
}

async function gatherCore(
  db: Db,
  dealId: string,
  opts: { asOf: Date; rates: RateMap },
  crossDeal: boolean,
): Promise<GatherResult> {
  const { asOf, rates } = opts;
  const micro = microFromRates(rates);

  // 1. deal and live deal stones
  const deal = await db.partnerDeal.findUniqueOrThrow({
    where: { id: dealId },
    select: {
      id: true, code: true, status: true, method: true, scope: true, earnOn: true, currency: true, ratePct: true, fixedFee: true,
      invested: true, capitalProtected: true, poolAcquisitionCost: true, excludedCostTypes: true, formulaVersion: true, partnerId: true,
    },
  });
  if (!Object.prototype.hasOwnProperty.call(ENGINES, deal.formulaVersion)) {
    throw new PartnerGatherError(`Deal ${deal.code} is pinned to unknown formula version ${deal.formulaVersion}.`);
  }
  const earnOn: EarnOn = deal.earnOn === "SALE" ? "SALE" : deal.earnOn === "PAYMENT" ? "PAYMENT" : unknownEarnOn(deal.code);
  const terms = termsOf(deal);
  const excluded = parseExcluded(deal.excludedCostTypes);
  const flags = new FlagSink(deal.method);

  // Conversions: integer only, never throw, remember which rates were really used.
  const usedCurrencies = new Set<string>();
  const lack = (from: string, to: string): string => {
    const missing = [from, to].filter((c) => c !== "LKR" && micro[c] === undefined);
    return missing.length ? missing.join("/") : `${from}/${to}`;
  };
  const conv = (amount: Minor, from: string, to: string): Minor | null => {
    if (from === to) return amount;
    try {
      const v = convertMinor(amount, from, to, micro);
      if (v !== null) for (const c of [from, to]) if (c !== "LKR") usedCurrencies.add(c);
      return v;
    } catch {
      flags.add("NEGATIVE_AMOUNT", `converted amount from ${from} is out of range`);
      return null;
    }
  };
  // For consistency checks only: does not record the rate as used and never raises a flag.
  const convQuiet = (amount: Minor, from: string, to: string): Minor | null => {
    if (from === to) return amount;
    try {
      return convertMinor(amount, from, to, micro);
    } catch {
      return null;
    }
  };

  const [partnerRows, dsRows] = await Promise.all([
    db.partner.findMany({ select: { name: true, company: true }, take: 500 }),
    db.partnerDealStone.findMany({
      where: { dealId, removedAt: null },
      orderBy: [{ addedAt: "asc" }, { id: "asc" }],
      select: {
        id: true, roughStoneId: true, gemstoneId: true, weightMilli: true, acquisitionOverride: true, acquisitionCurrency: true,
        investedAlloc: true, countSalesFrom: true, writtenOffAt: true, addedAt: true,
        roughStone: {
          select: {
            id: true, code: true, status: true, weightCt: true, purchasePrice: true, currency: true, parcelId: true, purchaseDate: true,
            costAllocations: { select: { id: true, type: true, amount: true, currency: true, description: true, createdAt: true, expense: { select: { status: true } } } },
            transformationsAsInput: { select: { transformation: { select: { id: true, createdAt: true } } } },
          },
        },
        gemstone: { select: { id: true, code: true, status: true, weightCt: true, currency: true, totalCost: true } },
      },
    }),
  ]);
  const partnerNames = uniq(partnerRows.flatMap((p) => [p.name, p.company ?? ""]).filter((n) => n.trim() !== ""));

  const dsModels: DsModel[] = dsRows.map((r) => {
    const rough = r.roughStone;
    const gem = r.gemstone;
    const kind: StoneKind = rough ? "ROUGH" : "GEM";
    const cuts = rough ? rough.transformationsAsInput.map((t) => t.transformation) : [];
    return {
      id: r.id,
      kind,
      stoneId: (rough ?? gem)!.id,
      code: (rough ?? gem)!.code,
      status: (rough ?? gem)!.status,
      addedAt: r.addedAt,
      frozenMilli: Math.max(0, r.weightMilli),
      currentMilli: weightMilliOf((rough ?? gem)!.weightCt),
      acquisitionOverride: r.acquisitionOverride,
      acquisitionCurrency: r.acquisitionCurrency,
      investedAlloc: r.investedAlloc,
      countSalesFrom: r.countSalesFrom,
      writtenOff: r.writtenOffAt !== null,
      parcelId: rough?.parcelId ?? null,
      purchasePrice: rough?.purchasePrice ?? null,
      roughCurrency: rough?.currency ?? null,
      purchaseDate: rough?.purchaseDate ?? null,
      roughLines: rough ? rough.costAllocations.map((l) => toLine(l, partnerNames)).sort(byCreated) : [],
      cutCount: cuts.length,
      cutAt: cuts.length ? new Date(Math.min(...cuts.map((c) => c.createdAt.getTime()))) : null,
      units: [],
      overrideMinor: null,
      lateRoughLines: [],
      lateShares: [],
      roughLineEvidence: [],
    };
  });
  const bucketOf = (ds: DsModel): string => bucketKeyOf(deal.scope, ds.id);

  // 2. derived gems of the deal roughs (depth is exactly one)
  const cutRoughIds = dsModels.filter((d) => d.kind === "ROUGH" && d.cutCount > 0).map((d) => d.stoneId);
  const derivedRows = cutRoughIds.length
    ? await db.gemstone.findMany({
        where: { transformationsAsOutput: { some: { transformation: { inputs: { some: { roughStoneId: { in: cutRoughIds } } } } } } },
        select: {
          id: true, code: true, status: true, weightCt: true, currency: true, totalCost: true,
          transformationsAsOutput: {
            select: { outputWeightCt: true, transformation: { select: { id: true, inputs: { select: { roughStoneId: true } } } } },
          },
        },
      })
    : [];
  const derivedByRough = new Map<string, DerivedGem[]>();
  for (const g of derivedRows) {
    for (const out of g.transformationsAsOutput) {
      for (const input of out.transformation.inputs) {
        if (!cutRoughIds.includes(input.roughStoneId)) continue;
        const list = derivedByRough.get(input.roughStoneId) ?? [];
        if (list.some((x) => x.id === g.id)) continue;
        list.push({
          id: g.id, code: g.code, status: g.status, weightMilli: weightMilliOf(g.weightCt), currency: g.currency,
          storedTotal: safeMinor(g.totalCost), outputMilli: weightMilliOf(out.outputWeightCt),
        });
        derivedByRough.set(input.roughStoneId, list);
      }
    }
  }
  for (const list of derivedByRough.values()) list.sort((a, b) => a.code.localeCompare(b.code));

  // 3. units: gem -> that gem; uncut rough -> the rough; cut rough -> its derived gems
  const seenUnit = new Map<string, { origin: RichUnit["origin"]; ds: DsModel }>();
  const newUnit = (p: Pick<RichUnit, "key" | "kind" | "id" | "code" | "status" | "origin" | "weightMilli" | "outputMilli" | "gemCurrency" | "storedTotal"> & { dsId: string }): RichUnit => ({
    ...p, lines: [], costMinor: null, basisMinor: null, lateShare: 0, costLines: [], sale: null, priceMinor: null, order: null,
    ignoredOrders: [], ignoredPaymentIds: [],
  });
  const place = (ds: DsModel, u: RichUnit): void => {
    const prev = seenUnit.get(u.key);
    if (prev) {
      const code = (prev.origin === "DIRECT") !== (u.origin === "DIRECT") && prev.origin !== "ROUGH" && u.origin !== "ROUGH" ? "OVERLAP_ROUGH_GEM" : "DUPLICATE_UNIT";
      flags.add(code, `${u.code} is counted under ${prev.ds.code} and ${ds.code}`, { unitKey: u.key, bucketKey: bucketOf(ds) });
      return;
    }
    seenUnit.set(u.key, { origin: u.origin, ds });
    ds.units.push(u);
  };
  const gemOfDs = new Map(dsRows.map((r) => [r.id, r.gemstone] as const));
  for (const ds of dsModels) {
    if (ds.kind === "GEM") {
      const g = gemOfDs.get(ds.id)!;
      place(ds, newUnit({
        key: unitKeyOf("GEM", g.id), kind: "GEM", id: g.id, code: g.code, status: g.status, origin: "DIRECT", dsId: ds.id,
        weightMilli: weightMilliOf(g.weightCt), outputMilli: null, gemCurrency: g.currency, storedTotal: safeMinor(g.totalCost),
      }));
      continue;
    }
    const derived = derivedByRough.get(ds.stoneId) ?? [];
    if (ds.cutCount === 0 && derived.length === 0) {
      const price = ds.purchasePrice;
      const u = newUnit({
        key: unitKeyOf("ROUGH", ds.stoneId), kind: "ROUGH", id: ds.stoneId, code: ds.code, status: ds.status, origin: "ROUGH", dsId: ds.id,
        weightMilli: ds.currentMilli, outputMilli: null, gemCurrency: null, storedTotal: null,
      });
      // The rough's price behaves like a ROUGH_PURCHASE line so overrides and exclusions treat it the same way.
      u.lines = [
        ...ds.roughLines,
        {
          id: `purchase:${ds.stoneId}`, type: "ROUGH_PURCHASE", amount: safeMinor(price), currency: ds.roughCurrency ?? deal.currency,
          createdAt: ds.purchaseDate ?? new Date(0), expenseRejected: false, sourceId: null, suspect: false,
        },
      ];
      place(ds, u);
      continue;
    }
    for (const g of derived) {
      place(ds, newUnit({
        key: unitKeyOf("GEM", g.id), kind: "GEM", id: g.id, code: g.code, status: g.status, origin: "DERIVED", dsId: ds.id,
        weightMilli: g.weightMilli, outputMilli: g.outputMilli, gemCurrency: g.currency, storedTotal: g.storedTotal,
      }));
    }
  }
  const allUnits = dsModels.flatMap((d) => d.units);
  const gemUnits = allUnits.filter((u) => u.kind === "GEM");

  // 4. cost lines of every gem unit, and the bills they were copied from
  const gemLineRows = gemUnits.length
    ? await db.costAllocation.findMany({
        where: { gemstoneId: { in: gemUnits.map((u) => u.id) } },
        select: { id: true, gemstoneId: true, type: true, amount: true, currency: true, description: true, createdAt: true, sourceAllocationId: true, expense: { select: { status: true } } },
      })
    : [];
  for (const u of gemUnits) {
    u.lines = gemLineRows.filter((l) => l.gemstoneId === u.id).map((l) => toLine(l, partnerNames)).sort(byCreated);
  }
  // A cut gem may hold lines of derived gems that were deduplicated away: PURCHASE_DRIFT needs every derived gem's lines.
  const derivedIds = uniq([...derivedByRough.values()].flatMap((l) => l.map((g) => g.id)));
  const extraDerived = derivedIds.filter((id) => !gemUnits.some((u) => u.id === id));
  const extraLineRows = extraDerived.length
    ? await db.costAllocation.findMany({
        where: { gemstoneId: { in: extraDerived } },
        select: { id: true, gemstoneId: true, type: true, amount: true, currency: true, description: true, createdAt: true, sourceAllocationId: true, expense: { select: { status: true } } },
      })
    : [];
  const linesOfGem = (gemId: string): LineRow[] =>
    (gemUnits.find((u) => u.id === gemId)?.lines ?? extraLineRows.filter((l) => l.gemstoneId === gemId).map((l) => toLine(l, partnerNames))).slice();

  const sourceIds = uniq([...gemLineRows, ...extraLineRows].map((l) => l.sourceAllocationId).filter((x): x is string => !!x));
  const sourceRows = sourceIds.length
    ? await db.costAllocation.findMany({ where: { id: { in: sourceIds } }, select: { id: true, expense: { select: { status: true } } } })
    : [];
  const rejectedSources = new Set(sourceRows.filter((s) => s.expense?.status === "REJECTED").map((s) => s.id));
  const pointedAt = new Set(sourceIds);

  type LineEval = { st: "OK" | "REJECTED" | "EXCLUDED_TYPE" | "OVERRIDDEN" | "NEEDS_RATE" | "BAD"; minor: Minor | null; lack: string };
  const evalLine = (l: LineRow, overridden: boolean): LineEval => {
    if (l.expenseRejected || (l.sourceId !== null && rejectedSources.has(l.sourceId))) return { st: "REJECTED", minor: null, lack: "" };
    if (excluded.has(l.type)) return { st: "EXCLUDED_TYPE", minor: null, lack: "" };
    if (overridden && l.type === "ROUGH_PURCHASE") return { st: "OVERRIDDEN", minor: null, lack: "" };
    if (l.amount === null) return { st: "BAD", minor: null, lack: "" };
    const c = conv(l.amount, l.currency, deal.currency);
    return c === null ? { st: "NEEDS_RATE", minor: null, lack: lack(l.currency, deal.currency) } : { st: "OK", minor: c, lack: "" };
  };
  const lineEvidence = (l: LineRow, e: LineEval, extra?: EvidenceCostLine["excluded"]): EvidenceCostLine => {
    const out: EvidenceCostLine = {
      id: l.id, type: l.type, amountOriginalMinor: l.amount, currency: l.currency,
      convertedMinor: e.st === "OK" ? e.minor : l.amount !== null && l.currency === deal.currency ? l.amount : null,
      createdAt: iso(l.createdAt),
    };
    const reason = extra ?? (e.st === "REJECTED" || e.st === "EXCLUDED_TYPE" || e.st === "OVERRIDDEN" ? e.st : undefined);
    if (reason) out.excluded = reason;
    return out;
  };

  // 5. per deal stone: acquisition override, late rough bills, cost of each unit
  for (const ds of dsModels) {
    const bucketKey = bucketOf(ds);
    const dsCode = ds.code;
    if (ds.acquisitionOverride !== null) {
      const raw = safeMinor(ds.acquisitionOverride);
      if (raw === null) {
        flags.add("NEGATIVE_AMOUNT", `acquisition override of ${dsCode} is not representable`, { bucketKey });
      } else {
        ds.overrideMinor = conv(raw, ds.acquisitionCurrency ?? deal.currency, deal.currency);
      }
      flags.add("ACQUISITION_OVERRIDDEN", `acquisition cost of ${dsCode} was set by the allocator`, { bucketKey });
      if (ds.units.length === 0) flags.add("ALLOCATION_INCOMPLETE", `acquisition override of ${dsCode} has no stone to carry it`, { bucketKey });
    } else if (deal.scope === "POOLED" && deal.poolAcquisitionCost !== null) {
      flags.add("ALLOCATION_INCOMPLETE", `${dsCode} has no share of the pooled acquisition cost`, { bucketKey });
    }
    const hasOverride = ds.acquisitionOverride !== null;
    const unknownOverride = hasOverride && ds.overrideMinor === null;
    const allocW = (u: RichUnit): number => Math.max(0, u.outputMilli ?? u.weightMilli);
    const overrideShares: (Minor | null)[] =
      hasOverride && ds.overrideMinor !== null && ds.units.length > 0
        ? ds.units.length === 1 ? [ds.overrideMinor] : allocateMinor(ds.overrideMinor, ds.units.map(allocW))
        : ds.units.map(() => null);

    // Late bills filed on a cut rough: copies on the gems already count; undistributed ones are shared by output weight.
    let lateNeedsRate = false;
    let lateLack = "";
    const lateOk: { l: LineRow; minor: Minor }[] = [];
    if (ds.kind === "ROUGH" && ds.cutAt !== null) {
      for (const l of ds.roughLines) {
        const copied = pointedAt.has(l.id);
        if (l.createdAt.getTime() <= ds.cutAt.getTime()) {
          if (l.expenseRejected && !copied) {
            flags.add("REJECTED_BILL_IN_CUT", `a bill on ${dsCode} was rejected after the cut; its share on the gems cannot be traced`, { bucketKey, unitKey: unitKeyOf("ROUGH", ds.stoneId) });
          }
          ds.roughLineEvidence.push(lineEvidence(l, { st: "OK", minor: null, lack: "" }, "PRE_CUT"));
          continue;
        }
        if (copied) {
          ds.roughLineEvidence.push(lineEvidence(l, { st: "OK", minor: null, lack: "" }, "COPIED_TO_GEMS"));
          continue;
        }
        const e = evalLine(l, false);
        ds.lateRoughLines.push(lineEvidence(l, e));
        if (!KNOWN_COST_TYPES.has(l.type) && e.st !== "REJECTED") {
          flags.add("UNKNOWN_COST_TYPE", `late bill type ${l.type} on ${dsCode}`, { bucketKey });
        }
        if (e.st === "EXCLUDED_TYPE") flags.add("OVERHEAD_EXCLUDED", `a late bill on ${dsCode} is an overhead type`, { bucketKey });
        if (e.st === "NEEDS_RATE") {
          lateNeedsRate = true;
          lateLack = e.lack;
        }
        if (e.st === "BAD") flags.add("NEGATIVE_AMOUNT", `a late bill on ${dsCode} is not representable`, { bucketKey });
        if (e.st === "OK" && e.minor !== null) {
          lateOk.push({ l, minor: e.minor });
          if (e.minor < 0) flags.add("NEGATIVE_COST_LINE", `a late bill on ${dsCode} is a credit`, { bucketKey });
          if (l.suspect) flags.add("POSSIBLE_PARTNER_PAYOUT_BILL", `a late bill on ${dsCode} looks like a partner payout`, { bucketKey });
        }
      }
      if (lateOk.length > 0 || lateNeedsRate) {
        if (ds.units.length === 0) {
          flags.add("LATE_BILL_UNALLOCATED", `late bills on ${dsCode} have no gem to carry them`, { bucketKey, unitKey: unitKeyOf("ROUGH", ds.stoneId) });
        } else {
          flags.add("LATE_ROUGH_BILL_ALLOCATED", `late bills on ${dsCode} were shared over its gems by output weight`, { bucketKey });
          if (!lateNeedsRate) {
            const total = lateOk.reduce((s, x) => s + x.minor, 0);
            const shares = allocateMinor(total, ds.units.map(allocW));
            ds.units.forEach((u, i) => {
              u.lateShare = shares[i];
              ds.lateShares.push({ unitKey: u.key, minor: shares[i] });
            });
          }
        }
      }
    }

    ds.units.forEach((u, idx) => {
      const where = { unitKey: u.key, bucketKey };
      let basis = 0;
      let other = 0;
      let needsRate = lateNeedsRate && u.origin === "DERIVED";
      const missingCcy = new Set<string>(needsRate ? [lateLack] : []);
      let bad = false;
      let negativeLine = false;
      let excludedAny = false;
      let suspect = false;
      const unknownTypes = new Set<string>();
      for (const l of u.lines) {
        const e = evalLine(l, hasOverride);
        u.costLines.push(lineEvidence(l, e));
        if (!KNOWN_COST_TYPES.has(l.type) && e.st !== "REJECTED") unknownTypes.add(l.type);
        if (e.st === "EXCLUDED_TYPE") excludedAny = true;
        if (e.st === "NEEDS_RATE") {
          needsRate = true;
          missingCcy.add(e.lack);
        } else if (e.st === "BAD") {
          bad = true;
        } else if (e.st === "OK" && e.minor !== null) {
          if (l.type === "ROUGH_PURCHASE") basis += e.minor;
          else other += e.minor;
          if (e.minor < 0) negativeLine = true;
          if (l.suspect) suspect = true;
        }
      }
      if (hasOverride) {
        if (unknownOverride) {
          needsRate = true;
          missingCcy.add(lack(ds.acquisitionCurrency ?? deal.currency, deal.currency));
        } else basis = overrideShares[idx] ?? 0;
      }
      if (bad) flags.add("NEGATIVE_AMOUNT", `a cost line of ${u.code} is not representable`, where);
      if (unknownTypes.size) flags.add("UNKNOWN_COST_TYPE", `cost type ${[...unknownTypes].sort().join(", ")} on ${u.code}`, where);
      if (excludedAny) flags.add("OVERHEAD_EXCLUDED", `overhead cost lines of ${u.code} are not charged to the partner`, where);
      if (negativeLine) flags.add("NEGATIVE_COST_LINE", `${u.code} has a negative cost line, counted as a credit`, where);
      if (suspect) flags.add("POSSIBLE_PARTNER_PAYOUT_BILL", `a cost line of ${u.code} looks like a partner payout`, where);

      if (bad || needsRate) {
        if (needsRate) flags.add("NEEDS_RATE_COST", `no rate for ${[...missingCcy].sort().join(", ")} on ${u.code}`, where);
        return;
      }
      const basisKnown = hasOverride || basis !== 0;
      if (!basisKnown) {
        flags.add("COST_MISSING", `acquisition cost of ${u.code} is unknown (zero)`, where);
        return;
      }
      u.basisMinor = basis;
      u.costMinor = basis + other + u.lateShare;
      if (u.costMinor < 0 && usesCost(deal.method)) flags.add("NEGATIVE_AMOUNT", `total cost of ${u.code} is negative`, where);
    });
  }

  // 6. sales, cancelled sales, deposits (never the customer)
  const gemIds = gemUnits.map((u) => u.id);
  const [orders, cancelled, deposits] = await Promise.all([
    gemIds.length
      ? db.salesOrder.findMany({
          where: { gemstoneId: { in: gemIds }, status: { in: [...LIVE_SO] } },
          select: {
            id: true, gemstoneId: true, status: true, saleDate: true, createdAt: true, agreedPrice: true, totalAmount: true, currency: true,
            payments: { select: { id: true, amount: true, currency: true, orderCurrencyAmount: true, receivedAt: true } },
          },
        })
      : [],
    gemIds.length
      ? db.salesOrder.findMany({
          where: { gemstoneId: { in: gemIds }, status: "CANCELLED" },
          select: { id: true, gemstoneId: true, status: true, currency: true, payments: { select: { amount: true, currency: true, orderCurrencyAmount: true } } },
        })
      : [],
    gemIds.length
      ? db.reservation.findMany({
          where: { gemstoneId: { in: gemIds }, status: { in: ["ACTIVE", "CONVERTED"] }, deposit: { gt: 0 } },
          select: { gemstoneId: true },
        })
      : [],
  ]);
  const hasDeposit = new Set(deposits.map((d) => d.gemstoneId));
  const dsOfUnit = new Map(dsModels.flatMap((d) => d.units.map((u) => [u.key, d] as const)));

  for (const u of gemUnits) {
    const ds = dsOfUnit.get(u.key)!;
    const bucketKey = bucketOf(ds);
    const where = { unitKey: u.key, bucketKey };
    const mine = orders.filter((o) => o.gemstoneId === u.id);
    const ev = evaluateSale({
      orders: mine, earnOn, asOf, countSalesFrom: ds.countSalesFrom, addedAt: ds.addedAt, dealCurrency: deal.currency, conv, lack,
    });
    u.sale = ev.sale;
    u.priceMinor = ev.sale?.priceMinor ?? null;
    u.order = ev.order;
    u.ignoredOrders = ev.ignoredOrders;
    u.ignoredPaymentIds = ev.ignoredPaymentIds;
    for (const f of ev.flags) flags.add(f.code, `${f.detail} (${u.code})`, where);
    if (ev.counted && ev.counted.payments.length === 0 && hasDeposit.has(u.id)) {
      flags.add("DEPOSIT_NOT_RECORDED", `${u.code} has a reservation deposit but its sale has no payment`, where);
    }
    // Hand-edited statuses: realisation follows the orders, so a disagreement is only flagged.
    if ((u.status === "SOLD" && mine.length === 0) || (mine.length > 0 && u.status !== "SOLD")) {
      flags.add("STATUS_MISMATCH", `${u.code} is ${u.status} but ${mine.length ? "has" : "has no"} live sale`, where);
    }
    for (const c of cancelled.filter((x) => x.gemstoneId === u.id)) {
      u.ignoredOrders.push({ id: c.id, status: c.status, reason: "CANCELLED" });
      let net = 0;
      let unknown = false;
      for (const p of c.payments) {
        const stored = p.orderCurrencyAmount === null ? null : safeMinor(p.orderCurrencyAmount);
        const orig = safeMinor(p.amount);
        const v = p.orderCurrencyAmount !== null ? stored : orig === null ? null : convQuiet(orig, p.currency, c.currency);
        if (v === null) unknown = true;
        else net += v;
      }
      if (c.payments.length > 0 && (unknown || net !== 0)) {
        flags.add("CANCELLED_WITH_PAYMENTS", `a cancelled sale of ${u.code} still holds payments`, where);
      }
    }
    u.ignoredOrders.sort((a, b) => a.id.localeCompare(b.id));
  }

  // 7. consistency checks per deal stone and per unit
  for (const ds of dsModels) {
    const bucketKey = bucketOf(ds);
    const stoneKey = unitKeyOf(ds.kind, ds.stoneId);
    if (ds.frozenMilli > 0 && ds.currentMilli !== ds.frozenMilli) {
      flags.add("WEIGHT_CHANGED", `${ds.code} weighed ${ds.frozenMilli / 1000} ct when attached and now ${ds.currentMilli / 1000} ct`, { bucketKey, unitKey: stoneKey });
    }
    if (ds.kind === "ROUGH") {
      const cut = ds.cutCount > 0;
      if (!cut) flags.add("ROUGH_UNCUT", `${ds.code} is not cut yet; its own price is its cost`, { bucketKey, unitKey: stoneKey });
      if (ds.cutCount > 1) flags.add("MULTIPLE_CUTS", `${ds.code} was cut ${ds.cutCount} times; each cut carries its full cost`, { bucketKey, unitKey: stoneKey });
      if (ds.status === "SOLD") {
        if (cut) flags.add("STATUS_MISMATCH", `${ds.code} is SOLD but was cut into gems`, { bucketKey, unitKey: stoneKey });
        else flags.add("ROUGH_SOLD_NO_PROCEEDS", `${ds.code} is SOLD but no gem or sale records proceeds`, { bucketKey, unitKey: stoneKey });
      } else if (cut && ds.status !== "CONVERTED") {
        flags.add("STATUS_MISMATCH", `${ds.code} was cut but its status is ${ds.status}`, { bucketKey, unitKey: stoneKey });
      } else if (!cut && ds.status === "CONVERTED") {
        flags.add("STATUS_MISMATCH", `${ds.code} is CONVERTED but no cutting record exists`, { bucketKey, unitKey: stoneKey });
      }
      if (ds.units.length === 0 && (cut || ds.status === "CONVERTED")) {
        flags.add("CONVERTED_NO_OUTPUT", `${ds.code} has no finished stones to carry its cost`, { bucketKey, unitKey: stoneKey });
      }
    }
  }
  if (dsModels.length > 0 && dsModels.some((d) => d.frozenMilli <= 0)) {
    flags.add("TOTAL_WEIGHT_ZERO", `${dsModels.filter((d) => d.frozenMilli <= 0).length} of ${dsModels.length} stones have no frozen weight; equal weights are used`);
  }
  for (const u of gemUnits) {
    const ds = dsOfUnit.get(u.key)!;
    // Stored total vs its own lines in the gem's currency (what recomputeGemCost writes); only a consistency flag.
    if (u.storedTotal !== null && u.gemCurrency !== null) {
      let sum = 0;
      let ok = true;
      for (const l of u.lines) {
        const c = l.amount === null ? null : convQuiet(l.amount, l.currency, u.gemCurrency);
        if (c === null) {
          ok = false;
          break;
        }
        sum += c;
      }
      if (ok && Math.abs(u.storedTotal - sum) > Math.max(TOLERANCE_MINOR, Math.round(Math.abs(sum) / 100))) {
        flags.add("COST_DRIFT", `stored cost of ${u.code} differs from the sum of its cost lines`, { unitKey: u.key, bucketKey: bucketOf(ds) });
      }
    }
  }
  for (const ds of dsModels) {
    if (ds.kind !== "ROUGH" || ds.cutCount === 0 || ds.acquisitionOverride !== null) continue;
    const derived = derivedByRough.get(ds.stoneId) ?? [];
    const price = safeMinor(ds.purchasePrice);
    if (derived.length === 0 || price === null || ds.roughCurrency === null) continue;
    const priceNow = convQuiet(price, ds.roughCurrency, deal.currency);
    let lines = 0;
    let ok = priceNow !== null;
    for (const g of derived) {
      for (const l of linesOfGem(g.id)) {
        if (l.type !== "ROUGH_PURCHASE") continue;
        const c = l.amount === null ? null : convQuiet(l.amount, l.currency, deal.currency);
        if (c === null) ok = false;
        else lines += c;
      }
    }
    if (ok && priceNow !== null && Math.abs(lines - priceNow) > TOLERANCE_MINOR) {
      flags.add("PURCHASE_DRIFT", `the gems of ${ds.code} carry a different purchase cost than the rough's current price`, { bucketKey: bucketOf(ds), unitKey: unitKeyOf("ROUGH", ds.stoneId) });
    }
  }

  // Parcel header against the stones' effective acquisition cost, only when the whole parcel is in the deal.
  const parcelIds = uniq(dsModels.map((d) => d.parcelId).filter((x): x is string => !!x));
  if (parcelIds.length) {
    const parcels = await db.parcel.findMany({
      where: { id: { in: parcelIds } },
      select: { id: true, code: true, totalCost: true, currency: true, roughStones: { select: { id: true } } },
    });
    for (const p of parcels) {
      const members = dsModels.filter((d) => d.parcelId === p.id);
      const memberIds = new Set(members.map((m) => m.stoneId));
      if (!p.roughStones.every((r) => memberIds.has(r.id))) continue;
      const header = safeMinor(p.totalCost);
      const headerConv = header === null ? null : convQuiet(header, p.currency, deal.currency);
      let sum = 0;
      let ok = headerConv !== null;
      for (const m of members) {
        let eff: Minor | null;
        if (m.acquisitionOverride !== null) eff = m.overrideMinor;
        else {
          const pr = safeMinor(m.purchasePrice);
          eff = pr === null || m.roughCurrency === null ? null : convQuiet(pr, m.roughCurrency, deal.currency);
        }
        if (eff === null) ok = false;
        else sum += eff;
      }
      if (ok && headerConv !== null && Math.abs(headerConv - sum) > TOLERANCE_MINOR) {
        flags.add("PARCEL_DRIFT", `parcel ${p.code} header differs from the sum of its stones' acquisition costs`);
      }
    }
  }

  // 8. engine input per method (a method's input type has no field for what it must not read)
  const groupOf = <U>(ds: DsModel, units: U[]): Group<U> => ({ groupKey: ds.id, weightMilli: ds.frozenMilli, units });
  const costUnit = (u: RichUnit): CostUnit => ({ unitKey: u.key, weightMilli: u.weightMilli, sale: u.sale, costMinor: u.costMinor, basisMinor: u.basisMinor });
  const baseUnit = (u: RichUnit, withPrice: boolean): BaseUnit => ({
    unitKey: u.key,
    weightMilli: u.weightMilli,
    sale: u.sale === null ? null : { ...u.sale, priceMinor: withPrice ? u.sale.priceMinor : null },
  });
  const header = { formulaVersion: deal.formulaVersion, currency: deal.currency, earnOn };
  let input: EngineInput;
  if (terms.method === "PROFIT_SHARE") {
    input = { ...header, terms, groups: dsModels.map((ds) => groupOf(ds, ds.units.map(costUnit))) };
  } else if (terms.method === "SALE_COMMISSION") {
    input = { ...header, terms, groups: dsModels.map((ds) => groupOf(ds, ds.units.map((u) => baseUnit(u, true)))) };
  } else if (terms.method === "FIXED_FEE") {
    input = { ...header, terms, groups: dsModels.map((ds) => groupOf(ds, ds.units.map((u) => baseUnit(u, false)))) };
  } else {
    const allocs = dsModels.map((ds) => (ds.investedAlloc === null ? null : safeMinor(ds.investedAlloc)));
    const allocated = allocs.reduce<number>((s, a) => s + (a ?? 0), 0);
    if (allocs.some((a) => a === null) || allocated !== terms.investedMinor) {
      flags.add("INVESTED_MISMATCH", `per-stone invested amounts add up to ${allocated} minor units against ${terms.investedMinor}`);
    }
    // The engine insists the split sums to the term; a mismatch is a BLOCK flag, so it runs on what is actually allocated.
    const groups: Group<CostUnit>[] = dsModels.map((ds, i) => ({
      ...groupOf(ds, ds.units.map(costUnit)),
      investedMinor: allocs[i] ?? 0,
      writtenOff: ds.writtenOff,
    }));
    dsModels.forEach((ds, i) => {
      const invested = allocs[i] ?? 0;
      const costs = ds.units.map((u) => u.costMinor);
      if (invested > 0 && costs.length > 0 && costs.every((c): c is number => c !== null)) {
        const total = costs.reduce((s, c) => s + c, 0);
        if (invested > total) {
          flags.add("INVESTED_EXCEEDS_BASIS", `invested principal of ${ds.code} exceeds its total eligible cost`, { bucketKey: bucketOf(ds) });
        }
      }
    });
    input = { ...header, terms: { ...terms, investedMinor: allocated }, groups };
  }

  // 9. fixed fee above the revenue it is earned on (the engine itself never sees a price)
  if (terms.method === "FIXED_FEE") {
    const result = runEngine(input);
    for (const b of result.buckets) {
      const inBucket = dsModels.filter((d) => (deal.scope === "POOLED" ? true : d.id === b.bucketKey));
      let revenue = 0;
      let known = true;
      for (const ds of inBucket) {
        for (const u of ds.units) {
          const s = u.sale;
          if (!s || s.fracNum === null || s.fracNum === 0) continue;
          if (s.priceMinor === null) known = false;
          else if (s.priceMinor >= 0) revenue += mulFrac(s.priceMinor, s.fracNum, s.fracDen);
        }
      }
      if (known && b.amountMinor > revenue) {
        flags.add("FEE_EXCEEDS_REVENUE", `the fee for ${b.bucketKey === "POOL" ? "the pool" : "a stone"} exceeds the revenue recognised on it`, { bucketKey: b.bucketKey });
      }
    }
  }

  // 10. rates in use: a fallback table is only an estimate
  const sources = (c: string): RateSource | undefined => rates.perUnit[c]?.source;
  const approx = [...usedCurrencies].filter((c) => sources(c) === "FALLBACK").sort();
  if (approx.length) flags.add("APPROX_RATES", `approximate exchange rates used for ${approx.join(", ")}`);

  // 11. other open deals on the same stones: caps and diverging cost basis
  if (crossDeal && OPEN_DEAL_STATUSES.includes(deal.status)) {
    const ownKeys = new Set<string>();
    for (const ds of dsModels) {
      ownKeys.add(unitKeyOf(ds.kind, ds.stoneId));
      for (const u of ds.units) ownKeys.add(u.key);
    }
    const overlaps = await findOverlappingDeals(db, { excludeDealId: dealId, keys: ownKeys, statuses: OPEN_DEAL_STATUSES });
    if (overlaps.length) {
      const bp = (v: string | null): number | null => {
        if (v === null) return null;
        try {
          return bpFromPct(v);
        } catch {
          return null;
        }
      };
      const codeOf = new Map<string, string>();
      for (const ds of dsModels) {
        codeOf.set(unitKeyOf(ds.kind, ds.stoneId), ds.code);
        for (const u of ds.units) codeOf.set(u.key, u.code);
      }
      const caps = evaluateCaps(
        { partnerId: deal.partnerId, method: deal.method, rateBp: "rateBp" in terms ? terms.rateBp : null },
        ownKeys,
        overlaps.map((o) => ({ code: o.code, partnerId: o.partnerId, method: o.method, rateBp: bp(o.ratePct), overlap: o.overlap })),
        (k) => codeOf.get(k) ?? k,
      );
      for (const e of caps.errors) flags.add("CO_PARTNER_CAP_EXCEEDED", e);

      const ownCost = new Map(allUnits.map((u) => [u.key, u.costMinor] as const));
      for (const o of overlaps) {
        let other: GatherResult;
        try {
          other = await gatherCore(db, o.dealId, opts, false);
        } catch {
          continue;
        }
        // Their costs come from the evidence (an M2/M3 input has no cost field).
        const theirs = new Map(other.evidence.units.map((eu) => [eu.unitKey, eu.costMinor] as const));
        const ccy = other.input.currency;
        let differing = 0;
        let first: string | undefined;
        for (const [key, mine] of ownCost) {
          const t = theirs.get(key);
          if (mine === null || t === undefined || t === null) continue;
          const tc = convQuiet(t, ccy, deal.currency);
          if (tc !== null && Math.abs(tc - mine) > TOLERANCE_MINOR) {
            differing++;
            first ??= key;
          }
        }
        if (differing > 0) {
          flags.add("COST_BASIS_DIVERGES_ACROSS_DEALS", `${differing} stone(s) carry a different cost in ${o.code}`, first ? { unitKey: first } : {});
        }
      }
    }
  }

  // 12. evidence (ids, codes, amounts; never text)
  const evidence: Evidence = {
    dealId,
    currenciesUsed: [...usedCurrencies].sort(),
    dealStones: dsModels.map((ds) => ({
      dealStoneId: ds.id,
      bucketKey: bucketOf(ds),
      kind: ds.kind,
      id: ds.stoneId,
      code: ds.code,
      frozenWeightMilli: ds.frozenMilli,
      currentWeightMilli: ds.currentMilli,
      acquisitionOverrideMinor: ds.overrideMinor,
      unitKeys: ds.units.map((u) => u.key),
      roughLines: ds.roughLineEvidence,
      lateRoughLines: ds.lateRoughLines,
      lateShares: ds.lateShares,
    })),
    units: dsModels.flatMap((ds) =>
      ds.units.map((u) => ({
        unitKey: u.key,
        kind: u.kind,
        id: u.id,
        code: u.code,
        dealStoneId: ds.id,
        weightMilli: u.weightMilli,
        basisMinor: u.basisMinor,
        lateShareMinor: u.lateShare,
        costMinor: u.costMinor,
        costLines: u.costLines,
        order: u.order,
        ignoredOrders: u.ignoredOrders,
        ignoredPaymentIds: u.ignoredPaymentIds,
      })),
    ),
  };

  return { input, flags: flags.sorted(), rates, asOf: iso(asOf), evidence };
}
