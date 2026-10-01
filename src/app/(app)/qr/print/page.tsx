import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { renderQrSvg, publicVerifyUrl } from "@/lib/qr";
import { formatCarat } from "@/lib/utils";
import { SgsMark } from "@/components/brand/logo";
import { PrintTrigger } from "./print-trigger";

/**
 * Printable QR labels for gem boxes.
 *
 * Query params:
 *   - code=<one code>       — legacy single-label mode
 *   - codes=<c1,c2,c3,...>  — batch mode, N labels per sheet
 *   - kind=rough|gemstone   — decides which table to look up + URL shape
 *   - layout=sticker|sheet  — sticker = one label per print (60×40 mm),
 *                             sheet   = N labels on an A4 grid (default
 *                             when codes has more than one entry)
 *
 * Rough labels encode the internal /rough/<code> URL; gemstone labels
 * encode the public /verify/<code> URL so customers can scan the sticker
 * on the box and see the stone straight away.
 */
export default async function QrPrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    codes?: string;
    kind?: "gemstone" | "rough";
    layout?: "sticker" | "sheet";
  }>;
}) {
  await requireAuth();
  const sp = await searchParams;
  const kind = sp.kind ?? "gemstone";
  const codes = (sp.codes ?? sp.code ?? "")
    .split(",").map((c) => c.trim()).filter(Boolean);
  if (codes.length === 0) return notFound();

  const layout = sp.layout ?? (codes.length > 1 ? "sheet" : "sticker");

  const items = await Promise.all(codes.map(async (code) => {
    let name = code;
    let weight = "";
    let origin: string | null = null;
    let treatment: string | null = null;
    // For cut stones we also print the parent rough serial so a box label
    // shows the whole chain — box picker sees "SGS-G-… from SGS-R-…" at
    // a glance, no need to open the app.
    let fromRough: string | null = null;
    let cgiScore: number | null = null;
    let cgiBand: string | null = null;
    if (kind === "gemstone") {
      const g = await prisma.gemstone.findUnique({
        where: { code },
        include: {
          transformationsAsOutput: {
            select: { transformation: { select: { inputs: { select: { roughStone: { select: { code: true } } } } } } },
          },
        },
      });
      if (!g) return null;
      name = `${g.gemType}${g.variety ? ` · ${g.variety}` : ""}`;
      weight = formatCarat(Number(g.weightCt));
      origin = g.origin;
      treatment = g.treatment;
      fromRough = g.transformationsAsOutput[0]?.transformation.inputs[0]?.roughStone.code ?? null;
      cgiScore = g.cgiScore;
      cgiBand = g.cgiBand;
    } else {
      const r = await prisma.roughStone.findUnique({ where: { code } });
      if (!r) return null;
      name = `${r.gemType}${r.variety ? ` · ${r.variety}` : ""}`;
      weight = formatCarat(Number(r.weightCt));
      origin = r.origin;
      treatment = r.treatment;
    }
    const url = kind === "gemstone" ? publicVerifyUrl(code) : `/rough/${code}`;
    // A single QR is generated per label; CSS in the layout scales it into
    // whichever slot (sticker or sheet cell) it lands in.
    const svg = await renderQrSvg(url, { size: 240, margin: 1 });
    return { code, name, weight, origin, treatment, fromRough, cgiScore, cgiBand, svg };
  }));
  const valid = items.filter((i): i is NonNullable<typeof i> => i !== null);
  if (valid.length === 0) return notFound();

  return (
    <div className={layout === "sheet" ? "min-h-screen bg-secondary/30 p-6 print:p-0 print:bg-white" : "min-h-screen p-6 print:p-0"}>
      {/* @page rules force real physical dimensions no matter what paper the
          user's printer has loaded. Sticker mode also hides the app chrome. */}
      <style>{layout === "sticker"
        ? "@page { size: 60mm 40mm; margin: 2mm; } @media print { html, body { background: #fff; } }"
        : "@page { size: A4; margin: 8mm; } @media print { html, body { background: #fff; } }"}
      </style>

      <div className="fixed top-4 right-4 print:hidden">
        <PrintTrigger />
      </div>

      {layout === "sticker" ? (
        <div className="flex flex-col items-center gap-6 print:gap-0">
          {valid.map((it) => <Sticker key={it.code} {...it} />)}
        </div>
      ) : (
        <div className="mx-auto max-w-[210mm]">
          <div className="print:hidden mb-4 text-sm text-muted-foreground">
            {valid.length} label{valid.length === 1 ? "" : "s"} · A4 sheet · {kind === "gemstone" ? "public verify link" : "internal record"}
          </div>
          <div className="grid grid-cols-3 gap-2 print:gap-1">
            {valid.map((it) => <SheetCell key={it.code} {...it} />)}
          </div>
        </div>
      )}
    </div>
  );
}

type LabelInfo = {
  code: string;
  name: string;
  weight: string;
  origin: string | null;
  treatment: string | null;
  fromRough: string | null;
  cgiScore: number | null;
  cgiBand: string | null;
  svg: string;
};

const BAND_SHORT: Record<string, string> = {
  ELITE: "Elite",
  PREMIUM: "Premium",
  TRADE: "Trade",
  COMMERCIAL: "Commercial",
  ENTRY: "Entry",
};

function Sticker({ code, name, weight, origin, treatment, fromRough, cgiScore, cgiBand, svg }: LabelInfo) {
  // Fixed 26mm QR slot on the left; the right column is the full remaining
  // width so text never overlaps the code. The [&_svg] rule forces the QR
  // SVG to fill its box regardless of its intrinsic width.
  return (
    <div className="bg-white border border-black/10 rounded-md w-[56mm] h-[36mm] p-[2mm] flex items-center gap-[2mm] print:border-0 print:rounded-none">
      <div
        className="shrink-0 [&_svg]:block [&_svg]:w-full [&_svg]:h-full overflow-hidden"
        style={{ width: "26mm", height: "26mm" }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="flex-1 min-w-0 leading-tight overflow-hidden">
        <div className="flex items-center gap-1">
          <SgsMark size={9} />
          <div className="font-serif text-[6pt] text-sgs-teal-700 tracking-wide">SERENDIB</div>
        </div>
        <div className="font-mono text-[6pt] mt-[1mm] truncate">{code}</div>
        <div className="font-serif text-[9pt] leading-[1.1] mt-[0.5mm] truncate">{name}</div>
        <div className="text-[7pt] font-medium truncate">{weight}</div>
        {origin && <div className="text-[6pt] text-muted-foreground truncate">{origin}</div>}
        {treatment && (
          <div className="text-[6pt] font-medium text-sgs-purple-500 truncate">{treatment}</div>
        )}
        {cgiScore != null && cgiBand && (
          <div className="text-[6pt] font-semibold text-sgs-teal-700 truncate">
            CGI {cgiScore} · {BAND_SHORT[cgiBand] ?? cgiBand}
          </div>
        )}
        {fromRough && (
          <div className="text-[5.5pt] text-muted-foreground truncate">
            from <span className="font-mono">{fromRough}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SheetCell({ code, name, weight, origin, treatment, fromRough, cgiScore, cgiBand, svg }: LabelInfo) {
  return (
    <div className="bg-white border border-black/10 rounded p-2 flex items-center gap-2 break-inside-avoid print:rounded-none">
      <div
        className="shrink-0 [&_svg]:block [&_svg]:w-full [&_svg]:h-full overflow-hidden"
        style={{ width: "22mm", height: "22mm" }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="flex-1 min-w-0 leading-tight overflow-hidden">
        <div className="font-mono text-[6.5pt] truncate">{code}</div>
        <div className="font-serif text-[9pt] truncate">{name}</div>
        <div className="text-[7pt] truncate">{weight}{origin ? ` · ${origin}` : ""}</div>
        {treatment && (
          <div className="text-[6pt] font-medium text-sgs-purple-500 truncate">{treatment}</div>
        )}
        {cgiScore != null && cgiBand && (
          <div className="text-[6pt] font-semibold text-sgs-teal-700 truncate">
            CGI {cgiScore} · {BAND_SHORT[cgiBand] ?? cgiBand}
          </div>
        )}
        {fromRough && (
          <div className="text-[6pt] text-muted-foreground truncate">
            from <span className="font-mono">{fromRough}</span>
          </div>
        )}
      </div>
    </div>
  );
}
