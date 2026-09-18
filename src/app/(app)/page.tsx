import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { subMonths, startOfMonth, endOfMonth, format, differenceInCalendarDays } from "date-fns";
import {
  Diamond, Gem, Scissors, TrendingUp, Coins, AlertTriangle,
  Lock, FileText, Mail, Plane, Crown,
} from "lucide-react";
import { dashboardAlerts } from "@/lib/reports";
import { sweepExpiredReservations } from "@/lib/sweeper";
import { ColumnChart } from "@/components/charts/column-chart";
import { compactCurrency } from "@/components/charts/bar-chart";

export default async function DashboardPage() {
  await requireCapability("dashboard:read");
  await sweepExpiredReservations();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const yearStart = new Date(now.getUTCFullYear(), 0, 1);

  const [
    roughCount, roughAgg, gemCount, gemAgg,
    availableGems, inCutting, recentGems,
    salesThisMonth, salesThisYear, allPayments,
    lastAudit, alerts,
    lastSale, lastEnquiry,
    activeDirectorCount, allContributions,
  ] = await Promise.all([
    prisma.roughStone.count(),
    prisma.roughStone.aggregate({ _sum: { weightCt: true, purchasePrice: true } }),
    prisma.gemstone.count(),
    prisma.gemstone.aggregate({ _sum: { weightCt: true, totalCost: true, askingPrice: true } }),
    prisma.gemstone.count({ where: { status: "AVAILABLE" } }),
    prisma.roughStone.count({ where: { status: "IN_CUTTING" } }),
    prisma.gemstone.findMany({ take: 6, orderBy: { createdAt: "desc" } }),
    prisma.salesOrder.findMany({ where: { saleDate: { gte: monthStart, lte: monthEnd } } }),
    prisma.salesOrder.findMany({ where: { saleDate: { gte: yearStart } }, include: { gemstone: true } }),
    prisma.payment.findMany({ where: { receivedAt: { gte: yearStart } } }),
    prisma.auditLog.findMany({ take: 8, orderBy: { at: "desc" } }),
    dashboardAlerts(),
    prisma.salesOrder.findFirst({ orderBy: { saleDate: "desc" }, select: { saleDate: true } }),
    prisma.enquiry.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.director.count({ where: { active: true } }),
    prisma.capitalContribution.findMany({ select: { amount: true, currency: true } }),
  ]);

  // Capital in the base currency only — mixed-currency rollups need live
  // rates that aren't fetched server-side. The /directors page shows the
  // per-currency breakdown for everything else.
  const capitalInBase = allContributions
    .filter((c) => c.currency === "LKR")
    .reduce((s, c) => s + Number(c.amount), 0);
  const otherCurrencyContribs = allContributions.filter((c) => c.currency !== "LKR").length;

  const revenueMonth = sum(salesThisMonth, (o) => Number(o.totalAmount));
  const revenueYtd   = sum(salesThisYear,  (o) => Number(o.totalAmount));
  const paidYtd      = sum(allPayments,    (p) => Number(p.amount));
  const outstandingYtd = revenueYtd - paidYtd;

  const grossProfitYtd = sum(salesThisYear, (o) => Number(o.agreedPrice) - Number(o.gemstone.totalCost));

  // 6-month revenue mini chart
  const monthly: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const s = startOfMonth(subMonths(now, i));
    const e = endOfMonth(s);
    const inWin = salesThisYear.filter((o) => o.saleDate >= s && o.saleDate <= e);
    monthly.push({ label: format(s, "MMM"), value: sum(inWin, (o) => Number(o.totalAmount)) });
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
        <Link href="/reports" className="text-xs border rounded-md px-3 py-1.5 hover:bg-secondary">
          View all reports →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Revenue this month"   value={formatCurrency(revenueMonth)} icon={<Coins />} accent="purple" />
        <KpiTile label="Revenue YTD"          value={formatCurrency(revenueYtd)}   icon={<TrendingUp />} accent="teal" />
        <KpiTile label="Gross profit YTD"     value={formatCurrency(grossProfitYtd)} icon={<Coins />} accent={grossProfitYtd >= 0 ? "purple" : "danger"} />
        <KpiTile label="Outstanding"          value={formatCurrency(outstandingYtd)} icon={<AlertTriangle />} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Rough stones"        value={String(roughCount)} icon={<Diamond />} href="/rough" />
        <KpiTile label="Finished gemstones"  value={String(gemCount)}   icon={<Gem />} href="/gemstones" />
        <KpiTile label="Available to sell"   value={String(availableGems)} icon={<TrendingUp />} href="/gemstones" />
        <KpiTile label="In cutting"          value={String(inCutting)}     icon={<Scissors />} href="/cutting" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiTile
          label="Directors' capital (LKR)"
          value={formatCurrency(capitalInBase)}
          icon={<Crown />}
          accent="purple"
          href="/directors"
        />
        <KpiTile
          label="Active directors"
          value={
            otherCurrencyContribs > 0
              ? `${activeDirectorCount} · ${otherCurrencyContribs} non-LKR contribs`
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
            <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
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
          <CardHeader><CardTitle>Latest activity</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {lastAudit.length === 0 && <div className="text-sm text-muted-foreground py-4">No activity yet.</div>}
            {lastAudit.map((a) => (
              <div key={a.id} className="py-2 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <Badge variant="muted">{a.entity}</Badge>
                  <span className="text-muted-foreground">{a.action}</span>
                  {a.entityCode && <span className="font-mono text-xs">{a.entityCode}</span>}
                  {a.field && <span className="text-muted-foreground">· {a.field}: {a.oldValue ?? "∅"} → {a.newValue ?? "∅"}</span>}
                </div>
                <div className="text-xs text-muted-foreground">{formatDate(a.at)} · {a.userName ?? "system"}</div>
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
  label, value, icon, accent = "default", href,
}: {
  label: string; value: string; icon: React.ReactNode;
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
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="font-serif text-2xl num mt-0.5">{value}</div>
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
