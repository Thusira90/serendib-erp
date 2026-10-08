import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ADJUSTMENT_REASONS, PARTNER_CURRENCIES, PAYOUT_PAYMENT_METHODS } from "@/lib/enums";
import { codePrefix, nextCode } from "@/lib/ids";
import { notify } from "@/lib/notifications";
import { actorCan } from "@/lib/partner-auth";
import {
  ENGINES,
  EngineInvariantError,
  runEngineVersioned,
  validateTerms,
  type BaseUnit,
  type BucketResult,
  type CostUnit,
  type EngineInput,
  type EngineResult,
  type GatherFlag,
  type Group,
  type TermsDraft,
} from "@/lib/partner-engine";
import {
  OPEN_DEAL_STATUSES,
  PartnerGatherError,
  buildRateMap,
  collectCurrencies,
  derivedGemIdsByRough,
  evaluateSale,
  findOverlappingDeals,
  gatherDeal,
  type Db,
  type Evidence,
  type EvidenceCostLine,
  type EvidenceUnit,
  type GatherResult,
  type RateMap,
  type RateSource,
} from "@/lib/partner-gather";
import {
  RAT_ZERO,
  allocateMinor,
  convertMinor,
  decimalToMinor,
  microFromRates,
  minorToDecimalString,
  mulBp,
  mulFrac,
  mulRat,
  parseScaled,
  ratAdd,
  ratDivBig,
  ratFrom,
  ratMulInt,
  ratToStrings,
  sha256Hex,
  type Minor,
  type Rat,
} from "@/lib/partner-money";
import { getDealFootprint, validateCoPartnerCaps } from "@/lib/partner-queries";

type Tx = Prisma.TransactionClient;
type Num = { toString(): string };

export type Actor = { id: string; name: string | null };

export interface Ledger {
  currency: string;
  settled: Minor;
  adjustments: Minor;
  position: Minor;
  netPaid: Minor;
  balance: Minor;
  perBucket: { bucketKey: string; credited: Minor; lastKey: string | null }[];
}

export interface ProposalRow {
  bucketKey: string;
  label: string;
  engineMinor: Minor;
  creditedMinor: Minor;
  deltaMinor: Minor;
  kind: "SETTLEMENT" | "ADJUSTMENT";
  reasonCode: string;
  belowMateriality: boolean;
  /** Every reason that applies (a settlement line can carry several). */
  reasons?: string[];
}

export interface ReconcilePreview {
  dealId: string;
  inputsHash: string;
  asOf: string;
  rates: RateMap;
  result: EngineResult;
  flags: GatherFlag[];
  ledger: Ledger;
  proposal: ProposalRow[];
  blocking: string[];
  needsAck: string[];
}

export type CommitArgs = {
  dealId: string;
  inputsHash: string;
  rates: RateMap;
  ackedFlags: string[];
  forceBelowMateriality?: string[];
  reasons: Record<string, { code: string; text: string; partnerNote?: string }>;
  settlementNote?: string;
  settlementPartnerNote?: string;
  actor: Actor;
};
export type CommitResult =
  | { ok: true; settlementCode: string | null; adjustmentCodes: string[] }
  | { ok: false; error: "DATA_CHANGED" | "BLOCKED" | "ACK_REQUIRED" | "NOTHING_TO_DO" | "RATES_STALE" | "FORBIDDEN" | "INVALID"; detail?: string[] };

export type Outcome = { ok: true } | { ok: false; error: string };
export type CodeOutcome = { ok: true; code: string } | { ok: false; error: string };

export const FORBIDDEN_MESSAGE = "You do not have permission to do this.";
export const RATES_MAX_AGE_MS = 15 * 60_000;
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;
/** Materiality of a restatement: the larger of 1.00 and 0.1% of what the bucket was credited. */
const MATERIALITY_FLOOR_MINOR = 100;
const MATERIALITY_BP = 10;
const PAID_DATE_SLACK_MS = 14 * 3_600_000;
const EMPTY_KEY = sha256Hex("");
/** Same list the gatherer uses for a live sale (never "not CANCELLED", which would include DRAFT). */
const LIVE_SALE_STATUSES: readonly string[] = ["CONFIRMED", "INVOICED", "PARTIAL", "PAID", "SHIPPED", "DELIVERED"];
const RECONCILE_REASONS: readonly string[] = ["COST_CHANGE", "PRICE_CHANGE", "FX_CORRECTION", "CORRECTION", "NETTING", "SALE_CANCELLED"];
const RATE_SOURCES: readonly string[] = ["LIVE", "FALLBACK", "MANUAL"];
const RATE_RE = /^\d{1,9}(\.\d{1,6})?$/;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const minor = (v: Num | null | undefined): Minor => (v === null || v === undefined ? 0 : decimalToMinor(v));
const dec = (m: Minor): string => minorToDecimalString(m);
const uniq = <T>(xs: Iterable<T>): T[] => [...new Set(xs)];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const sortedFlags = (xs: GatherFlag[]): GatherFlag[] => {
  const rank = { BLOCK: 0, ACK: 1, INFO: 2 } as const;
  return [...xs].sort((a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code) || (a.unitKey ?? "").localeCompare(b.unitKey ?? ""));
};

/** 1,234.50 style text for messages (string arithmetic only). */
export function fmtMinor(m: Minor): string {
  const [int, frac] = minorToDecimalString(Math.abs(m)).split(".");
  return `${m < 0 ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

function parseJson(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Sorted-key JSON so the same data always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** Hash of everything the engine saw: the input and the evidence behind it (converted values included, the live feed is not). */
export function inputsHashOf(g: Pick<GatherResult, "input" | "evidence">): string {
  return sha256(canonicalJson({ input: g.input, evidence: g.evidence }));
}

export const dealLockKey = (dealId: string): string => `partner-deal:${dealId}`;

/** Serialises every ledger write of one deal until the surrounding transaction ends. */
async function lockDeal(tx: Tx, dealId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dealLockKey(dealId)}))`;
}

const forbidden = (): { ok: false; error: string } => ({ ok: false, error: FORBIDDEN_MESSAGE });
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const DEAL_SELECT = {
  id: true, code: true, status: true, method: true, scope: true, earnOn: true, currency: true, ratePct: true, fixedFee: true,
  invested: true, capitalProtected: true, poolAcquisitionCost: true, rateOverrides: true, ratesFrozenAt: true, formulaVersion: true,
  termsVersion: true, partnerId: true,
} satisfies Prisma.PartnerDealSelect;
type DealRow = Prisma.PartnerDealGetPayload<{ select: typeof DEAL_SELECT }>;

async function actorName(db: Db, actor: Actor): Promise<string | null> {
  if (actor.name) return actor.name;
  const u = await db.user.findUnique({ where: { id: actor.id }, select: { name: true } });
  return u?.name ?? null;
}

function parseOverrideMap(json: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = parseJson(json);
  if (!isRecord(raw)) return out;
  for (const [ccy, v] of Object.entries(raw)) {
    if (!/^[A-Z]{3}$/.test(ccy) || ccy === "LKR" || (typeof v !== "string" && typeof v !== "number")) continue;
    try {
      const micro = parseScaled(String(v), 6);
      if (micro > 0n && micro <= BigInt(Number.MAX_SAFE_INTEGER)) out[ccy] = rate6(micro);
    } catch {
      // an unusable override counts as absent
    }
  }
  return out;
}

const rate6 = (micro: bigint): string => `${micro / 1_000_000n}.${(micro % 1_000_000n).toString().padStart(6, "0")}`;

// ---------------------------------------------------------------------------
// Rates supplied by the admin dialog
// ---------------------------------------------------------------------------

type RatesCheck = { ok: true; rates: RateMap } | { ok: false; error: "INVALID" | "RATES_STALE"; detail: string };

/**
 * The supplied map must be well formed, agree with the deal's frozen or manual rates, and be fresh. A live rate that has
 * moved since the preview is deliberately not checked: the preview's map is what the snapshot records.
 */
function checkSuppliedRates(raw: RateMap, deal: { rateOverrides: string | null }, now: number): RatesCheck {
  const bad = (detail: string): RatesCheck => ({ ok: false, error: "INVALID", detail });
  if (!isRecord(raw) || raw.base !== "LKR" || typeof raw.fetchedAt !== "string" || !isRecord(raw.perUnit)) {
    return bad("The exchange rates are missing or malformed.");
  }
  const fetched = Date.parse(raw.fetchedAt);
  if (Number.isNaN(fetched)) return bad("The exchange rates have no valid timestamp.");
  const perUnit: RateMap["perUnit"] = {};
  for (const [ccy, entry] of Object.entries(raw.perUnit).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^[A-Z]{3}$/.test(ccy) || ccy === "LKR") return bad(`The rate for ${ccy} is not allowed.`);
    if (!isRecord(entry) || typeof entry.rate !== "string" || !RATE_RE.test(entry.rate) || !RATE_SOURCES.includes(String(entry.source))) {
      return bad(`The rate for ${ccy} is malformed.`);
    }
    const micro = parseScaled(entry.rate, 6);
    if (micro <= 0n) return bad(`The rate for ${ccy} must be positive.`);
    perUnit[ccy] = { rate: rate6(micro), source: entry.source as RateSource };
  }
  for (const [ccy, rate] of Object.entries(parseOverrideMap(deal.rateOverrides))) {
    const got = perUnit[ccy];
    if (!got) continue;
    if (got.rate !== rate) return bad(`The ${ccy} rate differs from the deal's frozen rate. Preview again.`);
    got.source = "MANUAL";
  }
  const age = now - fetched;
  if (age < -5 * 60_000) return bad("The exchange rates are dated in the future.");
  if (age > RATES_MAX_AGE_MS) return { ok: false, error: "RATES_STALE", detail: "The exchange rates are more than 15 minutes old. Preview again." };
  return { ok: true, rates: { base: "LKR", fetchedAt: raw.fetchedAt, perUnit } };
}

// ---------------------------------------------------------------------------
// Ledger reads
// ---------------------------------------------------------------------------

interface LineRow { id: string; settlementId: string; bucketKey: string; amount: Minor; realizationKey: string; createdAt: Date }
interface AdjRow { id: string; settlementId: string | null; bucketKey: string | null; amount: Minor; realizationKey: string | null; createdAt: Date }
interface KeyRef { kind: "LINE" | "ADJ"; id: string }
interface LedgerData {
  ledger: Ledger;
  lines: LineRow[];
  adjustments: AdjRow[];
  lastRef: Map<string, KeyRef>;
  latestAt: number;
  hasSettlement: boolean;
}

async function loadLedger(db: Db, dealId: string): Promise<LedgerData> {
  const deal = await db.partnerDeal.findUniqueOrThrow({ where: { id: dealId }, select: { currency: true } });
  const [settlements, lineRows, adjRows, payouts] = await Promise.all([
    db.partnerSettlement.findMany({ where: { dealId }, select: { amount: true, createdAt: true } }),
    db.partnerSettlementLine.findMany({
      where: { dealId },
      select: { id: true, settlementId: true, bucketKey: true, amount: true, realizationKey: true, createdAt: true },
    }),
    db.partnerAdjustment.findMany({
      where: { dealId },
      select: { id: true, settlementId: true, bucketKey: true, amount: true, realizationKey: true, createdAt: true },
    }),
    db.partnerPayout.findMany({ where: { dealId }, select: { direction: true, amount: true, createdAt: true } }),
  ]);
  const lines: LineRow[] = lineRows.map((l) => ({ ...l, amount: minor(l.amount) }));
  const adjustments: AdjRow[] = adjRows.map((a) => ({ ...a, amount: minor(a.amount) }));

  const per = new Map<string, { credited: number; key: string | null; at: number; id: string }>();
  const lastRef = new Map<string, KeyRef>();
  const push = (bucket: string, amount: Minor, key: string | null, at: Date, id: string, kind: KeyRef["kind"]): void => {
    const e = per.get(bucket) ?? { credited: 0, key: null, at: -1, id: "" };
    e.credited += amount;
    const t = at.getTime();
    if (key !== null && (t > e.at || (t === e.at && id > e.id))) {
      e.key = key;
      e.at = t;
      e.id = id;
      lastRef.set(bucket, { kind, id });
    }
    per.set(bucket, e);
  };
  for (const l of lines) push(l.bucketKey, l.amount, l.realizationKey, l.createdAt, l.id, "LINE");
  for (const a of adjustments) if (a.bucketKey !== null) push(a.bucketKey, a.amount, a.realizationKey, a.createdAt, a.id, "ADJ");

  const settled = settlements.reduce((s, r) => s + minor(r.amount), 0);
  const adjusted = adjustments.reduce((s, a) => s + a.amount, 0);
  const paid = payouts.filter((p) => p.direction === "PAID").reduce((s, p) => s + minor(p.amount), 0);
  const received = payouts.filter((p) => p.direction === "RECEIVED").reduce((s, p) => s + minor(p.amount), 0);
  const netPaid = paid - received;
  const latestAt = Math.max(
    0,
    ...settlements.map((s) => s.createdAt.getTime()),
    ...lines.map((l) => l.createdAt.getTime()),
    ...adjustments.map((a) => a.createdAt.getTime()),
    ...payouts.map((p) => p.createdAt.getTime()),
  );
  return {
    ledger: {
      currency: deal.currency,
      settled,
      adjustments: adjusted,
      position: settled + adjusted,
      netPaid,
      balance: settled + adjusted - netPaid,
      perBucket: [...per.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bucketKey, e]) => ({ bucketKey, credited: e.credited, lastKey: e.key })),
    },
    lines,
    adjustments,
    lastRef,
    latestAt,
    hasSettlement: settlements.length > 0,
  };
}

/** settled + adjustments - net paid, all in the deal currency (spec 5.2). */
export async function getLedger(db: Db, dealId: string): Promise<Ledger> {
  return (await loadLedger(db, dealId)).ledger;
}

/** Ledger rows get strictly increasing timestamps, so "the latest row of a bucket" is unambiguous. */
const monotonicStamp = (latestAt: number): Date => new Date(Math.max(Date.now(), latestAt + 1));

// ---------------------------------------------------------------------------
// Engine inputs read back (live gather and stored snapshots share one shape)
// ---------------------------------------------------------------------------

interface UnitFacts { orderId: string | null; fracNum: number | null; fracDen: number; price: Minor | null; cost: Minor | null | undefined }

function groupsOf(input: EngineInput): Group<BaseUnit>[] {
  return input.groups as Group<BaseUnit>[];
}

function unitFacts(input: EngineInput): Map<string, UnitFacts> {
  const out = new Map<string, UnitFacts>();
  for (const g of groupsOf(input)) {
    for (const u of g.units) {
      out.set(u.unitKey, {
        orderId: u.sale?.orderId ?? null,
        fracNum: u.sale?.fracNum ?? null,
        fracDen: u.sale?.fracDen ?? 1,
        price: u.sale?.priceMinor ?? null,
        cost: "costMinor" in u ? (u as CostUnit).costMinor : undefined,
      });
    }
  }
  return out;
}

const bucketGroupKeys = (input: EngineInput, bucketKey: string): Set<string> =>
  new Set(groupsOf(input).filter((g) => input.terms.scope === "POOLED" || g.groupKey === bucketKey).map((g) => g.groupKey));

/** Order ids of the sales in a bucket: all live ones, or only those that earned (usable). */
function bucketOrderIds(input: EngineInput, bucketKey: string, onlyUnitKeys?: readonly string[]): string[] {
  const groups = bucketGroupKeys(input, bucketKey);
  const only = onlyUnitKeys ? new Set(onlyUnitKeys) : null;
  const ids: string[] = [];
  for (const g of groupsOf(input)) {
    if (!groups.has(g.groupKey)) continue;
    for (const u of g.units) if (u.sale && (!only || only.has(u.unitKey))) ids.push(u.sale.orderId);
  }
  return uniq(ids).sort();
}

interface Snapshot { input: EngineInput | null; evidence: Evidence | null; result: EngineResult | null; rates: RateMap | null }

function parseSnapshot(inputsJson: string | null, resultJson: string | null, ratesJson: string | null): Snapshot {
  const inputs = parseJson(inputsJson);
  const result = parseJson(resultJson);
  const rates = parseJson(ratesJson);
  const input = isRecord(inputs) && isRecord(inputs.input) && Array.isArray(inputs.input.groups) ? (inputs.input as unknown as EngineInput) : null;
  const evidence = isRecord(inputs) && isRecord(inputs.evidence) && Array.isArray(inputs.evidence.units) ? (inputs.evidence as unknown as Evidence) : null;
  return {
    input,
    evidence,
    result: isRecord(result) && Array.isArray(result.buckets) ? (result as unknown as EngineResult) : null,
    rates: isRecord(rates) && isRecord(rates.perUnit) ? (rates as unknown as RateMap) : null,
  };
}

interface Prev { orderIds: string[]; rates: RateMap | null; snapshot: Snapshot | null; hasLine: boolean }

async function previousFor(db: Db, bucketKey: string, data: LedgerData): Promise<Prev> {
  const lines = data.lines.filter((l) => l.bucketKey === bucketKey).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  const ref = data.lastRef.get(bucketKey) ?? null;
  let snapshot: Snapshot | null = null;
  if (lines.length > 0) {
    const s = await db.partnerSettlement.findUnique({ where: { id: lines[0].settlementId }, select: { inputs: true, result: true, rates: true } });
    if (s) snapshot = parseSnapshot(s.inputs, s.result, s.rates);
  }
  let orderIds: string[] = [];
  let rates: RateMap | null = snapshot?.rates ?? null;
  if (ref?.kind === "ADJ") {
    const a = await db.partnerAdjustment.findUnique({ where: { id: ref.id }, select: { evidence: true, rates: true } });
    const ev = parseJson(a?.evidence);
    orderIds = isRecord(ev) && Array.isArray(ev.orderIds) ? ev.orderIds.filter((x): x is string => typeof x === "string") : [];
    const r = parseJson(a?.rates);
    rates = isRecord(r) && isRecord(r.perUnit) && Object.keys(r.perUnit).length > 0 ? (r as unknown as RateMap) : rates;
  } else if (ref?.kind === "LINE" && snapshot?.input && snapshot.result) {
    const bucket = snapshot.result.buckets.find((b) => b.bucketKey === bucketKey);
    orderIds = bucket ? bucketOrderIds(snapshot.input, bucketKey, bucket.soldUnitKeys) : [];
  }
  return { orderIds, rates, snapshot, hasLine: lines.length > 0 };
}

const ratesDiffer = (before: RateMap | null, now: RateMap, used: readonly string[]): boolean =>
  before !== null && used.some((c) => c !== "LKR" && before.perUnit[c] !== undefined && now.perUnit[c] !== undefined && before.perUnit[c].rate !== now.perUnit[c].rate);

interface ChangedLine { unitKey: string; lineId: string; type: string; change: "ADDED" | "REMOVED" | "CHANGED"; amountMinor: Minor | null }

/** Cost lines of the bucket that differ from the last settlement snapshot (ids, types and amounts only). */
function changedLines(before: Evidence | null, now: Evidence, scope: string, bucketKey: string): ChangedLine[] {
  if (!before) return [];
  const inBucket = (u: EvidenceUnit): boolean => scope === "POOLED" || u.dealStoneId === bucketKey;
  const index = (ev: Evidence): Map<string, { unitKey: string; line: EvidenceCostLine }> => {
    const m = new Map<string, { unitKey: string; line: EvidenceCostLine }>();
    for (const u of ev.units) if (inBucket(u)) for (const l of u.costLines) m.set(`${u.unitKey}|${l.id}`, { unitKey: u.unitKey, line: l });
    return m;
  };
  const was = index(before);
  const is = index(now);
  const out: ChangedLine[] = [];
  for (const [k, v] of is) {
    const w = was.get(k);
    if (!w) out.push({ unitKey: v.unitKey, lineId: v.line.id, type: v.line.type, change: "ADDED", amountMinor: v.line.convertedMinor });
    else if (w.line.convertedMinor !== v.line.convertedMinor || w.line.excluded !== v.line.excluded) {
      out.push({ unitKey: v.unitKey, lineId: v.line.id, type: v.line.type, change: "CHANGED", amountMinor: v.line.convertedMinor });
    }
  }
  for (const [k, w] of was) if (!is.has(k)) out.push({ unitKey: w.unitKey, lineId: w.line.id, type: w.line.type, change: "REMOVED", amountMinor: w.line.convertedMinor });
  return out;
}

// ---------------------------------------------------------------------------
// Aggregate obligations across co-partner deals (spec 4.5, W33, W34)
// ---------------------------------------------------------------------------

interface Obligations { obligationsMinor: Minor; revenueMinor: Minor; blocked: boolean; exceedsProfit: boolean; dealCount: number }

/** Revenue and cost the company recognised on each sold unit, in the deal's own currency (the same fractions the engine used). */
function unitEconomics(g: GatherResult): Map<string, { revenue: Minor; cost: Minor | null }> {
  const facts = unitFacts(g.input);
  const out = new Map<string, { revenue: Minor; cost: Minor | null }>();
  for (const u of g.evidence.units) {
    const o = u.order;
    const f = facts.get(u.unitKey);
    if (!o || !f || f.fracNum === null || o.priceConvertedMinor === null || o.priceConvertedMinor < 0) continue;
    out.set(u.unitKey, {
      revenue: mulFrac(o.priceConvertedMinor, f.fracNum, f.fracDen),
      cost: u.costMinor === null ? null : mulFrac(u.costMinor, f.fracNum, f.fracDen),
    });
  }
  return out;
}

async function obligationsFor(db: Db, deal: DealRow, self: { gathered: GatherResult; result: EngineResult }): Promise<Obligations> {
  const fp = await getDealFootprint(db, deal.id);
  const keys = new Set<string>([...fp.roughIds.map((id) => `R:${id}`), ...fp.gemIds.map((id) => `G:${id}`), ...fp.derivedGemIds.map((id) => `G:${id}`)]);
  const overlaps = keys.size > 0 ? await findOverlappingDeals(db, { excludeDealId: deal.id, keys, statuses: OPEN_DEAL_STATUSES }) : [];

  type Calc = { currency: string; gathered: GatherResult; result: EngineResult };
  const calcs: Calc[] = [{ currency: deal.currency, gathered: self.gathered, result: self.result }];
  for (const o of overlaps) {
    try {
      const od = await db.partnerDeal.findUniqueOrThrow({ where: { id: o.dealId }, select: { currency: true, rateOverrides: true } });
      const rates = await buildRateMap(od, await collectCurrencies(db, o.dealId));
      const g = await gatherDeal(db, o.dealId, { asOf: new Date(self.gathered.asOf), rates, crossDeal: false });
      calcs.push({ currency: od.currency, gathered: g, result: runEngineVersioned(g.input) });
    } catch {
      // a deal that cannot be calculated (unfinished draft terms) has no obligation to add
    }
  }
  const foreign = uniq(calcs.map((c) => c.currency).filter((c) => c !== deal.currency));
  const micro = foreign.length > 0 ? microFromRates(await buildRateMap(deal, foreign)) : null;
  const conv = (m: Minor, from: string): Minor | null => {
    if (from === deal.currency) return m;
    try {
      return micro === null ? null : convertMinor(m, from, deal.currency, micro);
    } catch {
      return null;
    }
  };

  let obligations = 0;
  let capital = 0;
  let counted = 0;
  const revenue = new Map<string, Minor>();
  const profitUnits = new Map<string, { revenue: Minor; cost: Minor | null }>();
  for (const c of calcs) {
    const total = conv(c.result.totalMinor, c.currency);
    if (total === null) continue;
    counted++;
    obligations += total;
    capital += conv(c.result.buckets.reduce((s, b) => s + b.capitalReturnedMinor, 0), c.currency) ?? 0;
    for (const [unitKey, e] of unitEconomics(c.gathered)) {
      const rev = conv(e.revenue, c.currency);
      if (rev === null) continue;
      revenue.set(unitKey, Math.max(revenue.get(unitKey) ?? 0, rev));
      if (!profitUnits.has(unitKey)) profitUnits.set(unitKey, { revenue: rev, cost: e.cost === null ? null : conv(e.cost, c.currency) });
    }
  }
  const revenueTotal = [...revenue.values()].reduce((s, x) => s + x, 0);
  const profitKnown = [...profitUnits.values()].every((u) => u.cost !== null);
  const profit = [...profitUnits.values()].reduce((s, u) => s + u.revenue - (u.cost ?? 0), 0);
  const nonCapital = obligations - capital;
  return {
    obligationsMinor: obligations,
    revenueMinor: revenueTotal,
    // One deal on its own is covered by FEE_EXCEEDS_REVENUE (an acknowledgement); the block is for stacked co-partners.
    blocked: counted >= 2 && obligations > revenueTotal,
    exceedsProfit: profitKnown && nonCapital > 0 && nonCapital > profit,
    dealCount: counted,
  };
}

/** Sum of every open co-partner deal's engine total against the revenue recognised on the stones they share. */
export async function checkObligations(
  db: Db,
  dealId: string,
): Promise<{ obligationsMinor: Minor; revenueMinor: Minor; blocked: boolean; exceedsProfit: boolean }> {
  const deal = await db.partnerDeal.findUniqueOrThrow({ where: { id: dealId }, select: DEAL_SELECT });
  const rates = await buildRateMap(deal, await collectCurrencies(db, dealId));
  const gathered = await gatherDeal(db, dealId, { asOf: new Date(), rates, crossDeal: false });
  const o = await obligationsFor(db, deal, { gathered, result: runEngineVersioned(gathered.input) });
  return { obligationsMinor: o.obligationsMinor, revenueMinor: o.revenueMinor, blocked: o.blocked, exceedsProfit: o.exceedsProfit };
}

// ---------------------------------------------------------------------------
// Assessment: flags, hash and the proposed ledger rows for one gather
// ---------------------------------------------------------------------------

type PlannedRow = ProposalRow & {
  reasons: string[];
  realizationKey: string;
  orderIds: string[];
  changedLines: ChangedLine[];
  settlementId: string | null;
};

interface Assessment {
  result: EngineResult;
  flags: GatherFlag[];
  blocking: string[];
  needsAck: string[];
  hash: string;
  data: LedgerData;
  planned: PlannedRow[];
}

async function planRows(
  db: Db,
  a: { gathered: GatherResult; result: EngineResult; data: LedgerData; rates: RateMap },
): Promise<PlannedRow[]> {
  const { gathered, result, data, rates } = a;
  const input = gathered.input;
  const perBucket = new Map(data.ledger.perBucket.map((p) => [p.bucketKey, p]));
  const resultBy = new Map(result.buckets.map((b) => [b.bucketKey, b]));
  const keys = result.buckets.map((b) => b.bucketKey);
  for (const p of data.ledger.perBucket) if (!resultBy.has(p.bucketKey)) keys.push(p.bucketKey);
  const nowFacts = unitFacts(input);
  const labelOf = (k: string): string =>
    k === "POOL" ? "Pool" : gathered.evidence.dealStones.find((d) => d.bucketKey === k)?.code ?? "Removed stone";

  const rows: PlannedRow[] = [];
  for (const bucketKey of keys) {
    const b: BucketResult | null = resultBy.get(bucketKey) ?? null;
    const engine = b ? b.amountMinor : 0;
    const credited = perBucket.get(bucketKey)?.credited ?? 0;
    const lastKey = perBucket.get(bucketKey)?.lastKey ?? null;
    const delta = engine - credited;
    if (delta === 0) continue;
    const key = b ? b.realizationKey : EMPTY_KEY;
    const realChanged = lastKey === null || lastKey !== key;
    const prev = await previousFor(db, bucketKey, data);
    const nowLive = bucketOrderIds(input, bucketKey);
    const row: PlannedRow = {
      bucketKey,
      label: labelOf(bucketKey),
      engineMinor: engine,
      creditedMinor: credited,
      deltaMinor: delta,
      kind: "ADJUSTMENT",
      reasonCode: "COST_CHANGE",
      reasons: [],
      belowMateriality: false,
      realizationKey: key,
      orderIds: b ? bucketOrderIds(input, bucketKey, b.soldUnitKeys) : [],
      changedLines: changedLines(prev.snapshot?.evidence ?? null, gathered.evidence, input.terms.scope, bucketKey),
      settlementId: null,
    };
    if (b === null) {
      row.reasonCode = "STONE_REMOVED";
    } else if (realChanged && delta > 0) {
      row.kind = "SETTLEMENT";
      const reasons: string[] = [];
      if (!prev.hasLine && lastKey === null) reasons.push("FIRST");
      else {
        reasons.push("NEW_REALIZATION");
        const before = prev.snapshot?.input ? unitFacts(prev.snapshot.input) : null;
        if (before) {
          let cost = false;
          let price = false;
          for (const [unitKey, f] of nowFacts) {
            const w = before.get(unitKey);
            if (!w || w.orderId === null || w.orderId !== f.orderId || w.fracNum !== f.fracNum || w.fracDen !== f.fracDen) continue;
            if (w.price !== f.price) price = true;
            if (w.cost !== undefined && f.cost !== undefined && w.cost !== f.cost) cost = true;
          }
          if (cost) reasons.push("COST_CHANGED");
          if (price) reasons.push("PRICE_CHANGED");
        }
      }
      row.reasons = reasons;
      row.reasonCode = reasons[0];
    } else if (realChanged) {
      row.reasonCode = prev.orderIds.some((id) => !nowLive.includes(id)) ? "SALE_CANCELLED" : "NETTING";
    } else {
      row.reasonCode = ratesDiffer(prev.rates, rates, gathered.evidence.currenciesUsed) ? "FX_CORRECTION" : "COST_CHANGE";
      const threshold = Math.max(MATERIALITY_FLOOR_MINOR, mulBp(Math.abs(credited), MATERIALITY_BP));
      row.belowMateriality = Math.abs(delta) < threshold;
    }
    if (row.kind === "ADJUSTMENT") {
      row.reasons = [row.reasonCode];
      const line = data.lines.filter((l) => l.bucketKey === bucketKey).sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || y.id.localeCompare(x.id))[0];
      row.settlementId = line?.settlementId ?? null;
    }
    rows.push(row);
  }
  return rows;
}

async function assess(db: Db, deal: DealRow, gathered: GatherResult, rates: RateMap): Promise<Assessment> {
  const result = runEngineVersioned(gathered.input);
  const flags: GatherFlag[] = [...gathered.flags];
  const approx = gathered.evidence.currenciesUsed.filter((c) => c !== "LKR" && rates.perUnit[c]?.source === "FALLBACK");
  if (approx.length > 0) {
    flags.push({ code: "APPROX_RATES_USED", severity: "BLOCK", detail: `only the approximate fallback exchange rate is available for ${approx.join(", ")}` });
  }
  const ob = await obligationsFor(db, deal, { gathered, result });
  if (ob.blocked) {
    flags.push({
      code: "CO_PARTNER_TOTAL_EXCEEDS_REVENUE",
      severity: "BLOCK",
      detail: `co-partner obligations ${fmtMinor(ob.obligationsMinor)} exceed the revenue recognised ${fmtMinor(ob.revenueMinor)}`,
    });
  }
  if (ob.exceedsProfit) {
    flags.push({ code: "OBLIGATIONS_EXCEED_PROFIT", severity: "INFO", detail: "partner obligations exceed the company's realised profit" });
  }
  const sorted = sortedFlags(flags);
  const data = await loadLedger(db, deal.id);
  const planned = await planRows(db, { gathered, result, data, rates });
  return {
    result,
    flags: sorted,
    blocking: uniq(sorted.filter((f) => f.severity === "BLOCK").map((f) => f.code)),
    needsAck: uniq(sorted.filter((f) => f.severity === "ACK").map((f) => f.code)),
    hash: inputsHashOf(gathered),
    data,
    planned,
  };
}

const toProposalRow = (r: PlannedRow): ProposalRow => ({
  bucketKey: r.bucketKey,
  label: r.label,
  engineMinor: r.engineMinor,
  creditedMinor: r.creditedMinor,
  deltaMinor: r.deltaMinor,
  kind: r.kind,
  reasonCode: r.reasonCode,
  belowMateriality: r.belowMateriality,
  reasons: r.reasons,
});

// ---------------------------------------------------------------------------
// Estimate and preview
// ---------------------------------------------------------------------------

/** Live estimate: not stored, floats with costs and sales. Throws PartnerGatherError when the deal's terms are incomplete. */
export async function computeEstimate(
  db: Db,
  dealId: string,
): Promise<{ result: EngineResult; flags: GatherFlag[]; rates: RateMap; ledger: Ledger; notYetSettled: Minor }> {
  const deal = await db.partnerDeal.findUniqueOrThrow({ where: { id: dealId }, select: DEAL_SELECT });
  const rates = await buildRateMap(deal, await collectCurrencies(db, dealId));
  const gathered = await gatherDeal(db, dealId, { asOf: new Date(), rates });
  const result = runEngineVersioned(gathered.input);
  const ledger = await getLedger(db, dealId);
  return { result, flags: gathered.flags, rates, ledger, notYetSettled: result.totalMinor - ledger.position };
}

/** Preview with an explicit rate map (what commit reproduces); `previewReconcileIn` builds the map from the deal. */
export async function previewWithRates(db: Db, dealId: string, rates: RateMap, now: Date = new Date()): Promise<ReconcilePreview> {
  const deal = await db.partnerDeal.findUniqueOrThrow({ where: { id: dealId }, select: DEAL_SELECT });
  const gathered = await gatherDeal(db, dealId, { asOf: now, rates });
  const a = await assess(db, deal, gathered, rates);
  return {
    dealId,
    inputsHash: a.hash,
    asOf: gathered.asOf,
    rates,
    result: a.result,
    flags: a.flags,
    ledger: a.data.ledger,
    proposal: a.planned.map(toProposalRow),
    blocking: a.blocking,
    needsAck: a.needsAck,
  };
}

export async function previewReconcileIn(db: Db, dealId: string): Promise<ReconcilePreview> {
  const deal = await db.partnerDeal.findUniqueOrThrow({ where: { id: dealId }, select: { currency: true, rateOverrides: true } });
  const rates = await buildRateMap(deal, await collectCurrencies(db, dealId));
  return previewWithRates(db, dealId, rates);
}

/** Step one of reconcile. The caller (the server action) checks `partner:settle` with a fresh read first. */
export async function previewReconcile(dealId: string): Promise<ReconcilePreview> {
  return previewReconcileIn(prisma, dealId);
}

// ---------------------------------------------------------------------------
// Commit: the only creator of settlements and bucket adjustments
// ---------------------------------------------------------------------------

function checkCommitArgs(a: CommitArgs): string[] {
  const errs: string[] = [];
  if (!a || typeof a.dealId !== "string" || a.dealId === "") errs.push("A deal is required.");
  if (!a || typeof a.inputsHash !== "string" || !/^[0-9a-f]{64}$/.test(a.inputsHash)) errs.push("The review reference is missing. Preview again.");
  if (!a || !a.actor || typeof a.actor.id !== "string" || a.actor.id === "") errs.push("The signed-in user is missing.");
  if (!a || !Array.isArray(a.ackedFlags) || a.ackedFlags.some((x) => typeof x !== "string")) errs.push("The acknowledged flags are malformed.");
  if (errs.length > 0) return errs;
  for (const [bucketKey, r] of Object.entries(a.reasons ?? {})) {
    const text = typeof r?.text === "string" ? r.text.trim() : "";
    if (!RECONCILE_REASONS.includes(String(r?.code))) errs.push(`The reason for ${bucketKey} is not allowed.`);
    if (text.length === 0 || text.length > 500) errs.push(`The explanation for ${bucketKey} must be 1 to 500 characters.`);
    if (r?.partnerNote !== undefined && r.partnerNote.trim().length > 280) errs.push(`The partner note for ${bucketKey} is longer than 280 characters.`);
  }
  if ((a.settlementNote ?? "").trim().length > 500) errs.push("The settlement note is longer than 500 characters.");
  if ((a.settlementPartnerNote ?? "").trim().length > 280) errs.push("The partner note is longer than 280 characters.");
  return errs;
}

async function notifyBlocked(tx: Tx, deal: DealRow, codes: string[]): Promise<void> {
  const body = codes.join(", ");
  const recent = await tx.notification.count({
    where: { type: "PARTNER_ACTIVITY", entityId: deal.id, body, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
  });
  if (recent > 0) return;
  await notify(
    {
      type: "PARTNER_ACTIVITY",
      title: `Reconcile blocked for ${deal.code}`,
      body,
      entity: "PartnerDeal",
      entityId: deal.id,
      entityCode: deal.code,
      url: `/partners/deals/${deal.id}`,
      extraRoles: ["SUPER_ADMIN"],
    },
    tx,
  );
}

/** Commit inside a caller-owned transaction (the exported `commitReconcile` wraps this in its own). */
export async function commitReconcileIn(tx: Tx, a: CommitArgs): Promise<CommitResult> {
  const invalid = (detail: string[]): CommitResult => ({ ok: false, error: "INVALID", detail });
  const bad = checkCommitArgs(a);
  if (bad.length > 0) return invalid(bad);

  await lockDeal(tx, a.dealId);
  if (!(await actorCan(tx, a.actor.id, "partner:settle"))) return { ok: false, error: "FORBIDDEN" };
  const deal = await tx.partnerDeal.findUnique({ where: { id: a.dealId }, select: DEAL_SELECT });
  if (!deal) return invalid(["The deal was not found."]);
  if (deal.status !== "ACTIVE" && deal.status !== "CLOSED") return invalid(["Only an active or closed deal can be reconciled."]);

  const checked = checkSuppliedRates(a.rates, deal, Date.now());
  if (!checked.ok) return { ok: false, error: checked.error, detail: [checked.detail] };
  const rates = checked.rates;

  const asOf = new Date();
  let gathered: GatherResult;
  let assessment: Assessment;
  try {
    gathered = await gatherDeal(tx, a.dealId, { asOf, rates });
    assessment = await assess(tx, deal, gathered, rates);
  } catch (e) {
    if (e instanceof PartnerGatherError || e instanceof EngineInvariantError) return invalid([e.message]);
    throw e;
  }
  if (assessment.hash !== a.inputsHash) return { ok: false, error: "DATA_CHANGED", detail: ["The deal's data changed since the preview. Preview again."] };

  if (assessment.blocking.length > 0) {
    await notifyBlocked(tx, deal, assessment.blocking);
    return { ok: false, error: "BLOCKED", detail: assessment.blocking };
  }
  const acked = new Set(a.ackedFlags);
  const missing = assessment.needsAck.filter((c) => !acked.has(c));
  if (missing.length > 0) return { ok: false, error: "ACK_REQUIRED", detail: missing };

  const forced = new Set(a.forceBelowMateriality ?? []);
  const adjustmentRows = assessment.planned.filter((r) => r.kind === "ADJUSTMENT" && (!r.belowMateriality || forced.has(r.bucketKey)));
  const lineRows = assessment.planned.filter((r) => r.kind === "SETTLEMENT");
  if (adjustmentRows.length === 0 && lineRows.length === 0) return { ok: false, error: "NOTHING_TO_DO" };

  const name = await actorName(tx, a.actor);
  const stamp = monotonicStamp(assessment.data.latestAt);
  const year = stamp.getFullYear();
  const formulaVersion = gathered.input.formulaVersion;
  const adjustmentCodes: string[] = [];
  let added = 0;

  for (const row of adjustmentRows) {
    const pick = a.reasons?.[row.bucketKey];
    const code = await nextCode(codePrefix.partnerAdjustment, year, tx, { pad: 4 });
    const reasonCode = pick ? pick.code : row.reasonCode;
    const created = await tx.partnerAdjustment.create({
      data: {
        code,
        dealId: deal.id,
        settlementId: row.settlementId,
        bucketKey: row.bucketKey,
        currency: deal.currency,
        amount: dec(row.deltaMinor),
        reasonCode,
        reason: pick ? pick.text.trim() : `Restated by reconcile (${row.reasonCode})`,
        partnerNote: pick?.partnerNote?.trim() ? pick.partnerNote.trim() : null,
        evidence: JSON.stringify({
          engineNow: row.engineMinor,
          creditedBefore: row.creditedMinor,
          delta: row.deltaMinor,
          inputsHash: assessment.hash,
          changedLines: row.changedLines,
          orderIds: row.orderIds,
        }),
        realizationKey: row.realizationKey,
        formulaVersion,
        rates: JSON.stringify(rates),
        createdById: a.actor.id,
        createdByName: name,
        createdAt: stamp,
      },
    });
    adjustmentCodes.push(code);
    added += row.deltaMinor;
    await writeAudit(
      {
        userId: a.actor.id,
        userName: name,
        entity: "PartnerAdjustment",
        entityId: created.id,
        entityCode: code,
        action: "ADJUSTMENT_ADDED",
        newValue: `Adjustment ${code} recorded`,
        metadata: { dealId: deal.id, dealCode: deal.code, amountMinor: row.deltaMinor, bucketKey: row.bucketKey, reasonCode, via: "reconcile" },
      },
      tx,
    );
  }

  let settlementCode: string | null = null;
  if (lineRows.length > 0) {
    const amount = lineRows.reduce((s, r) => s + r.deltaMinor, 0);
    const seq = ((await tx.partnerSettlement.aggregate({ where: { dealId: deal.id }, _max: { seq: true } }))._max.seq ?? 0) + 1;
    settlementCode = await nextCode(codePrefix.partnerSettlement, year, tx, { pad: 4 });
    const ackedFlags = assessment.flags
      .filter((f) => f.severity === "ACK")
      .map((f) => ({ code: f.code, severity: f.severity, ackedByName: name, ...(f.unitKey ? { unitKey: f.unitKey } : {}), ...(f.bucketKey ? { bucketKey: f.bucketKey } : {}) }));
    const settlement = await tx.partnerSettlement.create({
      data: {
        code: settlementCode,
        dealId: deal.id,
        seq,
        formulaVersion,
        termsVersion: deal.termsVersion,
        currency: deal.currency,
        asOf,
        terms: JSON.stringify({ ...gathered.input.terms, earnOn: gathered.input.earnOn, currency: gathered.input.currency, termsVersion: deal.termsVersion }),
        inputs: JSON.stringify({ input: gathered.input, evidence: gathered.evidence }),
        inputsHash: assessment.hash,
        result: JSON.stringify(assessment.result),
        rates: JSON.stringify(rates),
        flags: JSON.stringify(ackedFlags),
        earnedTotal: dec(assessment.result.totalMinor),
        positionBefore: dec(assessment.data.ledger.position + added),
        amount: dec(amount),
        note: a.settlementNote?.trim() ? a.settlementNote.trim() : null,
        partnerNote: a.settlementPartnerNote?.trim() ? a.settlementPartnerNote.trim() : null,
        createdById: a.actor.id,
        createdByName: name,
        createdAt: stamp,
        lines: {
          create: lineRows.map((r) => ({
            dealId: deal.id,
            bucketKey: r.bucketKey,
            cumulative: dec(r.engineMinor),
            creditedBefore: dec(r.creditedMinor),
            amount: dec(r.deltaMinor),
            reasons: JSON.stringify(r.reasons),
            realizationKey: r.realizationKey,
            createdAt: stamp,
          })),
        },
      },
    });
    await writeAudit(
      {
        userId: a.actor.id,
        userName: name,
        entity: "PartnerSettlement",
        entityId: settlement.id,
        entityCode: settlementCode,
        action: "SETTLEMENT_CREATED",
        newValue: `Settlement ${settlementCode} recorded`,
        metadata: {
          dealId: deal.id,
          dealCode: deal.code,
          amountMinor: amount,
          lines: lineRows.length,
          inputsHash: assessment.hash,
          ackedFlags: ackedFlags.map((f) => f.code),
        },
      },
      tx,
    );
  }
  // Rates are frozen on the deal at the first commit; a currency first used by a later commit is frozen then, so
  // live FX churn can never move an amount that has already been credited.
  const frozenNow = parseOverrideMap(deal.rateOverrides);
  const toFreeze = gathered.evidence.currenciesUsed.filter((c) => c !== "LKR" && !(c in frozenNow) && rates.perUnit[c] !== undefined);
  if (deal.ratesFrozenAt === null || toFreeze.length > 0) {
    const merged: Record<string, string> = { ...frozenNow };
    for (const c of toFreeze) merged[c] = rates.perUnit[c].rate;
    const sortedMerged = Object.fromEntries(Object.entries(merged).sort(([x], [y]) => x.localeCompare(y)));
    await tx.partnerDeal.update({
      where: { id: deal.id },
      data: {
        ...(deal.ratesFrozenAt === null ? { ratesFrozenAt: asOf } : {}),
        ...(Object.keys(sortedMerged).length > 0 ? { rateOverrides: JSON.stringify(sortedMerged) } : {}),
      },
    });
  }
  return { ok: true, settlementCode, adjustmentCodes };
}

export async function commitReconcile(a: CommitArgs): Promise<CommitResult> {
  return prisma.$transaction((tx) => commitReconcileIn(tx, a), TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Manual adjustments
// ---------------------------------------------------------------------------

export type AdjustmentArgs = {
  dealId: string;
  bucketKey: string | null;
  amountMinor: Minor;
  reasonCode: string;
  reason: string;
  partnerNote?: string;
  settlementId?: string;
  actor: Actor;
};

export async function createAdjustmentIn(tx: Tx, a: AdjustmentArgs): Promise<CodeOutcome> {
  const reason = typeof a?.reason === "string" ? a.reason.trim() : "";
  const note = a?.partnerNote?.trim() ?? "";
  if (!a || typeof a.dealId !== "string" || a.dealId === "") return fail("A deal is required.");
  if (!a.actor || typeof a.actor.id !== "string" || a.actor.id === "") return fail("The signed-in user is missing.");
  if (!Number.isSafeInteger(a.amountMinor) || a.amountMinor === 0) return fail("The adjustment amount must be a non-zero amount.");
  if (!(ADJUSTMENT_REASONS as readonly string[]).includes(a.reasonCode)) return fail("Choose a reason for the adjustment.");
  if (reason.length === 0 || reason.length > 500) return fail("Explain the adjustment in 1 to 500 characters.");
  if (note.length > 280) return fail("The partner note can be at most 280 characters.");

  await lockDeal(tx, a.dealId);
  if (!(await actorCan(tx, a.actor.id, "partner:settle"))) return forbidden();
  const deal = await tx.partnerDeal.findUnique({ where: { id: a.dealId }, select: DEAL_SELECT });
  if (!deal) return fail("The deal was not found.");
  if (deal.status !== "ACTIVE" && deal.status !== "CLOSED") return fail("Adjustments can only be added to an active or closed deal.");
  if (a.settlementId) {
    const s = await tx.partnerSettlement.findFirst({ where: { id: a.settlementId, dealId: deal.id }, select: { id: true } });
    if (!s) return fail("That settlement does not belong to this deal.");
  }
  const data = await loadLedger(tx, deal.id);
  if (a.bucketKey !== null) {
    const known =
      data.ledger.perBucket.some((p) => p.bucketKey === a.bucketKey) ||
      (deal.scope === "POOLED"
        ? a.bucketKey === "POOL"
        : (await tx.partnerDealStone.count({ where: { id: a.bucketKey, dealId: deal.id } })) > 0);
    if (!known) return fail("That bucket does not belong to this deal.");
  }
  const creditedBefore = a.bucketKey === null ? 0 : data.ledger.perBucket.find((p) => p.bucketKey === a.bucketKey)?.credited ?? 0;

  const evidence: Record<string, unknown> = { engineNow: null, creditedBefore, delta: a.amountMinor, inputsHash: null, orderIds: [] };
  let ratesJson = "{}";
  try {
    const rates = await buildRateMap(deal, await collectCurrencies(tx, deal.id));
    const g = await gatherDeal(tx, deal.id, { asOf: new Date(), rates, crossDeal: false });
    const r = runEngineVersioned(g.input);
    const b = a.bucketKey === null ? null : r.buckets.find((x) => x.bucketKey === a.bucketKey) ?? null;
    evidence.engineNow = a.bucketKey === null ? r.totalMinor : b ? b.amountMinor : 0;
    evidence.inputsHash = inputsHashOf(g);
    if (b) evidence.orderIds = bucketOrderIds(g.input, b.bucketKey, b.soldUnitKeys);
    ratesJson = JSON.stringify(rates);
  } catch {
    // the evidence stays partial: a manual adjustment must not depend on the live data being calculable
  }

  const name = await actorName(tx, a.actor);
  const stamp = monotonicStamp(data.latestAt);
  const code = await nextCode(codePrefix.partnerAdjustment, stamp.getFullYear(), tx, { pad: 4 });
  const created = await tx.partnerAdjustment.create({
    data: {
      code,
      dealId: deal.id,
      settlementId: a.settlementId ?? null,
      bucketKey: a.bucketKey,
      currency: deal.currency,
      amount: dec(a.amountMinor),
      reasonCode: a.reasonCode,
      reason,
      partnerNote: note === "" ? null : note,
      evidence: JSON.stringify(evidence),
      realizationKey: null,
      formulaVersion: deal.formulaVersion,
      rates: ratesJson,
      createdById: a.actor.id,
      createdByName: name,
      createdAt: stamp,
    },
  });
  await writeAudit(
    {
      userId: a.actor.id,
      userName: name,
      entity: "PartnerAdjustment",
      entityId: created.id,
      entityCode: code,
      action: "ADJUSTMENT_ADDED",
      newValue: `Adjustment ${code} recorded`,
      metadata: { dealId: deal.id, dealCode: deal.code, amountMinor: a.amountMinor, bucketKey: a.bucketKey, reasonCode: a.reasonCode, via: "manual" },
    },
    tx,
  );
  return { ok: true, code };
}

export async function createAdjustment(a: AdjustmentArgs): Promise<CodeOutcome> {
  return prisma.$transaction((tx) => createAdjustmentIn(tx, a), TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Payouts and reversals
// ---------------------------------------------------------------------------

export type PayoutArgs = {
  dealId: string;
  direction: "PAID" | "RECEIVED";
  amountMinor: Minor;
  paidAt: Date;
  method?: string;
  reference?: string;
  originalAmountMinor?: Minor;
  originalCurrency?: string;
  partnerNote?: string;
  ackPayingAhead?: boolean;
  actor: Actor;
};

/**
 * For a SALE deal: how much of the position the buyers have actually paid for. Each credited bucket counts at its
 * revenue-weighted buyer-paid fraction; deal-level adjustments count in full. PAYMENT deals already earn on collection.
 */
async function collectedShare(
  db: Db,
  deal: DealRow,
  data: LedgerData,
): Promise<{ collectedMinor: Minor; perBucket: { bucketKey: string; creditedMinor: Minor; paidFraction: { n: string; d: string } }[] }> {
  const now = new Date();
  const rates = await buildRateMap(deal, await collectCurrencies(db, deal.id));
  const gathered = await gatherDeal(db, deal.id, { asOf: now, rates, crossDeal: false });
  const result = runEngineVersioned(gathered.input);
  const orderIds = uniq(gathered.evidence.units.map((u) => u.order?.id).filter((x): x is string => typeof x === "string"));
  const orders = orderIds.length
    ? await db.salesOrder.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true, status: true, saleDate: true, createdAt: true, agreedPrice: true, totalAmount: true, currency: true,
          payments: { select: { id: true, amount: true, currency: true, orderCurrencyAmount: true, receivedAt: true } },
        },
      })
    : [];
  const micro = microFromRates(rates);
  const conv = (amount: Minor, from: string, to: string): Minor | null => {
    try {
      return convertMinor(amount, from, to, micro);
    } catch {
      return null;
    }
  };
  const paidOf = new Map<string, Rat>();
  for (const u of gathered.evidence.units) {
    const o = orders.find((x) => x.id === u.order?.id);
    if (!o) continue;
    const ev = evaluateSale({
      orders: [o], earnOn: "PAYMENT", asOf: now, countSalesFrom: null, addedAt: new Date(0), dealCurrency: deal.currency, conv, lack: (f, t) => `${f}/${t}`,
    });
    // A payment that cannot be priced counts as unpaid: the safe side for a paying-ahead check.
    paidOf.set(u.unitKey, ev.sale && ev.sale.fracNum !== null && ev.sale.fracDen > 0 ? ratFrom(ev.sale.fracNum, ev.sale.fracDen) : RAT_ZERO);
  }
  const weightOf = new Map(gathered.evidence.units.map((u) => [u.unitKey, Math.max(0, u.order?.priceConvertedMinor ?? 0)] as const));
  let collected = 0;
  const per: { bucketKey: string; creditedMinor: Minor; paidFraction: { n: string; d: string } }[] = [];
  for (const b of result.buckets) {
    const credited = data.ledger.perBucket.find((p) => p.bucketKey === b.bucketKey)?.credited ?? 0;
    const flat = b.soldUnitKeys.every((k) => (weightOf.get(k) ?? 0) === 0);
    let sum = RAT_ZERO;
    let weight = 0;
    for (const k of b.soldUnitKeys) {
      const w = flat ? 1 : weightOf.get(k) ?? 0;
      sum = ratAdd(sum, ratMulInt(paidOf.get(k) ?? RAT_ZERO, w));
      weight += w;
    }
    const fraction = weight > 0 ? ratDivBig(sum, BigInt(weight)) : RAT_ZERO;
    per.push({ bucketKey: b.bucketKey, creditedMinor: credited, paidFraction: ratToStrings(fraction) });
    if (credited > 0) collected += mulRat(credited, fraction);
  }
  const dealLevel = data.adjustments.filter((x) => x.bucketKey === null).reduce((s, x) => s + x.amount, 0);
  return { collectedMinor: collected + dealLevel, perBucket: per };
}

/** What the buyers have paid against the credited position of a SALE deal (null for a PAYMENT deal). For the payout dialog. */
export async function getCollectedShare(db: Db, dealId: string) {
  const deal = await db.partnerDeal.findUniqueOrThrow({ where: { id: dealId }, select: DEAL_SELECT });
  if (deal.earnOn !== "SALE") return null;
  return collectedShare(db, deal, await loadLedger(db, dealId));
}

export async function recordPayoutIn(tx: Tx, a: PayoutArgs): Promise<CodeOutcome> {
  if (!a || typeof a.dealId !== "string" || a.dealId === "") return fail("A deal is required.");
  if (!a.actor || typeof a.actor.id !== "string" || a.actor.id === "") return fail("The signed-in user is missing.");
  if (a.direction !== "PAID" && a.direction !== "RECEIVED") return fail("Choose whether this is a payment to the partner or a repayment from them.");
  if (!Number.isSafeInteger(a.amountMinor) || a.amountMinor <= 0) return fail("The amount must be greater than zero.");
  if (!(a.paidAt instanceof Date) || Number.isNaN(a.paidAt.getTime())) return fail("Enter the date of the payment.");
  // Date-only inputs arrive as UTC midnight, so the check allows for time zones ahead of UTC.
  if (a.paidAt.getTime() > Date.now() + PAID_DATE_SLACK_MS) return fail("The payment date cannot be in the future.");
  if (a.method !== undefined && !(PAYOUT_PAYMENT_METHODS as readonly string[]).includes(a.method)) return fail("Choose how the money was paid.");
  const reference = a.reference?.trim() ?? "";
  const note = a.partnerNote?.trim() ?? "";
  if (reference.length > 200) return fail("The reference can be at most 200 characters.");
  if (note.length > 280) return fail("The partner note can be at most 280 characters.");
  if ((a.originalAmountMinor === undefined) !== (a.originalCurrency === undefined)) return fail("Give both the original amount and its currency, or neither.");
  if (a.originalAmountMinor !== undefined && (!Number.isSafeInteger(a.originalAmountMinor) || a.originalAmountMinor <= 0)) {
    return fail("The original amount must be greater than zero.");
  }
  if (a.originalCurrency !== undefined && !/^[A-Z]{3}$/.test(a.originalCurrency)) return fail("The original currency is not valid.");

  await lockDeal(tx, a.dealId);
  if (!(await actorCan(tx, a.actor.id, "partner:settle"))) return forbidden();
  const deal = await tx.partnerDeal.findUnique({ where: { id: a.dealId }, select: DEAL_SELECT });
  if (!deal) return fail("The deal was not found.");
  if (deal.status !== "ACTIVE" && deal.status !== "CLOSED") return fail("Payouts can only be recorded on an active or closed deal.");
  const data = await loadLedger(tx, deal.id);
  const { balance, netPaid } = data.ledger;

  if (a.direction === "PAID") {
    if (a.amountMinor > balance) {
      return fail(`The payout of ${fmtMinor(a.amountMinor)} exceeds balance ${fmtMinor(Math.max(0, balance))}. Advances are not supported.`);
    }
    if (deal.earnOn === "SALE" && a.ackPayingAhead !== true) {
      const share = await collectedShare(tx, deal, data);
      if (netPaid + a.amountMinor > share.collectedMinor) {
        return fail(
          `Paying ahead of collection: the buyers have paid for ${fmtMinor(Math.max(0, share.collectedMinor))} of this position and ${fmtMinor(netPaid)} was already paid out. Confirm to pay ahead.`,
        );
      }
    }
  } else {
    const owed = Math.max(0, -balance);
    if (a.amountMinor > owed) {
      return fail(`The repayment of ${fmtMinor(a.amountMinor)} exceeds amount owed by partner ${fmtMinor(owed)}.`);
    }
    if (a.amountMinor > netPaid) return fail(`The repayment of ${fmtMinor(a.amountMinor)} exceeds the net amount paid out so far (${fmtMinor(netPaid)}).`);
  }

  const latest = await tx.partnerSettlement.findFirst({ where: { dealId: deal.id }, orderBy: { seq: "desc" }, select: { id: true } });
  const name = await actorName(tx, a.actor);
  const stamp = monotonicStamp(data.latestAt);
  const code = await nextCode(codePrefix.partnerPayout, stamp.getFullYear(), tx, { pad: 4 });
  const created = await tx.partnerPayout.create({
    data: {
      code,
      dealId: deal.id,
      settlementId: latest?.id ?? null,
      direction: a.direction,
      currency: deal.currency,
      amount: dec(a.amountMinor),
      paidAt: a.paidAt,
      method: a.method ?? null,
      reference: reference === "" ? null : reference,
      originalAmount: a.originalAmountMinor === undefined ? null : dec(a.originalAmountMinor),
      originalCurrency: a.originalCurrency ?? null,
      partnerNote: note === "" ? null : note,
      createdById: a.actor.id,
      createdByName: name,
      createdAt: stamp,
    },
  });
  await writeAudit(
    {
      userId: a.actor.id,
      userName: name,
      entity: "PartnerPayout",
      entityId: created.id,
      entityCode: code,
      action: "PAYOUT_RECORDED",
      newValue: `${a.direction === "PAID" ? "Payout" : "Repayment"} ${code} recorded`,
      metadata: { dealId: deal.id, dealCode: deal.code, direction: a.direction, amountMinor: a.amountMinor, payingAheadAcknowledged: a.ackPayingAhead === true },
    },
    tx,
  );
  return { ok: true, code };
}

export async function recordPayout(a: PayoutArgs): Promise<CodeOutcome> {
  return prisma.$transaction((tx) => recordPayoutIn(tx, a), TX_OPTIONS);
}

export async function reversePayoutIn(tx: Tx, a: { payoutId: string; reason: string; actor: Actor }): Promise<CodeOutcome> {
  const reason = typeof a?.reason === "string" ? a.reason.trim() : "";
  if (!a || typeof a.payoutId !== "string" || a.payoutId === "") return fail("A payout is required.");
  if (!a.actor || typeof a.actor.id !== "string" || a.actor.id === "") return fail("The signed-in user is missing.");
  if (reason.length === 0 || reason.length > 200) return fail("Explain the reversal in 1 to 200 characters.");

  const first = await tx.partnerPayout.findUnique({ where: { id: a.payoutId }, select: { dealId: true } });
  if (!first) return fail("The payout was not found.");
  await lockDeal(tx, first.dealId);
  if (!(await actorCan(tx, a.actor.id, "partner:settle"))) return forbidden();
  const original = await tx.partnerPayout.findUnique({ where: { id: a.payoutId } });
  if (!original) return fail("The payout was not found.");
  if (original.direction !== "PAID") return fail("Only a payment made to the partner can be reversed.");
  const existing = await tx.partnerPayout.findFirst({ where: { reversalOfId: original.id }, select: { code: true } });
  if (existing) return fail(`This payout was already reversed (${existing.code}).`);
  const data = await loadLedger(tx, original.dealId);
  const amount = minor(original.amount);
  if (data.ledger.netPaid - amount < 0) return fail("Reversing this payout would make the net amount paid negative.");

  const name = await actorName(tx, a.actor);
  const stamp = monotonicStamp(data.latestAt);
  const code = await nextCode(codePrefix.partnerPayout, stamp.getFullYear(), tx, { pad: 4 });
  let created: { id: string };
  try {
    created = await tx.partnerPayout.create({
      data: {
        code,
        dealId: original.dealId,
        settlementId: original.settlementId,
        direction: "RECEIVED",
        currency: original.currency,
        amount: dec(amount),
        paidAt: stamp,
        method: original.method,
        reference: `Reversal of ${original.code}: ${reason}`.slice(0, 300),
        originalAmount: original.originalAmount === null ? null : dec(minor(original.originalAmount)),
        originalCurrency: original.originalCurrency,
        reversalOfId: original.id,
        createdById: a.actor.id,
        createdByName: name,
        createdAt: stamp,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("This payout was already reversed.");
    throw e;
  }
  await writeAudit(
    {
      userId: a.actor.id,
      userName: name,
      entity: "PartnerPayout",
      entityId: created.id,
      entityCode: code,
      action: "PAYOUT_REVERSED",
      newValue: `Payout ${original.code} reversed`,
      metadata: { dealId: original.dealId, reversalOfId: original.id, originalCode: original.code, amountMinor: amount },
    },
    tx,
  );
  return { ok: true, code };
}

export async function reversePayout(a: { payoutId: string; reason: string; actor: Actor }): Promise<CodeOutcome> {
  return prisma.$transaction((tx) => reversePayoutIn(tx, a), TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Write-off and revalue
// ---------------------------------------------------------------------------

async function stoneHasLiveSale(db: Db, ds: { roughStoneId: string | null; gemstoneId: string | null }): Promise<boolean> {
  const gemIds: string[] = [];
  if (ds.gemstoneId) gemIds.push(ds.gemstoneId);
  if (ds.roughStoneId) gemIds.push(...((await derivedGemIdsByRough(db, [ds.roughStoneId])).get(ds.roughStoneId) ?? []));
  if (gemIds.length === 0) return false;
  return (await db.salesOrder.count({ where: { gemstoneId: { in: gemIds }, status: { in: [...LIVE_SALE_STATUSES] } } })) > 0;
}

/**
 * Marks an investment stone's capital as written off (lost or unsellable). Pari passu: its capital is simply not returned.
 * Capital-protected: the company bears it, which the admin records with a manual STONE_WRITTEN_OFF adjustment.
 */
export async function writeOffStoneIn(tx: Tx, a: { dealId: string; dealStoneId: string; note: string; actor: Actor }): Promise<Outcome> {
  const note = typeof a?.note === "string" ? a.note.trim() : "";
  if (!a || typeof a.dealId !== "string" || typeof a.dealStoneId !== "string" || a.dealId === "" || a.dealStoneId === "") return fail("A deal and a stone are required.");
  if (!a.actor || typeof a.actor.id !== "string" || a.actor.id === "") return fail("The signed-in user is missing.");
  if (note.length === 0 || note.length > 500) return fail("Explain the write-off in 1 to 500 characters.");

  await lockDeal(tx, a.dealId);
  if (!(await actorCan(tx, a.actor.id, "partner:settle"))) return forbidden();
  const deal = await tx.partnerDeal.findUnique({ where: { id: a.dealId }, select: { id: true, code: true, status: true, method: true } });
  if (!deal) return fail("The deal was not found.");
  if (deal.method !== "INVESTMENT") return fail("Only investment deals track written-off capital.");
  if (deal.status !== "ACTIVE") return fail("Only an active deal can have a stone written off.");
  const ds = await tx.partnerDealStone.findFirst({
    where: { id: a.dealStoneId, dealId: deal.id, removedAt: null },
    select: { id: true, writtenOffAt: true, roughStoneId: true, gemstoneId: true },
  });
  if (!ds) return fail("That stone is not in this deal.");
  if (ds.writtenOffAt !== null) return fail("That stone is already written off.");
  if (await stoneHasLiveSale(tx, ds)) return fail("A stone with a live sale cannot be written off.");

  const name = await actorName(tx, a.actor);
  await tx.partnerDealStone.update({ where: { id: ds.id }, data: { writtenOffAt: new Date(), writtenOffNote: note } });
  await writeAudit(
    {
      userId: a.actor.id,
      userName: name,
      entity: "PartnerDealStone",
      entityId: ds.id,
      entityCode: deal.code,
      action: "STONE_WRITTEN_OFF",
      newValue: "Stone written off",
      metadata: { dealId: deal.id, dealCode: deal.code, note },
    },
    tx,
  );
  return { ok: true };
}

export async function writeOffStone(a: { dealId: string; dealStoneId: string; note: string; actor: Actor }): Promise<Outcome> {
  return prisma.$transaction((tx) => writeOffStoneIn(tx, a), TX_OPTIONS);
}

/** The only way to change rates once they are frozen. The next reconcile proposes the effect as an FX correction. */
export async function revalueRatesIn(tx: Tx, a: { dealId: string; rates: Record<string, string>; reason: string; actor: Actor }): Promise<Outcome> {
  const reason = typeof a?.reason === "string" ? a.reason.trim() : "";
  if (!a || typeof a.dealId !== "string" || a.dealId === "") return fail("A deal is required.");
  if (!a.actor || typeof a.actor.id !== "string" || a.actor.id === "") return fail("The signed-in user is missing.");
  if (reason.length === 0 || reason.length > 500) return fail("Explain the revaluation in 1 to 500 characters.");
  if (!isRecord(a.rates) || Object.keys(a.rates).length === 0) return fail("Give at least one exchange rate.");
  const next: Record<string, string> = {};
  for (const [ccy, raw] of Object.entries(a.rates)) {
    if (!/^[A-Z]{3}$/.test(ccy) || ccy === "LKR" || !(PARTNER_CURRENCIES as readonly string[]).includes(ccy)) return fail(`${ccy} is not a currency a deal can use.`);
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!RATE_RE.test(text) || parseScaled(text, 6) <= 0n) return fail(`The ${ccy} rate must be a positive number with at most 6 decimals.`);
    next[ccy] = rate6(parseScaled(text, 6));
  }

  await lockDeal(tx, a.dealId);
  if (!(await actorCan(tx, a.actor.id, "partner:settle"))) return forbidden();
  const deal = await tx.partnerDeal.findUnique({ where: { id: a.dealId }, select: { id: true, code: true, status: true, rateOverrides: true } });
  if (!deal) return fail("The deal was not found.");
  if (deal.status !== "ACTIVE" && deal.status !== "CLOSED") return fail("Only an active or closed deal can be revalued.");
  const before = parseOverrideMap(deal.rateOverrides);
  const changed = Object.entries(next).filter(([ccy, rate]) => before[ccy] !== rate);
  if (changed.length === 0) return fail("Those rates are already in use.");
  const merged = Object.fromEntries(Object.entries({ ...before, ...next }).sort(([x], [y]) => x.localeCompare(y)));
  const name = await actorName(tx, a.actor);
  await tx.partnerDeal.update({ where: { id: deal.id }, data: { rateOverrides: JSON.stringify(merged) } });
  await writeAudit(
    {
      userId: a.actor.id,
      userName: name,
      entity: "PartnerDeal",
      entityId: deal.id,
      entityCode: deal.code,
      action: "RATES_REVALUED",
      newValue: "Exchange rates revalued",
      metadata: { dealId: deal.id, before: Object.fromEntries(changed.map(([c]) => [c, before[c] ?? null])), after: Object.fromEntries(changed), reason },
    },
    tx,
  );
  return { ok: true };
}

export async function revalueRates(a: { dealId: string; rates: Record<string, string>; reason: string; actor: Actor }): Promise<Outcome> {
  return prisma.$transaction((tx) => revalueRatesIn(tx, a), TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Snapshot verification
// ---------------------------------------------------------------------------

function firstDifference(stored: unknown, replayed: unknown, path = ""): string {
  if (isRecord(stored) && isRecord(replayed)) {
    for (const k of uniq([...Object.keys(stored), ...Object.keys(replayed)]).sort()) {
      if (canonicalJson(stored[k]) !== canonicalJson(replayed[k])) return firstDifference(stored[k], replayed[k], path ? `${path}.${k}` : k);
    }
  }
  if (Array.isArray(stored) && Array.isArray(replayed)) {
    for (let i = 0; i < Math.max(stored.length, replayed.length); i++) {
      if (canonicalJson(stored[i]) !== canonicalJson(replayed[i])) return firstDifference(stored[i], replayed[i], `${path}[${i}]`);
    }
  }
  const show = (v: unknown): string => canonicalJson(v).slice(0, 80);
  return `${path || "result"}: stored ${show(stored)}, replayed ${show(replayed)}`;
}

/** Re-runs a stored snapshot through the engine version it was written with and compares the result. */
export async function replaySettlementIn(db: Db, settlementId: string): Promise<{ match: boolean; diff?: string }> {
  const s = await db.partnerSettlement.findUnique({
    where: { id: settlementId },
    select: { formulaVersion: true, inputs: true, inputsHash: true, result: true },
  });
  if (!s) return { match: false, diff: "The settlement was not found." };
  const inputs = parseJson(s.inputs);
  if (!isRecord(inputs) || !isRecord(inputs.input)) return { match: false, diff: "The stored inputs cannot be read." };
  if (sha256(canonicalJson(inputs)) !== s.inputsHash) return { match: false, diff: "The stored inputs no longer match their recorded hash." };
  if (!hasOwn(ENGINES, s.formulaVersion)) return { match: false, diff: `No engine is registered for formula version ${s.formulaVersion}.` };
  let replayed: unknown;
  try {
    replayed = JSON.parse(JSON.stringify(ENGINES[s.formulaVersion](inputs.input as unknown as EngineInput)));
  } catch (e) {
    return { match: false, diff: `The calculation failed: ${e instanceof Error ? e.message : "unknown error"}` };
  }
  const stored = parseJson(s.result);
  if (canonicalJson(stored) === canonicalJson(replayed)) return { match: true };
  return { match: false, diff: firstDifference(stored, replayed) };
}

export async function replaySettlement(settlementId: string): Promise<{ match: boolean; diff?: string }> {
  return replaySettlementIn(prisma, settlementId);
}

// ---------------------------------------------------------------------------
// Activation checks and the membership lock
// ---------------------------------------------------------------------------

const FLAG_HINT: Record<string, string> = {
  DUPLICATE_UNIT: "A stone is counted twice in this deal.",
  OVERLAP_ROUGH_GEM: "A rough and a gem cut from it are both in this deal.",
  ALLOCATION_INCOMPLETE: "Some stones have no allocated acquisition cost.",
  INVESTED_EXCEEDS_BASIS: "A stone's invested amount is more than its eligible cost.",
  NEGATIVE_AMOUNT: "An amount is negative or too large to calculate.",
  STONE_ALREADY_SOLD: "A stone was sold before it joined the deal.",
  MULTIPLE_LIVE_SALES: "A stone has more than one live sale.",
};
const flagText = (f: GatherFlag): string => `${FLAG_HINT[f.code] ?? f.code.replace(/_/g, " ").toLowerCase()} (${f.detail})`;

export async function validateDealForActivationIn(db: Db, dealId: string): Promise<{ ok: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const deal = await db.partnerDeal.findUnique({ where: { id: dealId }, select: { ...DEAL_SELECT, partner: { select: { active: true } } } });
  if (!deal) return { ok: false, errors: ["The deal was not found."], warnings };
  if (deal.status !== "DRAFT") errors.push("Only a draft deal can be activated.");
  if (!deal.partner.active) errors.push("The partner is not active.");
  const stones = await db.partnerDealStone.findMany({
    where: { dealId, removedAt: null },
    select: { id: true, roughStoneId: true, gemstoneId: true, investedAlloc: true, acquisitionSource: true, roughStone: { select: { parcelId: true } } },
  });
  if (stones.length === 0) errors.push("Add at least one stone to the deal.");

  const draft: TermsDraft = {
    method: deal.method,
    scope: deal.scope,
    earnOn: deal.earnOn,
    currency: deal.currency,
    ratePct: deal.ratePct?.toString() ?? null,
    fixedFee: deal.fixedFee?.toString() ?? null,
    invested: deal.invested?.toString() ?? null,
    capitalProtected: deal.capitalProtected,
    poolAcquisitionCost: deal.poolAcquisitionCost?.toString() ?? null,
    investedAlloc: deal.method === "INVESTMENT" ? stones.map((s) => s.investedAlloc?.toString() ?? null) : undefined,
  };
  const termErrors = validateTerms(draft);
  errors.push(...termErrors);
  if (termErrors.length > 0 || stones.length === 0) return { ok: errors.length === 0, errors: uniq(errors), warnings };

  const caps = await validateCoPartnerCaps(db, {
    dealId,
    method: deal.method,
    ratePct: deal.ratePct === null ? null : Number(deal.ratePct.toString()),
    stones: stones.map((s) => (s.roughStoneId ? { kind: "ROUGH" as const, id: s.roughStoneId } : { kind: "GEM" as const, id: s.gemstoneId! })),
  });
  errors.push(...caps.errors);
  warnings.push(...caps.warnings);

  let gathered: GatherResult;
  try {
    const rates = await buildRateMap(deal, await collectCurrencies(db, dealId));
    gathered = await gatherDeal(db, dealId, { asOf: new Date(), rates });
  } catch (e) {
    if (e instanceof PartnerGatherError) return { ok: false, errors: uniq([...errors, e.message]), warnings };
    throw e;
  }
  const parcelsChosen = stones.filter((s) => s.roughStone?.parcelId).every((s) => s.acquisitionSource !== null);
  for (const f of gathered.flags) {
    if (f.code === "CO_PARTNER_CAP_EXCEEDED" || f.code === "INVESTED_MISMATCH") continue;
    if (f.code === "PARCEL_DRIFT") {
      (parcelsChosen ? warnings : errors).push(
        parcelsChosen
          ? `A parcel's price differs from its stones' prices (${f.detail}).`
          : "A parcel's price differs from its stones' prices: allocate the parcel total or confirm each stone's price before starting the deal.",
      );
    } else if (f.severity === "BLOCK") errors.push(flagText(f));
    else if (f.severity === "ACK") warnings.push(flagText(f));
  }
  try {
    const result = runEngineVersioned(gathered.input);
    const ob = await obligationsFor(db, { ...deal }, { gathered, result });
    if (ob.blocked) errors.push("Together with the other partner deals on these stones, the amounts owed exceed the revenue.");
    if (ob.exceedsProfit) warnings.push("Together with the other partner deals on these stones, the amounts owed exceed the company's profit.");
  } catch (e) {
    if (!(e instanceof EngineInvariantError)) throw e;
    errors.push(e.message);
  }
  return { ok: errors.length === 0, errors: uniq(errors), warnings: uniq(warnings) };
}

export async function validateDealForActivation(dealId: string): Promise<{ ok: boolean; errors: string[]; warnings: string[] }> {
  return validateDealForActivationIn(prisma, dealId);
}

/**
 * Why stones cannot be attached or removed right now, or null. After the first settlement the stone set is frozen for
 * pooled fixed-fee deals and for investment deals (it would move the fraction or the invested split); a stone with a
 * credited amount or a live sale can never be removed.
 */
export async function membershipLockReason(
  db: Db,
  dealId: string,
  op: "ATTACH" | "DETACH",
  dealStoneId?: string,
): Promise<string | null> {
  const deal = await db.partnerDeal.findUnique({ where: { id: dealId }, select: { method: true, scope: true } });
  if (!deal) return "The deal was not found.";
  const settled = (await db.partnerSettlement.count({ where: { dealId } })) > 0;
  const frozenKind = deal.method === "INVESTMENT" || (deal.method === "FIXED_FEE" && deal.scope === "POOLED");
  if (settled && frozenKind) return "Stones cannot be added or removed after the first settlement on this kind of deal.";
  if (op === "DETACH") {
    if (!dealStoneId) return "Choose the stone to remove.";
    const ds = await db.partnerDealStone.findFirst({ where: { id: dealStoneId, dealId }, select: { id: true, roughStoneId: true, gemstoneId: true } });
    if (!ds) return "That stone is not in this deal.";
    const bucketKey = deal.scope === "POOLED" ? "POOL" : ds.id;
    const credited = (await getLedger(db, dealId)).perBucket.find((p) => p.bucketKey === bucketKey)?.credited ?? 0;
    if (credited !== 0) return "A stone that has been credited to the partner cannot be removed.";
    if (await stoneHasLiveSale(db, ds)) return "A stone with a live sale cannot be removed.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Allocators (frozen per-stone acquisition costs and invested principal)
// ---------------------------------------------------------------------------

type AllocationSpec = {
  source: "POOL_LUMP" | "PARCEL_TOTAL" | "MANUAL";
  basis?: "WEIGHT" | "EQUAL";
  amountMinor?: Minor;
  currency?: string;
  manual?: { dealStoneId: string; amountMinor: Minor }[];
};

function weightMilliOf(ct: Num | null | undefined): number {
  if (ct === null || ct === undefined) return 0;
  try {
    return Math.max(0, Number(parseScaled(ct.toString(), 3)));
  } catch {
    return 0;
  }
}

/** Frozen attach weights, else current weights, else equal: whichever is the first set with every stone positive. */
function allocationWeights(frozen: number[], current: number[]): number[] {
  if (frozen.length > 0 && frozen.every((w) => w > 0)) return frozen;
  if (current.length > 0 && current.every((w) => w > 0)) return current;
  return frozen.map(() => 1);
}

export async function allocateAcquisitionIn(tx: Tx, dealId: string, spec: AllocationSpec, actorId: string): Promise<Outcome> {
  if (typeof dealId !== "string" || dealId === "" || typeof actorId !== "string" || actorId === "") return fail("A deal and a user are required.");
  if (!spec || !["POOL_LUMP", "PARCEL_TOTAL", "MANUAL"].includes(spec.source)) return fail("Choose how the cost is allocated.");

  await lockDeal(tx, dealId);
  if (!(await actorCan(tx, actorId, "partner:write"))) return forbidden();
  const deal = await tx.partnerDeal.findUnique({ where: { id: dealId }, select: { id: true, code: true, status: true, scope: true, currency: true } });
  if (!deal) return fail("The deal was not found.");
  if (deal.status !== "DRAFT" && deal.status !== "ACTIVE") return fail("Costs can only be allocated on a draft or active deal.");
  const stones = await tx.partnerDealStone.findMany({
    where: { dealId, removedAt: null },
    orderBy: [{ addedAt: "asc" }, { id: "asc" }],
    select: {
      id: true, weightMilli: true, acquisitionOverride: true, acquisitionCurrency: true, acquisitionSource: true,
      roughStone: { select: { id: true, weightCt: true, parcelId: true } },
      gemstone: { select: { id: true, weightCt: true } },
    },
  });
  if (stones.length === 0) return fail("The deal has no stones.");
  type S = (typeof stones)[number];
  const currentOf = (s: S): number => weightMilliOf(s.roughStone?.weightCt ?? s.gemstone?.weightCt);
  const writes: { id: string; amount: Minor; currency: string; source: string }[] = [];
  let dealPatch: Prisma.PartnerDealUpdateInput | null = null;

  if (spec.source === "PARCEL_TOTAL") {
    const parcelIds = uniq(stones.map((s) => s.roughStone?.parcelId).filter((x): x is string => !!x));
    if (parcelIds.length === 0) return fail("None of the roughs in this deal belong to a parcel.");
    const parcels = await tx.parcel.findMany({
      where: { id: { in: parcelIds } },
      select: { id: true, code: true, totalCost: true, currency: true, roughStones: { select: { id: true } } },
    });
    const inDeal = new Set(stones.map((s) => s.roughStone?.id).filter((x): x is string => !!x));
    for (const p of parcels) {
      if (!p.roughStones.every((r) => inDeal.has(r.id))) return fail(`Add every rough of parcel ${p.code} to the deal before allocating its total.`);
      if (!(PARTNER_CURRENCIES as readonly string[]).includes(p.currency)) return fail(`Parcel ${p.code} is priced in a currency a deal cannot use.`);
      let header: Minor;
      try {
        header = decimalToMinor(p.totalCost);
      } catch {
        return fail(`The total of parcel ${p.code} cannot be read.`);
      }
      const members = stones.filter((s) => s.roughStone?.parcelId === p.id);
      const parts = allocateMinor(header, members.map(currentOf));
      members.forEach((m, i) => writes.push({ id: m.id, amount: parts[i], currency: p.currency, source: "PARCEL_TOTAL" }));
    }
  } else if (spec.source === "POOL_LUMP") {
    if (deal.scope !== "POOLED") return fail("A lump sum can only be spread over a pooled deal.");
    const currency = spec.currency ?? deal.currency;
    if (!(PARTNER_CURRENCIES as readonly string[]).includes(currency)) return fail("Choose a supported currency for the lump sum.");
    if (spec.amountMinor === undefined || !Number.isSafeInteger(spec.amountMinor) || spec.amountMinor < 0) return fail("Enter the lump sum.");
    const basis = spec.basis ?? "WEIGHT";
    if (basis !== "WEIGHT" && basis !== "EQUAL") return fail("Choose weight or equal shares.");
    const keep = stones.filter((s) => s.acquisitionOverride !== null && s.acquisitionSource !== "POOL_LUMP");
    if (keep.some((s) => s.acquisitionCurrency !== currency)) return fail("Costs already set on some stones are in another currency. Use the same currency or set every cost by hand.");
    const kept = keep.reduce((sum, s) => sum + minor(s.acquisitionOverride), 0);
    const remainder = spec.amountMinor - kept;
    if (remainder < 0) return fail(`The lump sum is smaller than the ${fmtMinor(kept)} already set on individual stones.`);
    const others = stones.filter((s) => !keep.includes(s));
    if (others.length === 0 && remainder !== 0) return fail("Every stone already has a cost, so there is nothing to spread the lump over.");
    if (others.length > 0) {
      const weights = basis === "EQUAL" ? others.map(() => 1) : allocationWeights(others.map((s) => s.weightMilli), others.map(currentOf));
      const parts = allocateMinor(remainder, weights);
      others.forEach((s, i) => writes.push({ id: s.id, amount: parts[i], currency, source: "POOL_LUMP" }));
    }
    dealPatch = { poolAcquisitionCost: dec(spec.amountMinor), poolCurrency: currency, allocationBasis: basis };
  } else {
    const currency = spec.currency ?? deal.currency;
    if (!(PARTNER_CURRENCIES as readonly string[]).includes(currency)) return fail("Choose a supported currency.");
    const given = new Map<string, Minor>();
    for (const m of spec.manual ?? []) {
      if (!stones.some((s) => s.id === m.dealStoneId)) return fail("One of the stones is not in this deal.");
      if (given.has(m.dealStoneId)) return fail("A stone appears twice.");
      if (!Number.isSafeInteger(m.amountMinor) || m.amountMinor < 0) return fail("Costs must be zero or more.");
      given.set(m.dealStoneId, m.amountMinor);
    }
    const missing = stones.filter((s) => !given.has(s.id) && s.acquisitionOverride === null);
    if (missing.length > 0) return fail(`${missing.length} stone(s) still need a cost. Every stone must have one.`);
    for (const [id, amount] of given) writes.push({ id, amount, currency, source: "MANUAL" });
    dealPatch = { allocationBasis: "MANUAL" };
  }

  const name = await actorName(tx, { id: actorId, name: null });
  for (const w of writes) {
    await tx.partnerDealStone.update({
      where: { id: w.id },
      data: { acquisitionOverride: dec(w.amount), acquisitionCurrency: w.currency, acquisitionSource: w.source },
    });
  }
  if (dealPatch) await tx.partnerDeal.update({ where: { id: deal.id }, data: dealPatch });
  await writeAudit(
    {
      userId: actorId,
      userName: name,
      entity: "PartnerDeal",
      entityId: deal.id,
      entityCode: deal.code,
      action: "ALLOCATION_SET",
      newValue: "Acquisition costs allocated",
      metadata: { dealId: deal.id, source: spec.source, stones: writes.length, totalMinor: writes.reduce((s, w) => s + w.amount, 0) },
    },
    tx,
  );
  return { ok: true };
}

export async function allocateAcquisition(dealId: string, spec: AllocationSpec, actorId: string): Promise<Outcome> {
  return prisma.$transaction((tx) => allocateAcquisitionIn(tx, dealId, spec, actorId), TX_OPTIONS);
}

export async function allocateInvestmentIn(
  tx: Tx,
  dealId: string,
  actorId: string,
  manual?: { dealStoneId: string; amountMinor: Minor }[],
): Promise<Outcome> {
  if (typeof dealId !== "string" || dealId === "" || typeof actorId !== "string" || actorId === "") return fail("A deal and a user are required.");
  await lockDeal(tx, dealId);
  if (!(await actorCan(tx, actorId, "partner:write"))) return forbidden();
  const deal = await tx.partnerDeal.findUnique({ where: { id: dealId }, select: DEAL_SELECT });
  if (!deal) return fail("The deal was not found.");
  if (deal.method !== "INVESTMENT") return fail("Only investment deals have an invested amount to split.");
  if (deal.status !== "DRAFT" && deal.status !== "ACTIVE") return fail("The split can only be set on a draft or active deal.");
  if ((await tx.partnerSettlement.count({ where: { dealId } })) > 0) return fail("The invested split is frozen once a settlement exists.");
  let invested: Minor;
  try {
    invested = minor(deal.invested);
  } catch {
    return fail("The invested amount cannot be read.");
  }
  if (invested <= 0) return fail("Set the invested amount first.");
  const stones = await tx.partnerDealStone.findMany({
    where: { dealId, removedAt: null },
    orderBy: [{ addedAt: "asc" }, { id: "asc" }],
    select: { id: true, weightMilli: true, roughStone: { select: { weightCt: true } }, gemstone: { select: { weightCt: true } } },
  });
  if (stones.length === 0) return fail("The deal has no stones.");

  let parts: Minor[];
  if (manual !== undefined) {
    const given = new Map<string, Minor>();
    for (const m of manual) {
      if (!stones.some((s) => s.id === m.dealStoneId)) return fail("One of the stones is not in this deal.");
      if (given.has(m.dealStoneId)) return fail("A stone appears twice.");
      if (!Number.isSafeInteger(m.amountMinor) || m.amountMinor < 0) return fail("Invested amounts must be zero or more.");
      given.set(m.dealStoneId, m.amountMinor);
    }
    if (given.size !== stones.length) return fail("Give an invested amount for every stone.");
    parts = stones.map((s) => given.get(s.id)!);
    const sum = parts.reduce((x, y) => x + y, 0);
    if (sum !== invested) return fail(`The per-stone amounts add up to ${fmtMinor(sum)}, not ${fmtMinor(invested)}.`);
  } else {
    let basis: Minor[] | null = null;
    try {
      const rates = await buildRateMap(deal, await collectCurrencies(tx, dealId));
      const g = await gatherDeal(tx, dealId, { asOf: new Date(), rates, crossDeal: false });
      const per = stones.map((s) => {
        const units = g.evidence.units.filter((u) => u.dealStoneId === s.id);
        return units.length > 0 && units.every((u) => u.basisMinor !== null) ? units.reduce((sum, u) => sum + (u.basisMinor ?? 0), 0) : null;
      });
      if (per.every((x): x is number => x !== null) && per.reduce((x, y) => x + y, 0) > 0) basis = per;
    } catch (e) {
      if (!(e instanceof PartnerGatherError)) throw e;
    }
    const weights = basis ?? allocationWeights(stones.map((s) => s.weightMilli), stones.map((s) => weightMilliOf(s.roughStone?.weightCt ?? s.gemstone?.weightCt)));
    parts = allocateMinor(invested, weights);
  }

  const name = await actorName(tx, { id: actorId, name: null });
  for (const [i, s] of stones.entries()) await tx.partnerDealStone.update({ where: { id: s.id }, data: { investedAlloc: dec(parts[i]) } });
  await writeAudit(
    {
      userId: actorId,
      userName: name,
      entity: "PartnerDeal",
      entityId: deal.id,
      entityCode: deal.code,
      action: "ALLOCATION_SET",
      newValue: "Invested amount split across stones",
      metadata: { dealId: deal.id, stones: stones.length, investedMinor: invested, manual: manual !== undefined },
    },
    tx,
  );
  return { ok: true };
}

export async function allocateInvestment(dealId: string, actorId: string, manual?: { dealStoneId: string; amountMinor: Minor }[]): Promise<Outcome> {
  return prisma.$transaction((tx) => allocateInvestmentIn(tx, dealId, actorId, manual), TX_OPTIONS);
}
