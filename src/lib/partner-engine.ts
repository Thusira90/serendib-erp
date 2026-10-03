// Pure partner payout engine (formula pd-1.0.0): integer minor units, BigInt rationals, no prisma, no I/O.
import { EARN_ON, PARTNER_CURRENCIES, PARTNER_SCOPES, PAYOUT_METHODS, type EarnOn, type PartnerScope, type PayoutMethod } from "./enums";
import {
  EngineInvariantError,
  RAT_ZERO,
  bpFromPct,
  decimalToMinor,
  divRound,
  mulBp,
  mulFrac,
  mulRat,
  parseScaled,
  ratAdd,
  ratDivBig,
  ratFrom,
  ratMulBig,
  ratToStrings,
  sha256Hex,
  toSafeInt,
  type Minor,
  type Rat,
} from "./partner-money";

export { EngineInvariantError };
export type { Minor, Rat, RateMap, RateMicro, RateSource } from "./partner-money";

export const FORMULA_VERSION = "pd-1.0.0";

export type Method = PayoutMethod;
export type Scope = PartnerScope;
export type { EarnOn };

export interface SaleInput { orderId: string; priceMinor: Minor | null; fracNum: number | null; fracDen: number }
export interface BaseUnit { unitKey: string; weightMilli: number; sale: SaleInput | null }
export interface CostUnit extends BaseUnit { costMinor: Minor | null; basisMinor: Minor | null }
export interface Group<U> {
  groupKey: string;
  weightMilli: number;
  investedMinor?: Minor | null;
  writtenOff?: boolean;
  units: U[];
}
export type Terms =
  | { method: "PROFIT_SHARE"; scope: Scope; rateBp: number }
  | { method: "SALE_COMMISSION"; scope: Scope; rateBp: number }
  | { method: "FIXED_FEE"; scope: Scope; feeMinor: Minor }
  | { method: "INVESTMENT"; scope: Scope; rateBp: number; investedMinor: Minor; capitalProtected: boolean };
export interface EngineHeader { formulaVersion: string; currency: string; earnOn: EarnOn }
export type ProfitInput = EngineHeader & { terms: Extract<Terms, { method: "PROFIT_SHARE" }>; groups: Group<CostUnit>[] };
export type RevenueInput = EngineHeader & { terms: Extract<Terms, { method: "SALE_COMMISSION" }>; groups: Group<BaseUnit>[] };
export type WeightInput = EngineHeader & { terms: Extract<Terms, { method: "FIXED_FEE" }>; groups: Group<BaseUnit>[] };
export type InvestmentInput = EngineHeader & { terms: Extract<Terms, { method: "INVESTMENT" }>; groups: Group<CostUnit>[] };
export type EngineInput = ProfitInput | RevenueInput | WeightInput | InvestmentInput;

export type Need = "salePrice" | "paymentsReceived" | "purchaseCost" | "costBreakdown" | "profit";
export interface ExplainLine { key: string; label: string; amountMinor: Minor | null; needs: Need[] }
export type ExcludedReason = "NEEDS_RATE" | "COST_MISSING" | "NO_SALE" | "INVALID";
export interface UnitResult {
  unitKey: string;
  usable: boolean;
  excludedReason: ExcludedReason | null;
  recognizedRevenueMinor: Minor;
  recognizedCostMinor: Minor;
}
export interface BucketResult {
  bucketKey: string;
  groupKeys: string[];
  soldUnitKeys: string[];
  revenueMinor: Minor;
  costMinor: Minor;
  profitMinor: Minor;
  realizedFraction: { n: string; d: string };
  principalReleasedMinor: Minor;
  capitalReturnedMinor: Minor;
  profitShareMinor: Minor;
  commissionMinor: Minor;
  feeMinor: Minor;
  amountMinor: Minor;
  realizationKey: string;
  units: UnitResult[];
  lines: ExplainLine[];
}
export interface EngineResult {
  formulaVersion: string;
  currency: string;
  method: Method;
  scope: Scope;
  earnOn: string;
  totalMinor: Minor;
  capitalOutstandingMinor: Minor | null;
  capitalWrittenOffMinor: Minor | null;
  buckets: BucketResult[];
}

export type Severity = "BLOCK" | "ACK" | "INFO";
export interface GatherFlag { code: string; severity: Severity; unitKey?: string; bucketKey?: string; detail: string }

export interface TermsDraft {
  method: string;
  scope: string;
  earnOn: string;
  currency: string;
  ratePct?: string | number | null;
  fixedFee?: string | number | null;
  invested?: string | number | null;
  capitalProtected?: boolean | null;
  poolAcquisitionCost?: string | number | null;
  /** Pass the per-stone frozen principal only when validating for activation. */
  investedAlloc?: (string | number | null)[] | null;
}

// ---------------------------------------------------------------------------
// Input screening (programming errors only; data problems become unit exclusions)
// ---------------------------------------------------------------------------

interface UnitView {
  unitKey: string;
  weightMilli: number;
  sold: boolean;
  orderId: string;
  price: Minor | null;
  num: number | null;
  den: number;
  cost: Minor | null;
  basis: Minor | null;
}
type Mode = "PRICE_AND_COST" | "PRICE" | "NONE";

const fail = (msg: string): never => {
  throw new EngineInvariantError(msg);
};
const isInt = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x);
const optInt = (x: number | null | undefined, what: string): number | null => {
  if (x === null || x === undefined) return null;
  return isInt(x) ? x : fail(`${what} is not a safe integer`);
};

function viewOf(u: BaseUnit, price: Minor | null, cost: Minor | null, basis: Minor | null): UnitView {
  if (typeof u.unitKey !== "string" || u.unitKey === "") fail("unitKey must be a non-empty string");
  if (!isInt(u.weightMilli)) fail(`weightMilli of ${u.unitKey} is not a safe integer`);
  const s = u.sale;
  if (s === null) {
    return { unitKey: u.unitKey, weightMilli: u.weightMilli, sold: false, orderId: "", price: null, num: null, den: 1, cost, basis };
  }
  if (!isInt(s.fracDen) || s.fracDen <= 0) fail(`fracDen of ${u.unitKey} must be a positive safe integer`);
  const num = optInt(s.fracNum, `fracNum of ${u.unitKey}`);
  if (num !== null && (num < 0 || num > s.fracDen)) fail(`fracNum of ${u.unitKey} must be within 0..fracDen`);
  return { unitKey: u.unitKey, weightMilli: u.weightMilli, sold: true, orderId: String(s.orderId), price, num, den: s.fracDen, cost, basis };
}

const costView = (u: CostUnit): UnitView =>
  viewOf(u, u.sale === null ? null : optInt(u.sale.priceMinor, `priceMinor of ${u.unitKey}`), optInt(u.costMinor, `costMinor of ${u.unitKey}`), optInt(u.basisMinor, `basisMinor of ${u.unitKey}`));
const priceView = (u: BaseUnit): UnitView =>
  viewOf(u, u.sale === null ? null : optInt(u.sale.priceMinor, `priceMinor of ${u.unitKey}`), null, null);
const feeView = (u: BaseUnit): UnitView => viewOf(u, null, null, null);

type Screen = { reason: ExcludedReason } | { reason: null; price: Minor; cost: Minor; num: number };
function screen(v: UnitView, mode: Mode): Screen {
  if (!v.sold) return { reason: "NO_SALE" };
  if (mode !== "NONE" && v.price !== null && v.price < 0) return { reason: "INVALID" };
  if (mode === "PRICE_AND_COST" && v.cost !== null && v.cost < 0) return { reason: "INVALID" };
  if (v.num === null) return { reason: "NEEDS_RATE" };
  if (mode !== "NONE" && v.price === null) return { reason: "NEEDS_RATE" };
  if (mode === "PRICE_AND_COST" && v.cost === null) return { reason: "COST_MISSING" };
  return { reason: null, price: v.price ?? 0, cost: v.cost ?? 0, num: v.num };
}

// ---------------------------------------------------------------------------
// Shared steps (spec 4.3)
// ---------------------------------------------------------------------------

interface UnitEval { view: UnitView; result: UnitResult; f: Rat }
interface GroupEval { group: Group<unknown>; evals: UnitEval[] }
interface BucketEval {
  key: string;
  groupKeys: string[];
  groups: GroupEval[];
  units: UnitResult[];
  soldUnitKeys: string[];
  R: bigint;
  C: bigint;
  F: Rat;
  realizationKey: string;
}

function evalUnit(v: UnitView, mode: Mode): UnitEval {
  const s = screen(v, mode);
  if (s.reason !== null) {
    return { view: v, f: RAT_ZERO, result: { unitKey: v.unitKey, usable: false, excludedReason: s.reason, recognizedRevenueMinor: 0, recognizedCostMinor: 0 } };
  }
  const rev = mode === "NONE" ? 0 : mulFrac(s.price, s.num, v.den);
  const cost = mode === "PRICE_AND_COST" ? mulFrac(s.cost, s.num, v.den) : 0;
  return { view: v, f: ratFrom(s.num, v.den), result: { unitKey: v.unitKey, usable: true, excludedReason: null, recognizedRevenueMinor: rev, recognizedCostMinor: cost } };
}

function weightedFraction(ws: bigint[], fs: Rat[]): Rat {
  let num = RAT_ZERO;
  let den = 0n;
  ws.forEach((w, i) => {
    num = ratAdd(num, ratMulBig(fs[i], w));
    den += w;
  });
  return den === 0n ? RAT_ZERO : ratDivBig(num, den);
}

// A single non-positive weight means the weights are unknown: every item then counts the same.
const flatWeights = (ws: number[]): bigint[] => (ws.some((w) => w <= 0) ? ws.map(() => 1n) : ws.map((w) => BigInt(w)));

function evalBucket<U>(key: string, groups: Group<U>[], toView: (u: U) => UnitView, mode: Mode): BucketEval {
  let R = 0n;
  let C = 0n;
  const units: UnitResult[] = [];
  const soldUnitKeys: string[] = [];
  const tokens: string[] = [];
  const groupEvals: GroupEval[] = [];
  const gFractions: Rat[] = [];
  for (const g of groups) {
    if (!isInt(g.weightMilli)) fail(`weightMilli of group ${g.groupKey} is not a safe integer`);
    const evals = g.units.map((u) => evalUnit(toView(u), mode));
    for (const e of evals) {
      units.push(e.result);
      if (e.result.usable) {
        R += BigInt(e.result.recognizedRevenueMinor);
        C += BigInt(e.result.recognizedCostMinor);
        soldUnitKeys.push(e.view.unitKey);
        tokens.push(`${e.view.unitKey}:${e.view.orderId}:${e.view.num}/${e.view.den}`);
      }
    }
    gFractions.push(weightedFraction(flatWeights(evals.map((e) => e.view.weightMilli)), evals.map((e) => e.f)));
    groupEvals.push({ group: g as Group<unknown>, evals });
  }
  const F = weightedFraction(flatWeights(groups.map((g) => g.weightMilli)), gFractions);
  return {
    key,
    groupKeys: groups.map((g) => g.groupKey),
    groups: groupEvals,
    units,
    soldUnitKeys,
    R,
    C,
    F,
    realizationKey: sha256Hex(tokens.sort().join("|")),
  };
}

function prepare<U>(
  i: EngineHeader & { terms: Terms; groups: Group<U>[] },
  method: Method,
  toView: (u: U) => UnitView,
  mode: Mode,
): BucketEval[] {
  if (i.formulaVersion !== FORMULA_VERSION) fail(`unsupported formula version ${String(i.formulaVersion)}`);
  if (i.terms.method !== method) fail(`terms.method ${String(i.terms.method)} does not match ${method}`);
  if (!(PARTNER_SCOPES as readonly string[]).includes(i.terms.scope)) fail("unknown scope");
  if (!(EARN_ON as readonly string[]).includes(i.earnOn)) fail("unknown earnOn");
  if (typeof i.currency !== "string" || i.currency === "") fail("currency is required");
  if (method !== "FIXED_FEE") {
    const bp = (i.terms as { rateBp: number }).rateBp;
    if (!isInt(bp) || bp < 1 || bp > 10000) fail("rateBp must be an integer in 1..10000");
  }
  const groupKeys = new Set<string>();
  const unitKeys = new Set<string>();
  for (const g of i.groups) {
    if (groupKeys.has(g.groupKey)) fail(`duplicate groupKey ${g.groupKey}`);
    groupKeys.add(g.groupKey);
    for (const u of g.units as BaseUnit[]) {
      if (unitKeys.has(u.unitKey)) fail(`duplicate unitKey ${u.unitKey}`);
      unitKeys.add(u.unitKey);
    }
  }
  if (i.terms.scope === "POOLED") return [evalBucket("POOL", i.groups, toView, mode)];
  return i.groups.map((g) => evalBucket(g.groupKey, [g], toView, mode));
}

interface Parts {
  principalReleased: Minor;
  capitalReturned: Minor;
  profitShare: Minor;
  commission: Minor;
  fee: Minor;
  amount: Minor;
}
const NO_PARTS: Parts = { principalReleased: 0, capitalReturned: 0, profitShare: 0, commission: 0, fee: 0, amount: 0 };

// M2 never reads a cost and M3 never reads a price, so the figures they did not compute stay 0 and must not be shown to a partner.
function bucketResult(ev: BucketEval, parts: Parts, lines: ExplainLine[], shows: "REVENUE_AND_COST" | "REVENUE" | "NONE"): BucketResult {
  const R = shows === "NONE" ? 0 : toSafeInt(ev.R, "revenue");
  const C = shows === "REVENUE_AND_COST" ? toSafeInt(ev.C, "cost") : 0;
  return {
    bucketKey: ev.key,
    groupKeys: ev.groupKeys,
    soldUnitKeys: ev.soldUnitKeys,
    revenueMinor: R,
    costMinor: C,
    profitMinor: shows === "REVENUE_AND_COST" ? profitOf(ev) : 0,
    realizedFraction: ratToStrings(ev.F),
    principalReleasedMinor: parts.principalReleased,
    capitalReturnedMinor: parts.capitalReturned,
    profitShareMinor: parts.profitShare,
    commissionMinor: parts.commission,
    feeMinor: parts.fee,
    amountMinor: parts.amount,
    realizationKey: ev.realizationKey,
    units: ev.units,
    lines,
  };
}

function resultOf(
  i: EngineHeader & { terms: Terms },
  buckets: BucketResult[],
  capitalOutstandingMinor: Minor | null,
  capitalWrittenOffMinor: Minor | null,
): EngineResult {
  let total = 0n;
  for (const b of buckets) total += BigInt(b.amountMinor);
  return {
    formulaVersion: i.formulaVersion,
    currency: i.currency,
    method: i.terms.method,
    scope: i.terms.scope,
    earnOn: i.earnOn,
    totalMinor: toSafeInt(total, "total"),
    capitalOutstandingMinor,
    capitalWrittenOffMinor,
    buckets,
  };
}

const profitOf = (ev: BucketEval): Minor => toSafeInt(ev.R - ev.C, "profit");

const payNeed = (earnOn: EarnOn): Need[] => (earnOn === "PAYMENT" ? ["paymentsReceived"] : []);

function profitLines(earnOn: EarnOn, R: Minor, C: Minor, profit: Minor): ExplainLine[] {
  return [
    { key: "revenue", label: "Revenue", amountMinor: R, needs: ["salePrice", ...payNeed(earnOn)] },
    { key: "cost", label: "Eligible costs", amountMinor: C, needs: ["purchaseCost", "costBreakdown", ...payNeed(earnOn)] },
    { key: "profit", label: "Profit", amountMinor: profit, needs: ["profit"] },
  ];
}

// ---------------------------------------------------------------------------
// M1 PROFIT_SHARE
// ---------------------------------------------------------------------------

export function computeProfitShare(i: ProfitInput): EngineResult {
  const evs = prepare(i, "PROFIT_SHARE", costView, "PRICE_AND_COST");
  const buckets = evs.map((ev) => {
    const R = toSafeInt(ev.R, "revenue");
    const C = toSafeInt(ev.C, "cost");
    const profit = profitOf(ev);
    const share = mulBp(Math.max(0, profit), i.terms.rateBp);
    const lines = [...profitLines(i.earnOn, R, C, profit), { key: "share", label: "Your share", amountMinor: share, needs: [] as Need[] }];
    return bucketResult(ev, { ...NO_PARTS, profitShare: share, amount: share }, lines, "REVENUE_AND_COST");
  });
  return resultOf(i, buckets, null, null);
}

// ---------------------------------------------------------------------------
// M2 SALE_COMMISSION (the unit type has no cost field; priceView never reads one)
// ---------------------------------------------------------------------------

export function computeSaleCommission(i: RevenueInput): EngineResult {
  const evs = prepare(i, "SALE_COMMISSION", priceView, "PRICE");
  const buckets = evs.map((ev) => {
    const R = toSafeInt(ev.R, "revenue");
    const commission = mulBp(R, i.terms.rateBp);
    const lines: ExplainLine[] = [
      { key: "revenue", label: "Sale proceeds", amountMinor: R, needs: ["salePrice", ...payNeed(i.earnOn)] },
      { key: "commission", label: "Your commission", amountMinor: commission, needs: [] },
    ];
    return bucketResult(ev, { ...NO_PARTS, commission, amount: commission }, lines, "REVENUE");
  });
  return resultOf(i, buckets, null, null);
}

// ---------------------------------------------------------------------------
// M3 FIXED_FEE (weights and realised fractions only; neither price nor cost is read)
// ---------------------------------------------------------------------------

export function computeFixedFee(i: WeightInput): EngineResult {
  const fee = i.terms.feeMinor;
  if (!isInt(fee) || fee < 0) fail("feeMinor must be a non-negative safe integer");
  const evs = prepare(i, "FIXED_FEE", feeView, "NONE");
  const buckets = evs.map((ev) => {
    const amount = mulRat(fee, ev.F);
    const lines: ExplainLine[] = [
      { key: "agreedFee", label: "Agreed fee", amountMinor: fee, needs: [] },
      { key: "realisedShare", label: "Realised share of the stones", amountMinor: null, needs: payNeed(i.earnOn) },
      { key: "fee", label: "Your fee", amountMinor: amount, needs: [] },
    ];
    return bucketResult(ev, { ...NO_PARTS, fee: amount, amount }, lines, "NONE");
  });
  return resultOf(i, buckets, null, null);
}

// ---------------------------------------------------------------------------
// M4 INVESTMENT
// ---------------------------------------------------------------------------

// Share of a group's frozen principal released by sales: weighted by cost basis, else by unit weight, else by count.
function releasedFraction(evals: UnitEval[]): Rat {
  if (evals.length === 0) return RAT_ZERO;
  const fs = evals.map((e) => e.f);
  const bases = evals.map((e) => e.view.basis);
  const basisUsable = bases.every((b) => b !== null && b >= 0) && bases.reduce<number>((a, b) => a + (b ?? 0), 0) > 0;
  const ws = basisUsable ? bases.map((b) => BigInt(b ?? 0)) : flatWeights(evals.map((e) => e.view.weightMilli));
  return weightedFraction(ws, fs);
}

export function computeInvestment(i: InvestmentInput): EngineResult {
  const invested = i.terms.investedMinor;
  if (!isInt(invested) || invested < 0) fail("investedMinor must be a non-negative safe integer");
  let alloc = 0n;
  for (const g of i.groups) {
    const inv = optInt(g.investedMinor, `investedMinor of group ${g.groupKey}`) ?? 0;
    if (inv < 0) fail(`investedMinor of group ${g.groupKey} must not be negative`);
    alloc += BigInt(inv);
  }
  if (alloc !== BigInt(invested)) fail("sum of group investedMinor must equal terms.investedMinor");

  const evs = prepare(i, "INVESTMENT", costView, "PRICE_AND_COST");
  let releasedTotal = 0n;
  let writtenOffTotal = 0n;
  const buckets = evs.map((ev) => {
    const R = toSafeInt(ev.R, "revenue");
    const C = toSafeInt(ev.C, "cost");
    let release = RAT_ZERO;
    let woInvested = 0n;
    let woRelease = RAT_ZERO;
    for (const ge of ev.groups) {
      const inv = BigInt(ge.group.investedMinor ?? 0);
      const part = ratMulBig(releasedFraction(ge.evals), inv);
      release = ratAdd(release, part);
      if (ge.group.writtenOff) {
        woInvested += inv;
        woRelease = ratAdd(woRelease, part);
      }
    }
    const principalReleased = toSafeInt(divRound(release.n, release.d), "principal released");
    const unreleasedWrittenOff = woInvested - divRound(woRelease.n, woRelease.d);
    releasedTotal += BigInt(principalReleased);
    writtenOffTotal += unreleasedWrittenOff;

    const profit = profitOf(ev);
    let capital: number;
    if (R >= C) capital = Math.min(principalReleased, C);
    else if (i.terms.capitalProtected) capital = Math.min(principalReleased, R);
    else capital = Math.min(toSafeInt(divRound(BigInt(principalReleased) * BigInt(R), BigInt(C)), "capital"), R);
    const profitShare = mulBp(Math.max(0, profit), i.terms.rateBp);
    const amount = capital + profitShare;
    if (capital < 0 || capital > principalReleased || capital + profitShare > R) {
      fail(`investment invariant broken in bucket ${ev.key}`);
    }
    const lines: ExplainLine[] = [
      ...profitLines(i.earnOn, R, C, profit),
      { key: "capital", label: "Capital returned", amountMinor: capital, needs: payNeed(i.earnOn) },
      { key: "share", label: "Your share of profit", amountMinor: profitShare, needs: [] },
      { key: "total", label: "Total", amountMinor: amount, needs: [] },
    ];
    return bucketResult(ev, { ...NO_PARTS, principalReleased, capitalReturned: capital, profitShare, amount }, lines, "REVENUE_AND_COST");
  });
  const outstanding = BigInt(invested) - releasedTotal - writtenOffTotal;
  return resultOf(
    i,
    buckets,
    toSafeInt(outstanding < 0n ? 0n : outstanding, "capital outstanding"),
    toSafeInt(writtenOffTotal, "capital written off"),
  );
}

// ---------------------------------------------------------------------------
// Dispatch and versioning
// ---------------------------------------------------------------------------

export function runEngine(i: EngineInput): EngineResult {
  switch (i.terms.method) {
    case "PROFIT_SHARE": return computeProfitShare(i as ProfitInput);
    case "SALE_COMMISSION": return computeSaleCommission(i as RevenueInput);
    case "FIXED_FEE": return computeFixedFee(i as WeightInput);
    case "INVESTMENT": return computeInvestment(i as InvestmentInput);
    default: return fail(`unknown payout method ${String((i.terms as { method: unknown }).method)}`);
  }
}

// Old versions stay here forever; a formula, rounding or fraction change adds a new key instead of editing one.
export const ENGINES: Record<string, (i: EngineInput) => EngineResult> = Object.freeze({
  [FORMULA_VERSION]: runEngine,
});

export function runEngineVersioned(i: EngineInput): EngineResult {
  const run = Object.prototype.hasOwnProperty.call(ENGINES, i.formulaVersion) ? ENGINES[i.formulaVersion] : undefined;
  if (!run) return fail(`no engine registered for formula version ${String(i.formulaVersion)}`);
  return run(i);
}

// ---------------------------------------------------------------------------
// Terms validation (spec 4.5, per-deal part; co-partner caps live with the queries)
// ---------------------------------------------------------------------------

const present = (x: unknown): boolean => x !== null && x !== undefined && String(x).trim() !== "";

function money2(raw: string | number, label: string, errors: string[]): Minor | null {
  const text = String(raw).trim();
  try {
    const cents = decimalToMinor(text);
    if (parseScaled(text, 4) !== BigInt(cents) * 100n) {
      errors.push(`${label} must have at most 2 decimal places.`);
      return null;
    }
    return cents;
  } catch {
    errors.push(`${label} must be a valid amount.`);
    return null;
  }
}

export function validateTerms(t: TermsDraft, currencies: readonly string[] = PARTNER_CURRENCIES): string[] {
  const errors: string[] = [];
  const method = (PAYOUT_METHODS as readonly string[]).includes(t.method) ? (t.method as Method) : null;
  if (!method) errors.push("Choose a payout method.");
  if (!(PARTNER_SCOPES as readonly string[]).includes(t.scope)) errors.push("Choose whether the deal is per stone or pooled.");
  if (!(EARN_ON as readonly string[]).includes(t.earnOn)) errors.push("Choose when the partner earns: on sale or on payment.");
  if (!currencies.includes(t.currency)) errors.push("Choose a supported deal currency.");

  const needsRate = method === "PROFIT_SHARE" || method === "SALE_COMMISSION" || method === "INVESTMENT";
  if (needsRate) {
    if (!present(t.ratePct)) errors.push("A percentage rate is required.");
    else {
      try {
        bpFromPct(String(t.ratePct).trim());
      } catch {
        errors.push("The rate must be greater than 0 and at most 100, with at most 2 decimal places.");
      }
    }
  }
  if (method === "FIXED_FEE") {
    if (!present(t.fixedFee)) errors.push("A fixed fee is required.");
    else {
      const fee = money2(t.fixedFee as string | number, "The fixed fee", errors);
      if (fee !== null && fee <= 0) errors.push("The fixed fee must be greater than 0.");
    }
  }
  if (method === "INVESTMENT") {
    let invested: Minor | null = null;
    if (!present(t.invested)) errors.push("The invested amount is required.");
    else {
      invested = money2(t.invested as string | number, "The invested amount", errors);
      if (invested !== null && invested <= 0) errors.push("The invested amount must be greater than 0.");
    }
    if (t.investedAlloc) {
      let sum = 0n;
      let ok = true;
      for (const a of t.investedAlloc) {
        try {
          if (!present(a)) throw new Error("missing");
          sum += BigInt(decimalToMinor(String(a)));
        } catch {
          ok = false;
        }
      }
      if (!ok) errors.push("Every stone needs a valid invested amount before the deal can start.");
      else if (invested !== null && sum !== BigInt(invested)) errors.push("The per-stone invested amounts must add up to the invested total.");
    }
  } else {
    if (present(t.invested)) errors.push("Only investment deals carry an invested amount.");
    if (t.capitalProtected === true) errors.push("Only investment deals can protect capital.");
  }
  if (present(t.poolAcquisitionCost) && t.scope !== "POOLED") errors.push("A pool acquisition cost only applies to pooled deals.");
  return errors;
}

