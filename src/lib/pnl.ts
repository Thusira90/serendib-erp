import "server-only";
import { prisma } from "@/lib/db";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";

/**
 * Simple accrual-style P&L: revenue from closed sales, direct COGS from the
 * gemstone's true-cost rollup at the time the sale closed, plus operating
 * expenses booked from the Expense register. Everything expressed in the base
 * currency (USD). Multi-currency reporting is out of scope for M8.
 */

type MonthRow = {
  month: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  netIncome: number;
};

export type PnlPeriod = {
  months: MonthRow[];
  totals: MonthRow;
  opexByCategory: { key: string; value: number }[];
  revenueByCountry: { key: string; value: number }[];
};

export async function pnlForLast12Months(): Promise<PnlPeriod> {
  const now = new Date();
  const windowStart = startOfMonth(subMonths(now, 11));

  const [orders, expenses] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { saleDate: { gte: windowStart } },
      include: { gemstone: true, customer: true },
    }),
    prisma.expense.findMany({ where: { incurredAt: { gte: windowStart } } }),
  ]);

  const months: MonthRow[] = [];
  for (let i = 11; i >= 0; i--) {
    const s = startOfMonth(subMonths(now, i));
    const e = endOfMonth(s);
    const mOrders = orders.filter((o) => o.saleDate >= s && o.saleDate <= e);
    const revenue = sum(mOrders, (o) => Number(o.agreedPrice));
    const cogs = sum(mOrders, (o) => Number(o.gemstone.totalCost));
    const opex = sum(
      expenses.filter((x) => x.incurredAt >= s && x.incurredAt <= e),
      (x) => Number(x.amount)
    );
    const grossProfit = revenue - cogs;
    const netIncome = grossProfit - opex;
    months.push({ month: format(s, "MMM yy"), revenue, cogs, grossProfit, opex, netIncome });
  }

  const totals: MonthRow = {
    month: "12-month total",
    revenue: sum(months, (m) => m.revenue),
    cogs: sum(months, (m) => m.cogs),
    grossProfit: sum(months, (m) => m.grossProfit),
    opex: sum(months, (m) => m.opex),
    netIncome: sum(months, (m) => m.netIncome),
  };

  const opexByCategoryMap = new Map<string, number>();
  for (const e of expenses) {
    opexByCategoryMap.set(e.category, (opexByCategoryMap.get(e.category) ?? 0) + Number(e.amount));
  }
  const opexByCategory = Array.from(opexByCategoryMap.entries())
    .map(([key, value]) => ({ key: key.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase()), value }))
    .sort((a, b) => b.value - a.value);

  const revByCountryMap = new Map<string, number>();
  for (const o of orders) {
    const k = o.customer.country ?? "Unknown";
    revByCountryMap.set(k, (revByCountryMap.get(k) ?? 0) + Number(o.agreedPrice));
  }
  const revenueByCountry = Array.from(revByCountryMap.entries())
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return { months, totals, opexByCategory, revenueByCountry };
}

function sum<T>(list: T[], get: (v: T) => number) {
  let s = 0; for (const v of list) s += get(v) || 0; return s;
}
