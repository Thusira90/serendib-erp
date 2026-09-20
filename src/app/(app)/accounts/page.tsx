import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { getCompanySettings } from "@/lib/company-settings";
import { NewAccountButton } from "./new-account-button";
import { SeedCoaButton } from "./seed-coa-button";
import { ACCOUNT_TYPE_LABEL, type AccountType } from "@/lib/enums";
import { Building2 } from "lucide-react";

/**
 * Chart of Accounts. Balances are the sum of POSTED journal lines against
 * each account, expressed in the account's normal side (debit-positive for
 * ASSET/COS/EXPENSE, credit-positive for LIABILITY/EQUITY/REVENUE).
 */
export default async function AccountsPage() {
  const session = await requireCapability("accounting:read");
  const canWrite = can(session.user.role, "accounting:write");
  const [accounts, balances, company] = await Promise.all([
    prisma.chartAccount.findMany({ orderBy: { code: "asc" } }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      _sum: { debit: true, credit: true },
      where: { journal: { status: "POSTED" } },
    }),
    getCompanySettings(),
  ]);

  const balanceByAccount = new Map<string, { debit: number; credit: number }>();
  for (const b of balances) {
    balanceByAccount.set(b.accountId, {
      debit: Number(b._sum.debit ?? 0),
      credit: Number(b._sum.credit ?? 0),
    });
  }

  const parents = accounts
    .filter((a) => a.parentId === null && !a.subtype)  // top-level categories
    .map((a) => ({ code: a.code, name: a.name, type: a.type }));
  // Also allow the seeded root categories (with type but no subtype) as parents.
  const allParents = accounts
    .filter((a) => a.subtype === null || a.type !== a.type)  // top-level categories
    .concat(accounts.filter((a) => a.subtype !== null))
    .map((a) => ({ code: a.code, name: a.name, type: a.type }));

  // Group by type for display
  const byType = new Map<AccountType, typeof accounts>();
  for (const a of accounts) {
    const t = a.type as AccountType;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(a);
  }
  const typeOrder: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "COST_OF_SALES", "EXPENSE"];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3">
            <Building2 className="h-7 w-7 text-sgs-purple-500" /> Chart of Accounts
          </h1>
          <p className="text-sm text-muted-foreground">
            The account tree the whole ERP posts against. Configurable per spec §10 — add sub-accounts
            under the seeded categories to fit how you actually run the business.
          </p>
        </div>
        {canWrite && accounts.length > 0 && (
          <NewAccountButton parents={allParents} defaultCurrency={company.defaultCurrency} />
        )}
      </div>

      {accounts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              The Chart of Accounts is empty. Seed the default categories from spec §10 to get started —
              you can customise anything after.
            </p>
            {canWrite && <SeedCoaButton />}
          </CardContent>
        </Card>
      )}

      {typeOrder.filter((t) => byType.has(t)).map((t) => {
        const rows = byType.get(t)!;
        const typeBalances = rows.reduce((acc, r) => {
          const b = balanceByAccount.get(r.id);
          if (b) { acc.debit += b.debit; acc.credit += b.credit; }
          return acc;
        }, { debit: 0, credit: 0 });
        const normal = t === "ASSET" || t === "COST_OF_SALES" || t === "EXPENSE" ? "debit" : "credit";
        const typeNet = normal === "debit" ? typeBalances.debit - typeBalances.credit : typeBalances.credit - typeBalances.debit;
        return (
          <Card key={t}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{ACCOUNT_TYPE_LABEL[t]}</CardTitle>
              <div className="text-xs text-muted-foreground flex items-center gap-3">
                <span>{rows.length} accounts</span>
                <span className="font-mono num">Net {formatCurrency(typeNet, company.defaultCurrency)}</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Subtype</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => {
                    const b = balanceByAccount.get(a.id) ?? { debit: 0, credit: 0 };
                    const bal = normal === "debit" ? b.debit - b.credit : b.credit - b.debit;
                    const isChild = a.parentId != null;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className={`font-mono text-xs ${isChild ? "pl-8" : "font-medium"}`}>
                          {a.code}
                        </TableCell>
                        <TableCell className={a.parentId ? "text-sm" : "font-medium"}>
                          {a.name}
                          {a.isSystem && <Badge variant="muted" className="ml-2">SYSTEM</Badge>}
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground font-mono">{a.subtype ?? "—"}</TableCell>
                        <TableCell className="text-right num text-xs">{b.debit === 0 ? "—" : formatCurrency(b.debit, a.currency)}</TableCell>
                        <TableCell className="text-right num text-xs">{b.credit === 0 ? "—" : formatCurrency(b.credit, a.currency)}</TableCell>
                        <TableCell className={`text-right num text-xs font-medium ${bal < 0 ? "text-red-600" : ""}`}>
                          {bal === 0 ? "—" : formatCurrency(bal, a.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={a.isActive ? "success" : "muted"}>{a.isActive ? "Active" : "Inactive"}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
