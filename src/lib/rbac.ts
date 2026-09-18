import "server-only";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/enums";

export const roleLabels: Record<Role, string> = {
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
  | "director:write";

const matrix: Record<Role, Set<Capability>> = {
  ADMINISTRATOR: new Set<Capability>([
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
  ]),
  MANAGEMENT: new Set<Capability>([
    "rough:read","gemstone:read","cutting:read","genealogy:read",
    "location:read","audit:read","dashboard:read","supplier:read","financials:read",
    "certificate:read","cgi:read","media:read","price:write",
    "customer:read","enquiry:read","quotation:read","reservation:read",
    "sale:read","payment:read","shipment:read","report:read",
    "expense:read","settings:read","collection:read",
    "director:read",
  ]),
  GEM_BUYER: new Set<Capability>([
    "rough:read","rough:write","supplier:read","supplier:write",
    "genealogy:read","dashboard:read","media:read",
  ]),
  GEMOLOGIST: new Set<Capability>([
    "rough:read","gemstone:read","gemstone:write",
    "genealogy:read","dashboard:read",
    "certificate:read","certificate:write","media:read","media:write",
  ]),
  CUTTER: new Set<Capability>([
    "rough:read","cutting:read","cutting:write","cutting:plan","gemstone:write",
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
  ]),
  WAREHOUSE: new Set<Capability>([
    "rough:read","gemstone:read","location:read","location:write","dashboard:read",
    "shipment:read","shipment:write",
  ]),
};

export function can(role: Role | undefined | null, cap: Capability): boolean {
  if (!role) return false;
  return matrix[role].has(cap);
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireCapability(cap: Capability) {
  const session = await requireAuth();
  if (!can(session.user.role, cap)) {
    throw new Error(`Forbidden: missing capability ${cap}`);
  }
  return session;
}
