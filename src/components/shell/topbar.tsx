"use client";
import { Bell, LogOut, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signOutAction } from "@/app/(app)/actions";
import type { Role } from "@/lib/enums";

const roleLabels: Record<Role, string> = {
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

export function Topbar({
  user, unreadNotifications = 0,
}: {
  user: { name: string; email: string; role: Role };
  unreadNotifications?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  return (
    <header className="h-16 border-b bg-card sticky top-0 z-10">
      <div className="h-full max-w-[1600px] mx-auto px-6 flex items-center justify-between gap-6">
        <form
          className="flex-1 max-w-xl"
          onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search — IDs, customers, or NL like 'untreated Ceylon sapphires above 3ct under $20k'…"
              value={q} onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </form>
        <div className="flex items-center gap-3">
          <Link href="/inbox" title="Inbox" className="relative h-9 w-9 grid place-items-center rounded-md hover:bg-secondary">
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-sgs-purple-500 text-white text-[10px] font-medium grid place-items-center">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </Link>
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-[11px] text-muted-foreground">{roleLabels[user.role]}</div>
          </div>
          <div className="h-9 w-9 rounded-full bg-sgs-gradient text-white grid place-items-center font-medium text-sm">
            {user.name.split(" ").map(p => p[0]).slice(0, 2).join("")}
          </div>
          <form action={() => start(() => signOutAction())}>
            <Button variant="ghost" size="icon" title="Sign out" disabled={pending}>
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
