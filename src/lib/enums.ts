/**
 * SQLite doesn't support Prisma enums, so the schema stores these as `String`
 * columns. This file is the single source of truth for the allowed values
 * and gives us TS union types + const arrays for Zod.
 */

export const ROLES = [
  "ADMINISTRATOR", "MANAGEMENT", "GEM_BUYER", "GEMOLOGIST",
  "CUTTER", "CGI_MEDIA", "SALES", "FINANCE", "WAREHOUSE",
] as const;
export type Role = (typeof ROLES)[number];

export const ROUGH_STATUSES = [
  "PURCHASED","RECEIVED","INSPECTED","AVAILABLE","RESERVED",
  "IN_CUTTING","CUT","CONVERTED","SOLD","LOST",
] as const;
export type RoughStatus = (typeof ROUGH_STATUSES)[number];

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

export const NOTIFICATION_TYPES = [
  "SALE_CREATED","PAYMENT_RECORDED","RESERVATION_CREATED","RESERVATION_RELEASED",
  "RESERVATION_EXPIRING","QUOTATION_ACCEPTED","QUOTATION_EXPIRING","CERTIFICATE_ISSUED",
  "CGI_MASTER_SET","SHIPMENT_CREATED","SHIPMENT_DELIVERED","ENQUIRY_NEW",
  "CUTTING_COMPLETED","ALERT",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
