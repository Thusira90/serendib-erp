import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/rbac";
import { inventoryOverview, profitabilityOverview, salesOverview, cuttingOverview } from "@/lib/reports";
import { pnlForLast12Months } from "@/lib/pnl";
import { toCsv } from "@/lib/csv";

export async function GET(req: Request) {
  await requireCapability("report:read");
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") ?? "inventory";

  let rows: Array<Record<string, unknown>> = [];
  let filename = "report.csv";

  if (kind === "inventory") {
    const data = await inventoryOverview();
    rows = data.gems.map((g) => ({
      gemstoneCode: g.code, type: g.gemType, variety: g.variety ?? "",
      origin: g.origin ?? "", status: g.status,
      weightCt: Number(g.weightCt), totalCost: Number(g.totalCost),
      askingPrice: g.askingPrice != null ? Number(g.askingPrice) : "",
      createdAt: g.createdAt.toISOString(),
    }));
    filename = "inventory-finished.csv";
  } else if (kind === "sales") {
    const data = await salesOverview();
    rows = data.orders.map((o) => ({
      salesOrderCode: o.code, invoiceNumber: o.invoiceNumber,
      customer: o.customer.displayName, country: o.customer.country ?? "",
      gemstoneCode: o.gemstone.code, gemType: o.gemstone.gemType, variety: o.gemstone.variety ?? "",
      agreedPrice: Number(o.agreedPrice), tax: Number(o.taxAmount), total: Number(o.totalAmount),
      currency: o.currency, saleDate: o.saleDate.toISOString().slice(0, 10),
      status: o.status,
    }));
    filename = "sales.csv";
  } else if (kind === "profitability") {
    const data = await profitabilityOverview();
    rows = data.perStone.map((r) => ({
      salesOrderCode: r.salesOrderCode,
      gemstoneCode: r.gemstoneCode, type: r.gemType, variety: r.variety ?? "",
      customer: r.customer, weightCt: r.weightCt,
      revenue: r.revenue, cost: r.cost, profit: r.profit,
      marginPct: (r.margin * 100).toFixed(2),
      roiPct: (r.roi * 100).toFixed(2),
      currency: r.currency,
    }));
    filename = "profitability.csv";
  } else if (kind === "cutting") {
    const data = await cuttingOverview();
    rows = data.jobs.map((j) => ({
      jobCode: j.code, rough: j.roughStone.code,
      cutter: j.cutter?.name ?? "—", status: j.status,
      plannedCut: j.plannedCut ?? "", actualCut: j.actualCut ?? "",
      cuttingCost: Number(j.cuttingCost), laborCost: Number(j.laborCost), machineCost: Number(j.machineCost),
      expectedYieldPct: j.expectedYieldPct != null ? Number(j.expectedYieldPct) : "",
      actualYieldPct: j.actualYieldPct != null ? Number(j.actualYieldPct) : "",
      startedAt: j.startedAt?.toISOString().slice(0, 10) ?? "",
      completedAt: j.completedAt?.toISOString().slice(0, 10) ?? "",
    }));
    filename = "cutting-jobs.csv";
  } else if (kind === "pnl") {
    const data = await pnlForLast12Months();
    rows = data.months.map((m) => ({
      month: m.month,
      revenue: m.revenue,
      cogs: m.cogs,
      grossProfit: m.grossProfit,
      opex: m.opex,
      netIncome: m.netIncome,
    }));
    filename = "pnl-monthly.csv";
  } else {
    return NextResponse.json({ error: "Unknown report kind." }, { status: 400 });
  }

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
