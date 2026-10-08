import "server-only";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/enums";

export const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMINISTRATOR: "Administrator",
  MANAGEMENT: "Management",
  GEM_BUYER: "Gem Buyer",
  GEMOLOGIST: "Gemologist",
  CUTTER: "Cutter",
  CGI_MEDIA: "CGI / Media",
  SALES: "Sales",
  FINANCE: "Finance",
  WAREHOUSE: "Warehouse",
};

export type Capability =
  | "rough:read"
  | "rough:write"
  | "gemstone:read"
  | "gemstone:write"
  | "cutting:read"
  | "cutting:write"
  | "cutting:plan"
  | "treatment:read"
  | "treatment:write"
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
  | "period:manage"
  | "partner:read"
  | "partner:write"
  | "partner:settle";

const ADMIN_BASE: Capability[] = [
  "rough:read","rough:write","gemstone:read","gemstone:write",
  "cutting:read","cutting:write","cutting:plan","treatment:read","treatment:write","genealogy:read",
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
  "partner:read","partner:write","partner:settle",
];

const matrix: Record<Role, Set<Capability>> = {
  // The owner tier: everything an Administrator can do PLUS user:manage.
  // Only role allowed to create users and edit per-user permissions.
  SUPER_ADMIN: new Set<Capability>([...ADMIN_BASE, "user:manage"]),
  // Administrator: full app access but cannot manage other users. That
  // authority stays with SUPER_ADMIN so the owner keeps control.
  ADMINISTRATOR: new Set<Capability>(ADMIN_BASE),
  MANAGEMENT: new Set<Capability>([
    "rough:read","gemstone:read","cutting:read","treatment:read","genealogy:read",
    "location:read","audit:read","dashboard:read","supplier:read","financials:read",
    "certificate:read","cgi:read","media:read","price:write",
    "customer:read","enquiry:read","quotation:read","reservation:read",
    "sale:read","payment:read","shipment:read","report:read",
    "expense:read","settings:read","collection:read",
    "director:read","shareholder:read","capital:read",
    "accounting:read","partner:read",
  ]),
  GEM_BUYER: new Set<Capability>([
    "rough:read","rough:write","supplier:read","supplier:write",
    "genealogy:read","dashboard:read","media:read",
  ]),
  GEMOLOGIST: new Set<Capability>([
    "rough:read","gemstone:read","gemstone:write",
    "genealogy:read","dashboard:read",
    "certificate:read","certificate:write","media:read","media:write",
    "treatment:read","treatment:write",
  ]),
  CUTTER: new Set<Capability>([
    "rough:read","cutting:read","cutting:write","cutting:plan","gemstone:write",
    "treatment:read","treatment:write",
    "genealogy:read","dashboard:read","media:read","media:write",
  ]),
  CGI_MEDIA: new Set<Capability>([
    "gemstone:read","dashboard:read","cgi:read","cgi:write","media:read","media:write",
  ]),
  SALES: new Set<Capability>([
    "gemstone:read","genealogy:read","dashboard:read","certificate:read","cgi:read","media:read","price:write",
    "customer:read","customer:write","enquiry:read","enquiry:write",
    "quotation:read","quotation:write","reservation:read","reservation:write",
    "sale:read","sale:write","payment:read","shipment:read",
    "collection:read","collection:write",
  ]),
  FINANCE: new Set<Capability>([
    "rough:read","gemstone:read","supplier:read","financials:read","dashboard:read","audit:read","cost:write",
    "customer:read","quotation:read","reservation:read","sale:read","sale:write",
    "payment:read","payment:write","shipment:read","report:read",
    "expense:read","expense:write",
    "director:read","director:write",
    "shareholder:read","shareholder:write",
    "capital:read","capital:write",
    "accounting:read","accounting:write","period:manage",
    "partner:read","partner:settle",
  ]),
  WAREHOUSE: new Set<Capability>([
    "rough:read","gemstone:read","location:read","location:write","dashboard:read",
    "shipment:read","shipment:write",
  ]),
};

/** Anything with a role — plus optional per-user grant/deny overlays. */
export type Principal = {
  role?: Role | null;
  grants?: string[] | null;
  denies?: string[] | null;
};

function isRole(x: unknown): x is Role {
  return typeof x === "string";
}

/**
 * Capability check. Accepts either a bare role string (existing callers) OR
 * a full principal `{ role, grants, denies }` so per-user overrides work.
 *
 * Effective set = matrix[role] ∪ grants − denies.
 * A `deny` always beats a `grant` — safest failure mode.
 */
export function can(who: Role | Principal | undefined | null, cap: Capability): boolean {
  if (!who) return false;
  const role = isRole(who) ? who : who.role;
  const grants = isRole(who) ? undefined : who.grants;
  const denies = isRole(who) ? undefined : who.denies;

  if (denies && denies.includes(cap)) return false;
  if (role && matrix[role]?.has(cap)) return true;
  if (grants && grants.includes(cap)) return true;
  return false;
}

/** Human-readable groups for the per-user permissions UI. Order matters. */
export const PERMISSION_GROUPS: Array<{ label: string; caps: Capability[]; note?: string }> = [
  { label: "Inventory",  caps: ["rough:read","rough:write","gemstone:read","gemstone:write","location:read","location:write","genealogy:read","supplier:read","supplier:write"] },
  { label: "Operations", caps: ["cutting:read","cutting:write","cutting:plan","treatment:read","treatment:write","certificate:read","certificate:write","cgi:read","cgi:write","media:read","media:write"] },
  { label: "Sales & CRM", caps: ["customer:read","customer:write","enquiry:read","enquiry:write","quotation:read","quotation:write","reservation:read","reservation:write","sale:read","sale:write","payment:read","payment:write","shipment:read","shipment:write","collection:read","collection:write"] },
  { label: "Finance & Accounting", caps: ["financials:read","expense:read","expense:write","cost:write","price:write","accounting:read","accounting:write","period:manage","director:read","director:write","shareholder:read","shareholder:write","capital:read","capital:write"] },
  {
    label: "Partners",
    caps: ["partner:read","partner:write","partner:settle"],
    note: "partner:read shows deal costs, supplier names and bill receipts on the admin pages. partner:settle records settlements, adjustments and payouts.",
  },
  { label: "Reports & Insights", caps: ["dashboard:read","report:read","audit:read"] },
  { label: "System", caps: ["settings:read","settings:write","user:manage"] },
];

/** Pre-canned permission templates — one-click "make this user X" presets. */
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
    caps: (["rough:read","gemstone:read","cutting:read","treatment:read","genealogy:read","location:read","dashboard:read","supplier:read","financials:read","certificate:read","cgi:read","media:read","customer:read","enquiry:read","quotation:read","reservation:read","sale:read","payment:read","shipment:read","report:read","expense:read","settings:read","collection:read","director:read","shareholder:read","capital:read","accounting:read","audit:read","partner:read"] as Capability[]),
  },
];

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireCapability(cap: Capability) {
  const session = await requireAuth();
  if (!can(session.user, cap)) {
    throw new Error(`Forbidden: missing capability ${cap}`);
  }
  return session;
}
