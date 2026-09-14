import "server-only";
import { prisma } from "@/lib/db";
import { parsePreferences, type CustomerPreferences } from "@/lib/customer-preferences";

/**
 * Rule-based match scoring between a customer's stated preferences and a
 * gemstone's attributes. Each dimension contributes to a 0-100 score with a
 * short human-readable reason.
 */

type Facet =
  | "gem type" | "variety" | "origin" | "color" | "shape" | "treatment"
  | "weight" | "budget";

const WEIGHTS: Record<Facet, number> = {
  "gem type": 22,
  "variety": 14,
  "origin": 14,
  "color": 8,
  "shape": 6,
  "treatment": 12,
  "weight": 12,
  "budget": 12,
};

type GemFacts = {
  id: string;
  code: string;
  gemType: string;
  variety: string | null;
  origin: string | null;
  colorDescription: string | null;
  shape: string | null;
  treatment: string | null;
  weightCt: number;
  askingPrice: number | null;
  currency: string;
};

type CustomerFacts = {
  id: string;
  code: string;
  displayName: string;
  preferences: CustomerPreferences;
};

export type MatchResult = {
  score: number;
  matchedFacets: Facet[];
  reasons: string[];
  misses: string[];
};

const includesCI = (list: string[], v: string | null) =>
  v != null && list.some((x) => x && v.toLowerCase().includes(x.toLowerCase()));

function scoreGemForCustomer(g: GemFacts, c: CustomerFacts): MatchResult {
  const p = c.preferences;
  let score = 0;
  const matched: Facet[] = [];
  const reasons: string[] = [];
  const misses: string[] = [];

  const add = (facet: Facet, ok: boolean, why: string, miss?: string) => {
    if (ok) {
      score += WEIGHTS[facet];
      matched.push(facet);
      reasons.push(why);
    } else if (miss) {
      misses.push(miss);
    }
  };

  // gem type — no preferences means "any" (partial credit)
  if (p.gemTypes.length === 0) score += WEIGHTS["gem type"] * 0.4;
  else add("gem type",
    p.gemTypes.some((t) => t.toLowerCase() === g.gemType.toLowerCase()),
    `${g.gemType} matches preferred`,
    `${g.gemType} not in preferred gem types`);

  // variety
  if (p.varieties.length === 0) score += WEIGHTS["variety"] * 0.4;
  else add("variety",
    includesCI(p.varieties, g.variety),
    `${g.variety ?? "variety"} matches preferred`,
    `${g.variety ?? "variety"} not in preferred varieties`);

  // origin
  if (p.origins.length === 0) score += WEIGHTS["origin"] * 0.4;
  else add("origin",
    includesCI(p.origins, g.origin),
    `${g.origin ?? "origin"} matches preferred`,
    `${g.origin ?? "origin"} not in preferred origins`);

  // color (description)
  if (p.colors.length === 0) score += WEIGHTS["color"] * 0.4;
  else add("color",
    includesCI(p.colors, g.colorDescription),
    `Colour matches "${p.colors.join(", ")}"`,
    `Colour doesn't match customer taste`);

  // shape
  if (p.shapes.length === 0) score += WEIGHTS["shape"] * 0.4;
  else add("shape",
    includesCI(p.shapes, g.shape),
    `${g.shape ?? "shape"} matches preferred`,
    `${g.shape ?? "shape"} not in preferred shapes`);

  // treatment
  if (p.treatments.length === 0) score += WEIGHTS["treatment"] * 0.4;
  else add("treatment",
    includesCI(p.treatments, g.treatment),
    `${g.treatment ?? "treatment"} matches preferred`,
    `${g.treatment ?? "treatment"} not in preferred treatments`);

  // weight
  const wtOk =
    (p.minWeightCt == null || g.weightCt >= p.minWeightCt) &&
    (p.maxWeightCt == null || g.weightCt <= p.maxWeightCt);
  if (p.minWeightCt == null && p.maxWeightCt == null) score += WEIGHTS["weight"] * 0.4;
  else add("weight", wtOk,
    `Weight ${g.weightCt.toFixed(2)}ct within window`,
    `Weight ${g.weightCt.toFixed(2)}ct outside ${p.minWeightCt ?? "…"}-${p.maxWeightCt ?? "…"}ct window`);

  // budget
  const priced = g.askingPrice != null;
  const budgetOk = priced &&
    (p.budgetMin == null || (g.askingPrice as number) >= p.budgetMin) &&
    (p.budgetMax == null || (g.askingPrice as number) <= p.budgetMax);
  if (p.budgetMin == null && p.budgetMax == null) score += WEIGHTS["budget"] * 0.4;
  else add("budget", !!budgetOk,
    `Asking price fits customer budget`,
    priced ? `Asking price outside ${p.budgetMin ?? "…"}-${p.budgetMax ?? "…"} ${p.currency} window` : `No asking price set`);

  return { score: Math.round(score), matchedFacets: matched, reasons, misses };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function matchingCustomersForGem(gemstoneId: string, limit = 8) {
  const gem = await prisma.gemstone.findUniqueOrThrow({ where: { id: gemstoneId } });
  const customers = await prisma.customer.findMany();
  const facts: GemFacts = {
    id: gem.id, code: gem.code,
    gemType: gem.gemType, variety: gem.variety, origin: gem.origin,
    colorDescription: gem.colorDescription, shape: gem.shape, treatment: gem.treatment,
    weightCt: Number(gem.weightCt),
    askingPrice: gem.askingPrice != null ? Number(gem.askingPrice) : null,
    currency: gem.currency,
  };
  const results = customers.map((c) => {
    const prefs = parsePreferences(c.preferences);
    const cf: CustomerFacts = {
      id: c.id, code: c.code, displayName: c.displayName, preferences: prefs,
    };
    const match = scoreGemForCustomer(facts, cf);
    return { customer: c, match };
  });
  return results
    .filter((r) => r.match.score >= 40)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit);
}

export async function matchingGemsForCustomer(customerId: string, limit = 12) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const gems = await prisma.gemstone.findMany({
    where: { status: { in: ["AVAILABLE", "IN_PROGRESS"] } },
  });
  const cf: CustomerFacts = {
    id: customer.id, code: customer.code, displayName: customer.displayName,
    preferences: parsePreferences(customer.preferences),
  };
  const results = gems.map((g) => {
    const facts: GemFacts = {
      id: g.id, code: g.code,
      gemType: g.gemType, variety: g.variety, origin: g.origin,
      colorDescription: g.colorDescription, shape: g.shape, treatment: g.treatment,
      weightCt: Number(g.weightCt),
      askingPrice: g.askingPrice != null ? Number(g.askingPrice) : null,
      currency: g.currency,
    };
    const match = scoreGemForCustomer(facts, cf);
    return { gem: g, match };
  });
  return results
    .filter((r) => r.match.score >= 40)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit);
}
