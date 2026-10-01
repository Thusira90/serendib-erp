import { CGI_BAND_CLASSES, CGI_BAND_LABEL, type CgiBand } from "@/lib/cgi";

/**
 * Compact CGI chip — "CGI 86 · Premium". Used in list columns, QR labels,
 * share cards and anywhere a one-line summary is enough.
 */
export function CgiBadge({
  score, band, size = "md",
}: {
  score: number | null | undefined;
  band: string | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  if (score == null || !band) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed text-[11px] text-muted-foreground">
        CGI — not graded
      </span>
    );
  }
  const b = band as CgiBand;
  const cls = CGI_BAND_CLASSES[b] ?? "bg-slate-100 text-slate-800 ring-slate-300";
  const label = CGI_BAND_LABEL[b] ?? band;
  const sizeCls =
    size === "lg" ? "text-sm px-3 py-1" :
    size === "sm" ? "text-[10px] px-1.5 py-0.5" :
    "text-xs px-2 py-0.5";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ring-1 ${cls} ${sizeCls} font-medium`} title={`Ceylon Gem Identity · ${score}/100 · ${label}`}>
      <span className="opacity-70">CGI</span>
      <span className="num">{score}</span>
      <span className="opacity-70">·</span>
      <span>{label}</span>
    </span>
  );
}

/**
 * Full breakdown card — origin / treatment / quality / cert / provenance
 * sub-scores with inline bars. Shown on the gemstone detail page and on
 * public share pages (admin + broker modes alike — same stone, same identity).
 */
export function CgiBreakdownCard({
  score, band, breakdown, title = "Ceylon Gem Identity",
}: {
  score: number | null;
  band: string | null;
  breakdown: Partial<{
    origin: number; treatment: number;
    quality: number; qualityColor: number; qualityClarity: number; qualityCut: number; qualityCarat: number;
    certification: number; provenance: number;
  }> | null;
  title?: string;
}) {
  if (score == null || !band) {
    return (
      <div className="rounded-lg border bg-background p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Not graded yet. Pick origin, treatment and quality bands on this stone and the score will compute automatically.
        </div>
      </div>
    );
  }
  const b = band as CgiBand;
  const cls = CGI_BAND_CLASSES[b] ?? "bg-slate-100 text-slate-800 ring-slate-300";
  const rows: Array<[string, number, number]> = [
    ["Origin confidence",    breakdown?.origin        ?? 0, 20],
    ["Treatment status",     breakdown?.treatment     ?? 0, 20],
    ["Quality (4Cs)",        breakdown?.quality       ?? 0, 40],
    ["Certification",        breakdown?.certification ?? 0, 10],
    ["Provenance",           breakdown?.provenance    ?? 0, 10],
  ];
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-serif text-4xl num">{score}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
        </div>
        <span className={`inline-flex items-center rounded-full ring-1 px-3 py-1 text-sm font-medium ${cls}`}>
          {CGI_BAND_LABEL[b] ?? band}
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        {rows.map(([label, val, max]) => (
          <div key={label} className="space-y-1">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{label}</span>
              <span className="num">{val.toFixed(val % 1 ? 1 : 0)} / {max}</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-sgs-teal-600"
                style={{ width: `${Math.min(100, (val / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t text-[11px] text-muted-foreground leading-relaxed">
        Ceylon Gem Identity — a Serendib score that rolls up origin confidence, treatment, grading, certification and traceability. Recomputed on every edit.
      </div>
    </div>
  );
}

/**
 * Explainer card — how the CGI score works. Used on public pages so
 * buyers understand what the number means. Pairs with CgiBreakdownCard
 * (which shows THIS stone's sub-scores) to give the full picture.
 */
export function CgiMethodologyCard() {
  const pillars: Array<[string, number, string]> = [
    ["Origin confidence",      20, "How solidly the origin is proven. Tier-A lab (SSEF, Gübelin, GRS, GIA, AGL, Lotus) = full points. GIC Colombo = next. Other labs or declared-only = less. No data = zero."],
    ["Treatment status",       20, "No-heat with a lab report wins. Declared no-heat next. Traditional heat is accepted but scored lower. Diffusion / fracture-fill carry a heavy penalty."],
    ["Quality (4Cs)",          40, "Colour (20), clarity (10), cut (7), carat tier (3). Colour dominates — Ceylon sapphires live or die by it."],
    ["Certification strength", 10, "The highest lab tier that has issued a report for this stone."],
    ["Provenance traceability",10, "Reward stones with the full chain documented: parent rough, bill history, and photos at every stage from intake through final polish."],
  ];
  const bands: Array<[string, string, string]> = [
    ["Elite",      "90–100", "bg-amber-100 text-amber-900 ring-amber-300"],
    ["Premium",    "75–89",  "bg-emerald-100 text-emerald-900 ring-emerald-300"],
    ["Trade",      "60–74",  "bg-sky-100 text-sky-900 ring-sky-300"],
    ["Commercial", "40–59",  "bg-slate-100 text-slate-800 ring-slate-300"],
    ["Entry",      "0–39",   "bg-zinc-100 text-zinc-700 ring-zinc-300"],
  ];
  return (
    <div className="rounded-lg border bg-background p-5">
      <div className="text-[10px] uppercase tracking-widest text-sgs-purple-500">How CGI works</div>
      <h3 className="font-serif text-xl mt-1">Ceylon Gem Identity — the scoring behind the number</h3>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
        Every finished stone in our vault is scored out of 100 across five pillars. The score is deterministic — same inputs, same number — and recomputes automatically whenever a grade, treatment, origin band or certificate changes. There is no subjective slider.
      </p>

      <div className="mt-4 space-y-3">
        {pillars.map(([name, weight, blurb]) => (
          <div key={name} className="grid grid-cols-[auto_1fr] gap-x-4 items-start">
            <div className="w-16 shrink-0">
              <div className="text-xs font-semibold">{name.split(" ")[0]}</div>
              <div className="text-[11px] text-muted-foreground">{weight} pts</div>
            </div>
            <div className="text-sm text-muted-foreground leading-snug">
              <span className="text-foreground font-medium">{name}.</span> {blurb}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Bands</div>
        <div className="flex flex-wrap gap-2">
          {bands.map(([label, range, cls]) => (
            <span key={label} className={`inline-flex items-center gap-2 rounded-full ring-1 px-3 py-1 text-xs font-medium ${cls}`}>
              <span>{label}</span>
              <span className="opacity-70 num">{range}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t text-[11px] text-muted-foreground leading-relaxed">
        CGI is Serendib&apos;s own quality roll-up — a plain-English way to compare stones at a glance. It does not replace an independent laboratory report, which remains the authority on origin and treatment.
      </div>
    </div>
  );
}
