import "server-only";
import { prisma } from "@/lib/db";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";

// ─── Inventory reports ───────────────────────────────────────────────────────

export async function inventoryOverview() {
  const [
    roughAll, gems,
    roughByType, roughByOrigin,
    gemByType, gemByOrigin, gemByStatus,
  ] = await Promise.all([
    prisma.roughStone.findMany({
      select: { id: true, weightCt: true, purchasePrice: true, status: true, gemType: true, origin: true, createdAt: true },
    }),
    prisma.gemstone.findMany({
      select: {
        id: true, code: true, weightCt: true, totalCost: true, askingPrice: true,
        status: true, gemType: true, variety: true, origin: true, createdAt: true,
      },
    }),
    prisma.roughStone.groupBy({ by: ["gemType"], _sum: { weightCt: true, purchasePrice: true }, _count: { _all: true } }),
    prisma.roughStone.groupBy({ by: ["origin"], _sum: { weightCt: true, purchasePrice: true }, _count: { _all: true } }),
    prisma.gemstone.groupBy({ by: ["gemType"], _sum: { weightCt: true, totalCost: true, askingPrice: true }, _count: { _all: true } }),
    prisma.gemstone.groupBy({ by: ["origin"], _sum: { weightCt: true, totalCost: true, askingPrice: true }, _count: { _all: true } }),
    prisma.gemstone.groupBy({ by: ["status"], _sum: { totalCost: true, askingPrice: true }, _count: { _all: true } }),
  ]);

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
      roughCost: sum(roughAll, (r) => Number(r.purchasePrice)),
      gemCount: gems.length,
      gemWeight: sum(gems, (g) => Number(g.weightCt)),
      gemTrueCost: sum(gems, (g) => Number(g.totalCost)),
      gemAskingTotal: sum(gems, (g) => Number(g.askingPrice ?? 0)),
    },
    roughByType: roughByType.map((r) => ({
      key: r.gemType, count: r._count._all,
      weight: Number(r._sum.weightCt ?? 0), value: Number(r._sum.purchasePrice ?? 0),
    })).sort((a, b) => b.value - a.value),
    roughByOrigin: roughByOrigin.map((r) => ({
      key: r.origin ?? "Unknown", count: r._count._all,
      weight: Number(r._sum.weightCt ?? 0), value: Number(r._sum.purchasePrice ?? 0),
    })).sort((a, b) => b.value - a.value),
    gemByType: gemByType.map((g) => ({
      key: g.gemType, count: g._count._all,
      weight: Number(g._sum.weightCt ?? 0), cost: Number(g._sum.totalCost ?? 0), asking: Number(g._sum.askingPrice ?? 0),
    })).sort((a, b) => b.asking - a.asking),
    gemByOrigin: gemByOrigin.map((g) => ({
      key: g.origin ?? "Unknown", count: g._count._all,
      weight: Number(g._sum.weightCt ?? 0), cost: Number(g._sum.totalCost ?? 0), asking: Number(g._sum.askingPrice ?? 0),
    })).sort((a, b) => b.asking - a.asking),
    gemByStatus: gemByStatus.map((s) => ({
      key: s.status, count: s._count._all,
      cost: Number(s._sum.totalCost ?? 0), asking: Number(s._sum.askingPrice ?? 0),
    })),
    aging: buckets,
    gems,
  };
}

// ─── Sales reports ───────────────────────────────────────────────────────────

export async function salesOverview() {
  const now = new Date();
  const start = startOfMonth(subMonths(now, 11));
  const [orders, payments] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { saleDate: { gte: start } },
      include: { customer: true, gemstone: true },
    }),
    prisma.payment.findMany({
      where: { receivedAt: { gte: start } },
      select: { amount: true, currency: true, receivedAt: true },
    }),
  ]);
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const byMonth: { month: string; revenue: number; count: number; paid: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const s = startOfMonth(subMonths(now, i));
    const e = endOfMonth(s);
    const mOrders = orders.filter((o) => o.saleDate >= s && o.saleDate <= e);
    const mPay = payments.filter((p) => p.receivedAt >= s && p.receivedAt <= e);
    byMonth.push({
      month: format(s, "MMM yy"),
      revenue: sum(mOrders, (o) => Number(o.totalAmount)),
      count: mOrders.length,
      paid: sum(mPay, (p) => Number(p.amount)),
    });
  }

  const byCountry = groupSum(orders, (o) => o.customer.country ?? "Unknown", (o) => Number(o.totalAmount));
  const byCustomer = groupSum(orders, (o) => o.customer.displayName, (o) => Number(o.totalAmount));
  const byGemType = groupSum(orders, (o) => o.gemstone.gemType, (o) => Number(o.totalAmount));
  const bySalesperson = groupSum(
    orders.filter((o) => o.salespersonId),
    (o) => nameById.get(o.salespersonId!) ?? "—",
    (o) => Number(o.totalAmount),
  );

  const totalRevenue = sum(orders, (o) => Number(o.totalAmount));
  const totalPaid = sum(payments, (p) => Number(p.amount));
  const outstanding = totalRevenue - totalPaid;
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
  const [orders, allGems] = await Promise.all([
    prisma.salesOrder.findMany({
      include: { gemstone: true, customer: true },
    }),
    prisma.gemstone.findMany({
      select: {
        id: true, code: true, gemType: true, variety: true, weightCt: true,
        totalCost: true, askingPrice: true, currency: true,
      },
    }),
  ]);

  const perStone = orders.map((o) => {
    const cost = Number(o.gemstone.totalCost);
    const revenue = Number(o.agreedPrice);
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
      currency: o.currency,
    };
  }).sort((a, b) => b.profit - a.profit);

  const potential = allGems.map((g) => ({
    code: g.code,
    label: `${g.gemType}${g.variety ? ` · ${g.variety}` : ""}`,
    cost: Number(g.totalCost),
    asking: g.askingPrice != null ? Number(g.askingPrice) : 0,
    projectedProfit: g.askingPrice != null ? Number(g.askingPrice) - Number(g.totalCost) : 0,
    weightCt: Number(g.weightCt),
  }));

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
