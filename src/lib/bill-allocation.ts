import "server-only";
import type { Prisma } from "@prisma/client";
import { convertStrict, fxNote, recomputeGemCost, round2, type Rates } from "@/lib/money";

type Tx = Prisma.TransactionClient;

/**
 * Row locks that serialise cutting against bills filed on, or rejected for,
 * the same rough, so a bill can never fall between the cut and its gems.
 */
export async function lockRoughStone(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "RoughStone" WHERE "id" = ${id} FOR UPDATE`;
}

export async function lockExpense(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${id} FOR UPDATE`;
}

/** A rough stone's own cost line (the bill itself), as stored on CostAllocation. */
export type BillLike = {
  id: string;
  type: string;
  description: string | null;
  amount: unknown;
  currency: string;
};

export type GemShare = { gemstoneId: string; code: string; currency: string; share: number };

export type GemCostLine = {
  type: string;
  description: string;
  amount: number;
  sourceAllocationId: string | null;
};

const pctLabel = (share: number) => (share * 100).toFixed(1);

/** One gem's share of one rough bill, in the gem's currency, pointing back at the rough's allocation. */
export function roughBillShareLine(
  rates: Rates,
  bill: BillLike,
  roughCode: string,
  share: number,
  target: string,
): GemCostLine {
  const amount = Number(bill.amount);
  return {
    type: bill.type,
    description: `Allocated share of ${bill.description ?? bill.type} on ${roughCode} (${pctLabel(share)}%)${fxNote(rates, amount, bill.currency, target)}`,
    amount: round2(convertStrict(rates, amount, bill.currency, target) * share),
    sourceAllocationId: bill.id,
  };
}

/**
 * Every cost line a freshly cut gem receives: its share of the rough purchase
 * price, of each bill filed on the rough, and of the cutting job cost. Lines
 * are rounded individually so the gem total always equals the sum of its lines.
 */
export function cutGemLines(
  rates: Rates,
  p: {
    rough: { code: string; purchasePrice: unknown; currency: string };
    bills: BillLike[];
    share: number;
    target: string;
    cutting?: { jobCode: string; totalCost: number };
  },
): GemCostLine[] {
  const purchase = Number(p.rough.purchasePrice);
  const lines: GemCostLine[] = [
    {
      type: "ROUGH_PURCHASE",
      description: `Allocated share of ${p.rough.code} purchase (${pctLabel(p.share)}%)${fxNote(rates, purchase, p.rough.currency, p.target)}`,
      amount: round2(convertStrict(rates, purchase, p.rough.currency, p.target) * p.share),
      sourceAllocationId: null,
    },
    ...p.bills.map((b) => roughBillShareLine(rates, b, p.rough.code, p.share, p.target)),
  ];
  if (p.cutting && p.cutting.totalCost > 0) {
    lines.push({
      type: "CUTTING",
      description: `Allocated share of cutting job ${p.cutting.jobCode} (${pctLabel(p.share)}%)`,
      amount: round2(p.cutting.totalCost * p.share),
      sourceAllocationId: null,
    });
  }
  return lines;
}

/** The gems a cut rough produced, each with its weight share of its cutting transformation. */
export async function derivedGemShares(tx: Tx, roughStoneId: string): Promise<GemShare[]> {
  const inputs = await tx.transformationInput.findMany({
    where: { roughStoneId },
    select: { transformationId: true },
  });
  const shares: GemShare[] = [];
  for (const transformationId of new Set(inputs.map((i) => i.transformationId))) {
    const outputs = await tx.transformationOutput.findMany({
      where: { transformationId },
      select: { outputWeightCt: true, gemstone: { select: { id: true, code: true, currency: true } } },
    });
    const total = outputs.reduce((s, o) => s + Number(o.outputWeightCt), 0);
    if (total <= 0) continue;
    for (const o of outputs) {
      shares.push({
        gemstoneId: o.gemstone.id,
        code: o.gemstone.code,
        currency: o.gemstone.currency,
        share: Number(o.outputWeightCt) / total,
      });
    }
  }
  return shares;
}

/**
 * Copies a rough bill onto the gems already derived from that rough (weight
 * share, gem currency) and recomputes their cost. A gem that already holds a
 * copy of this bill is skipped, so calling it twice changes nothing.
 * Returns the ids of the gems that changed.
 */
export async function allocateRoughBillToGems(
  tx: Tx,
  rates: Rates,
  rough: { id: string; code: string },
  bill: BillLike,
): Promise<string[]> {
  const shares = await derivedGemShares(tx, rough.id);
  if (shares.length === 0) return [];
  const have = new Set(
    (await tx.costAllocation.findMany({
      where: { sourceAllocationId: bill.id },
      select: { gemstoneId: true },
    })).map((l) => l.gemstoneId),
  );
  const changed: string[] = [];
  for (const s of shares) {
    if (have.has(s.gemstoneId)) continue;
    const line = roughBillShareLine(rates, bill, rough.code, s.share, s.currency);
    await tx.costAllocation.create({
      data: {
        gemstoneId: s.gemstoneId,
        type: line.type,
        description: line.description,
        amount: line.amount,
        currency: s.currency,
        sourceAllocationId: line.sourceAllocationId,
      },
    });
    changed.push(s.gemstoneId);
  }
  for (const id of changed) await recomputeGemCost(tx, id, rates);
  return changed;
}

export type StoneBillExpense = {
  id: string;
  category: string;
  description: string;
  amount: unknown;
  currency: string;
  incurredAt: Date;
  relatedEntity: string | null;
  relatedId: string | null;
};

/**
 * Creates the stone's CostAllocation for a stone-bill expense: on the gem
 * (recomputing its cost) or on the rough (and on every gem already cut from
 * it). Returns null when there is nothing to do: no linked stone, the stone
 * is gone, or the expense already has its allocation.
 */
export async function allocateExpenseToStone(
  tx: Tx,
  rates: Rates,
  expense: StoneBillExpense,
): Promise<{ allocationId: string; gemIds: string[] } | null> {
  if (!expense.relatedId) return null;
  if (await tx.costAllocation.findUnique({ where: { expenseId: expense.id }, select: { id: true } })) return null;

  const base = {
    expenseId: expense.id,
    type: expense.category,
    description: expense.description,
    amount: Number(expense.amount),
    currency: expense.currency,
    incurredAt: expense.incurredAt,
  };

  if (expense.relatedEntity === "Gemstone") {
    const gem = await tx.gemstone.findUnique({ where: { id: expense.relatedId }, select: { id: true } });
    if (!gem) return null;
    const a = await tx.costAllocation.create({ data: { ...base, gemstoneId: gem.id } });
    await recomputeGemCost(tx, gem.id, rates);
    return { allocationId: a.id, gemIds: [gem.id] };
  }

  if (expense.relatedEntity === "RoughStone") {
    const rough = await tx.roughStone.findUnique({ where: { id: expense.relatedId }, select: { id: true, code: true } });
    if (!rough) return null;
    const a = await tx.costAllocation.create({ data: { ...base, roughStoneId: rough.id } });
    const gemIds = await allocateRoughBillToGems(tx, rates, rough, a);
    return { allocationId: a.id, gemIds };
  }

  return null;
}

/**
 * Removes an expense's stone allocation together with every gem line copied
 * from it, then recomputes each affected gem. A no-op when the expense has no
 * allocation. Returns what was removed.
 */
export async function removeExpenseAllocation(
  tx: Tx,
  rates: Rates,
  expenseId: string,
): Promise<{ allocationId: string | null; removedLines: number; gemIds: string[] }> {
  const alloc = await tx.costAllocation.findUnique({
    where: { expenseId },
    select: { id: true, gemstoneId: true, roughStoneId: true },
  });
  if (!alloc) return { allocationId: null, removedLines: 0, gemIds: [] };

  const gemIds = new Set<string>();
  if (alloc.gemstoneId) gemIds.add(alloc.gemstoneId);
  const copies = await tx.costAllocation.findMany({
    where: { sourceAllocationId: alloc.id },
    select: { gemstoneId: true },
  });
  for (const c of copies) if (c.gemstoneId) gemIds.add(c.gemstoneId);
  if (alloc.roughStoneId) for (const s of await derivedGemShares(tx, alloc.roughStoneId)) gemIds.add(s.gemstoneId);

  const { count } = await tx.costAllocation.deleteMany({
    where: { OR: [{ id: alloc.id }, { sourceAllocationId: alloc.id }] },
  });
  for (const id of gemIds) await recomputeGemCost(tx, id, rates);
  return { allocationId: alloc.id, removedLines: count, gemIds: [...gemIds] };
}
