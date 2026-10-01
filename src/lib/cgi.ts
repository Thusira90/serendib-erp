/**
 * Ceylon Gem Identity (CGI) — score every finished gemstone 0–100.
 *
 * Five pillars (weights total 100):
 *   Origin confidence           20
 *   Treatment status            20
 *   Quality (Color/Clarity/Cut/Carat)  40
 *   Certification strength      10
 *   Provenance traceability     10
 *
 * Equal weight between the "origin + no-heat" faction (40) and the
 * "quality" faction (40); cert + provenance (10 each) fine-tune the band.
 *
 * Bands: Elite 90+, Premium 75–89, Trade 60–74, Commercial 40–59, Entry <40.
 *
 * The grader fills dropdown bands on the gemstone (and the certificates /
 * rough lineage are read from the DB). Nothing in here is subjective — the
 * same inputs always give the same score, and recomputing is cheap enough
 * to run on every edit.
 */

// ─── Dropdown bands (what the grader picks on the form) ────────────────────

export const CGI_ORIGIN_BANDS = [
  { value: "CONFIRMED_TIER_A", label: "Confirmed · Tier-A lab", hint: "SSEF / Gübelin / GRS / GIA / AGL / Lotus origin report" },
  { value: "CONFIRMED_TIER_B", label: "Confirmed · GIC Colombo", hint: "GIC Colombo origin determination" },
  { value: "CONFIRMED_TIER_C", label: "Confirmed · Other lab",   hint: "NGJA or any other local lab" },
  { value: "DECLARED",         label: "Declared · no cert",      hint: "Supplier/seller declared, no lab confirmation" },
  { value: "UNKNOWN",          label: "Unknown",                 hint: "No origin data" },
] as const;
export type CgiOriginBand = (typeof CGI_ORIGIN_BANDS)[number]["value"];

export const CGI_TREATMENT_BANDS = [
  { value: "NO_HEAT_CERTIFIED", label: "No heat · certified",      hint: "Tier-A or B lab confirms unheated" },
  { value: "NO_HEAT_DECLARED",  label: "No heat · declared",       hint: "Declared unheated, no lab confirmation yet" },
  { value: "HEAT",              label: "Heated (traditional)",     hint: "Accepted heat treatment" },
  { value: "DIFFUSED",          label: "Diffused (Be / Ti)",       hint: "Beryllium or titanium diffusion — heavy penalty" },
  { value: "FILLED",            label: "Fracture / glass filled",  hint: "Clarity enhancement — heavy penalty" },
  { value: "UNKNOWN",           label: "Unknown",                  hint: "No treatment data" },
] as const;
export type CgiTreatmentBand = (typeof CGI_TREATMENT_BANDS)[number]["value"];

export const CGI_COLOR_BANDS = [
  { value: "PRIME",      label: "Prime",      hint: "World-class — Royal Blue / Pigeon Blood / Vivid Pad" },
  { value: "FINE",       label: "Fine",       hint: "Collector grade — strong saturation, open colour" },
  { value: "COMMERCIAL", label: "Commercial", hint: "Attractive but not top; typical market colour" },
  { value: "PALE_DARK",  label: "Pale / Dark",hint: "Washed out or inky — colour outside the sweet spot" },
  { value: "OFF",        label: "Off-colour", hint: "Grey, brown or muddy; low desirability" },
] as const;
export type CgiColorBand = (typeof CGI_COLOR_BANDS)[number]["value"];

export const CGI_CLARITY_BANDS = [
  { value: "LOUPE_CLEAN",       label: "Loupe clean",       hint: "No inclusions under 10× loupe" },
  { value: "EYE_CLEAN",         label: "Eye clean",         hint: "No inclusions to the unaided eye" },
  { value: "SLIGHTLY",          label: "Slightly included", hint: "Minor inclusions, no eye-visible impact on brilliance" },
  { value: "MODERATELY",        label: "Moderately included", hint: "Eye-visible inclusions, some impact" },
  { value: "HEAVILY",           label: "Heavily included",  hint: "Prominent inclusions, major impact on beauty" },
] as const;
export type CgiClarityBand = (typeof CGI_CLARITY_BANDS)[number]["value"];

export const CGI_CUT_BANDS = [
  { value: "EXCELLENT", label: "Excellent" },
  { value: "VERY_GOOD", label: "Very good" },
  { value: "GOOD",      label: "Good" },
  { value: "FAIR",      label: "Fair" },
  { value: "POOR",      label: "Poor" },
] as const;
export type CgiCutBand = (typeof CGI_CUT_BANDS)[number]["value"];

// ─── Scoring tables ────────────────────────────────────────────────────────

const ORIGIN_SCORE: Record<CgiOriginBand, number> = {
  CONFIRMED_TIER_A: 20,
  CONFIRMED_TIER_B: 15,
  CONFIRMED_TIER_C: 10,
  DECLARED:          7,
  UNKNOWN:           0,
};

const TREATMENT_SCORE: Record<CgiTreatmentBand, number> = {
  NO_HEAT_CERTIFIED: 20,
  NO_HEAT_DECLARED:  14,
  HEAT:              13,
  DIFFUSED:           4,
  FILLED:             2,
  UNKNOWN:            0,
};

// Quality is 40 points total — Color 20, Clarity 10, Cut 7, Carat 3.
const COLOR_SCORE: Record<CgiColorBand, number> = {
  PRIME:      20,
  FINE:       16,
  COMMERCIAL: 11,
  PALE_DARK:   6,
  OFF:         2,
};

const CLARITY_SCORE: Record<CgiClarityBand, number> = {
  LOUPE_CLEAN: 10,
  EYE_CLEAN:    8,
  SLIGHTLY:     6,
  MODERATELY:   3,
  HEAVILY:      1,
};

const CUT_SCORE: Record<CgiCutBand, number> = {
  EXCELLENT: 7,
  VERY_GOOD: 6,
  GOOD:      4,
  FAIR:      2,
  POOR:      1,
};

// Carat tier — bigger premium stones get the full 3, tiny melee gets 1.
function caratScore(weightCt: number): number {
  if (weightCt >= 10) return 3;
  if (weightCt >= 5)  return 2.5;
  if (weightCt >= 3)  return 2;
  if (weightCt >= 1)  return 1.5;
  return 1;
}

// ─── Lab tiers ─────────────────────────────────────────────────────────────

const TIER_A_LABS = new Set(
  ["ssef", "gubelin", "gübelin", "grs", "gia", "agl", "lotus"].map((s) => s.toLowerCase()),
);
const TIER_B_LABS = new Set(["gic", "gic colombo", "gic-colombo"].map((s) => s.toLowerCase()));

export type LabTier = "A" | "B" | "C" | "D";

export function tierForLab(labName: string | null | undefined): LabTier {
  if (!labName) return "D";
  const n = labName.toLowerCase().trim();
  if (!n) return "D";
  for (const key of TIER_A_LABS) if (n.includes(key)) return "A";
  for (const key of TIER_B_LABS) if (n.includes(key)) return "B";
  return "C";
}

const CERT_SCORE: Record<LabTier, number> = { A: 10, B: 7, C: 4, D: 0 };

// ─── Compute ───────────────────────────────────────────────────────────────

export interface CgiBreakdown {
  origin: number;
  treatment: number;
  quality: number;        // out of 40
  qualityColor: number;   // out of 20
  qualityClarity: number; // out of 10
  qualityCut: number;     // out of 7
  qualityCarat: number;   // out of 3
  certification: number;
  provenance: number;
}

export interface CgiInputs {
  weightCt: number;
  originBand?: CgiOriginBand | null;
  treatmentBand?: CgiTreatmentBand | null;
  colorBand?: CgiColorBand | null;
  clarityBand?: CgiClarityBand | null;
  cutBand?: CgiCutBand | null;
  // Highest lab tier the stone has been certified by (null = no cert).
  bestCertTier?: LabTier | null;
  // Provenance signals:
  hasParentRough?: boolean;      // transformation lineage back to a rough
  hasBillChain?: boolean;        // cost allocations exist (rough purchase + ops)
  hasRoughMedia?: boolean;       // media at ROUGH_INTAKE / PLANNING / PRE_CUT
  hasCuttingMedia?: boolean;     // media at CUTTING / POLISHING
  hasFinalMedia?: boolean;       // media at FINAL / CERTIFICATION / PACKAGING
}

export interface CgiResult {
  score: number;        // 0-100 integer
  band: CgiBand;
  breakdown: CgiBreakdown;
}

export const CGI_BANDS = ["ELITE", "PREMIUM", "TRADE", "COMMERCIAL", "ENTRY"] as const;
export type CgiBand = (typeof CGI_BANDS)[number];

export const CGI_BAND_LABEL: Record<CgiBand, string> = {
  ELITE:      "Elite",
  PREMIUM:    "Premium",
  TRADE:      "Trade",
  COMMERCIAL: "Commercial",
  ENTRY:      "Entry",
};

/** Tailwind-ready colour classes for the band chip. */
export const CGI_BAND_CLASSES: Record<CgiBand, string> = {
  ELITE:      "bg-amber-100 text-amber-900 ring-amber-300",
  PREMIUM:    "bg-emerald-100 text-emerald-900 ring-emerald-300",
  TRADE:      "bg-sky-100 text-sky-900 ring-sky-300",
  COMMERCIAL: "bg-slate-100 text-slate-800 ring-slate-300",
  ENTRY:      "bg-zinc-100 text-zinc-700 ring-zinc-300",
};

function bandFor(score: number): CgiBand {
  if (score >= 90) return "ELITE";
  if (score >= 75) return "PREMIUM";
  if (score >= 60) return "TRADE";
  if (score >= 40) return "COMMERCIAL";
  return "ENTRY";
}

export function computeCgi(inp: CgiInputs): CgiResult {
  const origin        = inp.originBand    ? ORIGIN_SCORE[inp.originBand]       : 0;
  const treatment     = inp.treatmentBand ? TREATMENT_SCORE[inp.treatmentBand] : 0;
  const qualityColor  = inp.colorBand     ? COLOR_SCORE[inp.colorBand]         : 0;
  const qualityClarity= inp.clarityBand   ? CLARITY_SCORE[inp.clarityBand]     : 0;
  const qualityCut    = inp.cutBand       ? CUT_SCORE[inp.cutBand]             : 0;
  const qualityCarat  = caratScore(inp.weightCt);
  const quality       = qualityColor + qualityClarity + qualityCut + qualityCarat;
  const certification = CERT_SCORE[inp.bestCertTier ?? "D"];

  // Provenance (10 pts total)
  //   genealogy link           → 4
  //   bill chain               → 2
  //   rough-stage media        → 1.5
  //   cutting-stage media      → 1.5
  //   final-stage media        → 1
  let provenance = 0;
  if (inp.hasParentRough)    provenance += 4;
  if (inp.hasBillChain)      provenance += 2;
  if (inp.hasRoughMedia)     provenance += 1.5;
  if (inp.hasCuttingMedia)   provenance += 1.5;
  if (inp.hasFinalMedia)     provenance += 1;
  provenance = Math.min(10, provenance);

  const raw = origin + treatment + quality + certification + provenance;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    score,
    band: bandFor(score),
    breakdown: {
      origin,
      treatment,
      quality,
      qualityColor,
      qualityClarity,
      qualityCut,
      qualityCarat,
      certification,
      provenance,
    },
  };
}

// ─── Explain helpers ───────────────────────────────────────────────────────

/** Short label for the "why this score" tooltip. */
export const CGI_PILLAR_LABEL = {
  origin:        "Origin",
  treatment:     "Treatment",
  quality:       "Quality",
  certification: "Certification",
  provenance:    "Provenance",
} as const;

export const CGI_PILLAR_MAX = {
  origin: 20,
  treatment: 20,
  quality: 40,
  certification: 10,
  provenance: 10,
} as const;
