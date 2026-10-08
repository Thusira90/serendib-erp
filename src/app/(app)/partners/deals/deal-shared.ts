// Plain module shared by the deal pages (server) and their client islands: labels, plain-words formulas, flag hints and input types.
// Not a "use client" or "use server" file on purpose: a constant exported from either would arrive as a reference, not a value.
import type { DealStatus, EarnOn, FlagCode, PartnerScope, PayoutMethod } from "@/lib/enums";
import type { PartnerVisibility } from "@/lib/partner-visibility";

export const METHOD_LABEL: Record<PayoutMethod, string> = {
  PROFIT_SHARE: "Profit share",
  SALE_COMMISSION: "Sale commission",
  FIXED_FEE: "Fixed fee",
  INVESTMENT: "Investment",
};

export const METHOD_FORMULA: Record<PayoutMethod, string> = {
  PROFIT_SHARE: "Partner gets a % of the profit, where profit = sale price minus the stone's costs.",
  SALE_COMMISSION: "Partner gets a % of the sale price. Costs are never looked at.",
  FIXED_FEE: "Partner gets a set fee for each stone sold (or once for a pooled lot).",
  INVESTMENT: "Partner's capital comes back first from the sales, plus a % of the profit.",
};

export const PARTNER_KIND_LABELS: Record<string, string> = { BROKER: "Broker", INVESTOR: "Investor", AGENT: "Agent" };

export const SCOPE_LABEL: Record<PartnerScope, string> = { PER_STONE: "Per stone", POOLED: "Pooled" };

export const SCOPE_NOTE: Record<PartnerScope, string> = {
  PER_STONE:
    "Each stone is worked out on its own and a rough is treated as one lot. A stone's profit is floored at 0 separately, so partner shares can exceed the company's net profit across stones.",
  POOLED: "All stones are added together and worked out once, so gains and losses net off. Costs of unsold stones are left out until they sell.",
};

export const EARN_ON_LABEL: Record<EarnOn, string> = { SALE: "On sale", PAYMENT: "On payment" };

export const EARN_ON_NOTE: Record<EarnOn, string> = {
  PAYMENT: "The partner earns in proportion to the money received from the buyer. A half-paid sale earns half.",
  SALE: "The partner earns the full amount as soon as a sale is confirmed, even if the buyer has not paid yet.",
};

export const STATUS_LABEL: Record<DealStatus, string> = { DRAFT: "Draft", ACTIVE: "Active", CLOSED: "Closed", CANCELLED: "Cancelled" };
export const STATUS_VARIANT = { DRAFT: "muted", ACTIVE: "success", CLOSED: "secondary", CANCELLED: "danger" } as const;

export const LEGAL_NOTICE =
  "Investment and profit-sharing arrangements may be regulated and can have legal, tax and accounting consequences. Have the terms reviewed by a Sri Lankan lawyer and accountant before real use. This application records the terms you enter and calculates amounts from them; it does not give legal, tax or accounting advice.";

export const DEAL_HELP_LINES = [
  "Stones that are lost are never charged to the partner.",
  "Costs of unsold stones are left out until they sell.",
  "Cutting costs are shared between the cut gems by weight.",
] as const;

export const DEFAULT_EXCLUDED_TYPES: readonly string[] = ["RENT", "SALARIES", "TAX"];

export const TAB_KEYS = ["overview", "stones", "visibility", "money", "access"] as const;
export type DealTab = (typeof TAB_KEYS)[number];
export const TAB_LABEL: Record<DealTab, string> = {
  overview: "Overview",
  stones: "Stones",
  visibility: "Visibility",
  money: "Money",
  access: "Access",
};

export const FLAG_INFO: Record<FlagCode, { label: string; fix: string }> = {
  DUPLICATE_UNIT: { label: "A stone is counted twice", fix: "Remove one of the deal stones that cover the same stone." },
  OVERLAP_ROUGH_GEM: { label: "A rough and a gem cut from it are both in this deal", fix: "Keep either the rough or its gem in the deal, not both." },
  MULTIPLE_LIVE_SALES: { label: "A stone has more than one live sale", fix: "Cancel the sale that is not real, then recalculate." },
  APPROX_RATES_USED: { label: "Settlement would use approximate exchange rates", fix: "Add a manual exchange rate for the currency on the deal form." },
  CO_PARTNER_CAP_EXCEEDED: { label: "Partner shares on a shared stone add up to more than 100%", fix: "Lower a rate on one of the deals covering the stone." },
  CO_PARTNER_TOTAL_EXCEEDS_REVENUE: { label: "Amounts owed across partner deals exceed the revenue", fix: "Review the other open deals on the same stones." },
  INVESTED_MISMATCH: { label: "The per-stone invested amounts do not add up to the invested total", fix: "Open the Stones tab and run Allocate investment again." },
  INVESTED_EXCEEDS_BASIS: { label: "A stone's invested amount is more than its eligible cost", fix: "Re-split the invested amount on the Stones tab." },
  ALLOCATION_INCOMPLETE: { label: "Some stones have no allocated acquisition cost", fix: "Allocate the acquisition cost on the Stones tab." },
  NEGATIVE_AMOUNT: { label: "An amount is negative or too large to calculate", fix: "Check the stone, bill and sale amounts for typing errors." },
  STONE_ALREADY_SOLD: { label: "A stone was sold before it joined the deal", fix: "Remove it, or set a count-from date for the stone." },
  NEEDS_RATE_COST: { label: "A cost is in a currency with no exchange rate", fix: "Add a manual exchange rate for that currency." },
  NEEDS_RATE_SALE: { label: "A sale price is in a currency with no exchange rate", fix: "Add a manual exchange rate for that currency." },
  NEEDS_RATE_PAYMENT: { label: "A payment is in a currency with no exchange rate", fix: "Add a manual exchange rate for that currency." },
  COST_MISSING: { label: "A sold stone has no known cost", fix: "Record the purchase price or allocate the acquisition cost." },
  ZERO_PRICE_SALE: { label: "A stone was sold for nothing", fix: "Correct the sale price if it is wrong." },
  ROUGH_SOLD_NO_PROCEEDS: { label: "A rough is marked sold but no sale is recorded", fix: "Record the sale against the cut gem, or fix the rough's status." },
  MULTIPLE_CUTS: { label: "A rough has been cut more than once", fix: "Check the cutting records for a duplicate." },
  REJECTED_BILL_IN_CUT: { label: "A rejected bill sits inside a cut", fix: "Check the bill; rejected bills are not charged to the partner." },
  COST_DRIFT: { label: "A stone's stored total cost differs from the cost lines", fix: "Open the stone and recalculate its cost." },
  PURCHASE_DRIFT: { label: "A rough's purchase price differs from its cost line", fix: "Check the rough's purchase price." },
  PARCEL_DRIFT: { label: "A parcel's price differs from its stones' prices", fix: "Allocate the parcel total, or confirm each stone's price, on the Stones tab." },
  STATUS_MISMATCH: { label: "A stone's status does not match its sale", fix: "Check the stone's status and its sale." },
  DEPOSIT_NOT_RECORDED: { label: "A reservation deposit is not recorded as a payment", fix: "Record the deposit as a payment on the sale." },
  UNKNOWN_COST_TYPE: { label: "A cost has a type this deal does not recognise", fix: "Check the cost types table below." },
  WEIGHT_CHANGED: { label: "A stone's weight changed since it joined the deal", fix: "Confirm the new weight is right; the deal uses the weight at the time it joined." },
  LATE_BILL_UNALLOCATED: { label: "A bill arrived after cutting and has no share per gem", fix: "Allocate the bill to the cut gems." },
  NEGATIVE_COST_LINE: { label: "A cost line is negative", fix: "Check the bill for a sign error." },
  POSSIBLE_PARTNER_PAYOUT_BILL: { label: "A bill looks like a partner commission or payout", fix: "Payouts belong on the Money tab, not on stone bills. Remove the bill if it is one." },
  FEE_EXCEEDS_REVENUE: { label: "The fixed fee is more than the revenue of the stone", fix: "Check the fee against the sale price." },
  COST_BASIS_DIVERGES_ACROSS_DEALS: { label: "Another partner deal charges a different cost for the same stone", fix: "Align the allocated costs between the deals." },
  CANCELLED_WITH_PAYMENTS: { label: "A cancelled sale had payments", fix: "Nothing to fix; closing the deal asks for a typed confirmation." },
  OVERPAID: { label: "A buyer has paid more than the sale total", fix: "Nothing to fix; only the sale total counts." },
  FUTURE_SALE: { label: "A sale is dated in the future", fix: "It counts once its date arrives." },
  PRE_DEAL_SALE_IGNORED: { label: "An earlier sale is ignored (count-from date)", fix: "Nothing to fix." },
  OVERHEAD_EXCLUDED: { label: "Overhead costs are left out", fix: "Nothing to fix; change the cost types table below to include them." },
  ROUGH_UNCUT: { label: "A rough has not been cut yet", fix: "Nothing to fix; it counts as one lot until it is cut." },
  CONVERTED_NO_OUTPUT: { label: "A rough was converted but has no output gems", fix: "Check the cutting record." },
  LATE_ROUGH_BILL_ALLOCATED: { label: "A late bill on a rough was shared across its gems", fix: "Nothing to fix." },
  ACQUISITION_OVERRIDDEN: { label: "An allocated acquisition cost replaces the stone's own price", fix: "Nothing to fix." },
  APPROX_RATES: { label: "The estimate uses approximate exchange rates", fix: "Add a manual rate to fix the figure." },
  OBLIGATIONS_EXCEED_PROFIT: { label: "Amounts owed across partner deals exceed the company's profit", fix: "Expected with per-stone deals that floor losses; check it is intended." },
  TOTAL_WEIGHT_ZERO: { label: "The stones have no weight", fix: "Weights fall back to equal shares. Add the stone weights if that is wrong." },
};

export type StoneKind = "ROUGH" | "GEM";
export interface StoneRef { kind: StoneKind; id: string }

/** One row of the stone picker; only what the picker needs, never prices. */
export interface StoneSearchRow {
  kind: StoneKind;
  id: string;
  code: string;
  gemType: string;
  variety: string | null;
  weightCt: number;
  status: string;
  parcel: { id: string; code: string } | null;
  /** Gems cut from a rough; null for a gem. */
  derivedGems: number | null;
  /** Rough a gem was cut from; null for a rough or a directly acquired gem. */
  parentRoughCode: string | null;
  hasLiveOrder: boolean;
  /** Why the stone cannot be added to this deal (already in it, or covered through its rough or its gems); null when it can. */
  inDealNote: string | null;
  otherDeals: { code: string; partnerName: string; status: string }[];
}

export interface DealTermsInput {
  method: PayoutMethod;
  scope: PartnerScope;
  earnOn: EarnOn;
  currency: string;
  ratePct: string | null;
  fixedFee: string | null;
  invested: string | null;
  capitalProtected: boolean;
}

export interface DealInput extends DealTermsInput {
  partnerId: string;
  title: string;
  partnerTitle: string | null;
  excludedCostTypes: string[];
  /** Manual rates: LKR per 1 unit of the currency. */
  rates: Record<string, string>;
  /** Raw switches as the admin set them; the forced rules apply when the partner page is built. */
  visibility: PartnerVisibility;
  partnerNote: string | null;
  internalNotes: string | null;
}

export type SaleDecision = { mode: "IGNORE_EARLIER"; from: string } | { mode: "INCLUDE_EARLIER" };

export interface AllocationRow {
  dealStoneId: string;
  code: string;
  amountMinor: number;
  currency: string | null;
}

export type AllocationSpecInput =
  | { source: "POOL_LUMP"; basis: "WEIGHT" | "EQUAL"; amountMinor: number; currency: string }
  | { source: "PARCEL_TOTAL" }
  | { source: "MANUAL"; currency: string; manual: { dealStoneId: string; amountMinor: number }[] };

export interface CloseRequirements {
  balanceMinor: number;
  currency: string;
  needsTypedConfirm: boolean;
  needsBalanceNote: boolean;
  needsCapitalNote: boolean;
  capitalOutstandingMinor: number | null;
  cancelledWithPayments: boolean;
  estimateFailed: boolean;
}

export const parseStoneRef = (raw: string | undefined): StoneRef | null => {
  if (!raw) return null;
  const m = /^(rough|gem):([A-Za-z0-9]{10,40})$/.exec(raw);
  return m ? { kind: m[1] === "rough" ? "ROUGH" : "GEM", id: m[2] } : null;
};
export const stoneRefParam = (r: StoneRef): string => `${r.kind === "ROUGH" ? "rough" : "gem"}:${r.id}`;
