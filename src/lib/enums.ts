/**
 * SQLite doesn't support Prisma enums, so the schema stores these as `String`
 * columns. This file is the single source of truth for the allowed values
 * and gives us TS union types + const arrays for Zod.
 */

export const ROLES = [
  // SUPER_ADMIN is the owner tier — only role that can create/manage
  // other users and edit per-user permissions. Everything else is a
  // normal role that a super-admin assigns, and can further constrain
  // via per-user grants/denies.
  "SUPER_ADMIN",
  "ADMINISTRATOR", "MANAGEMENT", "GEM_BUYER", "GEMOLOGIST",
  "CUTTER", "CGI_MEDIA", "SALES", "FINANCE", "WAREHOUSE",
] as const;
export type Role = (typeof ROLES)[number];

export const ROUGH_STATUSES = [
  "PURCHASED","RECEIVED","INSPECTED","AVAILABLE","RESERVED",
  "IN_CUTTING","CUT","CONVERTED","SOLD","LOST",
] as const;
export type RoughStatus = (typeof ROUGH_STATUSES)[number];

/** Set only by the cutting flow; a manual edit may neither set nor clear them. */
export const ROUGH_SYSTEM_STATUSES = ["IN_CUTTING", "CONVERTED"] as const;

/** Set only by reserve / sell flows (release or cancel the sale to leave them). */
export const GEMSTONE_COMMERCE_STATUSES = ["RESERVED", "SOLD"] as const;

/** Status options a manual edit may offer: always the current value, never a system-owned one. */
export function manualStatusOptions<T extends string>(
  all: readonly T[],
  systemOwned: readonly string[],
  current: string,
): T[] {
  if (systemOwned.includes(current)) return all.filter((s) => s === current);
  return all.filter((s) => !systemOwned.includes(s));
}

export const GEMSTONE_STATUSES = [
  "IN_PROGRESS","AVAILABLE","RESERVED","SOLD","ARCHIVED","LOST",
] as const;
export type GemstoneStatus = (typeof GEMSTONE_STATUSES)[number];

export const CUTTING_JOB_STATUSES = [
  "PENDING","ASSIGNED","IN_PROGRESS","QUALITY_CHECK","COMPLETED","REJECTED","REWORK",
] as const;
export type CuttingJobStatus = (typeof CUTTING_JOB_STATUSES)[number];

export const TRANSFORMATION_TYPES = [
  "CUTTING","RE_CUT","SPLIT","REPAIR","OTHER",
] as const;
export type TransformationType = (typeof TRANSFORMATION_TYPES)[number];

export const CERTIFICATE_STATUSES = [
  "NOT_SUBMITTED","SUBMITTED","UNDER_EXAMINATION","ISSUED","REJECTED",
] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

export const CERTIFICATE_TYPES = [
  "IDENTIFICATION","ORIGIN","QUALITY","APPRAISAL","OTHER",
] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export const CGI_PROJECT_STATUSES = [
  "REQUESTED","IN_PROGRESS","INTERNAL_REVIEW","REVISION","APPROVED","ARCHIVED",
] as const;
export type CGIProjectStatus = (typeof CGI_PROJECT_STATUSES)[number];

export const ASSET_KINDS = [
  "ROUGH_PHOTO","FINISHED_PHOTO","MACRO_PHOTO","INSPECTION_PHOTO","VIDEO",
  "CERTIFICATE_IMAGE","CATALOGUE_IMAGE","SOCIAL_ASSET","OTHER",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

// Lifecycle stage the media documents. Orthogonal to `kind` (which is
// media-type-ish). Used to build the chronological "day one to the last
// day" journey view for a stone.
export const MEDIA_STAGES = [
  "ROUGH_INTAKE",
  "PLANNING",
  "PRE_CUT",
  "CUTTING",
  "POLISHING",
  "FINAL",
  "INSPECTION",
  "CERTIFICATION",
  "PACKAGING",
  "OTHER",
] as const;
export type MediaStage = (typeof MEDIA_STAGES)[number];

export const MEDIA_STAGE_LABEL: Record<MediaStage, string> = {
  ROUGH_INTAKE: "Rough intake",
  PLANNING:     "Planning & marking",
  PRE_CUT:      "Pre-cut",
  CUTTING:      "Cutting",
  POLISHING:    "Polishing",
  FINAL:        "Finished stone",
  INSPECTION:   "Inspection",
  CERTIFICATION:"Certification",
  PACKAGING:    "Packaging",
  OTHER:        "Other",
};

// Default stage suggestion when uploading from a given surface.
export const MEDIA_STAGE_DEFAULT_FOR = {
  rough:   "ROUGH_INTAKE" as MediaStage,
  cutting: "CUTTING"      as MediaStage,
  gem:     "FINAL"        as MediaStage,
};

export const INVENTORY_ITEM_KINDS = ["ROUGH","GEMSTONE"] as const;
export type InventoryItemKind = (typeof INVENTORY_ITEM_KINDS)[number];

export const COST_TYPES = [
  "ROUGH_PURCHASE","CUTTING","LABOR","CERTIFICATION","PHOTOGRAPHY",
  "CGI","TRANSPORT","PACKAGING","SHIPPING","MARKETING","CUSTOMS","OTHER",
] as const;
export type CostType = (typeof COST_TYPES)[number];

export const CUSTOMER_KINDS = ["INDIVIDUAL","COMPANY"] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

export const CUSTOMER_TYPES = [
  "COLLECTOR","JEWELLER","JEWELLERY_BRAND","DEALER","RETAILER",
  "WHOLESALER","PRIVATE_BUYER","INTERNATIONAL_BUYER",
] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const ENQUIRY_STATUSES = [
  "NEW","CONTACTED","QUOTED","NEGOTIATING","RESERVED","WON","LOST",
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const QUOTATION_STATUSES = [
  "DRAFT","SENT","ACCEPTED","DECLINED","EXPIRED",
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const RESERVATION_STATUSES = [
  "ACTIVE","RELEASED","EXPIRED","CONVERTED",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const SALES_ORDER_STATUSES = [
  "DRAFT","CONFIRMED","INVOICED","PARTIAL","PAID",
  "SHIPPED","DELIVERED","CANCELLED",
] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export const PAYMENT_METHODS = [
  "BANK_TRANSFER","CARD","CASH","CRYPTO","CHEQUE","OTHER",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SHIPMENT_STATUSES = [
  "PREPARING","PACKED","SHIPPED","IN_TRANSIT","DELIVERED","RETURNED","CANCELLED",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  "RENT","UTILITIES","OFFICE","SUPPLIES","EQUIPMENT","SOFTWARE",
  "PROFESSIONAL_FEES","INSURANCE","MARKETING","TRAVEL",
  "SHIPPING","BANK_FEES","TAX","SALARIES","OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Categories that may be filed as a stone bill (and so capitalised into stone
 * cost). Overhead categories (rent, utilities, salaries, ...) stay general expenses.
 */
export const STONE_BILL_CATEGORIES = [
  "SUPPLIES","EQUIPMENT","PROFESSIONAL_FEES","INSURANCE",
  "MARKETING","TRAVEL","SHIPPING","OTHER",
] as const satisfies readonly ExpenseCategory[];
export type StoneBillCategory = (typeof STONE_BILL_CATEGORIES)[number];

export const EXPENSE_STATUSES = [
  "RECORDED","APPROVED","REIMBURSED","REJECTED",
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

/**
 * ISO-4217 currencies we surface in the currency picker.
 * LKR is the base for a Sri Lankan business — everything else shows a live
 * conversion hint next to the amount.
 */
export const CURRENCIES = [
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "AED", name: "UAE Dirham", symbol: "AED" },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
] as const;
export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

/** Base currency used for reporting rollups and live-rate hints. */
export const BASE_CURRENCY = "LKR";

export const DIRECTOR_ROLES = [
  "Chairman",
  "Managing Director",
  "Executive Director",
  "Non-Executive Director",
  "Director",
] as const;
export type DirectorRole = (typeof DIRECTOR_ROLES)[number];

export const SHAREHOLDER_KINDS = ["INDIVIDUAL", "ENTITY"] as const;
export type ShareholderKind = (typeof SHAREHOLDER_KINDS)[number];

/**
 * The ledger of every money movement between the company and its
 * directors/shareholders. Grouping in ledger rollups (spec §20):
 *   - Share capital column   = SHARE_CAPITAL
 *   - Director loan column   = DIRECTOR_LOAN - LOAN_REPAY
 *   - Advances column        = ADVANCE - ADVANCE_REPAY
 *   - Expenses paid          = EXPENSE_PAID_ON_BEHALF
 *   - Withdrawals column     = WITHDRAWAL
 *   - Dividends column       = DIVIDEND
 * Outstanding balance the company owes the director is:
 *   (loan - loan_repay) + (advance - advance_repay) + expenses_paid - withdrawals
 * SHARE_CAPITAL and DIVIDEND move on the equity side and don't affect that.
 */
export const CAPITAL_TXN_TYPES = [
  "SHARE_CAPITAL",
  "DIRECTOR_LOAN",
  "LOAN_REPAY",
  "ADVANCE",
  "ADVANCE_REPAY",
  "EXPENSE_PAID_ON_BEHALF",
  "WITHDRAWAL",
  "DIVIDEND",
] as const;
export type CapitalTxnType = (typeof CAPITAL_TXN_TYPES)[number];

/** Which party (director-side vs shareholder-side) each type applies to. */
export const CAPITAL_TXN_META: Record<CapitalTxnType, {
  label: string;
  party: "director" | "shareholder";
  /** Sign for the director-payable balance calc. 0 = does not touch balance. */
  balanceSign: -1 | 0 | 1;
  hint: string;
}> = {
  SHARE_CAPITAL:          { label: "Share capital paid in",  party: "shareholder", balanceSign:  0, hint: "Money received from a shareholder in exchange for shares. Pair this with a share issue." },
  DIRECTOR_LOAN:          { label: "Director loan received", party: "director",    balanceSign:  1, hint: "Money lent by a director to the company." },
  LOAN_REPAY:             { label: "Loan repayment paid",    party: "director",    balanceSign: -1, hint: "Company repaying part of a director loan." },
  ADVANCE:                { label: "Director advance",       party: "director",    balanceSign:  1, hint: "Temporary funds provided by a director." },
  ADVANCE_REPAY:          { label: "Advance repayment",      party: "director",    balanceSign: -1, hint: "Company returning a director advance." },
  EXPENSE_PAID_ON_BEHALF: { label: "Expense paid on behalf", party: "director",    balanceSign:  1, hint: "Director personally paid a company expense — company now owes the director." },
  WITHDRAWAL:             { label: "Director withdrawal",    party: "director",    balanceSign: -1, hint: "Director drew money from the company." },
  DIVIDEND:               { label: "Dividend paid",          party: "shareholder", balanceSign:  0, hint: "Distribution to a shareholder out of retained earnings." },
};

export const CAPITAL_TXN_STATUSES = ["DRAFT", "POSTED", "REVERSED"] as const;
export type CapitalTxnStatus = (typeof CAPITAL_TXN_STATUSES)[number];

export const SHARE_TXN_TYPES = ["SHARE_ISSUE", "SHARE_TRANSFER", "SHARE_CANCEL"] as const;
export type ShareTxnType = (typeof SHARE_TXN_TYPES)[number];

// ─── Chart of Accounts + Journal enums ──────────────────────────────────────

/**
 * The five accounting categories used across the CoA and reports.
 * COST_OF_SALES is split out from EXPENSE so the P&L can build gross
 * profit correctly (spec §10 puts CoS in the 5000 series, expenses in 6000).
 */
export const ACCOUNT_TYPES = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "COST_OF_SALES",
  "EXPENSE",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Normal debit/credit side for each type. Assets + expenses debit-positive; the rest credit-positive. */
export const ACCOUNT_TYPE_NORMAL: Record<AccountType, "debit" | "credit"> = {
  ASSET:         "debit",
  LIABILITY:     "credit",
  EQUITY:        "credit",
  REVENUE:       "credit",
  COST_OF_SALES: "debit",
  EXPENSE:       "debit",
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ASSET:         "Assets",
  LIABILITY:     "Liabilities",
  EQUITY:        "Equity",
  REVENUE:       "Revenue",
  COST_OF_SALES: "Cost of sales",
  EXPENSE:       "Expenses",
};

/**
 * System subtype tags. The app looks up accounts by these tags instead of
 * hard-coded codes so users can renumber the CoA without breaking auto-
 * posting. Non-system accounts have `subtype = null`.
 */
export const ACCOUNT_SUBTYPES = [
  "CASH",
  "BANK",
  "AR",
  "AP",
  "INVENTORY_ROUGH",
  "INVENTORY_GEMSTONE",
  "INVENTORY_PARCEL",
  "PREPAYMENTS",
  "FIXED_ASSETS",
  "ACC_DEPRECIATION",
  "DIRECTOR_LOAN",
  "OTHER_LOANS",
  "ACCRUED_EXPENSES",
  "TAXES_PAYABLE",
  "SHARE_CAPITAL",
  "SHARE_PREMIUM",
  "RETAINED_EARNINGS",
  "CURRENT_YEAR_PL",
  "REVENUE_SALES",
  "REVENUE_OTHER",
  "COS_GEMSTONE",
  "COS_CUTTING",
  "COS_CERTIFICATION",
  "COS_PACKAGING",
  "COS_DIRECT_SELLING",
  "EXP_SALARIES",
  "EXP_RENT",
  "EXP_UTILITIES",
  "EXP_MARKETING",
  "EXP_EXHIBITION",
  "EXP_TRANSPORT",
  "EXP_PROFESSIONAL",
  "EXP_BANK_CHARGES",
  "EXP_DEPRECIATION",
] as const;
export type AccountSubtype = (typeof ACCOUNT_SUBTYPES)[number];

export const PERIOD_STATUSES = ["OPEN", "CLOSED", "LOCKED"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export const JOURNAL_STATUSES = ["DRAFT", "POSTED", "REVERSED"] as const;
export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

export const JOURNAL_SOURCE_MODULES = [
  "MANUAL", "CAPITAL", "EXPENSE", "SALE", "PAYMENT", "PURCHASE",
] as const;
export type JournalSourceModule = (typeof JOURNAL_SOURCE_MODULES)[number];

export const NOTIFICATION_TYPES = [
  "SALE_CREATED","PAYMENT_RECORDED","RESERVATION_CREATED","RESERVATION_RELEASED",
  "RESERVATION_EXPIRING","QUOTATION_ACCEPTED","QUOTATION_EXPIRING","CERTIFICATE_ISSUED",
  "CGI_MASTER_SET","SHIPMENT_CREATED","SHIPMENT_DELIVERED","ENQUIRY_NEW",
  "CUTTING_COMPLETED","ALERT","PARTNER_ACTIVITY",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ─── Partner deals ──────────────────────────────────────────────────────────
// Stored as String columns. The CHECK constraints in scripts/add-partner-deals.ts
// freeze method, scope, earnOn, status and direction, so extend those with a migration.

export const PARTNER_KINDS = ["BROKER", "INVESTOR", "AGENT"] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

/** The four ways a partner is paid; each has its own pure function in partner-engine.ts. */
export const PAYOUT_METHODS = ["PROFIT_SHARE", "SALE_COMMISSION", "FIXED_FEE", "INVESTMENT"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PARTNER_SCOPES = ["PER_STONE", "POOLED"] as const;
export type PartnerScope = (typeof PARTNER_SCOPES)[number];

export const EARN_ON = ["SALE", "PAYMENT"] as const;
export type EarnOn = (typeof EARN_ON)[number];

export const DEAL_STATUSES = ["DRAFT", "ACTIVE", "CLOSED", "CANCELLED"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const ALLOCATION_BASES = ["WEIGHT", "EQUAL", "MANUAL"] as const;
export type AllocationBasis = (typeof ALLOCATION_BASES)[number];

/** Where a deal stone's acquisitionOverride came from. */
export const ACQUISITION_SOURCES = ["MANUAL", "POOL_LUMP", "PARCEL_TOTAL"] as const;
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

export const DEAL_VISIBILITY_PRESETS = ["FULL", "STANDARD", "MINIMAL", "CUSTOM"] as const;
export type DealVisibilityPreset = (typeof DEAL_VISIBILITY_PRESETS)[number];

export const ADJUSTMENT_REASONS = [
  "COST_CHANGE", "PRICE_CHANGE", "FX_CORRECTION", "SALE_CANCELLED", "NETTING", "STONE_REMOVED",
  "STONE_WRITTEN_OFF", "FORFEITED_DEPOSIT", "CORRECTION", "GOODWILL", "MANUAL",
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const PAYOUT_DIRECTIONS = ["PAID", "RECEIVED"] as const;
export type PayoutDirection = (typeof PAYOUT_DIRECTIONS)[number];

/** How money physically reached the partner (not the deal's payout method). */
export const PAYOUT_PAYMENT_METHODS = ["BANK_TRANSFER", "CASH", "CHEQUE", "OTHER"] as const;
export type PayoutPaymentMethod = (typeof PAYOUT_PAYMENT_METHODS)[number];

export const ACCESS_OUTCOMES = [
  "OK", "NOT_FOUND", "EXPIRED", "REVOKED", "INACTIVE", "LOCKED", "PASSWORD_REQUIRED", "BAD_PASSWORD",
  "UNLOCKED", "RATE_LIMITED", "DOC_OK", "DOC_DENIED", "RESALE_CREATED", "RESALE_DENIED", "RESALE_REVOKED", "RESALE_VIEW",
] as const;
export type AccessOutcome = (typeof ACCESS_OUTCOMES)[number];

/** Closed set of activity-feed event types; built from structured tables, never free text. */
export const PARTNER_EVENT_TYPES = [
  "ACQUIRED", "CUTTING_STARTED", "CUTTING_COMPLETED", "GEM_REGISTERED", "CERTIFICATE_SUBMITTED",
  "CERTIFICATE_ISSUED", "MEDIA_ADDED", "COST_RECORDED", "SOLD", "PAYMENT_RECEIVED",
  "SETTLEMENT_RECORDED", "ADJUSTMENT_RECORDED", "PAYOUT_MADE", "TERMS_AMENDED", "DEAL_STARTED", "DEAL_CLOSED",
] as const;
export type PartnerEventType = (typeof PARTNER_EVENT_TYPES)[number];

/** Every gather flag code. Severity (BLOCK, ACK, INFO) is decided where the flag is raised, not here. */
export const FLAG_CODES = [
  // BLOCK
  "DUPLICATE_UNIT", "OVERLAP_ROUGH_GEM", "MULTIPLE_LIVE_SALES", "APPROX_RATES_USED", "CO_PARTNER_CAP_EXCEEDED",
  "CO_PARTNER_TOTAL_EXCEEDS_REVENUE", "INVESTED_MISMATCH", "INVESTED_EXCEEDS_BASIS", "ALLOCATION_INCOMPLETE",
  "NEGATIVE_AMOUNT",
  // BLOCK for INVESTMENT, ACK otherwise
  "STONE_ALREADY_SOLD",
  // ACK
  "NEEDS_RATE_COST", "NEEDS_RATE_SALE", "NEEDS_RATE_PAYMENT", "COST_MISSING", "ZERO_PRICE_SALE",
  "ROUGH_SOLD_NO_PROCEEDS", "MULTIPLE_CUTS", "REJECTED_BILL_IN_CUT", "COST_DRIFT", "PURCHASE_DRIFT", "PARCEL_DRIFT",
  "STATUS_MISMATCH", "DEPOSIT_NOT_RECORDED", "UNKNOWN_COST_TYPE", "WEIGHT_CHANGED", "LATE_BILL_UNALLOCATED",
  "NEGATIVE_COST_LINE", "POSSIBLE_PARTNER_PAYOUT_BILL", "FEE_EXCEEDS_REVENUE", "COST_BASIS_DIVERGES_ACROSS_DEALS",
  // INFO
  "CANCELLED_WITH_PAYMENTS", "OVERPAID", "FUTURE_SALE", "PRE_DEAL_SALE_IGNORED", "OVERHEAD_EXCLUDED", "ROUGH_UNCUT",
  "CONVERTED_NO_OUTPUT", "LATE_ROUGH_BILL_ALLOCATED", "ACQUISITION_OVERRIDDEN", "APPROX_RATES",
  "OBLIGATIONS_EXCEED_PROFIT", "TOTAL_WEIGHT_ZERO",
] as const;
export type FlagCode = (typeof FLAG_CODES)[number];

/**
 * Currencies a deal ledger may use. The engine does all arithmetic in 2-decimal
 * minor units, so zero-decimal currencies (JPY, KRW, IDR) are left out.
 */
export const PARTNER_CURRENCIES = [
  "LKR", "USD", "EUR", "GBP", "CHF", "CNY", "HKD", "SGD", "AUD", "CAD", "NZD", "AED", "SAR", "INR", "THB", "MYR", "ZAR", "BRL",
] as const satisfies readonly CurrencyCode[];
export type PartnerCurrency = (typeof PARTNER_CURRENCIES)[number];

/**
 * CostAllocation.type holds a CostType, or an ExpenseCategory for a stone bill.
 * Partners see only these coarse labels, never the raw type or a description.
 * LAB is not a current type; the spec groups it with certification, so it is kept as an alias.
 */
export const PARTNER_COST_TYPE_LABELS: Record<CostType | ExpenseCategory | "LAB", string> = {
  ROUGH_PURCHASE: "Acquisition",
  CUTTING: "Cutting & polishing",
  TRANSPORT: "Transport & shipping",
  SHIPPING: "Transport & shipping",
  INSURANCE: "Insurance",
  CERTIFICATION: "Certification",
  LAB: "Certification",
  MARKETING: "Marketing",
  LABOR: "Other costs",
  PHOTOGRAPHY: "Other costs",
  CGI: "Other costs",
  PACKAGING: "Other costs",
  CUSTOMS: "Other costs",
  OTHER: "Other costs",
  RENT: "Other costs",
  UTILITIES: "Other costs",
  OFFICE: "Other costs",
  SUPPLIES: "Other costs",
  EQUIPMENT: "Other costs",
  SOFTWARE: "Other costs",
  PROFESSIONAL_FEES: "Other costs",
  TRAVEL: "Other costs",
  BANK_FEES: "Other costs",
  TAX: "Other costs",
  SALARIES: "Other costs",
};

export const PARTNER_COST_FALLBACK_LABEL = "Other costs";

/** Partner-safe label for any CostAllocation.type, including values not in the enums. */
export function partnerCostLabel(type: string): string {
  return Object.prototype.hasOwnProperty.call(PARTNER_COST_TYPE_LABELS, type)
    ? PARTNER_COST_TYPE_LABELS[type as keyof typeof PARTNER_COST_TYPE_LABELS]
    : PARTNER_COST_FALLBACK_LABEL;
}
