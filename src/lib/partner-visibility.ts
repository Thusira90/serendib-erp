// Pure partner visibility model: 19 switches, 3 presets, fail-closed parsing and the forced/dependency rules (spec 6.1).
import type { EarnOn, ExplainLine, Method, Need } from "./partner-engine";

export interface PartnerVisibility {
  version: 1;
  stoneIdentity: boolean;
  stoneSpecs: boolean;
  provenance: boolean;
  timeline: boolean;
  media: boolean;
  processMedia: boolean;
  mediaCaptions: boolean;
  cgi: boolean;
  certificates: boolean;
  certificateFiles: boolean;
  askingPrice: boolean;
  salePrice: boolean;
  paymentsReceived: boolean;
  purchaseCost: boolean;
  costBreakdown: boolean;
  receipts: boolean;
  supplierIdentity: boolean;
  profitFigures: boolean;
  calculationDetail: boolean;
}
export type VisibilityKey = keyof Omit<PartnerVisibility, "version">;
export type VisibilityPreset = "FULL" | "STANDARD" | "MINIMAL";

export const VISIBILITY_KEYS: readonly VisibilityKey[] = [
  "stoneIdentity", "stoneSpecs", "provenance", "timeline", "media", "processMedia", "mediaCaptions", "cgi",
  "certificates", "certificateFiles", "askingPrice", "salePrice", "paymentsReceived", "purchaseCost",
  "costBreakdown", "receipts", "supplierIdentity", "profitFigures", "calculationDetail",
];

export const VISIBILITY_LABELS: Record<VisibilityKey, string> = {
  stoneIdentity: "Stone codes",
  stoneSpecs: "Stone specifications",
  provenance: "Provenance",
  timeline: "Activity timeline",
  media: "Photos and videos",
  processMedia: "Cutting process media",
  mediaCaptions: "Media captions",
  cgi: "CGI score",
  certificates: "Certificate details",
  certificateFiles: "Certificate documents",
  askingPrice: "Asking price",
  salePrice: "Sale price",
  paymentsReceived: "Buyer payments",
  purchaseCost: "Purchase cost",
  costBreakdown: "Cost breakdown",
  receipts: "Bill receipts",
  supplierIdentity: "Supplier name",
  profitFigures: "Profit figures",
  calculationDetail: "Step-by-step calculation",
};

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function build(on: (k: VisibilityKey) => boolean): PartnerVisibility {
  return {
    version: 1,
    stoneIdentity: on("stoneIdentity"),
    stoneSpecs: on("stoneSpecs"),
    provenance: on("provenance"),
    timeline: on("timeline"),
    media: on("media"),
    processMedia: on("processMedia"),
    mediaCaptions: on("mediaCaptions"),
    cgi: on("cgi"),
    certificates: on("certificates"),
    certificateFiles: on("certificateFiles"),
    askingPrice: on("askingPrice"),
    salePrice: on("salePrice"),
    paymentsReceived: on("paymentsReceived"),
    purchaseCost: on("purchaseCost"),
    costBreakdown: on("costBreakdown"),
    receipts: on("receipts"),
    supplierIdentity: on("supplierIdentity"),
    profitFigures: on("profitFigures"),
    calculationDetail: on("calculationDetail"),
  };
}

const NEVER_IN_STANDARD: readonly VisibilityKey[] = ["mediaCaptions", "certificateFiles", "receipts", "supplierIdentity"];
const ALWAYS_ON: readonly VisibilityKey[] = ["stoneSpecs", "timeline", "media", "cgi", "certificates"];

export const VISIBILITY_PRESETS: Record<VisibilityPreset, PartnerVisibility> = Object.freeze({
  FULL: Object.freeze(build(() => true)),
  STANDARD: Object.freeze(build((k) => !NEVER_IN_STANDARD.includes(k))),
  MINIMAL: Object.freeze(build((k) => ALWAYS_ON.includes(k))),
});

export const presetVisibility = (name: VisibilityPreset): PartnerVisibility => ({ ...VISIBILITY_PRESETS[name] });

/** BROKER and AGENT start from STANDARD; INVESTOR from FULL without supplier name, receipts and certificate files. */
export function defaultVisibilityForKind(kind: string): PartnerVisibility {
  if (kind !== "INVESTOR") return presetVisibility("STANDARD");
  const hidden: readonly VisibilityKey[] = ["supplierIdentity", "receipts", "certificateFiles"];
  return build((k) => !hidden.includes(k));
}

/** Fail closed: anything that is not strictly `true` is false, unknown keys are dropped, a wrong version yields all false. */
export function parseVisibility(raw: string | null | undefined): PartnerVisibility {
  const out = build(() => false);
  if (typeof raw !== "string") return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return out;
  const rec = parsed as Record<string, unknown>;
  if (!hasOwn(rec, "version") || rec.version !== 1) return out;
  for (const k of VISIBILITY_KEYS) {
    if (hasOwn(rec, k) && rec[k] === true) out[k] = true;
  }
  return out;
}

export const serializeVisibility = (v: PartnerVisibility): string => JSON.stringify(build((k) => v[k] === true));

export function presetOf(v: PartnerVisibility): VisibilityPreset | "CUSTOM" {
  for (const name of ["FULL", "STANDARD", "MINIMAL"] as const) {
    const p = VISIBILITY_PRESETS[name];
    if (VISIBILITY_KEYS.every((k) => (v[k] === true) === p[k])) return name;
  }
  return "CUSTOM";
}

export interface ForcedFlag { key: keyof PartnerVisibility; reason: string }

/** What the partner actually sees: raw switches plus the forced-on and dependency rules, each with its reason. */
export function normalizeVisibility(
  v: PartnerVisibility,
  method: Method,
  earnOn: EarnOn,
): { effective: PartnerVisibility; forced: ForcedFlag[] } {
  const e = build((k) => v[k] === true);
  const forced: ForcedFlag[] = [];
  const on = (key: VisibilityKey, reason: string) => {
    if (!e[key]) {
      e[key] = true;
      forced.push({ key, reason });
    }
  };
  const off = (key: VisibilityKey, reason: string) => {
    if (e[key]) {
      e[key] = false;
      forced.push({ key, reason });
    }
  };
  const profitBased = method === "PROFIT_SHARE" || method === "INVESTMENT";

  if (method === "SALE_COMMISSION") on("salePrice", "The commission divided by the rate would reveal the sale price.");
  if (profitBased) on("profitFigures", "The share divided by the rate would reveal the profit.");
  // The engine never computes a cost or profit for M2/M3, and a profit figure next to a visible price would reveal the cost.
  if (!profitBased) off("profitFigures", "Commission and fixed-fee deals have no cost or profit figures to show.");
  if (profitBased && e.salePrice) {
    const why = "With the sale price and the profit visible, the cost would follow from price minus profit.";
    on("purchaseCost", why);
    on("costBreakdown", why);
  }
  if (earnOn === "PAYMENT") {
    if (method === "INVESTMENT") {
      // The investor always sees capital returned and outstanding next to the invested amount, which is the paid fraction of a stone.
      on("paymentsReceived", "Capital returned and capital outstanding, set against the invested amount, would reveal how much the buyer has paid.");
    } else if (method === "FIXED_FEE" || e.salePrice) {
      on("paymentsReceived", "The amount divided by the rate and price (or by the fee) would reveal how much the buyer has paid.");
    }
  }
  if (e.receipts && !e.costBreakdown) off("receipts", "Receipts need the cost breakdown to be visible.");
  if (e.certificateFiles && !e.certificates) off("certificateFiles", "Certificate documents need the certificate details to be visible.");
  if (e.mediaCaptions && !e.media && !e.processMedia) off("mediaCaptions", "Captions need photos or process media to be visible.");
  return { effective: e, forced };
}

export interface VisibilityLocks {
  forcedOn: Partial<Record<VisibilityKey, string>>;
  forcedOff: Partial<Record<VisibilityKey, string>>;
}

/** Switches the admin cannot change right now, each with its reason; read from the current raw flags so a lock shows even when the switch is already on. */
export function visibilityLocks(v: PartnerVisibility, method: Method, earnOn: EarnOn): VisibilityLocks {
  const locks: VisibilityLocks = { forcedOn: {}, forcedOff: {} };
  for (const k of VISIBILITY_KEYS) {
    const asOff = normalizeVisibility({ ...v, [k]: false }, method, earnOn);
    if (asOff.effective[k]) locks.forcedOn[k] = asOff.forced.find((f) => f.key === k)?.reason ?? "";
    const asOn = normalizeVisibility({ ...v, [k]: true }, method, earnOn);
    if (!asOn.effective[k]) locks.forcedOff[k] = asOn.forced.find((f) => f.key === k)?.reason ?? "";
  }
  return locks;
}

export const NEED_FLAGS: Record<Need, (keyof PartnerVisibility)[]> = {
  salePrice: ["salePrice"],
  paymentsReceived: ["paymentsReceived"],
  purchaseCost: ["purchaseCost"],
  costBreakdown: ["costBreakdown"],
  profit: ["profitFigures"],
};

/** A line renders only when every flag it needs is on in the EFFECTIVE visibility. */
export const lineVisible = (line: ExplainLine, effective: PartnerVisibility): boolean =>
  line.needs.every((n) => NEED_FLAGS[n].every((k) => effective[k] === true));

/** The partner sees the step-by-step calculation only when every line of the bucket may be shown. */
export const linesVisible = (lines: ExplainLine[], effective: PartnerVisibility): boolean =>
  effective.calculationDetail === true && lines.every((l) => lineVisible(l, effective));

function needsMet(m: Method, e: PartnerVisibility, earnOn: EarnOn): boolean {
  const pay = earnOn !== "PAYMENT" || e.paymentsReceived;
  switch (m) {
    case "PROFIT_SHARE":
    case "INVESTMENT":
      return e.salePrice && e.purchaseCost && e.costBreakdown && pay;
    case "SALE_COMMISSION":
      return e.salePrice && pay;
    case "FIXED_FEE":
      return pay;
  }
}

/** True when the partner could reproduce their amount from what is visible (the calculationDetail switch is separate). */
export const explainable = (m: Method, v: PartnerVisibility, earnOn: EarnOn): boolean =>
  needsMet(m, normalizeVisibility(v, m, earnOn).effective, earnOn);

/** True when the calculation section is actually rendered for the partner. */
export function calculationVisible(m: Method, v: PartnerVisibility, earnOn: EarnOn): boolean {
  const e = normalizeVisibility(v, m, earnOn).effective;
  return e.calculationDetail && needsMet(m, e, earnOn);
}

/** Admin-only notes about what a configuration still lets the partner infer. Warnings, never blocks. */
export function disclosureWarnings(v: PartnerVisibility, m: Method, earnOn: EarnOn): string[] {
  const { effective: e, forced } = normalizeVisibility(v, m, earnOn);
  const w: string[] = [];
  if (e.receipts && !e.supplierIdentity) w.push("Receipts normally name the vendor, so the supplier may be identifiable.");
  if (e.purchaseCost && !e.supplierIdentity) w.push("The purchase cost together with the origin may identify the supplier.");
  if (e.certificateFiles) w.push("Certificate documents are already public via the verify page.");
  if (e.provenance) w.push("Provenance reveals the acquisition date.");
  if (e.mediaCaptions) w.push("Captions are free text and may contain names or prices.");
  if (e.stoneIdentity) {
    w.push(
      "Stone codes let the holder open the public verify and catalogue pages, which show the acquisition date and certificate, so provenance and certificate documents are not hard controls while codes are visible.",
    );
  }
  // M4 never gets here: normalizeVisibility forces its payment progress on under PAYMENT.
  if (!e.paymentsReceived && earnOn === "PAYMENT" && m === "PROFIT_SHARE") {
    w.push("Payments are hidden but the settled amounts still move with the buyer's payments.");
  }
  if ((m === "PROFIT_SHARE" || m === "INVESTMENT") && e.purchaseCost && e.costBreakdown && !e.salePrice) {
    w.push("Cost and profit are both visible, so the partner can add them to work out the sale price.");
  }
  for (const f of forced) {
    if (e[f.key as VisibilityKey] === true) w.push(`${VISIBILITY_LABELS[f.key as VisibilityKey]} cannot be hidden: ${f.reason}`);
  }
  return w;
}
