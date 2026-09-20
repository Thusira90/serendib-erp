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

const matrix: Record<Role, Capability[]> = {
  ADMINISTRATOR: [
    "rough:read","rough:write","gemstone:read","gemstone:write",
    "cutting:read","cutting:write","cutting:plan","genealogy:read",
    "location:read","location:write","audit:read","dashboard:read",
    "supplier:read","supplier:write","financials:read","user:manage",
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
  ],
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

export function can(role: Role, cap: Capability): boolean {
  return matrix[role].includes(cap);
}
