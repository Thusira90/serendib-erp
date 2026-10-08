import "server-only";
import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EARN_ON, MEDIA_STAGES, PARTNER_SCOPES, PAYOUT_METHODS, partnerCostLabel, type PartnerEventType } from "@/lib/enums";
import { isIssuedAccess, type ResolvedAccess } from "@/lib/partner-access";
import {
  toMoney,
  type CalcLineDto,
  type Money,
  type PartnerNotice,
  type PartnerPortalDto,
  type StoneDto,
  type StoneStage,
  type TimelineItemDto,
} from "@/lib/partner-dto";
import { runEngineVersioned, type EarnOn, type ExplainLine, type Method, type Scope } from "@/lib/partner-engine";
import { buildRateMap, collectCurrencies, gatherDeal, unitKeyOf, type Db, type RateMap } from "@/lib/partner-gather";
import { convertMinor, decimalToMinor, divRound, microFromRates, type Minor, type RateMicro } from "@/lib/partner-money";
import { getDealFootprint } from "@/lib/partner-queries";
import { lineVisible, normalizeVisibility, parseVisibility, type PartnerVisibility } from "@/lib/partner-visibility";

// The partner portal's whitelist builder (spec 6.3 and 6.4). Everything a partner sees is assigned field by field from the
// explicit selects below; no database row is ever copied wholesale and no free-text column other than the partner-visible
// notes, captions and lab names is read at all. Flags are applied in one place: toPartnerView.

export class PartnerViewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartnerViewError";
  }
}

/** An admin looking at the page as the partner would. It carries no access id, so the log and counter code refuses it. */
export type AdminPreview = { readonly kind: "ADMIN_PREVIEW"; readonly dealId: string };
export const adminPreview = (dealId: string): AdminPreview => Object.freeze({ kind: "ADMIN_PREVIEW" as const, dealId });

type Num = { toString(): string };

const COLOMBO_OFFSET_MS = 19_800_000;
const MAX_MEDIA_PER_STONE = 24;
const MAX_MEDIA_LOADED_PER_STONE = 60;
const MAX_TIMELINE = 500;
const PUBLIC_DEAL_STATUSES: readonly string[] = ["ACTIVE", "CLOSED"];
const DEFAULT_EXCLUDED_TYPES: readonly string[] = ["RENT", "SALARIES", "TAX"];
const MEDIA_KINDS = ["ROUGH_PHOTO", "FINISHED_PHOTO", "MACRO_PHOTO", "INSPECTION_PHOTO", "VIDEO", "CATALOGUE_IMAGE"];
const CERT_LIVE_STATUSES = ["ISSUED", "SUBMITTED", "UNDER_EXAMINATION"];
const CUT_TYPES = ["CUTTING", "RE_CUT"];

// ---------------------------------------------------------------------------
// Opaque keys: deal-scoped HMACs, never a database id
// ---------------------------------------------------------------------------

let keyCache: { secret: string; stone: Buffer; doc: Buffer } | null = null;

function keyring(): { stone: Buffer; doc: Buffer } {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.trim() === "") throw new PartnerViewError("AUTH_SECRET is not configured");
  if (keyCache === null || keyCache.secret !== secret) {
    const sub = (label: string): Buffer => createHmac("sha256", secret).update(label).digest();
    keyCache = { secret, stone: sub("partner-stonekey-v1"), doc: sub("partner-dockey-v1") };
  }
  return keyCache;
}

const derive = (key: Buffer, dealId: string, id: string): string =>
  createHmac("sha256", key).update(`${dealId}:${id}`).digest("base64url").slice(0, 16);

export const stoneKey = (dealId: string, id: string): string => derive(keyring().stone, dealId, id);
export const docKey = (dealId: string, id: string): string => derive(keyring().doc, dealId, id);
const mediaKey = (dealId: string, id: string): string => derive(keyring().stone, dealId, `media:${id}`);

// ---------------------------------------------------------------------------
// Public-safe addresses
// ---------------------------------------------------------------------------

function mediaOrigin(): string | null {
  const raw = process.env.R2_PUBLIC_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** The only addresses a partner may be given: the public media origin over https, or a local upload path. */
export function publicAssetUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (url === "" || url.length > 2048) return null;
  if (url.startsWith("/")) {
    const clean = /^\/uploads\/[A-Za-z0-9._\-/]+$/.test(url) && !url.includes("//") && !url.split("/").some((seg) => seg === ".." || seg === ".");
    return clean ? url : null;
  }
  const origin = mediaOrigin();
  if (origin === null) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.origin !== origin || u.username !== "" || u.password !== "") return null;
  if (/%2f|%5c|%2e/i.test(u.pathname)) return null;
  return u.href;
}

// ---------------------------------------------------------------------------
// The data the view works on: plain primitives, no ids, no Prisma rows
// ---------------------------------------------------------------------------

export interface SrcSpecs {
  gemType: string | null;
  variety: string | null;
  weightCt: number | null;
  dimensionsMm: string | null;
  shape: string | null;
  cut: string | null;
  colorDescription: string | null;
  clarity: string | null;
  treatment: string | null;
  origin: string | null;
}
export interface SrcCostLine { label: string; minor: Minor; on: string | null }
export interface SrcCost { purchaseMinor: Minor | null; lines: SrcCostLine[]; totalMinor: Minor | null }
export interface SrcPayment { on: string; orderMinor: Minor | null; dealMinor: Minor | null }
export interface SrcSale {
  soldOn: string;
  priceMinor: Minor | null;
  originalMinor: Minor | null;
  originalCurrency: string;
  fxNote: string | null;
  denMinor: Minor | null;
  paidMinor: Minor | null;
  payments: SrcPayment[];
}
export interface SrcMedia {
  key: string;
  url: string;
  kind: "PHOTO" | "VIDEO";
  stage: string | null;
  caption: string | null;
  on: string | null;
  primary: boolean;
  process: boolean;
  intake: boolean;
}
export interface SrcCertificate { laboratory: string; number: string | null; issuedOn: string | null; submittedOn: string | null; issued: boolean }
export interface SrcCut { on: string; yieldPct: number | null }
export interface SrcStone {
  key: string;
  parentKey: string | null;
  anonName: string;
  code: string;
  kind: "ROUGH" | "GEM";
  isUnit: boolean;
  rawStatus: string;
  specs: SrcSpecs;
  cgi: { score: number | null; band: string | null } | null;
  certificate: SrcCertificate | null;
  askingPrice: { minor: Minor; currency: string } | null;
  supplierName: string | null;
  acquiredOn: string | null;
  registeredOn: string | null;
  cutFromRoughOn: string | null;
  cuttingStartedOn: string[];
  cuts: SrcCut[];
  childUnits: number;
  soldChildUnits: number;
  cost: SrcCost | null;
  sale: SrcSale | null;
  media: SrcMedia[];
}
export interface SrcBucket {
  cardKey: string | null;
  sold: boolean;
  amountMinor: Minor;
  profitMinor: Minor;
  fractionPct: number;
  lines: ExplainLine[];
}
export interface SrcDocument { key: string; kind: "RECEIPT" | "CERTIFICATE"; name: string; on: string; stoneKey: string | null }
export interface SrcLedger {
  settlements: { code: string; on: string; amountMinor: Minor; note: string | null }[];
  adjustments: { code: string; on: string; amountMinor: Minor; reasonCode: string; note: string | null }[];
  payouts: { code: string; on: string; amountMinor: Minor; direction: "PAID" | "RECEIVED"; note: string | null }[];
}
export interface PartnerViewSource {
  generatedAt: string;
  asOf: string;
  partner: { name: string; kind: string };
  deal: {
    reference: string;
    partnerTitle: string | null;
    status: string;
    method: Method;
    scope: Scope;
    earnOn: EarnOn;
    currency: string;
    ratePct: number | null;
    fixedFeeMinor: Minor | null;
    investedMinor: Minor | null;
    capitalProtected: boolean;
    activatedOn: string | null;
    closedOn: string | null;
    termsAmendedOn: string | null;
    partnerNote: string | null;
  };
  incomplete: boolean;
  approxRates: boolean;
  counts: { totalStones: number; soldStones: number };
  totals: {
    totalMinor: Minor;
    capitalReturnedMinor: Minor;
    profitShareMinor: Minor;
    commissionMinor: Minor;
    feeMinor: Minor;
    capitalOutstandingMinor: Minor | null;
    capitalWrittenOffMinor: Minor | null;
  };
  buckets: SrcBucket[];
  stones: SrcStone[];
  documents: SrcDocument[];
  ledger: SrcLedger;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const dayOf = (d: Date): string => new Date(d.getTime() + COLOMBO_OFFSET_MS).toISOString().slice(0, 10);
const dayOfIso = (iso: string): string => dayOf(new Date(iso));
const uniq = <T>(xs: Iterable<T>): T[] => Array.from(new Set(xs));
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function num(v: Num | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

function minorOrNull(v: Num | null | undefined): Minor | null {
  if (v === null || v === undefined) return null;
  try {
    return decimalToMinor(v);
  } catch {
    return null;
  }
}

function textOrNull(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t === "" ? null : t;
}

function dims(a: Num | null, b: Num | null, c: Num | null): string | null {
  const parts = [a, b, c]
    .map((v) => num(v))
    .filter((n): n is number => n !== null && n > 0)
    .map((n) => String(Number(n.toFixed(2))));
  return parts.length > 0 ? parts.join(" x ") : null;
}

function pick<T extends string>(list: readonly T[], v: string, what: string): T {
  if ((list as readonly string[]).includes(v)) return v as T;
  throw new PartnerViewError(`Unknown ${what}`);
}

const whenAny = async <T>(cond: boolean, run: () => Promise<T[]>): Promise<T[]> => (cond ? run() : []);

const stoneLetters = (index: number): string => {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

function parseExcluded(json: string): Set<string> {
  try {
    const v: unknown = JSON.parse(json);
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return new Set(v as string[]);
  } catch {
    // fall back to the default list
  }
  return new Set(DEFAULT_EXCLUDED_TYPES);
}

/** 1 USD = 330.50 LKR, from the frozen deal rates; null when either side has no rate. */
function fxText(from: string, to: string, micro: RateMicro): string | null {
  if (from === to || !has(micro, from) || !has(micro, to)) return null;
  const a = micro[from];
  const b = micro[to];
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a <= 0 || b <= 0) return null;
  const v = divRound(BigInt(a) * 1_000_000n, BigInt(b));
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0");
  return `1 ${from} = ${whole}.${frac} ${to}`;
}

const pctOfFraction = (f: { n: string; d: string }): number => {
  const d = BigInt(f.d);
  return d === 0n ? 0 : Number(divRound(BigInt(f.n) * 10_000n, d)) / 100;
};

const pctOf = (part: Minor, whole: Minor): number | null => {
  if (!Number.isSafeInteger(part) || !Number.isSafeInteger(whole) || whole <= 0) return null;
  const v = Number(divRound(BigInt(part) * 1000n, BigInt(whole))) / 10;
  return Math.min(100, Math.max(-100, v));
};

// ---------------------------------------------------------------------------
// Explicit selects (the only columns this module reads)
// ---------------------------------------------------------------------------

const DEAL_SELECT = {
  id: true, code: true, status: true, method: true, scope: true, earnOn: true, currency: true, ratePct: true, fixedFee: true,
  invested: true, capitalProtected: true, partnerTitle: true, partnerNote: true, visibility: true, excludedCostTypes: true,
  rateOverrides: true, activatedAt: true, closedAt: true, termsAmendedAt: true,
  partner: { select: { name: true, kind: true, active: true } },
} satisfies Prisma.PartnerDealSelect;
type DealRow = Prisma.PartnerDealGetPayload<{ select: typeof DEAL_SELECT }>;

const ROUGH_SELECT = {
  id: true, gemType: true, variety: true, origin: true, weightCt: true, lengthMm: true, widthMm: true, heightMm: true, shape: true,
  color: true, clarity: true, treatment: true, status: true, purchaseDate: true,
  supplier: { select: { name: true } },
} satisfies Prisma.RoughStoneSelect;
type RoughRow = Prisma.RoughStoneGetPayload<{ select: typeof ROUGH_SELECT }>;

const GEM_SELECT = {
  id: true, gemType: true, variety: true, origin: true, treatment: true, weightCt: true, lengthMm: true, widthMm: true, depthMm: true,
  shape: true, cut: true, colorDescription: true, clarity: true, status: true, askingPrice: true, currency: true, cgiScore: true,
  cgiBand: true, createdAt: true,
} satisfies Prisma.GemstoneSelect;
type GemRow = Prisma.GemstoneGetPayload<{ select: typeof GEM_SELECT }>;

const CERT_SELECT = {
  id: true, gemstoneId: true, status: true, certificateNumber: true, submissionDate: true, issueDate: true, createdAt: true,
  documentUrl: true, imageUrl: true,
  laboratory: { select: { name: true } },
} satisfies Prisma.CertificateSelect;
type CertRow = Prisma.CertificateGetPayload<{ select: typeof CERT_SELECT }>;

const ASSET_SELECT = {
  id: true, gemstoneId: true, roughStoneId: true, cuttingJobId: true, kind: true, stage: true, url: true, caption: true,
  isPrimary: true, capturedAt: true, createdAt: true, partnerHidden: true,
} satisfies Prisma.DigitalAssetSelect;

const JOB_SELECT = { id: true, roughStoneId: true, startedAt: true } satisfies Prisma.CuttingJobSelect;

const RECEIPT_SELECT = {
  id: true, type: true, roughStoneId: true, gemstoneId: true,
  expense: { select: { id: true, status: true, receiptUrl: true, incurredAt: true } },
} satisfies Prisma.CostAllocationSelect;

const PAYMENT_SELECT = {
  salesOrderId: true, amount: true, currency: true, orderCurrencyAmount: true, receivedAt: true,
} satisfies Prisma.PaymentSelect;

const SETTLEMENT_SELECT = { code: true, createdAt: true, amount: true, partnerNote: true } satisfies Prisma.PartnerSettlementSelect;
const ADJUSTMENT_SELECT = { code: true, createdAt: true, amount: true, reasonCode: true, partnerNote: true } satisfies Prisma.PartnerAdjustmentSelect;
const PAYOUT_SELECT = { code: true, paidAt: true, amount: true, direction: true, partnerNote: true } satisfies Prisma.PartnerPayoutSelect;

// ---------------------------------------------------------------------------
// Documents (receipts and certificate files): opaque keys only; the raw address stays on the server
// ---------------------------------------------------------------------------

interface ReceiptCandidate { id: string; ownerId: string; type: string; on: string; url: string }
interface CertificateCandidate { id: string; gemId: string; laboratory: string; on: string; url: string }

async function loadDocumentCandidates(
  db: Db,
  dealId: string,
  excluded: ReadonlySet<string>,
): Promise<{ receipts: ReceiptCandidate[]; certificates: CertificateCandidate[] }> {
  const footprint = await getDealFootprint(db, dealId);
  const roughIds = footprint.roughIds;
  const gemIds = uniq(footprint.gemIds.concat(footprint.derivedGemIds));
  const receipts: ReceiptCandidate[] = [];
  const certificates: CertificateCandidate[] = [];
  if (roughIds.length + gemIds.length === 0) return { receipts, certificates };

  const lines = await db.costAllocation.findMany({
    where: { expenseId: { not: null }, OR: [{ roughStoneId: { in: roughIds } }, { gemstoneId: { in: gemIds } }] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: RECEIPT_SELECT,
  });
  const seenExpense = new Set<string>();
  for (const l of lines) {
    const ex = l.expense;
    const owner = l.gemstoneId ?? l.roughStoneId;
    if (ex === null || owner === null || ex.status === "REJECTED" || excluded.has(l.type) || seenExpense.has(ex.id)) continue;
    const url = textOrNull(ex.receiptUrl);
    if (url === null) continue;
    seenExpense.add(ex.id);
    receipts.push({ id: ex.id, ownerId: owner, type: l.type, on: dayOf(ex.incurredAt), url });
  }

  if (gemIds.length > 0) {
    const certs = await db.certificate.findMany({
      where: { gemstoneId: { in: gemIds }, status: "ISSUED" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: CERT_SELECT,
    });
    for (const c of certs) {
      const url = textOrNull(c.documentUrl) ?? textOrNull(c.imageUrl);
      if (url === null) continue;
      certificates.push({ id: c.id, gemId: c.gemstoneId, laboratory: c.laboratory.name, on: dayOf(c.issueDate ?? c.createdAt), url });
    }
  }
  return { receipts, certificates };
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

async function readDeal(db: Db, dealId: string): Promise<DealRow> {
  return db.partnerDeal.findUniqueOrThrow({ where: { id: dealId }, select: DEAL_SELECT });
}

const certRank = (c: CertRow): number => (c.status === "ISSUED" ? 0 : 1);

async function loadSource(db: Db, deal: DealRow, asOf: Date, ratesIn?: RateMap): Promise<PartnerViewSource> {
  const dealId = deal.id;
  const method = pick(PAYOUT_METHODS, deal.method, "payout method");
  const scope = pick(PARTNER_SCOPES, deal.scope, "scope");
  const earnOn = pick(EARN_ON, deal.earnOn, "earn-on setting");
  const dealCcy = deal.currency;
  const rates = ratesIn ?? (await buildRateMap(deal, await collectCurrencies(db, dealId)));
  const micro = microFromRates(rates);
  const conv = (amount: Minor, from: string, to: string): Minor | null => {
    try {
      return convertMinor(amount, from, to, micro);
    } catch {
      return null;
    }
  };

  // Other deals and other partners are never compared (crossDeal off), so nothing about them can reach the view.
  const gathered = await gatherDeal(db, dealId, { asOf, rates, crossDeal: false });
  const result = runEngineVersioned(gathered.input);
  const evidence = gathered.evidence;
  const unitByKey = new Map(evidence.units.map((u) => [u.unitKey, u] as const));

  const roughIds = evidence.dealStones.filter((d) => d.kind === "ROUGH").map((d) => d.id);
  const gemIds = uniq(
    evidence.dealStones.filter((d) => d.kind === "GEM").map((d) => d.id).concat(evidence.units.filter((u) => u.kind === "GEM").map((u) => u.id)),
  );
  const excluded = parseExcluded(deal.excludedCostTypes);

  const [roughRows, gemRows, certRows, jobRows, cutRows, docs, settlementRows, adjustmentRows, payoutRows] = await Promise.all([
    whenAny(roughIds.length > 0, () => db.roughStone.findMany({ where: { id: { in: roughIds } }, select: ROUGH_SELECT })),
    whenAny(gemIds.length > 0, () => db.gemstone.findMany({ where: { id: { in: gemIds } }, select: GEM_SELECT })),
    whenAny(gemIds.length > 0, () =>
      db.certificate.findMany({
        where: { gemstoneId: { in: gemIds }, status: { in: CERT_LIVE_STATUSES } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: CERT_SELECT,
      }),
    ),
    whenAny(roughIds.length > 0, () =>
      db.cuttingJob.findMany({ where: { roughStoneId: { in: roughIds } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: JOB_SELECT }),
    ),
    whenAny(roughIds.length + gemIds.length > 0, () =>
      db.gemstoneTransformation.findMany({
        where: {
          type: { in: CUT_TYPES },
          OR: [{ inputs: { some: { roughStoneId: { in: roughIds } } } }, { outputs: { some: { gemstoneId: { in: gemIds } } } }],
        },
        orderBy: [{ performedAt: "asc" }, { id: "asc" }],
        select: {
          id: true, performedAt: true, yieldPct: true,
          inputs: { where: { roughStoneId: { in: roughIds } }, select: { roughStoneId: true } },
          outputs: { where: { gemstoneId: { in: gemIds } }, select: { gemstoneId: true } },
        } satisfies Prisma.GemstoneTransformationSelect,
      }),
    ),
    loadDocumentCandidates(db, dealId, excluded),
    db.partnerSettlement.findMany({ where: { dealId }, orderBy: [{ seq: "asc" }], select: SETTLEMENT_SELECT }),
    db.partnerAdjustment.findMany({ where: { dealId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: ADJUSTMENT_SELECT }),
    db.partnerPayout.findMany({ where: { dealId }, orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: PAYOUT_SELECT }),
  ]);
  const roughById = new Map(roughRows.map((r) => [r.id, r] as const));
  const gemById = new Map(gemRows.map((g) => [g.id, g] as const));
  const cuts = cutRows;

  // A gem that is a deal stone in its own right keeps the supplier of the rough it was cut from (spec 6.4). Only the supplier
  // name is read, and only when every input rough agrees; the rough itself and the other gems cut from it stay unknowable.
  const gemOnlyIds = evidence.dealStones.filter((d) => d.kind === "GEM").map((d) => d.id);
  const parentRows = await whenAny(gemOnlyIds.length > 0, () =>
    db.transformationOutput.findMany({
      where: { gemstoneId: { in: gemOnlyIds }, transformation: { type: { in: CUT_TYPES } } },
      select: {
        gemstoneId: true,
        transformation: { select: { inputs: { select: { roughStone: { select: { supplier: { select: { name: true } } } } } } } },
      } satisfies Prisma.TransformationOutputSelect,
    }),
  );
  const parentSupplier = new Map<string, string | null>();
  for (const id of gemOnlyIds) {
    const names = new Set<string | null>();
    for (const row of parentRows) {
      if (row.gemstoneId !== id) continue;
      for (const inp of row.transformation.inputs) names.add(textOrNull(inp.roughStone.supplier?.name));
    }
    const only = names.size === 1 ? Array.from(names)[0] : null;
    parentSupplier.set(id, only ?? null);
  }

  // Live orders of the units (from the gather evidence) and the payments received on them (no reference, notes or method).
  const orderIds = evidence.units.map((u) => u.order?.id).filter((x): x is string => typeof x === "string");
  const payRows = await whenAny(orderIds.length > 0, () =>
    db.payment.findMany({
      where: { salesOrderId: { in: orderIds }, receivedAt: { lte: asOf } },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      select: PAYMENT_SELECT,
    }),
  );

  // Media owned by the deal's stones and by the cutting jobs of its roughs; hidden assets are filtered in the query and again below.
  const jobIds = jobRows.map((j) => j.id);
  const jobRough = new Map(jobRows.map((j) => [j.id, j.roughStoneId] as const));
  const assetRows = await whenAny(gemIds.length + roughIds.length + jobIds.length > 0, () =>
    db.digitalAsset.findMany({
      where: {
        kind: { in: MEDIA_KINDS },
        AND: [
          { OR: [{ gemstoneId: { in: gemIds } }, { roughStoneId: { in: roughIds } }, { cuttingJobId: { in: jobIds } }] },
          { OR: [{ partnerHidden: null }, { partnerHidden: false }] },
        ],
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      select: ASSET_SELECT,
    }),
  );

  // ---- cards, in a fixed order: each deal stone, then the gems cut from it
  const cards: SrcStone[] = [];
  const cardKeyByStoneId = new Map<string, string>();
  const cardKeyByDealStone = new Map<string, string>();
  const idOfKey = new Map<string, string>();
  // A stone already placed under another deal stone is skipped (the gatherer flags it); two different ids sharing a key is fatal.
  const claimKey = (id: string): string | null => {
    const key = stoneKey(dealId, id);
    const owner = idOfKey.get(key);
    if (owner === undefined) {
      idOfKey.set(key, id);
      return key;
    }
    if (owner !== id) throw new PartnerViewError("Stone key collision");
    return null;
  };
  const anon = (): string => `Stone ${stoneLetters(cards.length)}`;
  const emptyCard = (key: string, parentKey: string | null, code: string, kind: "ROUGH" | "GEM", rawStatus: string, specs: SrcSpecs): SrcStone => ({
    key, parentKey, anonName: anon(), code, kind, isUnit: false, rawStatus, specs, cgi: null, certificate: null, askingPrice: null,
    supplierName: null, acquiredOn: null, registeredOn: null, cutFromRoughOn: null, cuttingStartedOn: [], cuts: [], childUnits: 0,
    soldChildUnits: 0, cost: null, sale: null, media: [],
  });

  const costOf = (unitKey: string): SrcCost | null => {
    const u = unitByKey.get(unitKey);
    if (!u || u.costMinor === null) return null;
    const lines: SrcCostLine[] = [];
    for (const l of u.costLines) {
      if (l.excluded !== undefined || l.type === "ROUGH_PURCHASE" || l.convertedMinor === null) continue;
      lines.push({ label: partnerCostLabel(l.type), minor: l.convertedMinor, on: dayOfIso(l.createdAt) });
    }
    if (u.lateShareMinor !== 0) lines.push({ label: "Other costs", minor: u.lateShareMinor, on: null });
    return { purchaseMinor: u.basisMinor, lines, totalMinor: u.costMinor };
  };

  const salesPayments = new Map<string, typeof payRows>();
  for (const p of payRows) {
    const list = salesPayments.get(p.salesOrderId) ?? [];
    list.push(p);
    salesPayments.set(p.salesOrderId, list);
  }
  const saleOf = (unitKey: string): SrcSale | null => {
    const u = unitByKey.get(unitKey);
    const o = u?.order ?? null;
    if (!o) return null;
    const den = o.totalMinor !== null && o.totalMinor > 0 ? o.totalMinor : o.priceOriginalMinor;
    const payments: SrcPayment[] = [];
    let paid = 0;
    let paidKnown = true;
    for (const p of salesPayments.get(o.id) ?? []) {
      const original = minorOrNull(p.amount);
      const stored = p.orderCurrencyAmount === null ? null : minorOrNull(p.orderCurrencyAmount);
      const inOrder = p.orderCurrencyAmount !== null ? stored : original === null ? null : conv(original, p.currency, o.currency);
      const inDeal = inOrder === null ? null : o.currency === dealCcy ? inOrder : conv(inOrder, o.currency, dealCcy);
      payments.push({ on: dayOf(p.receivedAt), orderMinor: inOrder, dealMinor: inDeal });
      if (inOrder === null) paidKnown = false;
      else paid += inOrder;
    }
    const denOk = den !== null && den > 0;
    return {
      soldOn: dayOfIso(o.saleDate),
      priceMinor: o.priceConvertedMinor,
      originalMinor: o.priceOriginalMinor,
      originalCurrency: o.currency,
      fxNote: fxText(o.currency, dealCcy, micro),
      denMinor: denOk ? den : null,
      paidMinor: paidKnown && denOk ? Math.max(0, Math.min(paid, den)) : null,
      payments,
    };
  };

  const certOf = (gemId: string): SrcCertificate | null => {
    const mine = certRows.filter((c) => c.gemstoneId === gemId).sort((a, b) => certRank(a) - certRank(b));
    const c = mine[0];
    if (!c) return null;
    const issued = c.status === "ISSUED";
    return {
      laboratory: c.laboratory.name,
      number: issued ? textOrNull(c.certificateNumber) : null,
      issuedOn: issued && c.issueDate ? dayOf(c.issueDate) : null,
      submittedOn: c.submissionDate ? dayOf(c.submissionDate) : null,
      issued,
    };
  };

  const roughSpecs = (r: RoughRow): SrcSpecs => ({
    gemType: r.gemType, variety: r.variety, weightCt: num(r.weightCt), dimensionsMm: dims(r.lengthMm, r.widthMm, r.heightMm), shape: r.shape,
    cut: null, colorDescription: r.color, clarity: r.clarity, treatment: r.treatment, origin: r.origin,
  });
  const gemSpecs = (g: GemRow): SrcSpecs => ({
    gemType: g.gemType, variety: g.variety, weightCt: num(g.weightCt), dimensionsMm: dims(g.lengthMm, g.widthMm, g.depthMm), shape: g.shape,
    cut: g.cut, colorDescription: g.colorDescription, clarity: g.clarity, treatment: g.treatment, origin: g.origin,
  });

  const fillGem = (card: SrcStone, g: GemRow, unitKey: string | null, parentSupplier: string | null, parentRoughId: string | null): void => {
    card.cgi = g.cgiScore !== null || g.cgiBand !== null ? { score: g.cgiScore, band: g.cgiBand } : null;
    card.certificate = certOf(g.id);
    const ask = minorOrNull(g.askingPrice);
    card.askingPrice = ask === null ? null : { minor: ask, currency: g.currency };
    card.supplierName = parentSupplier;
    if (unitKey !== null) {
      card.isUnit = true;
      card.cost = costOf(unitKey);
      card.sale = saleOf(unitKey);
    }
    const producing = cuts.filter((c) => c.outputs.some((o) => o.gemstoneId === g.id));
    if (parentRoughId !== null) {
      const own = producing.find((c) => c.inputs.some((i) => i.roughStoneId === parentRoughId));
      card.registeredOn = dayOf(own ? own.performedAt : g.createdAt);
    } else if (producing.length > 0) {
      card.cutFromRoughOn = dayOf(producing[0].performedAt);
    } else {
      card.registeredOn = dayOf(g.createdAt);
    }
  };

  for (const ds of evidence.dealStones) {
    if (ds.kind === "ROUGH") {
      const r = roughById.get(ds.id);
      const rk = r ? claimKey(ds.id) : null;
      if (!r || rk === null) continue;
      const card = emptyCard(rk, null, ds.code, "ROUGH", r.status, roughSpecs(r));
      cardKeyByStoneId.set(ds.id, card.key);
      cardKeyByDealStone.set(ds.dealStoneId, card.key);
      card.supplierName = textOrNull(r.supplier?.name);
      card.acquiredOn = dayOf(r.purchaseDate);
      card.cuttingStartedOn = jobRows.filter((j) => j.roughStoneId === ds.id && j.startedAt !== null).map((j) => dayOf(j.startedAt as Date));
      card.cuts = cuts
        .filter((c) => c.inputs.some((i) => i.roughStoneId === ds.id))
        .map((c) => ({ on: dayOf(c.performedAt), yieldPct: num(c.yieldPct) }));
      cards.push(card);
      const roughKey = unitKeyOf("ROUGH", ds.id);
      if (ds.unitKeys.includes(roughKey)) {
        card.isUnit = true;
        card.cost = costOf(roughKey);
        continue;
      }
      for (const uk of ds.unitKeys) {
        const u = unitByKey.get(uk);
        const g = u ? gemById.get(u.id) : undefined;
        const gk = u && g ? claimKey(u.id) : null;
        if (!u || !g || gk === null) continue;
        const child = emptyCard(gk, card.key, u.code, "GEM", g.status, gemSpecs(g));
        cardKeyByStoneId.set(u.id, child.key);
        fillGem(child, g, uk, card.supplierName, ds.id);
        card.childUnits += 1;
        if (child.sale !== null) card.soldChildUnits += 1;
        cards.push(child);
      }
    } else {
      const g = gemById.get(ds.id);
      const gk = g ? claimKey(ds.id) : null;
      if (!g || gk === null) continue;
      const card = emptyCard(gk, null, ds.code, "GEM", g.status, gemSpecs(g));
      cardKeyByStoneId.set(ds.id, card.key);
      cardKeyByDealStone.set(ds.dealStoneId, card.key);
      const gemKey = unitKeyOf("GEM", ds.id);
      fillGem(card, g, ds.unitKeys.includes(gemKey) ? gemKey : null, parentSupplier.get(ds.id) ?? null, null);
      cards.push(card);
    }
  }

  // ---- media
  const cardByKey = new Map(cards.map((c) => [c.key, c] as const));
  const ownerCardKey = (a: { gemstoneId: string | null; roughStoneId: string | null; cuttingJobId: string | null }): string | null => {
    if (a.gemstoneId !== null && cardKeyByStoneId.has(a.gemstoneId)) return cardKeyByStoneId.get(a.gemstoneId) ?? null;
    if (a.roughStoneId !== null && cardKeyByStoneId.has(a.roughStoneId)) return cardKeyByStoneId.get(a.roughStoneId) ?? null;
    if (a.cuttingJobId !== null) {
      const rough = jobRough.get(a.cuttingJobId);
      if (rough !== undefined && cardKeyByStoneId.has(rough)) return cardKeyByStoneId.get(rough) ?? null;
    }
    return null;
  };
  for (const a of assetRows) {
    if (a.partnerHidden === true || a.stage === "CERTIFICATION" || !MEDIA_KINDS.includes(a.kind)) continue;
    const url = publicAssetUrl(a.url);
    const owner = ownerCardKey(a);
    const card = owner === null ? undefined : cardByKey.get(owner);
    if (url === null || !card || card.media.length >= MAX_MEDIA_LOADED_PER_STONE) continue;
    card.media.push({
      key: mediaKey(dealId, a.id),
      url,
      kind: a.kind === "VIDEO" ? "VIDEO" : "PHOTO",
      stage: a.stage !== null && (MEDIA_STAGES as readonly string[]).includes(a.stage) ? a.stage : null,
      caption: textOrNull(a.caption),
      on: dayOf(a.capturedAt ?? a.createdAt),
      primary: a.isPrimary,
      process: a.cuttingJobId !== null,
      intake: a.stage === "ROUGH_INTAKE",
    });
  }

  // ---- buckets
  const buckets: SrcBucket[] = result.buckets.map((b) => ({
    cardKey: scope === "POOLED" ? null : cardKeyByDealStone.get(b.bucketKey) ?? null,
    sold: b.soldUnitKeys.length > 0,
    amountMinor: b.amountMinor,
    profitMinor: b.profitMinor,
    fractionPct: pctOfFraction(b.realizedFraction),
    lines: b.lines.map((l) => ({ key: l.key, label: l.label, amountMinor: l.amountMinor, needs: l.needs.slice() })),
  }));
  let capitalReturned = 0;
  let profitShare = 0;
  let commission = 0;
  let fee = 0;
  for (const b of result.buckets) {
    capitalReturned += b.capitalReturnedMinor;
    profitShare += b.profitShareMinor;
    commission += b.commissionMinor;
    fee += b.feeMinor;
  }
  const excludedUnit = result.buckets.some((b) => b.units.some((u) => !u.usable && u.excludedReason !== null && u.excludedReason !== "NO_SALE"));
  const blocked = gathered.flags.some((f) => f.severity === "BLOCK");

  // ---- documents
  const documents: SrcDocument[] = [];
  for (const r of docs.receipts) {
    documents.push({ key: docKey(dealId, r.id), kind: "RECEIPT", name: partnerCostLabel(r.type), on: r.on, stoneKey: cardKeyByStoneId.get(r.ownerId) ?? null });
  }
  for (const c of docs.certificates) {
    documents.push({ key: docKey(dealId, c.id), kind: "CERTIFICATE", name: c.laboratory, on: c.on, stoneKey: cardKeyByStoneId.get(c.gemId) ?? null });
  }

  const units = evidence.units;
  return {
    generatedAt: new Date().toISOString(),
    asOf: asOf.toISOString(),
    partner: { name: deal.partner.name, kind: deal.partner.kind },
    deal: {
      reference: deal.code,
      partnerTitle: textOrNull(deal.partnerTitle),
      status: deal.status,
      method,
      scope,
      earnOn,
      currency: dealCcy,
      ratePct: num(deal.ratePct),
      fixedFeeMinor: minorOrNull(deal.fixedFee),
      investedMinor: minorOrNull(deal.invested),
      capitalProtected: method === "INVESTMENT" && deal.capitalProtected,
      activatedOn: deal.activatedAt ? dayOf(deal.activatedAt) : null,
      closedOn: deal.closedAt ? dayOf(deal.closedAt) : null,
      termsAmendedOn: deal.termsAmendedAt ? dayOf(deal.termsAmendedAt) : null,
      partnerNote: textOrNull(deal.partnerNote),
    },
    incomplete: excludedUnit || blocked,
    approxRates: gathered.flags.some((f) => f.code === "APPROX_RATES"),
    counts: { totalStones: units.length, soldStones: units.filter((u) => u.order !== null).length },
    totals: {
      totalMinor: result.totalMinor,
      capitalReturnedMinor: capitalReturned,
      profitShareMinor: profitShare,
      commissionMinor: commission,
      feeMinor: fee,
      capitalOutstandingMinor: result.capitalOutstandingMinor,
      capitalWrittenOffMinor: result.capitalWrittenOffMinor,
    },
    buckets,
    stones: cards,
    documents,
    ledger: {
      settlements: settlementRows.map((s) => ({ code: s.code, on: dayOf(s.createdAt), amountMinor: decimalToMinor(s.amount), note: textOrNull(s.partnerNote) })),
      adjustments: adjustmentRows.map((a) => ({
        code: a.code, on: dayOf(a.createdAt), amountMinor: decimalToMinor(a.amount), reasonCode: a.reasonCode, note: textOrNull(a.partnerNote),
      })),
      payouts: payoutRows.map((p) => ({
        code: p.code, on: dayOf(p.paidAt), amountMinor: decimalToMinor(p.amount), direction: p.direction === "RECEIVED" ? "RECEIVED" : "PAID", note: textOrNull(p.partnerNote),
      })),
    },
  };
}

/** Admin and test use: the whole source of a deal, with no viewer checks. Never serialise it to a client. */
export async function loadPartnerViewSource(db: Db, a: { dealId: string; asOf?: Date; rates?: RateMap }): Promise<PartnerViewSource> {
  const deal = await readDeal(db, a.dealId);
  return loadSource(db, deal, a.asOf ?? new Date(), a.rates);
}

// ---------------------------------------------------------------------------
// The view: flags in, DTO out (pure)
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<string, string> = { BROKER: "Broker", INVESTOR: "Investor", AGENT: "Agent" };
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", CLOSED: "Closed", DRAFT: "Draft", CANCELLED: "Cancelled" };
const METHOD_LABEL: Record<Method, string> = {
  PROFIT_SHARE: "Profit share",
  SALE_COMMISSION: "Sale commission",
  FIXED_FEE: "Fixed fee",
  INVESTMENT: "Investment with profit share",
};
const METHOD_NOTE: Record<Method, string> = {
  PROFIT_SHARE:
    "You receive an agreed percentage of the profit on stones that sell. Profit is the sale price less the eligible costs of the stone. Where a rough stone is cut into several gems, its cost is shared between the gems by finished weight.",
  SALE_COMMISSION: "You receive an agreed percentage of the sale price of stones that sell, whether or not a profit is made.",
  FIXED_FEE: "You receive the agreed fixed fee for the stones that sell. The fee does not depend on the sale price or on costs.",
  INVESTMENT:
    "Your invested capital is returned as stones sell, together with an agreed percentage of the profit. Where a rough stone is cut into several gems, its cost is shared between the gems by finished weight.",
};
const SCOPE_LABEL: Record<Scope, string> = { PER_STONE: "Per stone", POOLED: "Pooled" };
const EARN_LABEL: Record<EarnOn, string> = { SALE: "On sale", PAYMENT: "On payment" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const EVENT_ORDER: readonly PartnerEventType[] = [
  "DEAL_STARTED", "ACQUIRED", "CUTTING_STARTED", "CUTTING_COMPLETED", "GEM_REGISTERED", "CERTIFICATE_SUBMITTED", "CERTIFICATE_ISSUED",
  "MEDIA_ADDED", "COST_RECORDED", "SOLD", "PAYMENT_RECEIVED", "SETTLEMENT_RECORDED", "ADJUSTMENT_RECORDED", "PAYOUT_MADE", "TERMS_AMENDED",
  "DEAL_CLOSED",
];

function docDate(on: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(on);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : on;
}

function stageOf(s: SrcStone, e: PartnerVisibility): StoneStage {
  if (s.sale !== null) {
    if (!e.paymentsReceived) return "SOLD";
    const { paidMinor, denMinor } = s.sale;
    if (paidMinor === null || denMinor === null) return "SOLD";
    if (paidMinor <= 0) return "SOLD_AWAITING_PAYMENT";
    return paidMinor >= denMinor ? "SOLD_PAID" : "SOLD_PART_PAID";
  }
  if (s.kind === "ROUGH") {
    if (!s.isUnit) {
      if (s.soldChildUnits > 0) return s.soldChildUnits >= s.childUnits ? "SOLD" : "PARTLY_SOLD";
      return "CUT";
    }
    switch (s.rawStatus) {
      case "PURCHASED": case "RECEIVED": case "INSPECTED": case "AVAILABLE": return "PURCHASED";
      case "RESERVED": return "RESERVED";
      case "IN_CUTTING": return "IN_CUTTING";
      case "CUT": case "CONVERTED": return "CUT";
      default: return "UNAVAILABLE";
    }
  }
  switch (s.rawStatus) {
    case "IN_PROGRESS": return "CUT";
    case "AVAILABLE": return "IN_STOCK";
    case "RESERVED": return "RESERVED";
    default: return "UNAVAILABLE";
  }
}

function adjustmentLabel(code: string, e: PartnerVisibility): string {
  switch (code) {
    case "COST_CHANGE": return e.costBreakdown ? "Cost update" : "Recalculation";
    case "PRICE_CHANGE": return e.salePrice ? "Price update" : "Recalculation";
    case "FX_CORRECTION": return e.salePrice ? "Exchange-rate correction" : "Recalculation";
    case "NETTING": return "Recalculation";
    case "SALE_CANCELLED": return "Sale cancelled";
    case "STONE_REMOVED": return "Stone removed from the deal";
    case "STONE_WRITTEN_OFF": return "Stone written off";
    default: return "Adjustment";
  }
}

export function toPartnerView(src: PartnerViewSource, flags: PartnerVisibility): PartnerPortalDto {
  const d = src.deal;
  const e = normalizeVisibility(flags, d.method, d.earnOn).effective;
  const ccy = d.currency;
  const M = (m: Minor): Money => toMoney(m, ccy);
  const profitBased = d.method === "PROFIT_SHARE" || d.method === "INVESTMENT";
  const nameOf = (s: SrcStone): string => (e.stoneIdentity ? s.code : s.anonName);
  const nameByKey = new Map(src.stones.map((s) => [s.key, nameOf(s)] as const));
  const bucketOfCard = new Map<string, SrcBucket>();
  for (const b of src.buckets) if (b.cardKey !== null) bucketOfCard.set(b.cardKey, b);

  const visibleMedia = (s: SrcStone): SrcMedia[] => {
    if (!e.media && !e.processMedia) return [];
    const out = s.media.filter((m) => (m.process ? e.processMedia : e.media) && (!m.intake || e.supplierIdentity));
    return out.slice(0, MAX_MEDIA_PER_STONE);
  };

  const stoneDto = (s: SrcStone): StoneDto => {
    const bucket = bucketOfCard.get(s.key) ?? null;
    const sold = bucket !== null && bucket.sold;
    const c = s.cost;
    let cost: StoneDto["cost"] = null;
    if (c !== null) {
      const purchase = e.purchaseCost && c.purchaseMinor !== null ? M(c.purchaseMinor) : null;
      let lines: { label: string; amount: Money }[] | null = null;
      if (e.costBreakdown) {
        const order: string[] = [];
        const sums = new Map<string, number>();
        for (const l of c.lines) {
          if (!sums.has(l.label)) order.push(l.label);
          sums.set(l.label, (sums.get(l.label) ?? 0) + l.minor);
        }
        lines = order.map((label) => ({ label, amount: M(sums.get(label) ?? 0) }));
      }
      const total = e.purchaseCost && e.costBreakdown && c.totalMinor !== null ? M(c.totalMinor) : null;
      if (purchase !== null || lines !== null || total !== null) cost = { purchase, lines, total };
    }

    let sale: StoneDto["sale"] = null;
    let payments: StoneDto["payments"] = null;
    if (s.sale !== null) {
      const x = s.sale;
      const foreign = e.salePrice && x.originalCurrency !== ccy && x.originalMinor !== null;
      sale = {
        soldOn: x.soldOn,
        price: e.salePrice && x.priceMinor !== null ? M(x.priceMinor) : null,
        priceOriginal: foreign && x.originalMinor !== null ? toMoney(x.originalMinor, x.originalCurrency) : null,
        fxNote: foreign ? x.fxNote : null,
        paidPct: e.paymentsReceived && x.paidMinor !== null && x.denMinor !== null ? pctOf(x.paidMinor, x.denMinor) : null,
      };
      if (e.paymentsReceived) {
        payments = x.payments.map((p) => ({
          on: p.on,
          amount: e.salePrice && p.dealMinor !== null ? M(p.dealMinor) : null,
          pct: p.orderMinor !== null && x.denMinor !== null ? pctOf(p.orderMinor, x.denMinor) : null,
        }));
      }
    }

    const media = e.media || e.processMedia
      ? visibleMedia(s).map((m) => ({
          key: m.key,
          url: m.url,
          kind: m.kind,
          stage: m.stage,
          caption: e.mediaCaptions ? m.caption : null,
          on: m.on,
          primary: m.primary,
        }))
      : null;

    const sp = s.specs;
    const base = sp.variety ?? sp.gemType;
    const title = !e.stoneSpecs || base === null ? null : s.kind === "ROUGH" ? `${base} rough` : `${sp.shape ? `${sp.shape} ` : ""}${base}`;

    return {
      key: s.key,
      parentKey: e.provenance ? s.parentKey : null,
      displayName: nameOf(s),
      kind: s.kind,
      title,
      specs: e.stoneSpecs
        ? {
            gemType: sp.gemType,
            variety: sp.variety,
            weightCt: sp.weightCt,
            dimensionsMm: sp.dimensionsMm,
            shape: sp.shape,
            cut: sp.cut,
            colorDescription: sp.colorDescription,
            clarity: sp.clarity,
            treatment: sp.treatment,
            origin: sp.origin,
          }
        : null,
      stage: stageOf(s, e),
      cgi: e.cgi && s.cgi !== null ? { score: s.cgi.score, band: s.cgi.band } : null,
      certificate: e.certificates && s.certificate !== null
        ? { laboratory: s.certificate.laboratory, number: s.certificate.number, issuedOn: s.certificate.issuedOn }
        : null,
      media,
      askingPrice: e.askingPrice && s.askingPrice !== null && s.sale === null ? toMoney(s.askingPrice.minor, s.askingPrice.currency) : null,
      sale,
      payments,
      cost,
      supplier: e.supplierIdentity && s.supplierName !== null ? { name: s.supplierName } : null,
      profit: e.profitFigures && profitBased && bucket !== null && sold ? M(bucket.profitMinor) : null,
      contribution: bucket !== null && sold ? M(bucket.amountMinor) : null,
    };
  };

  const stones = src.stones.map(stoneDto);

  // ---- statement
  const t = src.totals;
  const led = src.ledger;
  const settled = led.settlements.reduce((s, x) => s + x.amountMinor, 0);
  const adjusted = led.adjustments.reduce((s, x) => s + x.amountMinor, 0);
  const netPaid = led.payouts.reduce((s, x) => s + (x.direction === "PAID" ? x.amountMinor : -x.amountMinor), 0);
  const position = settled + adjusted;
  const lastDay = (days: string[]): string | null => days.reduce<string | null>((m, x) => (m === null || x > m ? x : m), null);

  const calcVisible = e.calculationDetail && src.buckets.every((b) => b.lines.every((l) => lineVisible(l, e)));
  const calculation = calcVisible
    ? src.buckets
        .filter((b) => b.sold)
        .map((b) => {
          const lines: CalcLineDto[] = b.lines.map((l, i) => {
            const line: CalcLineDto = {
              label: l.label,
              value: l.amountMinor === null ? null : M(l.amountMinor),
              pct: l.key === "share" || l.key === "commission" ? d.ratePct : l.key === "realisedShare" ? b.fractionPct : null,
            };
            if (i === b.lines.length - 1) line.emphasis = true;
            return line;
          });
          return { bucketLabel: b.cardKey === null ? "All stones (pooled)" : nameByKey.get(b.cardKey) ?? "Stone", lines };
        })
    : null;

  const statement: PartnerPortalDto["statement"] = {
    estimate: {
      amount: M(t.totalMinor),
      asOf: dayOfIso(src.asOf),
      incomplete: src.incomplete,
      approxRates: src.approxRates,
      soldStones: src.counts.soldStones,
      totalStones: src.counts.totalStones,
      parts: {
        capitalReturned: d.method === "INVESTMENT" ? M(t.capitalReturnedMinor) : null,
        profitShare: profitBased ? M(t.profitShareMinor) : null,
        commission: d.method === "SALE_COMMISSION" ? M(t.commissionMinor) : null,
        fixedFee: d.method === "FIXED_FEE" ? M(t.feeMinor) : null,
      },
    },
    settled: { amount: M(settled), count: led.settlements.length, lastOn: lastDay(led.settlements.map((x) => x.on)) },
    adjustments: {
      amount: M(adjusted),
      items: led.adjustments.map((a) => ({ on: a.on, ref: a.code, label: adjustmentLabel(a.reasonCode, e), amount: M(a.amountMinor), note: a.note })),
    },
    paid: {
      amount: M(netPaid),
      lastOn: lastDay(led.payouts.map((x) => x.on)),
      items: led.payouts.map((p) => ({ on: p.on, ref: p.code, amount: M(p.amountMinor), direction: p.direction, note: p.note })),
    },
    balance: M(position - netPaid),
    notYetSettled: M(t.totalMinor - position),
    capitalOutstanding: d.method === "INVESTMENT" && t.capitalOutstandingMinor !== null ? M(t.capitalOutstandingMinor) : null,
    capitalWrittenOff:
      d.method === "INVESTMENT" && t.capitalWrittenOffMinor !== null && t.capitalWrittenOffMinor > 0 ? M(t.capitalWrittenOffMinor) : null,
    settlements: led.settlements.map((s) => ({ ref: s.code, on: s.on, amount: M(s.amountMinor), note: s.note })),
    calculation,
  };

  // ---- timeline: fixed templates over structured data, never free text
  let timeline: TimelineItemDto[] | null = null;
  if (e.timeline) {
    const items: TimelineItemDto[] = [];
    const push = (on: string | null, type: PartnerEventType, text: string, key: string | null, amount: Money | null): void => {
      if (on !== null) items.push({ on, type, text, stoneKey: key, amount });
    };
    push(d.activatedOn, "DEAL_STARTED", "Deal started", null, null);
    for (const s of src.stones) {
      const name = nameOf(s);
      if (e.provenance) {
        push(s.acquiredOn, "ACQUIRED", `Acquired ${name}`, s.key, null);
        for (const on of s.cuttingStartedOn) push(on, "CUTTING_STARTED", `Cutting started on ${name}`, s.key, null);
        for (const c of s.cuts) {
          const yieldText = e.stoneSpecs && c.yieldPct !== null ? ` - yield ${Number(c.yieldPct.toFixed(1))}%` : "";
          push(c.on, "CUTTING_COMPLETED", `Cutting completed on ${name}${yieldText}`, s.key, null);
        }
        push(s.registeredOn, "GEM_REGISTERED", `${name} registered as a finished stone`, s.key, null);
        const weightText = e.stoneSpecs && s.specs.weightCt !== null ? ` - ${Number(s.specs.weightCt.toFixed(2))} ct` : "";
        push(s.cutFromRoughOn, "CUTTING_COMPLETED", `${name} cut from a rough${weightText}`, s.key, null);
      }
      if (e.certificates && s.certificate !== null) {
        push(s.certificate.submittedOn, "CERTIFICATE_SUBMITTED", `Certificate submitted for ${name}`, s.key, null);
        if (s.certificate.issued) push(s.certificate.issuedOn, "CERTIFICATE_ISSUED", `Certificate issued for ${name}`, s.key, null);
      }
      for (const m of visibleMedia(s)) push(m.on, "MEDIA_ADDED", `${m.kind === "VIDEO" ? "Video" : "Photo"} added for ${name}`, s.key, null);
      if (e.costBreakdown && s.cost !== null) {
        for (const l of s.cost.lines) push(l.on, "COST_RECORDED", `${l.label} cost recorded for ${name}`, s.key, M(l.minor));
      }
      if (s.sale !== null) {
        push(s.sale.soldOn, "SOLD", `${name} sold`, s.key, e.salePrice && s.sale.priceMinor !== null ? M(s.sale.priceMinor) : null);
        if (e.paymentsReceived) {
          for (const p of s.sale.payments) {
            push(p.on, "PAYMENT_RECEIVED", `Payment received for ${name}`, s.key, e.salePrice && p.dealMinor !== null ? M(p.dealMinor) : null);
          }
        }
      }
    }
    for (const x of led.settlements) push(x.on, "SETTLEMENT_RECORDED", `Statement ${x.code} settled`, null, M(x.amountMinor));
    for (const x of led.adjustments) push(x.on, "ADJUSTMENT_RECORDED", `Adjustment ${x.code} recorded`, null, M(x.amountMinor));
    for (const x of led.payouts) {
      const text = x.direction === "PAID" ? `Payment ${x.code} sent to you` : `Amount ${x.code} received back from you`;
      push(x.on, "PAYOUT_MADE", text, null, M(x.amountMinor));
    }
    push(d.termsAmendedOn, "TERMS_AMENDED", "Terms amended", null, null);
    push(d.closedOn, "DEAL_CLOSED", "Deal closed", null, null);
    items.sort((a, b) => a.on.localeCompare(b.on) || EVENT_ORDER.indexOf(a.type) - EVENT_ORDER.indexOf(b.type) || a.text.localeCompare(b.text));
    timeline = items.length > MAX_TIMELINE ? items.slice(items.length - MAX_TIMELINE) : items;
  }

  // ---- documents
  const documents =
    e.receipts || e.certificateFiles
      ? src.documents
          .filter((x) => (x.kind === "RECEIPT" ? e.receipts : e.certificateFiles))
          .slice()
          .sort((a, b) => a.on.localeCompare(b.on) || a.key.localeCompare(b.key))
          .map((x) => ({
            key: x.key,
            label: `${x.kind === "RECEIPT" ? "Receipt" : "Certificate"} - ${x.name} - ${docDate(x.on)}`,
            kind: x.kind,
            stoneKey: x.stoneKey,
          }))
      : null;

  const notices: PartnerNotice[] = [];
  if (src.incomplete) notices.push("INCOMPLETE_DATA");
  if (src.approxRates) notices.push("APPROX_RATES");
  if (d.termsAmendedOn !== null) notices.push("TERMS_AMENDED");
  if (src.stones.length === 0) notices.push("NO_STONES");
  if (src.counts.soldStones === 0 && led.settlements.length + led.adjustments.length + led.payouts.length === 0) notices.push("NO_ACTIVITY");
  if (d.status === "CLOSED") notices.push("DEAL_CLOSED");

  return {
    schemaVersion: 1,
    generatedAt: src.generatedAt,
    watermarkName: src.partner.name,
    partner: { name: src.partner.name, kindLabel: KIND_LABEL[src.partner.kind] ?? "Partner" },
    deal: {
      reference: d.reference,
      title: d.partnerTitle ?? "Your deal",
      statusLabel: STATUS_LABEL[d.status] ?? "Active",
      methodLabel: METHOD_LABEL[d.method],
      methodNote: METHOD_NOTE[d.method],
      scopeLabel: SCOPE_LABEL[d.scope],
      earnOnLabel: EARN_LABEL[d.earnOn],
      currency: ccy,
      startedOn: d.activatedOn,
      closedOn: d.closedOn,
      termsAmendedOn: d.termsAmendedOn,
      partnerNote: d.partnerNote,
      terms: {
        ratePct: d.method === "FIXED_FEE" ? null : d.ratePct,
        fixedFee: d.method === "FIXED_FEE" && d.fixedFeeMinor !== null ? M(d.fixedFeeMinor) : null,
        invested: d.method === "INVESTMENT" && d.investedMinor !== null ? M(d.investedMinor) : null,
        capitalProtected: d.capitalProtected,
      },
    },
    statement,
    stones,
    timeline,
    documents,
    resale: null,
    notices,
  };
}

// ---------------------------------------------------------------------------
// The guard: nothing but plain primitives, no ids, no internal addresses, no forbidden names
// ---------------------------------------------------------------------------

// Column names that exist only on internal rows (spec 6.4, "never copied"). Names the DTO itself uses (reference, note, price, cost,
// name) are deliberately absent: their values are covered by the field-by-field whitelist and the leak test.
const DENY_KEYS: ReadonlySet<string> = new Set(
  [
    "id", "ids", "cuid", "dealId", "partnerId", "accessId", "customerId", "customer", "customerName", "buyer", "invoiceNumber", "invoice",
    "salespersonId", "salesperson", "orderId", "salesOrderId", "paymentId", "gemstoneId", "roughStoneId", "supplierId", "dealStoneId",
    "bucketKey", "unitKey", "tokenHash", "token", "passwordHash", "password", "description", "vendor", "receiptUrl", "documentUrl",
    "imageUrl", "originalName", "createdBy", "createdById", "createdByName", "recordedBy", "approvedBy", "operator", "cutter", "cutterId",
    "laborCost", "machineCost", "totalCost", "costPerCt", "minimumPrice", "pricePerCt", "purchasePrice", "initialValuation", "valuation",
    "valuationBy", "valuationDate", "valuationNotes", "observations", "mineSource", "cgiQualityNotes", "comments", "comment",
    "laboratoryFees", "tracking", "trackingNumber", "courier", "destination", "destCountry", "internalNotes", "termsAmendReason",
    "evidence", "inputs", "rates", "reason", "method", "notes", "userName", "ipAddress", "metadata", "oldValue", "newValue",
    "realizationKey", "inputsHash", "formulaVersion", "partnerHidden", "code", "recordedByName", "deposit", "salesOrder", "payment",
  ].map((k) => k.toLowerCase()),
);

const CUID_RE = /\bc[a-z0-9]{24}\b/;
const INTERNAL_PATH_RE =
  /^(?:https?:\/\/[^/]+)?\/(?:rough|gemstones|customers|sales|inventory|expenses|partners|suppliers|cutting|quotations|reservations|shipments|audit-log|settings|users|api|login)(?:[/?#]|$)/i;
const DANGEROUS_SCHEME_RE = /^\s*(?:javascript|data|vbscript|file):/i;

export function assertPublicDto(x: unknown): void {
  const ancestors = new Set<object>();
  const fail = (path: string, why: string): never => {
    throw new PartnerViewError(`DTO guard: ${why} at ${path}`);
  };
  const walk = (v: unknown, path: string, depth: number): void => {
    if (depth > 14) fail(path, "nesting too deep");
    switch (typeof v) {
      case "string": {
        if (CUID_RE.test(v)) fail(path, "id-shaped string");
        if (INTERNAL_PATH_RE.test(v)) fail(path, "internal address");
        if (DANGEROUS_SCHEME_RE.test(v)) fail(path, "unsafe address scheme");
        return;
      }
      case "number":
        if (!Number.isFinite(v)) fail(path, "non-finite number");
        return;
      case "boolean":
        return;
      case "object": {
        if (v === null) return;
        if (ancestors.has(v)) fail(path, "circular reference");
        ancestors.add(v);
        if (Array.isArray(v)) {
          v.forEach((item, i) => walk(item, `${path}[${i}]`, depth + 1));
          ancestors.delete(v);
          return;
        }
        const proto = Object.getPrototypeOf(v);
        if (proto !== Object.prototype && proto !== null) fail(path, "non-plain object (Date, Decimal or class instance)");
        if (Object.getOwnPropertySymbols(v).length > 0) fail(path, "symbol key");
        const keys = Object.keys(v);
        if (keys.length === 3 && keys.includes("d") && keys.includes("e") && keys.includes("s")) fail(path, "Decimal-shaped object");
        for (const k of keys) {
          if (DENY_KEYS.has(k.toLowerCase())) fail(`${path}.${k}`, "forbidden key");
          const child = (v as Record<string, unknown>)[k];
          // The same rule that admitted the address when the view was built: the public media origin over https, or an upload path.
          if (k === "url" && !(typeof child === "string" && publicAssetUrl(child) === child)) fail(`${path}.${k}`, "unsafe media address");
          walk(child, `${path}.${k}`, depth + 1);
        }
        ancestors.delete(v);
        return;
      }
      default:
        fail(path, `unsupported value (${typeof v})`);
    }
  };
  walk(x, "dto", 0);
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export interface BuildArgs {
  dealId: string;
  viewer: ResolvedAccess | AdminPreview;
  /** Admin preview only: what the partner would see with these switches. A real visit always uses the deal's stored flags. */
  visibility?: PartnerVisibility;
  /** Admin preview only; a real visit is always "now". */
  asOf?: Date;
  /** Admin preview and tests only: a ready rate map (skips the live feed). */
  rates?: RateMap;
}

type Viewer = { public: true; dealId: string } | { public: false; dealId: string };

// A real visit must come from resolvePartnerAccess (a hand-built object is refused); a preview is a server-built marker.
function classifyViewer(v: unknown): Viewer {
  if (isIssuedAccess(v)) return { public: true, dealId: v.dealId };
  if (typeof v === "object" && v !== null) {
    const p = v as { kind?: unknown; dealId?: unknown };
    if (p.kind === "ADMIN_PREVIEW" && typeof p.dealId === "string") return { public: false, dealId: p.dealId };
  }
  throw new PartnerViewError("Unknown viewer");
}

function viewerAllowed(viewer: Viewer, dealId: string, deal: { status: string; partner: { active: boolean } }): void {
  if (viewer.dealId !== dealId) throw new PartnerViewError("This viewer does not belong to the deal");
  if (viewer.public && (!PUBLIC_DEAL_STATUSES.includes(deal.status) || !deal.partner.active)) throw new PartnerViewError("The deal is not available");
}

export async function buildPartnerPortalDtoIn(db: Db, a: BuildArgs): Promise<PartnerPortalDto> {
  keyring();
  const viewer = classifyViewer(a.viewer);
  if (viewer.dealId !== a.dealId) throw new PartnerViewError("This viewer does not belong to the deal");
  const deal = await readDeal(db, a.dealId);
  viewerAllowed(viewer, a.dealId, deal);
  const flags = !viewer.public && a.visibility ? a.visibility : parseVisibility(deal.visibility);
  const asOf = !viewer.public && a.asOf ? a.asOf : new Date();
  const src = await loadSource(db, deal, asOf, viewer.public ? undefined : a.rates);
  const dto = toPartnerView(src, flags);
  assertPublicDto(dto);
  return dto;
}

export async function buildPartnerPortalDto(a: BuildArgs): Promise<PartnerPortalDto> {
  return buildPartnerPortalDtoIn(prisma, a);
}

/**
 * The stored address of a document the viewer may currently see. The key is recomputed over the deal's own receipts and
 * issued certificates (never looked up by database id), and the viewer's flags decide whether that kind is visible at all.
 */
export async function resolvePartnerDocument(
  a: { dealId: string; viewer: ResolvedAccess | AdminPreview; key: string; visibility?: PartnerVisibility },
  db: Db = prisma,
): Promise<{ kind: "RECEIPT" | "CERTIFICATE"; url: string } | null> {
  keyring();
  const viewer = classifyViewer(a.viewer);
  if (typeof a.key !== "string" || !/^[A-Za-z0-9_-]{16}$/.test(a.key)) return null;
  if (viewer.dealId !== a.dealId) return null;
  const deal = await readDeal(db, a.dealId);
  try {
    viewerAllowed(viewer, a.dealId, deal);
  } catch {
    return null;
  }
  const flags = !viewer.public && a.visibility ? a.visibility : parseVisibility(deal.visibility);
  const e = normalizeVisibility(flags, pick(PAYOUT_METHODS, deal.method, "payout method"), pick(EARN_ON, deal.earnOn, "earn-on setting")).effective;
  if (!e.receipts && !e.certificateFiles) return null;
  const docs = await loadDocumentCandidates(db, a.dealId, parseExcluded(deal.excludedCostTypes));
  if (e.receipts) {
    const r = docs.receipts.find((x) => docKey(a.dealId, x.id) === a.key);
    const url = r ? publicAssetUrl(r.url) : null;
    if (url !== null) return { kind: "RECEIPT", url };
  }
  if (e.certificateFiles) {
    const c = docs.certificates.find((x) => docKey(a.dealId, x.id) === a.key);
    const url = c ? publicAssetUrl(c.url) : null;
    if (url !== null) return { kind: "CERTIFICATE", url };
  }
  return null;
}
