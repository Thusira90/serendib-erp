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
