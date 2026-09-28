import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Receipt, FileText } from "lucide-react";
import { AddBillButton } from "./add-bill-button";

/**
 * Bills & cost history for a single stone.
 *
 * For a gemstone: shows every CostAllocation on the gem itself. This
 * includes purchase cost, cutting labour, certification, filed bills — the
 * complete "true cost" ledger, matching what totalCost reflects.
 *
 * For a rough: shows every CostAllocation attached to that rough, PLUS the
 * initial purchase price for context. Everything here flows downstream —
 * when the rough is cut, its bills carry into the finished gem's
 * genealogy view.
 *
 * Rows link to the parent Expense (with its receipt) when there is one.
 */
export async function StoneBillsSection({
  kind, stoneId, stoneCode, canWrite, defaultCurrency = "LKR",
}: {
  kind: "rough" | "gemstone";
  stoneId: string;
  stoneCode: string;
  canWrite: boolean;
  defaultCurrency?: string;
}) {
  const allocations = await prisma.costAllocation.findMany({
    where: kind === "rough" ? { roughStoneId: stoneId } : { gemstoneId: stoneId },
    orderBy: { incurredAt: "asc" },
    include: { expense: { select: { code: true, vendor: true, receiptUrl: true } } },
  });

  // Also pull rough-side bills for downstream gemstones so a cut stone's
  // Bills panel shows its inherited costs from the parent rough (full
  // genealogy transparency).
  let inheritedFromRough: Array<{
    id: string;
    incurredAt: Date;
    type: string;
    description: string | null;
    amount: number;
    currency: string;
    expense: { code: string; vendor: string | null; receiptUrl: string | null } | null;
    roughCode: string;
  }> = [];
  if (kind === "gemstone") {
    const gem = await prisma.gemstone.findUnique({
      where: { id: stoneId },
      include: {
        transformationsAsOutput: {
          include: {
            transformation: {
              include: {
                inputs: {
                  include: {
                    roughStone: {
                      include: {
                        costAllocations: {
                          include: { expense: { select: { code: true, vendor: true, receiptUrl: true } } },
                          orderBy: { incurredAt: "asc" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (gem) {
      for (const out of gem.transformationsAsOutput) {
        for (const inp of out.transformation.inputs) {
          for (const a of inp.roughStone.costAllocations) {
            inheritedFromRough.push({
              id: a.id,
              incurredAt: a.incurredAt,
              type: a.type,
              description: a.description,
              amount: Number(a.amount),
              currency: a.currency,
              expense: a.expense,
              roughCode: inp.roughStone.code,
            });
          }
        }
      }
      inheritedFromRough.sort((a, b) => a.incurredAt.getTime() - b.incurredAt.getTime());
    }
  }

  const total = allocations.reduce((s, a) => s + Number(a.amount), 0);
  const inheritedTotal = inheritedFromRough.reduce((s, a) => s + a.amount, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-sgs-teal-500" /> Bills & costs
          </CardTitle>
          <div className="text-xs text-muted-foreground mt-1">
            Every allocated cost line for this stone — mirrored to the
            <Link href="/expenses" className="text-sgs-teal-700 hover:underline"> expenses ledger</Link> and the
            <Link href="/reports/pnl" className="text-sgs-teal-700 hover:underline"> P&amp;L</Link>.
          </div>
        </div>
        {canWrite && (
          <AddBillButton
            kind={kind}
            stoneId={stoneId}
            stoneCode={stoneCode}
            defaultCurrency={defaultCurrency}
          />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {allocations.length === 0 && inheritedFromRough.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-6 border rounded-md">
            No bills filed yet.
            {canWrite && <> Click <span className="font-medium">Add bill</span> to file the first one.</>}
          </div>
        )}

        {allocations.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Own bills · {allocations.length}
            </div>
            <ul className="divide-y border rounded-md">
              {allocations.map((a) => (
                <BillRow
                  key={a.id}
                  incurredAt={a.incurredAt}
                  type={a.type}
                  description={a.description}
                  amount={Number(a.amount)}
                  currency={a.currency}
                  expense={a.expense}
                />
              ))}
            </ul>
            <div className="flex justify-end pt-1 text-sm">
              <span className="text-muted-foreground mr-2">Subtotal:</span>
              <span className="num font-medium">{formatCurrency(total, allocations[0]?.currency ?? defaultCurrency)}</span>
            </div>
          </div>
        )}

        {inheritedFromRough.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Inherited from parent rough · {inheritedFromRough.length}
            </div>
            <ul className="divide-y border rounded-md bg-secondary/20">
              {inheritedFromRough.map((a) => (
                <BillRow
                  key={a.id}
                  incurredAt={a.incurredAt}
                  type={a.type}
                  description={a.description ? `${a.description} (from ${a.roughCode})` : `From ${a.roughCode}`}
                  amount={a.amount}
                  currency={a.currency}
                  expense={a.expense}
                />
              ))}
            </ul>
            <div className="flex justify-end pt-1 text-sm">
              <span className="text-muted-foreground mr-2">Inherited subtotal:</span>
              <span className="num">{formatCurrency(inheritedTotal, inheritedFromRough[0]?.currency ?? defaultCurrency)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BillRow({
  incurredAt, type, description, amount, currency, expense,
}: {
  incurredAt: Date;
  type: string;
  description: string | null;
  amount: number;
  currency: string;
  expense: { code: string; vendor: string | null; receiptUrl: string | null } | null;
}) {
  return (
    <li className="p-3 flex items-center justify-between gap-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="muted">{type.replaceAll("_", " ")}</Badge>
          <span className="text-xs text-muted-foreground">{formatDate(incurredAt)}</span>
          {expense?.code && (
            <Link href={`/expenses?code=${encodeURIComponent(expense.code)}`} className="text-[10px] font-mono text-sgs-teal-700 hover:underline">
              {expense.code}
            </Link>
          )}
          {expense?.receiptUrl && (
            <Link href={expense.receiptUrl} target="_blank" className="inline-flex items-center gap-0.5 text-[10px] text-sgs-teal-700 hover:underline">
              <FileText className="h-3 w-3" /> receipt
            </Link>
          )}
        </div>
        {description && <div className="mt-0.5 truncate">{description}</div>}
        {expense?.vendor && <div className="text-xs text-muted-foreground">{expense.vendor}</div>}
      </div>
      <div className="num font-medium whitespace-nowrap">
        {formatCurrency(amount, currency)}
      </div>
    </li>
  );
}
