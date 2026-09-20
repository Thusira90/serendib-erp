import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getCompanySettings } from "@/lib/company-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ManualJournalForm } from "./manual-journal-form";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function NewJournalPage() {
  await requireCapability("accounting:write");
  const [accounts, company] = await Promise.all([
    prisma.chartAccount.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    }),
    getCompanySettings(),
  ]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <Link href="/journals" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to journals
        </Link>
        <h1 className="font-serif text-3xl mt-2">New manual journal</h1>
        <p className="text-sm text-muted-foreground">
          Use this for adjustments, corrections, opening balances and anything the modules don't auto-post.
          Debits must equal credits before the entry can be posted.
        </p>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            The Chart of Accounts is empty. <Link href="/accounts" className="text-sgs-teal-700 hover:underline">Seed it first</Link>.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Entry</CardTitle></CardHeader>
          <CardContent>
            <ManualJournalForm
              accounts={accounts.map((a) => ({
                id: a.id, code: a.code, name: a.name, type: a.type, currency: a.currency,
              }))}
              defaultCurrency={company.defaultCurrency}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
