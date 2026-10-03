import "server-only";
import { prisma } from "@/lib/db";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";
import { getExchangeRates, round2, toBase } from "@/lib/money";
import { netPaidInOrderCurrency, toBaseStored } from "@/lib/sales-ledger";

// ─── Inventory reports ───────────────────────────────────────────────────────

export async function inventoryOverview() {
  const [roughRows, gemRows, rates] = await Promise.all([
    prisma.roughStone.findMany({
      select: { id: true, weightCt: true, purchasePrice: true, currency: true, status: true, gemType: true, origin: true, createdAt: true },
    }),
    prisma.gemstone.findMany({
      select: {
        id: true, code: true, weightCt: true, totalCost: true, askingPrice: true, currency: true,
        status: true, gemType: true, variety: true, origin: true, createdAt: true,
      },
    }),
    getExchangeRates(),
  ]);
  // Every money field is converted to LKR once, here, so the grouped and total
  // figures below never add amounts in different currencies.
  const roughAll = roughRows.map((r) => ({ ...r, purchasePrice: toBase(rates, Number(r.purchasePrice), r.currency) }));
  const gems = gemRows.map((g) => ({
    ...g,
    totalCost: toBase(rates, Number(g.totalCost), g.currency),
    askingPrice: g.askingPrice != null ? toBase(rates, Number(g.askingPrice), g.currency) : null,
  }));

  type Agg = { count: number; weight: number; value: number; asking: number };
  const group = <T,>(list: T[], key: (v: T) => string, parts: (v: T) => { weight: number; value: number; asking: number }) => {
    const map = new Map<string, Agg>();
    for (const v of list) {
      const k = key(v);
      const p = parts(v);
      const a = map.get(k) ?? { count: 0, weight: 0, value: 0, asking: 0 };
      a.count++; a.weight += p.weight; a.value += p.value; a.asking += p.asking;
      map.set(k, a);
    }
    return Array.from(map.entries());
  };
  const roughParts = (r: (typeof roughAll)[number]) => ({ weight: Number(r.weightCt), value: r.purchasePrice, asking: 0 });
  const gemParts = (g: (typeof gems)[number]) => ({ weight: Number(g.weightCt), value: g.totalCost, asking: g.askingPrice ?? 0 });
  const roughByType = group(roughAll, (r) => r.gemType, roughParts);
  const roughByOrigin = group(roughAll, (r) => r.origin ?? "Unknown", roughParts);
  const gemByType = group(gems, (g) => g.gemType, gemParts);
  const gemByOrigin = group(gems, (g) => g.origin ?? "Unknown", gemParts);
  const gemByStatus = group(gems, (g) => g.status, gemParts);

  const now = Date.now();
  const buckets = { "0-30": 0, "30-90": 0, "90-180": 0, "180+": 0 };
  for (const g of gems) {
    const age = (now - g.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (age <= 30) buckets["0-30"]++;
    else if (age <= 90) buckets["30-90"]++;
    else if (age <= 180) buckets["90-180"]++;
    else buckets["180+"]++;
  }

  return {
    totals: {
      roughCount: roughAll.length,
      roughWeight: sum(roughAll, (r) => Number(r.weightCt)),
      roughCost: sum(roughAll, (r) => r.purchasePrice),
      gemCount: gems.length,
      gemWeight: sum(gems, (g) => Number(g.weightCt)),
      gemTrueCost: sum(gems, (g) => g.totalCost),
      gemAskingTotal: sum(gems, (g) => g.askingPrice ?? 0),
    },
    roughByType: roughByType.map(([key, a]) => ({
      key, count: a.count, weight: a.weight, value: a.value,
    })).sort((a, b) => b.value - a.value),
    roughByOrigin: roughByOrigin.map(([key, a]) => ({
      key, count: a.count, weight: a.weight, value: a.value,
    })).sort((a, b) => b.value - a.value),
    gemByType: gemByType.map(([key, a]) => ({
      key, count: a.count, weight: a.weight, cost: a.value, asking: a.asking,
    })).sort((a, b) => b.asking - a.asking),
    gemByOrigin: gemByOrigin.map(([key, a]) => ({
      key, count: a.count, weight: a.weight, cost: a.value, asking: a.asking,
    })).sort((a, b) => b.asking - a.asking),
    gemByStatus: gemByStatus.map(([key, a]) => ({
      key, count: a.count, cost: a.value, asking: a.asking,
    })),
    aging: buckets,
    gems,
  };
}

// ─── Sales reports ───────────────────────────────────────────────────────────

export async function salesOverview() {
  const now = new Date();
  const start = startOfMonth(subMonths(now, 11));
  const [orders, payments, rates] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { saleDate: { gte: start }, status: { not: "CANCELLED" } },
      include: {
        customer: true, gemstone: true,
        payments: { select: { amount: true, currency: true, orderCurrencyAmount: true } },
      },
    }),
    // Refunds are negative rows, so this is net cash collected.
    prisma.payment.findMany({
      where: { receivedAt: { gte: start } },
      select: { amount: true, currency: true, fxRateLkr: true, receivedAt: true },
    }),
    getExchangeRates(),
  ]);
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  // Revenue is the agreed price (excl. tax) in LKR at the rate stored on the sale; what is still owed
  // is the tax-inclusive total minus net paid, both in the order currency, then converted.
  const revenueOf = (o: (typeof orders)[number]) => toBaseStored(rates, Number(o.agreedPrice), o.currency, o.fxRateLkr);
  const owedOf = (o: (typeof orders)[number]) =>
    toBaseStored(rates, round2(Number(o.totalAmount) - netPaidInOrderCurrency(rates, o.payments, o.currency)), o.currency, o.fxRateLkr);
  const paidOf = (p: (typeof payments)[number]) => toBaseStored(rates, Number(p.amount), p.currency, p.fxRateLkr);

  const byMonth: { month: string; revenue: number; count: number; paid: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const s = startOfMonth(subMonths(now, i));
    const e = endOfMonth(s);
    const mOrders = orders.filter((o) => o.saleDate >= s && o.saleDate <= e);
    const mPay = payments.filter((p) => p.receivedAt >= s && p.receivedAt <= e);
    byMonth.push({
      month: format(s, "MMM yy"),
      revenue: sum(mOrders, revenueOf),
      count: mOrders.length,
      paid: sum(mPay, paidOf),
    });
  }

  const byCountry = groupSum(orders, (o) => o.customer.country ?? "Unknown", revenueOf);
  const byCustomer = groupSum(orders, (o) => o.customer.displayName, revenueOf);
  const byGemType = groupSum(orders, (o) => o.gemstone.gemType, revenueOf);
  const bySalesperson = groupSum(
    orders.filter((o) => o.salespersonId),
    (o) => nameById.get(o.salespersonId!) ?? "—",
    revenueOf,
  );

  const totalRevenue = sum(orders, revenueOf);
  const totalPaid = sum(payments, paidOf);
  const outstanding = sum(orders, owedOf);
  const avgOrderValue = orders.length ? totalRevenue / orders.length : 0;

  return {
    totals: {
      orders: orders.length,
      revenue: totalRevenue,
      paid: totalPaid,
      outstanding,
      avgOrderValue,
    },
    byMonth,
    byCountry: byCountry.sort((a, b) => b.value - a.value).slice(0, 12),
    byCustomer: byCustomer.sort((a, b) => b.value - a.value).slice(0, 10),
    byGemType: byGemType.sort((a, b) => b.value - a.value),
    bySalesperson: bySalesperson.sort((a, b) => b.value - a.value),
    orders,
  };
}

// ─── Profitability report ────────────────────────────────────────────────────

export async function profitabilityOverview() {
  const [orders, allGems, rates] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { status: { not: "CANCELLED" } },
      include: { gemstone: true, customer: true },
    }),
    prisma.gemstone.findMany({
      select: {
        id: true, code: true, gemType: true, variety: true, weightCt: true,
        totalCost: true, askingPrice: true, currency: true,
      },
    }),
    getExchangeRates(),
  ]);

  // Cost and revenue can be in different currencies; both are compared in LKR.
  const perStone = orders.map((o) => {
    const cost = toBase(rates, Number(o.gemstone.totalCost), o.gemstone.currency);
    const revenue = toBaseStored(rates, Number(o.agreedPrice), o.currency, o.fxRateLkr);
    const profit = revenue - cost;
    const margin = revenue > 0 ? profit / revenue : 0;
    const roi = cost > 0 ? profit / cost : 0;
    return {
      salesOrderCode: o.code,
      gemstoneCode: o.gemstone.code,
      gemType: o.gemstone.gemType, variety: o.gemstone.variety,
      customer: o.customer.displayName,
      weightCt: Number(o.gemstone.weightCt),
      cost, revenue, profit, margin, roi,
      currency: "LKR",
    };
  }).sort((a, b) => b.profit - a.profit);

  const potential = allGems.map((g) => {
    const cost = toBase(rates, Number(g.totalCost), g.currency);
    const asking = g.askingPrice != null ? toBase(rates, Number(g.askingPrice), g.currency) : 0;
    return {
      code: g.code,
      label: `${g.gemType}${g.variety ? ` · ${g.variety}` : ""}`,
      cost,
      asking,
      projectedProfit: g.askingPrice != null ? asking - cost : 0,
      weightCt: Number(g.weightCt),
    };
  });

  const totalRealizedRevenue = sum(perStone, (r) => r.revenue);
  const totalRealizedCost = sum(perStone, (r) => r.cost);
  const totalRealizedProfit = totalRealizedRevenue - totalRealizedCost;
  const overallMargin = totalRealizedRevenue > 0 ? totalRealizedProfit / totalRealizedRevenue : 0;

  const byVariety = groupSum(
    perStone,
    (r) => r.gemType + (r.variety ? ` · ${r.variety}` : ""),
    (r) => r.profit,
  );

  return {
    totals: {
      realizedRevenue: totalRealizedRevenue,
      realizedCost: totalRealizedCost,
      realizedProfit: totalRealizedProfit,
      overallMargin,
    },
    perStone,
    byVariety: byVariety.sort((a, b) => b.value - a.value),
    potential: potential.sort((a, b) => b.projectedProfit - a.projectedProfit).slice(0, 20),
  };
}

// ─── Cutting report ──────────────────────────────────────────────────────────

export async function cuttingOverview() {
  const [jobs, transformations] = await Promise.all([
    prisma.cuttingJob.findMany({ include: { cutter: true, roughStone: true } }),
    prisma.gemstoneTransformation.findMany({
      include: { inputs: true, outputs: true, cuttingJob: { include: { cutter: true } } },
    }),
  ]);

  const perCutter = new Map<string, {
    name: string; jobs: number; completed: number;
    totalCost: number; inputWeight: number; outputWeight: number;
    avgDurationDays: number; _durationsSum: number; _durationsN: number;
  }>();

  for (const j of jobs) {
    const key = j.cutterId ?? "unassigned";
    const name = j.cutter?.name ?? "Unassigned";
    if (!perCutter.has(key)) perCutter.set(key, {
      name, jobs: 0, completed: 0, totalCost: 0, inputWeight: 0, outputWeight: 0,
      avgDurationDays: 0, _durationsSum: 0, _durationsN: 0,
    });
    const row = perCutter.get(key)!;
    row.jobs++;
    if (j.status === "COMPLETED") row.completed++;
    row.totalCost += Number(j.cuttingCost) + Number(j.laborCost) + Number(j.machineCost);
    if (j.startedAt && j.completedAt) {
      const days = (j.completedAt.getTime() - j.startedAt.getTime()) / (1000 * 60 * 60 * 24);
      row._durationsSum += days;
      row._durationsN += 1;
    }
  }

  for (const tx of transformations) {
    const cutterId = tx.cuttingJob?.cutterId ?? "unassigned";
    const name = tx.cuttingJob?.cutter?.name ?? "Unassigned";
    if (!perCutter.has(cutterId)) perCutter.set(cutterId, {
      name, jobs: 0, completed: 0, totalCost: 0, inputWeight: 0, outputWeight: 0,
      avgDurationDays: 0, _durationsSum: 0, _durationsN: 0,
    });
    const row = perCutter.get(cutterId)!;
    row.inputWeight += Number(tx.totalInputWeightCt);
    row.outputWeight += Number(tx.totalOutputWeightCt);
  }

  const cutters = Array.from(perCutter.values()).map((r) => ({
    ...r,
    yieldPct: r.inputWeight > 0 ? (r.outputWeight / r.inputWeight) : 0,
    avgDurationDays: r._durationsN > 0 ? r._durationsSum / r._durationsN : 0,
  })).sort((a, b) => b.completed - a.completed);

  const totalInput = sum(transformations, (t) => Number(t.totalInputWeightCt));
  const totalOutput = sum(transformations, (t) => Number(t.totalOutputWeightCt));
  const totalCuttingCost = sum(jobs, (j) => Number(j.cuttingCost) + Number(j.laborCost) + Number(j.machineCost));

  return {
    totals: {
      jobs: jobs.length,
      completed: jobs.filter((j) => j.status === "COMPLETED").length,
      totalCuttingCost,
      totalInputWeight: totalInput,
      totalOutputWeight: totalOutput,
      totalWaste: totalInput - totalOutput,
      overallYield: totalInput > 0 ? totalOutput / totalInput : 0,
    },
    cutters,
    jobs,
  };
}

// ─── Dashboard alerts ────────────────────────────────────────────────────────

export async function dashboardAlerts() {
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [expiringReservations, expiringQuotations, dueEnquiries, unshippedSales] = await Promise.all([
    prisma.reservation.findMany({
      where: { status: "ACTIVE", expiresAt: { not: null, lte: in7d } },
      include: { customer: true, gemstone: true },
      orderBy: { expiresAt: "asc" },
      take: 20,
    }),
    prisma.quotation.findMany({
      where: { status: { in: ["SENT", "DRAFT"] }, validUntil: { not: null, lte: in7d } },
      include: { customer: true, gemstone: true },
      orderBy: { validUntil: "asc" },
      take: 20,
    }),
    prisma.enquiry.findMany({
      where: {
        status: { in: ["NEW", "CONTACTED", "NEGOTIATING"] },
        followUpDate: { not: null, lte: in7d },
      },
      include: { customer: true },
      orderBy: { followUpDate: "asc" },
      take: 20,
    }),
    prisma.salesOrder.findMany({
      where: {
        status: { in: ["INVOICED", "PARTIAL", "PAID"] },
        shipment: { is: null },
      },
      include: { customer: true, gemstone: true },
      orderBy: { saleDate: "asc" },
      take: 20,
    }),
  ]);

  return { expiringReservations, expiringQuotations, dueEnquiries, unshippedSales };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sum<T>(list: T[], get: (v: T) => number): number {
  let s = 0;
  for (const v of list) s += get(v) || 0;
  return s;
}

function groupSum<T>(list: T[], key: (v: T) => string, value: (v: T) => number) {
  const m = new Map<string, { key: string; value: number; count: number }>();
  for (const v of list) {
    const k = key(v);
    const cur = m.get(k) ?? { key: k, value: 0, count: 0 };
    cur.value += value(v);
    cur.count += 1;
    m.set(k, cur);
  }
  return Array.from(m.values());
}
