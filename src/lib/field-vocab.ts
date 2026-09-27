import "server-only";
import { prisma } from "@/lib/db";

/**
 * Curated starter vocabulary for open-text fields. These are what a user
 * sees the very first time they open a form; the moment they save a new
 * value, the vocab loader picks it up from the DB and it appears alongside.
 *
 * Deliberately kept short — the goal is a nudge toward consistent spelling,
 * not an exhaustive list. Users type freely for anything not here.
 */
export const SEED_VOCAB: Record<string, string[]> = {
  "gemType": [
    "Sapphire","Ruby","Emerald","Spinel","Garnet","Tourmaline","Topaz","Aquamarine",
    "Zircon","Peridot","Tanzanite","Chrysoberyl","Alexandrite","Amethyst","Citrine",
    "Moonstone","Star Sapphire","Star Ruby","Cat's Eye",
  ],
  "variety": [
    "Blue Sapphire","Yellow Sapphire","Pink Sapphire","White Sapphire","Green Sapphire",
    "Padparadscha","Star Sapphire","Star Ruby","Pigeon Blood Ruby",
    "Colombian Emerald","Zambian Emerald","Mahenge Spinel","Cobalt Spinel",
    "Paraiba Tourmaline","Rubellite","Indicolite","Chrome Tourmaline",
    "Tsavorite","Demantoid","Rhodolite","Mandarin Garnet",
    "Imperial Topaz","London Blue Topaz","Swiss Blue Topaz",
    "Santa Maria Aquamarine","Chrysoberyl Cat's Eye","Alexandrite",
  ],
  "species": [
    "Corundum","Beryl","Spinel","Garnet","Tourmaline","Topaz","Chrysoberyl",
    "Zircon","Peridot","Quartz","Feldspar","Zoisite",
  ],
  "origin": [
    "Sri Lanka","Burma","Myanmar","Madagascar","Mozambique","Tanzania","Kenya",
    "Colombia","Zambia","Ethiopia","Brazil","Vietnam","Cambodia","Thailand",
    "Afghanistan","Pakistan","Russia","Australia","USA",
  ],
  "mineSource": [
    "Ratnapura","Elahera","Balangoda","Meetiyagoda","Kataragama","Kuruvita","Beruwala",
    "Mogok","Namya","Muzo","Chivor","Coscuez","Winza","Longido",
  ],
  "shape": [
    "Oval","Round","Cushion","Emerald","Pear","Marquise","Heart","Trillion",
    "Radiant","Princess","Baguette","Asscher","Rough","Sugarloaf","Cabochon","Freeform",
  ],
  "color": [
    "Royal Blue","Cornflower Blue","Vivid Blue","Deep Blue","Sky Blue",
    "Vivid Red","Pigeon Blood","Ruby Red","Pink","Padparadscha",
    "Green","Vivid Green","Yellow","Golden Yellow","Orange",
    "White","Colorless","Peach","Purple","Violet","Grey","Black","Multi-color",
  ],
  "transparency": ["Transparent","Semi-transparent","Translucent","Semi-translucent","Opaque"],
  "clarity": [
    "Loupe Clean","Eye Clean","Very Slightly Included","Slightly Included",
    "Moderately Included","Heavily Included","VVS","VS","SI",
  ],
  "cut": [
    "Brilliant","Step","Mixed","Cabochon","Rose","Table","Portuguese",
    "Fancy","Concave","Buff Top","Sugarloaf",
  ],
  "facetingStyle": [
    "Brilliant","Step Cut","Mixed Cut","Radiant","Portuguese","Modified Brilliant",
  ],
  "colorHue": ["Blue","Red","Green","Yellow","Orange","Pink","Purple","Violet","Grey","White","Brown","Black"],
  "colorTone": ["Very Light","Light","Medium Light","Medium","Medium Dark","Dark","Very Dark"],
  "colorSaturation": ["Grayish","Slightly Grayish","Moderately Strong","Strong","Vivid","Very Vivid"],
  "luster": ["Vitreous","Adamantine","Silky","Waxy","Resinous","Greasy","Pearly","Metallic"],
  "fluorescence": ["None","Faint","Weak","Moderate","Strong","Very Strong"],
  "symmetry": ["Excellent","Very Good","Good","Fair","Poor"],
  "polish":   ["Excellent","Very Good","Good","Fair","Poor"],
  "treatment": [
    "None","Heat","Heat-only","Beryllium","Diffusion","Fracture-filled",
    "Oil","Clarity Enhanced","Irradiated","Untreated",
  ],
  "surface": ["Smooth","Rough","Etched","Frosted","Fractured","Chipped"],
  "fractures": ["None","Minor","Moderate","Extensive","Healed","Open"],

  "country": [
    "Sri Lanka","India","Thailand","Singapore","Hong Kong","UAE","USA","UK","Switzerland",
    "France","Germany","Italy","Japan","China","Australia","Canada",
  ],
  "city": [
    "Colombo","Ratnapura","Kandy","Mumbai","Delhi","Bangkok","Chanthaburi","Hong Kong",
    "Dubai","Geneva","Idar-Oberstein","New York","Los Angeles","London","Tokyo","Singapore",
  ],
};

type ModelName =
  | "roughStone" | "gemstone" | "customer" | "supplier" | "parcel"
  | "cuttingJob" | "certificate" | "expense";

/**
 * Return distinct non-null values for the given (model, field) pairs,
 * merged with the seed vocabulary for the field's semantic key.
 *
 * `seedKey` lets multiple physical fields share one starter list — e.g.
 * both `roughStone.gemType` and `gemstone.gemType` use SEED_VOCAB.gemType.
 * If omitted, the field name itself is used.
 */
export async function getFieldVocabulary(
  entries: Array<{ model: ModelName; field: string; seedKey?: string }>,
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};

  await Promise.all(entries.map(async ({ model, field, seedKey }) => {
    const key = `${model}.${field}`;
    const seed = SEED_VOCAB[seedKey ?? field] ?? [];

    // Prisma dynamic access: table name → delegate.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[model];
    if (!delegate?.findMany) { result[key] = dedupe(seed); return; }

    try {
      const rows = await delegate.findMany({
        where: { [field]: { not: null } },
        select: { [field]: true },
        distinct: [field],
        take: 500,
      });
      const fromDb = rows
        .map((r: Record<string, unknown>) => r[field])
        .filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0);
      result[key] = dedupe([...fromDb, ...seed]);
    } catch {
      result[key] = dedupe(seed);
    }
  }));

  return result;
}

function dedupe(list: string[]): string[] {
  const map = new Map<string, string>();
  for (const v of list) {
    const key = v.trim().toLowerCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, v.trim());
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}
