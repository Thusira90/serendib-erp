import "server-only";
import { PrismaClient, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { codePrefix, nextCode } from "@/lib/ids";
import type { JournalSourceModule } from "@/lib/enums";
import { accountBySubtype } from "@/lib/coa-seed";
import type { AccountSubtype } from "@/lib/enums";

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * Ensures a period row exists for the given (year, month). Creates one in
 * OPEN state if not. Journals refuse to post into CLOSED or LOCKED periods —
 * the caller decides how to handle that.
 */
export async function ensurePeriod(date: Date, tx: Tx = defaultPrisma) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const client = tx as PrismaClient;
  const existing = await client.accountingPeriod.findUnique({
    where: { year_month: { year, month } },
  });
  if (existing) return existing;
  return client.accountingPeriod.create({
    data: { year, month, status: "OPEN" },
  });
}

export type JournalLineInput = {
  accountId?: string;
  subtype?: AccountSubtype;   // convenience: look up account by subtype
  debit?: number | string;
  credit?: number | string;
  description?: string | null;
};

export type PostJournalArgs = {
  transactionDate: Date;
  description: string;
  reference?: string | null;
  currency?: string;
  sourceModule?: JournalSourceModule;
  sourceId?: string | null;
  sourceCode?: string | null;
  postedBy?: string | null;
  lines: JournalLineInput[];
};

/**
 * Post a journal entry. Runs inside the caller's transaction so it can be
 * chained with other writes (e.g. the CapitalTransaction that spawned it).
 *
 * Enforces:
 *   - at least two lines
 *   - each line has either debit>0 or credit>0, never both
 *   - sum(debit) === sum(credit) at 2-decimal precision
 *   - the target period is OPEN (not CLOSED or LOCKED)
 */
export async function postJournal(args: PostJournalArgs, tx: Tx = defaultPrisma): Promise<{ id: string; code: string }> {
  const client = tx as PrismaClient;
  if (args.lines.length < 2) throw new Error("A journal must have at least two lines.");

  const resolvedLines = await Promise.all(args.lines.map(async (l) => {
    let accountId = l.accountId ?? null;
    if (!accountId && l.subtype) {
      const acct = await accountBySubtype(l.subtype, tx);
      accountId = acct.id;
    }
    if (!accountId) throw new Error("Every journal line must resolve to an account (via accountId or subtype).");
    const debit = toNum(l.debit);
    const credit = toNum(l.credit);
    if (debit < 0 || credit < 0) throw new Error("Line debit/credit must be non-negative.");
    if (debit > 0 && credit > 0) throw new Error("A line can be either a debit or a credit, not both.");
    if (debit === 0 && credit === 0) throw new Error("Every line must have a non-zero amount.");
    return { accountId, debit, credit, description: l.description ?? null };
  }));
  const totalDebit  = round2(resolvedLines.reduce((s, l) => s + l.debit,  0));
  const totalCredit = round2(resolvedLines.reduce((s, l) => s + l.credit, 0));
  if (totalDebit !== totalCredit) {
    throw new Error(`Journal is unbalanced: debits ${totalDebit} ≠ credits ${totalCredit}.`);
  }

  const period = await ensurePeriod(args.transactionDate, tx);
  if (period.status !== "OPEN") {
    throw new Error(`Period ${period.year}-${String(period.month).padStart(2, "0")} is ${period.status}; use a reversing entry in the current period instead.`);
  }

  const year = args.transactionDate.getUTCFullYear();
  const code = await nextCode(codePrefix.journal, year, tx, { pad: 4 });
  const journal = await client.journal.create({
    data: {
      code,
      transactionDate: args.transactionDate,
      periodId: period.id,
      description: args.description,
      reference: args.reference ?? null,
      currency: args.currency ?? "LKR",
      sourceModule: args.sourceModule ?? "MANUAL",
      sourceId: args.sourceId ?? null,
      sourceCode: args.sourceCode ?? null,
      status: "POSTED",
      postedAt: new Date(),
      postedBy: args.postedBy ?? null,
      totalAmount: totalDebit,
      lines: {
        create: resolvedLines.map((l, i) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
          displayOrder: i,
        })),
      },
    },
    select: { id: true, code: true },
  });
  return journal;
}

/**
 * Post a reversing journal: same lines with debit/credit swapped, dated
 * today, linked back to the original via reversalOfId. The original is
 * marked REVERSED (still visible, still queryable, but excluded from the
 * live trial balance by convention — we sum only POSTED rows).
 *
 * We never edit posted lines. This is the only permitted "correction" flow.
 */
export async function reverseJournal(
  originalId: string,
  reason: string,
  postedBy: string | null,
  tx: Tx = defaultPrisma,
): Promise<{ id: string; code: string }> {
  const client = tx as PrismaClient;
  const original = await client.journal.findUniqueOrThrow({
    where: { id: originalId },
    include: { lines: true },
  });
  if (original.status !== "POSTED") {
    throw new Error(`Cannot reverse a journal in status ${original.status}.`);
  }

  const now = new Date();
  const period = await ensurePeriod(now, tx);
  if (period.status !== "OPEN") {
    throw new Error(`Current period is ${period.status}; cannot post a reversal.`);
  }
  const year = now.getUTCFullYear();
  const code = await nextCode(codePrefix.journal, year, tx, { pad: 4 });
  const reversal = await client.journal.create({
    data: {
      code,
      transactionDate: now,
      periodId: period.id,
      description: `Reversal of ${original.code}: ${reason}`,
      reference: original.reference,
      currency: original.currency,
      sourceModule: original.sourceModule,
      sourceId: original.sourceId,
      sourceCode: original.sourceCode,
      status: "POSTED",
      postedAt: now,
      postedBy,
      totalAmount: original.totalAmount,
      reversalOfId: original.id,
      lines: {
        create: original.lines.map((l, i) => ({
          accountId: l.accountId,
          debit: Number(l.credit),
          credit: Number(l.debit),
          description: l.description ? `Reversal — ${l.description}` : `Reversal`,
          displayOrder: i,
        })),
      },
    },
    select: { id: true, code: true },
  });
  await client.journal.update({
    where: { id: original.id },
    data: { status: "REVERSED" },
  });
  return reversal;
}

function toNum(v: number | string | undefined | null): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number) { return Math.round(n * 100) / 100; }
