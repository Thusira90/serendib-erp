import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { subMonths, startOfMonth, endOfMonth, format, differenceInCalendarDays, formatDistanceToNow } from "date-fns";
import {
  Diamond, Gem, Scissors, TrendingUp, Coins, AlertTriangle,
  Lock, FileText, Mail, Plane, Crown,
} from "lucide-react";
import { dashboardAlerts } from "@/lib/reports";
import { sweepExpiredReservations } from "@/lib/sweeper";
import { ColumnChart } from "@/components/charts/column-chart";
import { compactCurrency } from "@/components/charts/bar-chart";
import { DeleteActivityButton } from "@/components/delete-activity-button";
import { getExchangeRates, round2, toBase } from "@/lib/money";
import { netPaidInOrderCurrency, toBaseStored } from "@/lib/sales-ledger";

// Cache the dashboard for 30 s. Mutations that actually change a KPI
// (sales, payments, reservations, cutting-job completion, new rough /
// gem, capital contributions) call revalidatePath("/") so the user sees
// their own write instantly; everyone else gets a snappy edge hit until
// the next revalidation window.
export const revalidate = 30;

export default async function DashboardPage() {
  const session = await requireCapability("dashboard:read");
  const isSuperAdmin = session.user.role === "SUPER_ADMIN";
  await sweepExpiredReservations();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const yearStart = new Date(now.getUTCFullYear(), 0, 1);

  // Two groupBys replace five count/aggregate round-trips to Singapore:
  //   one for RoughStone (total + weight + spend + IN_CUTTING count), and
  //   one for Gemstone (total + weight + cost + ask + AVAILABLE count).
  // Grouped by currency as well so each group can be converted to LKR before
  // summing (raw sums across currencies are meaningless).
  const [
    roughByStatus, gemByStatus,
    recentGems,
    salesThisMonth, salesThisYear, openOrders,
    lastAudit, alerts,
    lastSale, lastEnquiry,
    activeDirectorCount, allContributions,
    rates,
  ] = await Promise.all([
    prisma.roughStone.groupBy({
      by: ["status", "currency"],
      _count: { _all: true },
      _sum: { weightCt: true, purchasePrice: true },
    }),
    prisma.gemstone.groupBy({
      by: ["status", "currency"],
      _count: { _all: true },
      _sum: { weightCt: true, totalCost: true, askingPrice: true },
    }),
    prisma.gemstone.findMany({ take: 6, orderBy: { createdAt: "desc" } }),
    prisma.salesOrder.findMany({ where: { saleDate: { gte: monthStart, lte: monthEnd }, status: { not: "CANCELLED" } } }),
    prisma.salesOrder.findMany({ where: { saleDate: { gte: yearStart }, status: { not: "CANCELLED" } }, include: { gemstone: true, payments: { select: { amount: true, currency: true, orderCurrencyAmount: true } } } }),
    // Outstanding covers every live invoice with a balance, whatever year it was issued.
    prisma.salesOrder.findMany({
      where: { status: { notIn: ["CANCELLED", "PAID"] } },
      select: { totalAmount: true, currency: true, fxRateLkr: true, payments: { select: { amount: true, currency: true, orderCurrencyAmount: true } } },
    }),
    prisma.auditLog.findMany({ take: 8, orderBy: { at: "desc" } }),
    dashboardAlerts(),
    prisma.salesOrder.findFirst({ orderBy: { saleDate: "desc" }, select: { saleDate: true } }),
    prisma.enquiry.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.director.count({ where: { active: true } }),
    // Reversed originals stay in: the reversal row is negative, so both are needed to net to zero.
    prisma.capitalTransaction.findMany({
      where: { status: { in: ["POSTED", "REVERSED"] } },
      select: { amount: true, currency: true, type: true },
    }),
    getExchangeRates(),
  ]);
  const lkr = (n: unknown, ccy: string) => toBase(rates, Number(n ?? 0), ccy);

  const roughCount = roughByStatus.reduce((n, r) => n + r._count._all, 0);
  const inCutting  = roughByStatus.filter((r) => r.status === "IN_CUTTING").reduce((n, r) => n + r._count._all, 0);
  const roughAgg = {
    _sum: {
      weightCt:      roughByStatus.reduce((s, r) => s + Number(r._sum.weightCt ?? 0), 0),
      purchasePrice: roughByStatus.reduce((s, r) => s + lkr(r._sum.purchasePrice, r.currency), 0),
    },
  };

  const gemCount      = gemByStatus.reduce((n, g) => n + g._count._all, 0);
  const availableGems = gemByStatus.filter((g) => g.status === "AVAILABLE").reduce((n, g) => n + g._count._all, 0);
  const gemAgg = {
    _sum: {
      weightCt:    gemByStatus.reduce((s, g) => s + Number(g._sum.weightCt ?? 0), 0),
      totalCost:   gemByStatus.reduce((s, g) => s + lkr(g._sum.totalCost, g.currency), 0),
      askingPrice: gemByStatus.reduce((s, g) => s + lkr(g._sum.askingPrice, g.currency), 0),
    },
  };

  // Capital in the base currency only — mixed-currency rollups need live
  // rates that aren't fetched server-side. The /capital ledger shows the
  // per-currency breakdown for everything else.
  //
  // We treat "capital raised" as SHARE_CAPITAL + net director loans/advances +
  // expenses paid on behalf, minus withdrawals — the same signed sum used in
  // the "Outstanding balance" column on the ledger.
  const balanceSign: Record<string, 1 | 0 | -1> = {
    SHARE_CAPITAL: 1, DIRECTOR_LOAN: 1, LOAN_REPAY: -1,
    ADVANCE: 1, ADVANCE_REPAY: -1, EXPENSE_PAID_ON_BEHALF: 1,
    WITHDRAWAL: -1, DIVIDEND: -1,
  };
  const capitalInBase = allContributions
    .filter((c) => c.currency === "LKR")
    .reduce((s, c) => s + Number(c.amount) * (balanceSign[c.type] ?? 0), 0);
  const otherCurrencyContribs = allContributions.filter((c) => c.currency !== "LKR").length;

  // Sales convert at the rate stored on the sale. Revenue excludes tax (agreedPrice); what customers
  // still owe is total minus net paid (refunds are negative), both in the order's own currency.
  const revenueOf = (o: { agreedPrice: unknown; currency: string; fxRateLkr: { toString(): string } | null }) =>
    toBaseStored(rates, Number(o.agreedPrice), o.currency, o.fxRateLkr);
  const revenueMonth = sum(salesThisMonth, revenueOf);
  const revenueYtd   = sum(salesThisYear,  revenueOf);
  const outstanding = sum(openOrders, (o) => {
    const owed = round2(Number(o.totalAmount) - netPaidInOrderCurrency(rates, o.payments, o.currency));
    return toBaseStored(rates, owed, o.currency, o.fxRateLkr);
  });

  const grossProfitYtd = sum(salesThisYear, (o) => revenueOf(o) - lkr(o.gemstone.totalCost, o.gemstone.currency));

  // 6-month revenue mini chart
  const monthly: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const s = startOfMonth(subMonths(now, i));
    const e = endOfMonth(s);
    const inWin = salesThisYear.filter((o) => o.saleDate >= s && o.saleDate <= e);
    monthly.push({ label: format(s, "MMM"), value: sum(inWin, revenueOf) });
  }

  const alertCount =
    alerts.expiringReservations.length +
    alerts.expiringQuotations.length +
    alerts.dueEnquiries.length +
    alerts.unshippedSales.length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground">A live pulse of the workshop and the vault.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[10px] text-muted-foreground text-right">
            <div className="uppercase tracking-wider">Refreshed</div>
            <div className="font-mono">{format(now, "HH:mm")} · {formatDistanceToNow(now, { addSuffix: true })}</div>
          </div>
          <Link href="/reports" className="text-xs border rounded-md px-3 py-1.5 hover:bg-secondary">
            View all reports →
          </Link>
        </div>
      </div>

      {/* When no sales or payments have been recorded yet, tiles show
          "No transactions yet" instead of "LKR 0.00" so the empty ledger
          isn't misread as a complete zero-revenue business picture. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          label="Revenue this month"
          value={salesThisMonth.length === 0 ? "—" : formatCurrency(revenueMonth)}
          subtitle={salesThisMonth.length === 0 ? "No sales this month yet" : undefined}
          icon={<Coins />} accent="purple"
        />
        <KpiTile
          label="Revenue YTD"
          value={salesThisYear.length === 0 ? "—" : formatCurrency(revenueYtd)}
          subtitle={salesThisYear.length === 0 ? "No sales recorded" : undefined}
          icon={<TrendingUp />} accent="teal"
        />
        <KpiTile
          label="Gross profit YTD"
          value={salesThisYear.length === 0 ? "—" : formatCurrency(grossProfitYtd)}
          subtitle={salesThisYear.length === 0 ? "Awaiting first sale" : undefined}
          icon={<Coins />} accent={grossProfitYtd >= 0 ? "purple" : "danger"}
        />
        <KpiTile
          label="Outstanding"
          value={openOrders.length === 0 && salesThisYear.length === 0 ? "—" : formatCurrency(outstanding)}
          subtitle={openOrders.length === 0 && salesThisYear.length === 0 ? "Nothing invoiced yet" : undefined}
          icon={<AlertTriangle />}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Rough stones"        value={String(roughCount)} icon={<Diamond />} href="/rough" />
        <KpiTile label="Cut & polished stones"  value={String(gemCount)}   icon={<Gem />} href="/gemstones" />
        <KpiTile label="Available to sell"   value={String(availableGems)} icon={<TrendingUp />} href="/gemstones" />
        <KpiTile label="In cutting"          value={String(inCutting)}     icon={<Scissors />} href="/cutting" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiTile
          label="Capital raised (LKR)"
          value={formatCurrency(capitalInBase)}
          icon={<Crown />}
          accent="purple"
          href="/capital"
        />
        <KpiTile
          label="Active directors"
          value={
            otherCurrencyContribs > 0
              ? `${activeDirectorCount} · ${otherCurrencyContribs} non-LKR entries`
              : String(activeDirectorCount)
          }
          icon={<Crown />}
          href="/directors"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CadenceTile label="Since last sale"    date={lastSale?.saleDate ?? null}       hrefIfEmpty="/sales" />
        <CadenceTile label="Since last enquiry" date={lastEnquiry?.createdAt ?? null}   hrefIfEmpty="/enquiries" />
        <CadenceTile label="Available stock"    subtitle={`${availableGems} finished stones ready to sell`} accent />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Revenue — last 6 months</CardTitle>
            <Link href="/reports/sales" className="text-xs text-sgs-teal-600 hover:underline">Full sales report →</Link>
          </CardHeader>
          <CardContent>
            <ColumnChart data={monthly} formatValue={compactCurrency("LKR")} />
            <div className="mt-4 grid grid-cols-[1fr_1fr_1.7fr] gap-4 text-sm">
              <Metric label="Rough weight"       value={formatCarat(Number(roughAgg._sum.weightCt ?? 0))} />
              <Metric label="Finished weight"    value={formatCarat(Number(gemAgg._sum.weightCt ?? 0))} />
              <Metric label="Asking value"       value={formatCurrency(Number(gemAgg._sum.askingPrice ?? 0))} accent />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>This week</CardTitle>
            <Badge variant={alertCount > 0 ? "warning" : "muted"}>{alertCount}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <AlertGroup icon={<Lock className="h-3.5 w-3.5" />} title="Reservations expiring" empty="Nothing expiring soon.">
              {alerts.expiringReservations.map((r) => (
                <AlertRow key={r.id}
                  href={`/gemstones/${r.gemstoneId}`}
                  primary={`${r.customer.displayName} · ${r.gemstone.code}`}
                  meta={r.expiresAt ? countdown(r.expiresAt) : "—"}
                />
              ))}
            </AlertGroup>
            <AlertGroup icon={<FileText className="h-3.5 w-3.5" />} title="Quotations expiring" empty="Nothing expiring soon.">
              {alerts.expiringQuotations.map((q) => (
                <AlertRow key={q.id}
                  href={`/quotations/${q.id}`}
                  primary={`${q.customer.displayName} · ${q.gemstone.code}`}
                  meta={q.validUntil ? countdown(q.validUntil) : "—"}
                />
              ))}
            </AlertGroup>
            <AlertGroup icon={<Mail className="h-3.5 w-3.5" />} title="Follow-ups due" empty="No follow-ups this week.">
              {alerts.dueEnquiries.map((e) => (
                <AlertRow key={e.id}
                  href={`/customers/${e.customerId}`}
                  primary={e.customer.displayName}
                  meta={e.followUpDate ? countdown(e.followUpDate) : "—"}
                />
              ))}
            </AlertGroup>
            <AlertGroup icon={<Plane className="h-3.5 w-3.5" />} title="Sold but unshipped" empty="Nothing waiting to ship.">
              {alerts.unshippedSales.map((s) => (
                <AlertRow key={s.id}
                  href={`/sales/${s.id}`}
                  primary={`${s.customer.displayName} · ${s.gemstone.code}`}
                  meta={formatDate(s.saleDate)}
                />
              ))}
            </AlertGroup>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {lastAudit.length === 0 && <div className="text-sm text-muted-foreground py-4">No activity yet.</div>}
            {lastAudit.map((a) => (
              <div key={a.id} className="py-2 flex items-center justify-between text-sm gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Badge variant="muted">{a.entity}</Badge>
                  <span className="text-muted-foreground">{a.action}</span>
                  {a.entityCode && <span className="font-mono text-xs">{a.entityCode}</span>}
                  {a.field && <span className="text-muted-foreground truncate">· {a.field}: {a.oldValue ?? "∅"} → {a.newValue ?? "∅"}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-xs text-muted-foreground">{formatDate(a.at)} · {a.userName ?? "system"}</div>
                  {isSuperAdmin && <DeleteActivityButton id={a.id} />}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent finished stones</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recentGems.length === 0 && <div className="text-sm text-muted-foreground">None yet.</div>}
            {recentGems.map((g) => (
              <Link key={g.id} href={`/gemstones/${g.id}`} className="flex items-center justify-between text-sm hover:text-sgs-teal-700">
                <div className="flex items-center gap-2">
                  <Gem className="h-3.5 w-3.5 text-sgs-purple-500" />
                  <span className="font-mono text-xs">{g.code}</span>
                  <span className="text-muted-foreground">{g.gemType}{g.variety ? ` · ${g.variety}` : ""}</span>
                </div>
                <span className="num">{formatCarat(Number(g.weightCt))}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function sum<T>(list: T[], get: (v: T) => number) {
  let s = 0; for (const v of list) s += get(v) || 0; return s;
}
function countdown(d: Date) {
  const days = differenceInCalendarDays(d, new Date());
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `${days}d`;
}

function CadenceTile({
  label, date, subtitle, hrefIfEmpty, accent = false,
}: {
  label: string;
  date?: Date | null;
  subtitle?: string;
  hrefIfEmpty?: string;
  accent?: boolean;
}) {
  const days = date ? Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const badge = days == null
    ? "muted" as const
    : days <= 7 ? "success" as const
    : days <= 30 ? "warning" as const
    : "danger" as const;
  const body = (
    <Card className="hover:shadow-luxe-lg transition-shadow">
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="font-serif text-xl num mt-0.5">
            {days == null
              ? "—"
              : days === 0 ? "today"
              : days === 1 ? "1 day"
              : `${days} days`}
          </div>
          {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
        {days != null && (
          <Badge variant={badge}>
            {days <= 7 ? "fresh" : days <= 30 ? "cooling" : "stale"}
          </Badge>
        )}
        {days == null && subtitle == null && hrefIfEmpty && (
          <Link href={hrefIfEmpty} className="text-xs text-sgs-teal-700 hover:underline">Set up →</Link>
        )}
        {accent && <Badge variant="teal">live</Badge>}
      </CardContent>
    </Card>
  );
  return body;
}

function KpiTile({
  label, value, subtitle, icon, accent = "default", href,
}: {
  label: string; value: string; subtitle?: string; icon: React.ReactNode;
  accent?: "default" | "teal" | "purple" | "danger";
  href?: string;
}) {
  const cls =
    accent === "purple" ? "bg-sgs-purple-500" :
    accent === "teal" ? "bg-sgs-teal-500" :
    accent === "danger" ? "bg-red-600" :
    "bg-sgs-gradient";
  const body = (
    <Card className="hover:shadow-luxe-lg transition-shadow">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`h-11 w-11 rounded-lg grid place-items-center text-white ${cls}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={`font-serif text-2xl num mt-0.5 ${value === "—" ? "text-muted-foreground/60" : ""}`}>{value}</div>
          {subtitle && <div className="text-[10px] text-muted-foreground italic mt-0.5">{subtitle}</div>}
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-serif text-xl num mt-0.5 ${accent ? "text-sgs-purple-600" : ""}`}>{value}</div>
    </div>
  );
}

function AlertGroup({
  icon, title, empty, children,
}: {
  icon: React.ReactNode; title: string; empty: string; children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const isEmpty = items.filter(Boolean).length === 0;
  return (
    <div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon} {title}
      </div>
      {isEmpty ? (
        <div className="text-xs text-muted-foreground pl-5">{empty}</div>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  );
}

function AlertRow({ href, primary, meta }: { href: string; primary: string; meta: string }) {
  return (
    <Link href={href} className="flex items-center justify-between text-sm hover:text-sgs-teal-700 pl-5">
      <span className="truncate">{primary}</span>
      <span className="text-xs text-muted-foreground shrink-0 ml-2">{meta}</span>
    </Link>
  );
}
