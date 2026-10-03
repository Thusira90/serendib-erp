import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getCompanySettings } from "@/lib/company-settings";
import { NewExpenseButton } from "./new-expense-button";
import { Coins, ReceiptText } from "lucide-react";
import { startOfMonth, endOfMonth } from "date-fns";
import { HBarChart, compactCurrency } from "@/components/charts/bar-chart";
import { getExchangeRates } from "@/lib/money";
import { toBaseStored } from "@/lib/sales-ledger";

const statusVariant: Record<string, "muted" | "teal" | "success" | "danger" | "purple"> = {
  RECORDED: "muted", APPROVED: "success", REIMBURSED: "purple", REJECTED: "danger",
};

const catLabel = (c: string) => c.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

export default async function ExpensesPage() {
  const session = await requireCapability("expense:read");
  const canWrite = can(session.user, "expense:write");

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const yearStart = new Date(now.getUTCFullYear(), 0, 1);

  // Same basis as the P&L opex: rejected rows and stone bills capitalised into stone cost are left out,
  // and every amount is converted at the rate stored on the expense, never summed raw across currencies.
  const [all, ytdRows, company, rates] = await Promise.all([
    prisma.expense.findMany({ orderBy: { incurredAt: "desc" }, take: 200 }),
    prisma.expense.findMany({
      where: { incurredAt: { gte: yearStart }, status: { not: "REJECTED" }, costAllocation: { is: null } },
      select: { category: true, amount: true, currency: true, fxRateLkr: true, incurredAt: true },
    }),
    getCompanySettings(),
    getExchangeRates(),
  ]);
  const lkr = (x: (typeof ytdRows)[number]) => toBaseStored(rates, Number(x.amount), x.currency, x.fxRateLkr);
  const monthRows = ytdRows.filter((x) => x.incurredAt >= monthStart && x.incurredAt <= monthEnd);
  const monthTotal = monthRows.reduce((s, x) => s + lkr(x), 0);
  const ytdTotal = ytdRows.reduce((s, x) => s + lkr(x), 0);
  const byCategoryMap = new Map<string, number>();
  for (const x of ytdRows) byCategoryMap.set(x.category, (byCategoryMap.get(x.category) ?? 0) + lkr(x));

  const chart = Array.from(byCategoryMap, ([category, value]) => ({ label: catLabel(category), value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><ReceiptText className="h-7 w-7 text-sgs-purple-500" /> Expenses</h1>
          <p className="text-sm text-muted-foreground">General operating expenses. Per-stone allocations remain on the gemstone's costing tab.</p>
        </div>
        {canWrite && <NewExpenseButton defaultCurrency={company.defaultCurrency} />}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="This month" value={formatCurrency(monthTotal)} accent />
        <Stat label="Count this month" value={String(monthRows.length)} />
        <Stat label="YTD" value={formatCurrency(ytdTotal)} />
        <Stat label="Categories" value={String(byCategoryMap.size)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        <Card>
          <CardHeader><CardTitle>YTD by category</CardTitle></CardHeader>
          <CardContent>
            {chart.length === 0 ? (
              <div className="text-sm text-muted-foreground">No expenses recorded.</div>
            ) : (
              <HBarChart data={chart} valueFormat={compactCurrency("LKR")} accent="sgs-purple" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Register</CardTitle>
            <div className="text-xs text-muted-foreground">{all.length} entries</div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Related</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {all.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No expenses yet.</TableCell></TableRow>
                )}
                {all.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.code}</TableCell>
                    <TableCell className="text-xs">{formatDate(e.incurredAt)}</TableCell>
                    <TableCell><Badge variant="muted">{catLabel(e.category)}</Badge></TableCell>
                    <TableCell className="text-sm">{e.vendor ?? "—"}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">
                      {e.description}
                      {e.receiptUrl && (
                        <> · <Link href={e.receiptUrl} target="_blank" className="text-xs text-sgs-teal-700 hover:underline">receipt</Link></>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.relatedEntity ? <><span className="text-muted-foreground">{e.relatedEntity}:</span> <span className="font-mono">{e.relatedCode ?? e.relatedId ?? ""}</span></> : "—"}
                    </TableCell>
                    <TableCell className="text-right num font-medium">
                      <Coins className="h-3 w-3 inline text-muted-foreground mr-1" />
                      {formatCurrency(Number(e.amount), e.currency)}
                    </TableCell>
                    <TableCell><Badge variant={statusVariant[e.status] ?? "muted"}>{e.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-serif text-2xl num mt-1 ${accent ? "text-sgs-purple-600" : ""}`}>{value}</div>
    </CardContent></Card>
  );
}
