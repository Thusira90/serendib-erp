// Pure definitions (safe for server and client): what a QR scan can show, per stone kind.
// The values are switches an admin sets on the QR page; the public pages obey them.

export type QrKind = "ROUGH" | "GEMSTONE";

export type QrFieldDef = {
  key: string;
  label: string;
  hint?: string;
  group: string;
  /** Used until an admin saves a choice. Matches what the public pages showed before this setting existed. */
  default: boolean;
};

export const QR_KINDS: Array<{ kind: QrKind; title: string; blurb: string }> = [
  {
    kind: "GEMSTONE",
    title: "Cut & polished stones",
    blurb: "Shown when someone scans a cut stone's QR code: the public /verify page.",
  },
  {
    kind: "ROUGH",
    title: "Rough stones",
    blurb: "Shown when someone scans a rough stone's QR code. Purchase price, supplier, mine and location are never shown.",
  },
];

export const QR_FIELDS: Record<QrKind, QrFieldDef[]> = {
  GEMSTONE: [
    { key: "stoneId", group: "The stone", label: "Stone ID", hint: "The SGS-G code printed on the label", default: true },
    { key: "name", group: "The stone", label: "Type & variety", hint: "e.g. Sapphire · Blue Sapphire", default: true },
    { key: "species", group: "The stone", label: "Species", default: true },
    { key: "weight", group: "The stone", label: "Weight (carats)", default: true },
    { key: "shapeCut", group: "The stone", label: "Shape & cut", default: true },
    { key: "dimensions", group: "The stone", label: "Dimensions", hint: "Length × width × depth in mm", default: true },
    { key: "colour", group: "Appearance", label: "Colour", default: true },
    { key: "clarity", group: "Appearance", label: "Clarity & transparency", default: false },
    { key: "finish", group: "Appearance", label: "Polish, symmetry, luster, fluorescence", default: false },
    { key: "inclusions", group: "Appearance", label: "Inclusions", default: false },
    { key: "origin", group: "Origin & treatment", label: "Origin", default: true },
    { key: "treatment", group: "Origin & treatment", label: "Treatment", hint: "Also hides the certificate's treatment line", default: true },
    { key: "provenance", group: "Origin & treatment", label: "Cut from our own rough", hint: "The parent rough's code and acquisition date", default: true },
    { key: "cgi", group: "Quality & certification", label: "Ceylon Gem Identity score", default: true },
    { key: "cgiBreakdown", group: "Quality & certification", label: "CGI score breakdown", hint: "Per-factor scores; these can hint at treatment and origin", default: true },
    { key: "certificate", group: "Quality & certification", label: "Certificate details", hint: "Laboratory, report number, type and issue date", default: true },
    { key: "certificateDocument", group: "Quality & certification", label: "Certificate document link", default: true },
    { key: "photos", group: "Pictures", label: "Photos", default: true },
    { key: "videos", group: "Pictures", label: "Videos", default: true },
    { key: "askingPrice", group: "Commercial", label: "Asking price", default: false },
    { key: "scanToVerify", group: "Page", label: "\"Scan to verify\" QR box", default: true },
  ],
  ROUGH: [
    { key: "stoneId", group: "The stone", label: "Stone ID", hint: "The SGS-R code printed on the label", default: true },
    { key: "name", group: "The stone", label: "Type & variety", default: true },
    { key: "species", group: "The stone", label: "Species", default: true },
    { key: "weight", group: "The stone", label: "Weight (carats)", default: true },
    { key: "dimensions", group: "The stone", label: "Dimensions", default: true },
    { key: "shape", group: "The stone", label: "Shape", default: true },
    { key: "colour", group: "Appearance", label: "Colour", default: true },
    { key: "clarity", group: "Appearance", label: "Clarity & transparency", default: true },
    { key: "surface", group: "Appearance", label: "Surface", default: true },
    { key: "inclusions", group: "Appearance", label: "Inclusions", default: true },
    { key: "origin", group: "Origin & treatment", label: "Origin", default: true },
    { key: "treatment", group: "Origin & treatment", label: "Treatment", default: true },
    { key: "photos", group: "Pictures", label: "Photos", default: true },
    { key: "videos", group: "Pictures", label: "Videos", default: true },
  ],
};

export const QR_PRESETS: Record<QrKind, Array<{ id: string; label: string; hint: string; keys: string[] }>> = {
  GEMSTONE: [
    { id: "minimal", label: "Minimal", hint: "ID, name, weight and pictures only", keys: ["stoneId", "name", "weight", "photos", "videos"] },
    {
      id: "exhibition", label: "Exhibition", hint: "Looks and quality, no treatment, certificate, size or price",
      keys: ["stoneId", "name", "weight", "shapeCut", "colour", "clarity", "origin", "cgi", "photos", "videos", "scanToVerify"],
    },
    {
      id: "full", label: "Full verification", hint: "Everything except the asking price",
      keys: QR_FIELDS.GEMSTONE.filter((f) => f.key !== "askingPrice").map((f) => f.key),
    },
  ],
  ROUGH: [
    { id: "minimal", label: "Minimal", hint: "ID, name, weight and pictures only", keys: ["stoneId", "name", "weight", "photos", "videos"] },
    {
      id: "exhibition", label: "Exhibition", hint: "Looks, no treatment or dimensions",
      keys: ["stoneId", "name", "weight", "colour", "clarity", "origin", "photos", "videos"],
    },
    { id: "full", label: "Full description", hint: "Everything available for rough", keys: QR_FIELDS.ROUGH.map((f) => f.key) },
  ],
};

export function defaultsFor(kind: QrKind): Record<string, boolean> {
  return Object.fromEntries(QR_FIELDS[kind].map((f) => [f.key, f.default]));
}

/** Only known keys, only real booleans; anything missing falls back to its default. */
export function normalizeFields(kind: QrKind, raw: unknown): Record<string, boolean> {
  const base = defaultsFor(kind);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;
  for (const key of Object.keys(base)) {
    if (typeof rec[key] === "boolean") base[key] = rec[key] as boolean;
  }
  return base;
}

export const isQrKind = (v: unknown): v is QrKind => v === "ROUGH" || v === "GEMSTONE";
