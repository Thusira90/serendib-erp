// Client-safe capability matrix mirror. Keep in sync with rbac.ts.
import type { Role } from "@/lib/enums";

export type Capability =
  | "rough:read"
  | "rough:write"
  | "gemstone:read"
  | "gemstone:write"
  | "cutting:read"
  | "cutting:write"
  | "cutting:plan"
  | "genealogy:read"
  | "location:read"
  | "location:write"
  | "audit:read"
  | "dashboard:read"
  | "supplier:read"
  | "supplier:write"
  | "financials:read"
  | "certificate:read"
  | "certificate:write"
  | "cgi:read"
  | "cgi:write"
  | "media:read"
  | "media:write"
  | "cost:write"
  | "price:write"
  | "customer:read"
  | "customer:write"
  | "enquiry:read"
  | "enquiry:write"
  | "quotation:read"
  | "quotation:write"
  | "reservation:read"
  | "reservation:write"
  | "sale:read"
  | "sale:write"
  | "payment:read"
  | "payment:write"
  | "shipment:read"
  | "shipment:write"
  | "report:read"
  | "expense:read"
  | "expense:write"
  | "settings:read"
  | "settings:write"
  | "user:manage"
  | "collection:read"
  | "collection:write"
  | "director:read"
  | "director:write"
  | "shareholder:read"
  | "shareholder:write"
  | "capital:read"
  | "capital:write"
  | "accounting:read"
  | "accounting:write"
  | "period:manage";

const ADMIN_BASE: Capability[] = [
  "rough:read","rough:write","gemstone:read","gemstone:write",
  "cutting:read","cutting:write","cutting:plan","genealogy:read",
  "location:read","location:write","audit:read","dashboard:read",
  "supplier:read","supplier:write","financials:read",
  "certificate:read","certificate:write","cgi:read","cgi:write",
  "media:read","media:write","cost:write","price:write",
  "customer:read","customer:write","enquiry:read","enquiry:write",
  "quotation:read","quotation:write","reservation:read","reservation:write",
  "sale:read","sale:write","payment:read","payment:write",
  "shipment:read","shipment:write","report:read",
  "expense:read","expense:write","settings:read","settings:write",
  "collection:read","collection:write",
  "director:read","director:write",
  "shareholder:read","shareholder:write",
  "capital:read","capital:write",
  "accounting:read","accounting:write","period:manage",
];

const matrix: Record<Role, Capability[]> = {
  SUPER_ADMIN: [...ADMIN_BASE, "user:manage"],
  ADMINISTRATOR: ADMIN_BASE,
  MANAGEMENT: [
    "rough:read","gemstone:read","cutting:read","genealogy:read",
    "location:read","audit:read","dashboard:read","supplier:read","financials:read",
    "certificate:read","cgi:read","media:read","price:write",
    "customer:read","enquiry:read","quotation:read","reservation:read",
    "sale:read","payment:read","shipment:read","report:read",
    "expense:read","settings:read","collection:read",
    "director:read","shareholder:read","capital:read",
    "accounting:read",
  ],
  GEM_BUYER: [
    "rough:read","rough:write","supplier:read","supplier:write",
    "genealogy:read","dashboard:read","media:read",
  ],
  GEMOLOGIST: [
    "rough:read","gemstone:read","gemstone:write",
    "genealogy:read","dashboard:read",
    "certificate:read","certificate:write","media:read","media:write",
  ],
  CUTTER: [
    "rough:read","cutting:read","cutting:write","cutting:plan","gemstone:write",
    "genealogy:read","dashboard:read","media:read","media:write",
  ],
  CGI_MEDIA: [
    "gemstone:read","dashboard:read","cgi:read","cgi:write","media:read","media:write",
  ],
  SALES: [
    "gemstone:read","genealogy:read","dashboard:read","certificate:read","cgi:read","media:read","price:write",
    "customer:read","customer:write","enquiry:read","enquiry:write",
    "quotation:read","quotation:write","reservation:read","reservation:write",
    "sale:read","sale:write","payment:read","shipment:read",
    "collection:read","collection:write",
  ],
  FINANCE: [
    "rough:read","gemstone:read","supplier:read","financials:read","dashboard:read","audit:read","cost:write",
    "customer:read","quotation:read","reservation:read","sale:read","sale:write",
    "payment:read","payment:write","shipment:read","report:read",
    "director:read","director:write",
    "shareholder:read","shareholder:write",
    "capital:read","capital:write",
    "accounting:read","accounting:write","period:manage",
  ],
  WAREHOUSE: [
    "rough:read","gemstone:read","location:read","location:write","dashboard:read",
    "shipment:read","shipment:write",
  ],
};

export type Principal = {
  role?: Role | null;
  grants?: string[] | null;
  denies?: string[] | null;
};

/** Client mirror of the permissions groups + presets used by the UI. */
export const PERMISSION_GROUPS: Array<{ label: string; caps: Capability[] }> = [
  { label: "Inventory",  caps: ["rough:read","rough:write","gemstone:read","gemstone:write","location:read","location:write","genealogy:read","supplier:read","supplier:write"] },
  { label: "Operations", caps: ["cutting:read","cutting:write","cutting:plan","certificate:read","certificate:write","cgi:read","cgi:write","media:read","media:write"] },
  { label: "Sales & CRM", caps: ["customer:read","customer:write","enquiry:read","enquiry:write","quotation:read","quotation:write","reservation:read","reservation:write","sale:read","sale:write","payment:read","payment:write","shipment:read","shipment:write","collection:read","collection:write"] },
  { label: "Finance & Accounting", caps: ["financials:read","expense:read","expense:write","cost:write","price:write","accounting:read","accounting:write","period:manage","director:read","director:write","shareholder:read","shareholder:write","capital:read","capital:write"] },
  { label: "Reports & Insights", caps: ["dashboard:read","report:read","audit:read"] },
  { label: "System", caps: ["settings:read","settings:write","user:manage"] },
];

export const PERMISSION_PRESETS: Array<{ label: string; description: string; caps: Capability[] }> = [
  {
    label: "Inventory viewer",
    description: "Read-only across all stones, locations, genealogy. Nothing else.",
    caps: ["rough:read","gemstone:read","location:read","genealogy:read","supplier:read","dashboard:read"],
  },
  {
    label: "Data entry",
    description: "Add and edit inventory + intake media, but no pricing, sales, or finance.",
    caps: ["rough:read","rough:write","gemstone:read","gemstone:write","location:read","location:write","genealogy:read","supplier:read","supplier:write","media:read","media:write","dashboard:read"],
  },
  {
    label: "Sales team",
    description: "CRM, quotations, reservations, sales — see stones, no cost or finance.",
    caps: ["gemstone:read","genealogy:read","dashboard:read","media:read","customer:read","customer:write","enquiry:read","enquiry:write","quotation:read","quotation:write","reservation:read","reservation:write","sale:read","sale:write","payment:read","shipment:read","collection:read","collection:write"],
  },
  {
    label: "Read only (all)",
    description: "See everything, edit nothing. Good for auditors or observers.",
    caps: ["rough:read","gemstone:read","cutting:read","genealogy:read","location:read","dashboard:read","supplier:read","financials:read","certificate:read","cgi:read","media:read","customer:read","enquiry:read","quotation:read","reservation:read","sale:read","payment:read","shipment:read","report:read","expense:read","settings:read","collection:read","director:read","shareholder:read","capital:read","accounting:read","audit:read"],
  },
];

export function can(who: Role | Principal | undefined | null, cap: Capability): boolean {
  if (!who) return false;
  const role = typeof who === "string" ? who : who.role;
  const grants = typeof who === "string" ? undefined : who.grants;
  const denies = typeof who === "string" ? undefined : who.denies;
  if (denies?.includes(cap)) return false;
  if (role && matrix[role]?.includes(cap)) return true;
  if (grants?.includes(cap)) return true;
  return false;
}
