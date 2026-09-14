import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Coins, Package, Scissors, LineChart } from "lucide-react";

const reports = [
  { href: "/reports/pnl",           title: "Profit & Loss", description: "Rolling 12-month revenue less COGS less operating expenses.",   icon: LineChart },
  { href: "/reports/inventory",     title: "Inventory",     description: "Rough + finished inventory, by type, origin, status, and age.", icon: Package },
  { href: "/reports/sales",         title: "Sales",         description: "Revenue by month, by country, by customer, by gem type.",       icon: BarChart3 },
  { href: "/reports/profitability", title: "Profitability", description: "Realized profit per stone, margin by variety, ROI.",           icon: Coins },
  { href: "/reports/cutting",       title: "Cutting",       description: "Cutter productivity, yield %, waste, job cost.",               icon: Scissors },
];

export default async function ReportsHub() {
  await requireCapability("report:read");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Reports</h1>
        <p className="text-sm text-muted-foreground">Read across the operation. CSV exports for each report.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="hover:shadow-luxe-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md bg-sgs-gradient-soft grid place-items-center">
                    <r.icon className="h-5 w-5 text-sgs-teal-600" />
                  </div>
                  {r.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{r.description}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
