import "server-only";
import type { Prisma } from "@prisma/client";
import { getExchangeRates, type Rates } from "@/lib/exchange-rates";

export type { Rates };
export { getExchangeRates };

/** Half away from zero, symmetric for negatives (Math.round alone rounds -1.005 the other way). */
export function round2(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;
}

/** Convert between any two supported currencies through the LKR base. Null when a rate is unknown. */
export function convert(rates: Rates, amount: number, from: string, to: string): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  const fromPer = from === rates.base ? 1 : rates.perUnit[from];
  const toPer = to === rates.base ? 1 : rates.perUnit[to];
  if (typeof fromPer !== "number" || typeof toPer !== "number" || toPer <= 0) return null;
  return (amount * fromPer) / toPer;
}

/** Write paths freeze converted amounts into records, so an unknown currency must stop the write. */
export function convertStrict(rates: Rates, amount: number, from: string, to: string): number {
  const v = convert(rates, amount, from, to);
  if (v == null) throw new Error(`No exchange rate available for ${from} → ${to}.`);
  return v;
}

/** Read paths (reports) must keep rendering; every selectable currency has a rate, so the raw fallback is unreachable in practice. */
export function toBase(rates: Rates, amount: number, currency: string): number {
  return convert(rates, amount, currency, rates.base) ?? amount;
}

/** Human-readable note recording the rate used when a cost line was converted. */
export function fxNote(rates: Rates, amount: number, from: string, to: string): string {
  if (from === to) return "";
  const rate = convert(rates, 1, from, to);
  const approx = rates.source === "fallback" ? ", approximate rate" : "";
  return ` [${from} ${amount.toFixed(2)} @ ${rate != null ? rate.toFixed(4) : "?"} ${to}${approx}]`;
}

/**
 * Rebuild a gemstone's totalCost / costPerCt from its CostAllocation lines,
 * converting every line into the gemstone's own currency first so lines in
 * different currencies are never added raw.
 */
export async function recomputeGemCost(
  tx: Prisma.TransactionClient,
  gemstoneId: string,
  rates: Rates,
): Promise<number> {
  const gem = await tx.gemstone.findUniqueOrThrow({
    where: { id: gemstoneId },
    select: { weightCt: true, currency: true },
  });
  const lines = await tx.costAllocation.findMany({
    where: { gemstoneId },
    select: { amount: true, currency: true },
  });
  let total = 0;
  for (const l of lines) total += convertStrict(rates, Number(l.amount), l.currency, gem.currency);
  total = round2(total);
  const wt = Number(gem.weightCt);
  await tx.gemstone.update({
    where: { id: gemstoneId },
    data: { totalCost: total, costPerCt: wt > 0 ? round2(total / wt) : 0 },
  });
  return total;
}
