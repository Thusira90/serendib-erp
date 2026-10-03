// Partner-facing portal DTO: primitives only (no Date, Decimal, bigint, internal ids or internal hrefs). Types plus one tiny helper.
import type { PartnerEventType } from "./enums";
import { minorToMajor, type Minor } from "./partner-money";

export type { PartnerEventType };

export type Money = { amount: number; currency: string };

export const toMoney = (minor: Minor, currency: string): Money => ({ amount: minorToMajor(minor), currency });

export type PartnerNotice = "INCOMPLETE_DATA" | "APPROX_RATES" | "TERMS_AMENDED" | "NO_STONES" | "NO_ACTIVITY" | "DEAL_CLOSED";
export type StoneStage =
  | "PURCHASED" | "IN_CUTTING" | "CUT" | "IN_STOCK" | "RESERVED" | "SOLD" | "SOLD_AWAITING_PAYMENT"
  | "SOLD_PART_PAID" | "SOLD_PAID" | "PARTLY_SOLD" | "UNAVAILABLE";

export interface CalcLineDto { label: string; value: Money | null; pct: number | null; emphasis?: boolean }

export interface StoneSpecsDto {
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

export interface StoneMediaDto {
  key: string;
  url: string;
  kind: "PHOTO" | "VIDEO";
  stage: string | null;
  caption: string | null;
  on: string | null;
  primary: boolean;
}

export interface StoneDto {
  key: string;
  parentKey: string | null;
  displayName: string;
  kind: "ROUGH" | "GEM";
  title: string | null;
  specs: StoneSpecsDto | null;
  stage: StoneStage;
  cgi: { score: number | null; band: string | null } | null;
  certificate: { laboratory: string; number: string | null; issuedOn: string | null } | null;
  media: StoneMediaDto[] | null;
  askingPrice: Money | null;
  sale: { soldOn: string; price: Money | null; priceOriginal: Money | null; fxNote: string | null; paidPct: number | null } | null;
  payments: { on: string; amount: Money | null; pct: number | null }[] | null;
  cost: { purchase: Money | null; lines: { label: string; amount: Money }[] | null; total: Money | null } | null;
  supplier: { name: string } | null;
  // Recognised profit from the engine (fraction-applied under PAYMENT), never the stone's whole price minus whole cost.
  profit: Money | null;
  contribution: Money | null;
}

export interface TimelineItemDto { on: string; type: PartnerEventType; text: string; stoneKey: string | null; amount: Money | null }

export interface PartnerDealTermsDto { ratePct: number | null; fixedFee: Money | null; invested: Money | null; capitalProtected: boolean }

export interface PartnerResaleDto {
  enabled: boolean;
  allowBranded: boolean;
  neutralHostWarning: boolean;
  maxTtlMinutes: number;
  eligible: { key: string; label: string; kind: "ROUGH" | "GEM" }[];
  links: { reference: string; createdOn: string; expiresOn: string; active: boolean; stoneCount: number; modeLabel: string }[];
}

export interface PartnerStatementDto {
  estimate: {
    amount: Money;
    asOf: string;
    incomplete: boolean;
    approxRates: boolean;
    soldStones: number;
    totalStones: number;
    parts: { capitalReturned: Money | null; profitShare: Money | null; commission: Money | null; fixedFee: Money | null };
  };
  settled: { amount: Money; count: number; lastOn: string | null };
  adjustments: { amount: Money; items: { on: string; ref: string; label: string; amount: Money; note: string | null }[] };
  paid: {
    amount: Money;
    lastOn: string | null;
    items: { on: string; ref: string; amount: Money; direction: "PAID" | "RECEIVED"; note: string | null }[];
  };
  balance: Money;
  notYetSettled: Money;
  capitalOutstanding: Money | null;
  capitalWrittenOff: Money | null;
  settlements: { ref: string; on: string; amount: Money; note: string | null }[];
  calculation: { bucketLabel: string; lines: CalcLineDto[] }[] | null;
}

export interface PartnerPortalDto {
  schemaVersion: 1;
  generatedAt: string;
  watermarkName: string;
  partner: { name: string; kindLabel: string };
  deal: {
    reference: string;
    title: string;
    statusLabel: string;
    methodLabel: string;
    methodNote: string;
    scopeLabel: string;
    earnOnLabel: string;
    currency: string;
    startedOn: string | null;
    closedOn: string | null;
    termsAmendedOn: string | null;
    partnerNote: string | null;
    terms: PartnerDealTermsDto;
  };
  statement: PartnerStatementDto;
  stones: StoneDto[];
  timeline: TimelineItemDto[] | null;
  documents: { key: string; label: string; kind: "RECEIPT" | "CERTIFICATE"; stoneKey: string | null }[] | null;
  resale: PartnerResaleDto | null;
  notices: PartnerNotice[];
}
