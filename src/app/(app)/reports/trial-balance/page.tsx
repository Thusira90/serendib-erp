import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { getCompanySettings } from "@/lib/company-settings";
import { ACCOUNT_TYPE_LABEL, type AccountType } from "@/lib/enums";
import { Scale, ChevronLeft } from "lucide-react";

/**
 * Trial balance — the accounting-audit workhorse.
 *
 * Sums POSTED journal lines per account. Debits and credits are shown on
 * their own columns, and a running total at the bottom must match. If
 * they don't, someone posted an unbalanced entry through a bug or a raw
 * SQL edit — the report surfaces that mismatch loudly.
 */
export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requireCapability("accounting:read");
  const params = await searchParams;
  const asOfDate = params.asOf ? new Date(params.asOf) : new Date();
  const asOfIso = asOfDate.toISOString().slice(0, 10);

  const [accounts, groups, company] = await Promise.all([
    prisma.chartAccount.findMany({ orderBy: { code: "asc" } }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      _sum: { debit: true, credit: true },
      where: {
        journal: { status: "POSTED", transactionDate: { lte: asOfDate } },
      },
    }),
    getCompanySettings(),
  ]);

  const bal = new Map<string, { debit: number; credit: number }>();
  for (const g of groups) {
    bal.set(g.accountId, { debit: Number(g._sum.debit ?? 0), credit: Number(g._sum.credit ?? 0) });
  }

  const rows = accounts
    .filter((a) => bal.has(a.id))
    .map((a) => {
      const b = bal.get(a.id)!;
      const normal = a.type === "ASSET" || a.type === "COST_OF_SALES" || a.type === "EXPENSE" ? "debit" : "credit";
      const net = normal === "debit" ? b.debit - b.credit : b.credit - b.debit;
      const debit  = normal === "debit"  ? Math.max(net, 0) : Math.max(-net, 0);
      const credit = normal === "credit" ? Math.max(net, 0) : Math.max(-net, 0);
      return { account: a, debit, credit, net, normal };
    });

  const byType = new Map<AccountType, typeof rows>();
  for (const r of rows) {
    const t = r.account.type as AccountType;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(r);
  }
  const typeOrder: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "COST_OF_SALES", "EXPENSE"];

  const totalDebit  = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to reports
        </Link>
        <div className="flex items-end justify-between gap-4 mt-2">
          <div>
            <h1 className="font-serif text-3xl flex items-center gap-3">
              <Scale className="h-7 w-7 text-sgs-teal-500" /> Trial Balance
            </h1>
            <p className="text-sm text-muted-foreground">
              As at {asOfDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}.
              Only POSTED entries are included; reversed entries net to zero and are hidden.
            </p>
          </div>
          <form action="/reports/trial-balance" method="get" className="flex items-end gap-2">
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              As at
              <input type="date" name="asOf" defaultValue={asOfIso}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
            </label>
            <button className="h-9 rounded-md border border-input bg-background px-3 text-sm hover:bg-secondary">Refresh</button>
          </form>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No posted entries as at this date. <Link href="/journals/new" className="text-sgs-teal-700 hover:underline">Post a journal</Link>{" "}
            or record a{" "}
            <Link href="/capital" className="text-sgs-teal-700 hover:underline">capital movement</Link> to see figures here.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Account</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typeOrder.filter((t) => byType.has(t)).map((t) => {
                  const rs = byType.get(t)!;
                  const subDebit  = rs.reduce((s, r) => s + r.debit,  0);
                  const subCredit = rs.reduce((s, r) => s + r.credit, 0);
                  return (
                    <>
                      <TableRow key={`h-${t}`} className="bg-secondary/40">
                        <TableCell colSpan={4} className="text-[10px] uppercase tracking-wider text-muted-foreground py-2">
                          {ACCOUNT_TYPE_LABEL[t]}
                        </TableCell>
                      </TableRow>
                      {rs.map((r) => (
                        <TableRow key={r.account.id}>
                          <TableCell className="font-mono text-xs">{r.account.code}</TableCell>
                          <TableCell className="text-sm">{r.account.name}</TableCell>
                          <TableCell className="text-right num">{r.debit === 0 ? "—" : formatCurrency(r.debit, r.account.currency)}</TableCell>
                          <TableCell className="text-right num">{r.credit === 0 ? "—" : formatCurrency(r.credit, r.account.currency)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow key={`s-${t}`} className="border-t">
                        <TableCell colSpan={2} className="text-xs font-medium text-right">Subtotal {ACCOUNT_TYPE_LABEL[t]}</TableCell>
                        <TableCell className="text-right num text-xs font-medium">{formatCurrency(subDebit, company.defaultCurrency)}</TableCell>
                        <TableCell className="text-right num text-xs font-medium">{formatCurrency(subCredit, company.defaultCurrency)}</TableCell>
                      </TableRow>
                    </>
                  );
                })}
                <TableRow className="border-t-2 font-medium">
                  <TableCell colSpan={2} className="text-right">Total</TableCell>
                  <TableCell className="text-right num">{formatCurrency(totalDebit, company.defaultCurrency)}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(totalCredit, company.defaultCurrency)}</TableCell>
                </TableRow>
                {diff !== 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-right text-red-600 font-medium">Difference</TableCell>
                    <TableCell colSpan={2} className="text-right num text-red-600 font-medium">
                      {formatCurrency(Math.abs(diff), company.defaultCurrency)} — trial balance is out of balance, investigate.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
