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

export const NOTIFICATION_TYPES = [
  "SALE_CREATED","PAYMENT_RECORDED","RESERVATION_CREATED","RESERVATION_RELEASED",
  "RESERVATION_EXPIRING","QUOTATION_ACCEPTED","QUOTATION_EXPIRING","CERTIFICATE_ISSUED",
  "CGI_MASTER_SET","SHIPMENT_CREATED","SHIPMENT_DELIVERED","ENQUIRY_NEW",
  "CUTTING_COMPLETED","ALERT",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
