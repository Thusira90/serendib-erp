"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { SgsLogo } from "@/components/brand/logo";
import { can, type Capability } from "@/lib/rbac.client";
import {
  LayoutDashboard, Diamond, Gem, GitBranch, Scissors, Users,
  Warehouse, ScrollText, PackageOpen, Building2, Award, Sparkles,
  Users2, Mail, FileText, Lock, Receipt, Plane, BarChart3, Inbox, ReceiptText,
  Settings, LayoutGrid, Crown, Wallet,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  needs: Capability;
  group?: string;
};

const nav: NavItem[] = [
  { href: "/",              label: "Dashboard",         icon: LayoutDashboard, needs: "dashboard:read" },
  { href: "/inbox",         label: "Inbox",             icon: Inbox,           needs: "dashboard:read" },
  { href: "/rough",         label: "Rough Stones",      icon: Diamond,          needs: "rough:read", group: "Inventory" },
  { href: "/gemstones",     label: "Finished Gemstones",icon: Gem,              needs: "gemstone:read", group: "Inventory" },
  { href: "/genealogy",     label: "Genealogy",         icon: GitBranch,        needs: "genealogy:read", group: "Inventory" },
  { href: "/locations",     label: "Locations",         icon: Warehouse,        needs: "location:read", group: "Inventory" },
  { href: "/cutting",       label: "Cutting Jobs",      icon: Scissors,         needs: "cutting:read", group: "Operations" },
  { href: "/certificates",  label: "Certification",     icon: Award,            needs: "certificate:read", group: "Operations" },
  { href: "/cgi",           label: "CGI & Media",       icon: Sparkles,         needs: "cgi:read", group: "Operations" },
  { href: "/customers",     label: "Customers",         icon: Users2,           needs: "customer:read", group: "Sales" },
  { href: "/enquiries",     label: "Enquiries",         icon: Mail,             needs: "enquiry:read", group: "Sales" },
  { href: "/quotations",    label: "Quotations",        icon: FileText,         needs: "quotation:read", group: "Sales" },
  { href: "/reservations",  label: "Reservations",      icon: Lock,             needs: "reservation:read", group: "Sales" },
  { href: "/sales",         label: "Sales",             icon: Receipt,          needs: "sale:read", group: "Sales" },
  { href: "/shipments",     label: "Shipments",         icon: Plane,            needs: "shipment:read", group: "Sales" },
  { href: "/collections",   label: "Collections",       icon: LayoutGrid,       needs: "collection:read", group: "Sales" },
  { href: "/parcels",       label: "Parcels",           icon: PackageOpen,      needs: "rough:read", group: "Purchasing" },
  { href: "/suppliers",     label: "Suppliers",         icon: Building2,        needs: "supplier:read", group: "Purchasing" },
  { href: "/expenses",      label: "Expenses",          icon: ReceiptText,      needs: "expense:read", group: "Financials" },
  { href: "/directors",     label: "Directors",         icon: Crown,            needs: "director:read", group: "Financials" },
  { href: "/shareholders",  label: "Shareholders",      icon: Users2,           needs: "shareholder:read", group: "Financials" },
  { href: "/capital",       label: "Capital ledger",    icon: Wallet,           needs: "capital:read", group: "Financials" },
  { href: "/reports",       label: "Reports",           icon: BarChart3,        needs: "report:read", group: "Financials" },
  { href: "/audit-log",     label: "Audit Log",         icon: ScrollText,       needs: "audit:read", group: "Administration" },
  { href: "/users",         label: "Users",             icon: Users,            needs: "user:manage", group: "Administration" },
  { href: "/settings",      label: "Company settings",  icon: Settings,         needs: "settings:read", group: "Administration" },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = nav.filter((n) => can(role, n.needs));
  const grouped = new Map<string, NavItem[]>();
  for (const n of items) {
    const g = n.group ?? "";
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(n);
  }
  return (
    <aside className="w-64 shrink-0 border-r bg-card min-h-screen sticky top-0">
      <div className="p-5 border-b">
        <SgsLogo size={32} />
      </div>
      <nav className="p-3 space-y-4">
        {Array.from(grouped.entries()).map(([group, links]) => (
          <div key={group}>
            {group && (
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </div>
            )}
            <ul className="space-y-0.5">
              {links.map((n) => {
                const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
                const Icon = n.icon;
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-sgs-gradient-soft text-sgs-teal-700 font-medium"
                          : "text-foreground/80 hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <Icon className={cn("h-4 w-4", active ? "text-sgs-purple-500" : "text-muted-foreground")} />
                      <span>{n.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
