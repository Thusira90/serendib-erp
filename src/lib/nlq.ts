/**
 * A very small natural-language query parser for the gemstone inventory.
 *
 * Understands things like:
 *   "untreated Ceylon sapphires above 3ct under $20k"
 *   "padparadscha 2-5 ct"
 *   "yellow sapphires under 5000 USD"
 *   "red spinel Myanmar"
 *
 * The output is a plain filter object the search page maps straight onto Prisma
 * `where` clauses. Anything the parser can't classify is kept as free-text so
 * we can still fuzzy-match on gem/rough IDs, customer names, etc.
 */

export type ParsedQuery = {
  gemTypes: string[];
  varieties: string[];
  origins: string[];
  colors: string[];
  treatments: string[];
  shapes: string[];
  minWeightCt: number | null;
  maxWeightCt: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  freeText: string;
  understood: boolean;
};

const GEM_TYPES = ["Sapphire","Ruby","Emerald","Spinel","Garnet","Tourmaline","Topaz","Aquamarine","Beryl","Zircon","Peridot","Tanzanite","Alexandrite","Chrysoberyl","Tsavorite"];
const VARIETIES = ["Blue Sapphire","Yellow Sapphire","Pink Sapphire","White Sapphire","Padparadscha","Star Sapphire","Red Spinel","Blue Spinel","Pink Spinel"];
const ORIGINS  = [
  { term: "sri lanka", canonical: "Sri Lanka" },
  { term: "ceylon", canonical: "Sri Lanka" },
  { term: "ratnapura", canonical: "Sri Lanka" },
  { term: "myanmar", canonical: "Myanmar" },
  { term: "burma", canonical: "Myanmar" },
  { term: "mogok", canonical: "Myanmar" },
  { term: "kashmir", canonical: "Kashmir" },
  { term: "madagascar", canonical: "Madagascar" },
  { term: "mozambique", canonical: "Mozambique" },
  { term: "colombia", canonical: "Colombia" },
  { term: "tanzania", canonical: "Tanzania" },
  { term: "thailand", canonical: "Thailand" },
];
const COLORS = ["blue","red","pink","yellow","green","orange","purple","white","royal blue","cornflower","padparadscha"];
const SHAPES = ["oval","cushion","round","pear","emerald cut","emerald","marquise","heart","trillion","radiant","princess"];
const TREATMENTS = [
  { term: "unheated", canonical: "Unheated" },
  { term: "no heat", canonical: "Unheated" },
  { term: "heat only", canonical: "Heat" },
  { term: "heated", canonical: "Heat" },
  { term: "oil only", canonical: "Oil only" },
];

export function parseQuery(raw: string): ParsedQuery {
  const original = raw.trim();
  const q = " " + original.toLowerCase() + " ";
  const out: ParsedQuery = {
    gemTypes: [], varieties: [], origins: [], colors: [], treatments: [], shapes: [],
    minWeightCt: null, maxWeightCt: null, minPrice: null, maxPrice: null,
    freeText: original, understood: false,
  };
  let consumed = q;

  const eat = (needle: string) => {
    const idx = consumed.indexOf(needle.toLowerCase());
    if (idx < 0) return false;
    consumed = consumed.slice(0, idx) + " ".repeat(needle.length) + consumed.slice(idx + needle.length);
    return true;
  };

  // Varieties first (longest-first) — includes compound phrases like "blue sapphire".
  for (const v of [...VARIETIES].sort((a, b) => b.length - a.length)) {
    while (q.includes(` ${v.toLowerCase()} `) && !out.varieties.includes(v)) {
      out.varieties.push(v); eat(v);
      // Add the base gem type as well when obvious.
      const base = v.split(" ").pop()!;
      const baseCanonical = GEM_TYPES.find((g) => g.toLowerCase() === base.toLowerCase());
      if (baseCanonical && !out.gemTypes.includes(baseCanonical)) out.gemTypes.push(baseCanonical);
      break;
    }
  }

  // Gem types (plural handled by stripping trailing "s").
  for (const g of GEM_TYPES) {
    if (q.includes(` ${g.toLowerCase()} `) || q.includes(` ${g.toLowerCase()}s `)) {
      if (!out.gemTypes.includes(g)) out.gemTypes.push(g);
    }
  }

  // Origins.
  for (const o of ORIGINS) {
    if (q.includes(` ${o.term} `) && !out.origins.includes(o.canonical)) {
      out.origins.push(o.canonical);
    }
  }

  // Colors.
  for (const c of [...COLORS].sort((a, b) => b.length - a.length)) {
    if (q.includes(` ${c} `) && !out.colors.includes(c)) out.colors.push(c);
  }

  // Shapes.
  for (const s of SHAPES) {
    if (q.includes(` ${s} `) && !out.shapes.includes(s)) out.shapes.push(s);
  }

  // Treatments.
  for (const t of TREATMENTS) {
    if (q.includes(` ${t.term} `) && !out.treatments.includes(t.canonical)) out.treatments.push(t.canonical);
  }

  // Weight — "above 3ct", "over 3 ct", "under 5ct", "3-5 ct", "at least 4 ct".
  const wRange = q.match(/(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*(?:c|ct|carat|carats)/);
  if (wRange) {
    out.minWeightCt = parseFloat(wRange[1]);
    out.maxWeightCt = parseFloat(wRange[2]);
  } else {
    const wMin = q.match(/(?:above|over|at least|more than|>=|>|from|min(?:imum)?)\s+(\d+(?:\.\d+)?)\s*(?:c|ct|carat|carats)/);
    if (wMin) out.minWeightCt = parseFloat(wMin[1]);
    const wMax = q.match(/(?:under|below|at most|less than|<=|<|up to|max(?:imum)?)\s+(\d+(?:\.\d+)?)\s*(?:c|ct|carat|carats)/);
    if (wMax) out.maxWeightCt = parseFloat(wMax[1]);
    const wEq = q.match(/(\d+(?:\.\d+)?)\s*(?:c|ct|carat|carats)/);
    if (wEq && out.minWeightCt == null && out.maxWeightCt == null) {
      const n = parseFloat(wEq[1]);
      out.minWeightCt = n * 0.85;
      out.maxWeightCt = n * 1.15;
    }
  }

  // Price. We require either an explicit currency prefix ($ / USD / EUR / €)
  // OR a k/thousand/m/million suffix, so plain "3" in "3 ct" isn't misread as
  // three dollars.
  const priceUnit = (num: string, unit: string | undefined) => {
    let n = parseFloat(num.replace(/,/g, "."));
    if (unit) {
      const u = unit.toLowerCase();
      if (u === "k" || u === "thousand") n *= 1000;
      if (u === "m" || u === "million")  n *= 1_000_000;
    }
    return n;
  };
  const priceRe = String.raw`(?:(?:\$|usd\s*|eur\s*|€)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(k|thousand|m|million))\b`;
  const pMinRe = new RegExp(`(?:above|over|more than|>=|>|min(?:imum)?|from)\\s+` + priceRe, "i");
  const pMaxRe = new RegExp(`(?:under|below|less than|<=|<|up to|max(?:imum)?|to)\\s+` + priceRe, "i");
  const pMinM = q.match(pMinRe);
  if (pMinM) out.minPrice = priceUnit(pMinM[1] ?? pMinM[2], pMinM[3]);
  const pMaxM = q.match(pMaxRe);
  if (pMaxM) out.maxPrice = priceUnit(pMaxM[1] ?? pMaxM[2], pMaxM[3]);
  // Bare "$20k" or "20k" without a directional word — treat as maxPrice.
  if (out.maxPrice == null && out.minPrice == null) {
    const pBare = q.match(new RegExp(priceRe, "i"));
    if (pBare) out.maxPrice = priceUnit(pBare[1] ?? pBare[2], pBare[3]);
  }

  out.understood = out.gemTypes.length > 0 || out.varieties.length > 0 ||
    out.origins.length > 0 || out.colors.length > 0 || out.treatments.length > 0 ||
    out.shapes.length > 0 ||
    out.minWeightCt != null || out.maxWeightCt != null ||
    out.minPrice != null || out.maxPrice != null;

  return out;
}

/** Convert parsed query into a Prisma `where` object for the Gemstone model. */
export function toGemstoneWhere(p: ParsedQuery) {
  const where: Record<string, unknown> = {};
  const AND: Record<string, unknown>[] = [];

  if (p.gemTypes.length > 0) where.gemType = { in: p.gemTypes };
  if (p.varieties.length > 0) AND.push({ OR: p.varieties.map((v) => ({ variety: { contains: v } })) });
  if (p.origins.length > 0) where.origin = { in: p.origins };
  if (p.treatments.length > 0) AND.push({ OR: p.treatments.map((t) => ({ treatment: { contains: t } })) });
  if (p.colors.length > 0) AND.push({ OR: p.colors.map((c) => ({ colorDescription: { contains: c } })) });
  if (p.shapes.length > 0) AND.push({ OR: p.shapes.map((s) => ({ shape: { contains: s } })) });
  if (p.minWeightCt != null) AND.push({ weightCt: { gte: p.minWeightCt } });
  if (p.maxWeightCt != null) AND.push({ weightCt: { lte: p.maxWeightCt } });
  if (p.minPrice != null) AND.push({ askingPrice: { gte: p.minPrice } });
  if (p.maxPrice != null) AND.push({ askingPrice: { lte: p.maxPrice } });
  if (AND.length > 0) where.AND = AND;
  return where;
}
