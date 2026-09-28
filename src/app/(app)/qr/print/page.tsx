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
    let label = code;
    let detail = "";
    if (kind === "gemstone") {
      const g = await prisma.gemstone.findUnique({ where: { code } });
      if (!g) return null;
      label = `${g.gemType}${g.variety ? ` · ${g.variety}` : ""}`;
      detail = `${formatCarat(Number(g.weightCt))}${g.origin ? ` · ${g.origin}` : ""}`;
    } else {
      const r = await prisma.roughStone.findUnique({ where: { code } });
      if (!r) return null;
      label = `${r.gemType}${r.variety ? ` · ${r.variety}` : ""}`;
      detail = `${formatCarat(Number(r.weightCt))}${r.origin ? ` · ${r.origin}` : ""}`;
    }
    const url = kind === "gemstone" ? publicVerifyUrl(code) : `/rough/${code}`;
    // Smaller QR for sheet layout to stay legible in a small cell.
    const svg = await renderQrSvg(url, { size: layout === "sheet" ? 140 : 200, margin: 1 });
    return { code, label, detail, svg };
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
          {valid.map((it) => <Sticker key={it.code} {...it} kind={kind} />)}
        </div>
      ) : (
        <div className="mx-auto max-w-[210mm]">
          <div className="print:hidden mb-4 text-sm text-muted-foreground">
            {valid.length} label{valid.length === 1 ? "" : "s"} · A4 sheet · {kind === "gemstone" ? "public verify link" : "internal record"}
          </div>
          <div className="grid grid-cols-3 gap-2 print:gap-1">
            {valid.map((it) => <SheetCell key={it.code} {...it} kind={kind} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function Sticker({
  code, label, detail, svg, kind,
}: {
  code: string; label: string; detail: string; svg: string; kind: "rough" | "gemstone";
}) {
  return (
    // Sized to match @page 60×40 mm, minus the 2 mm safety margin.
    <div className="bg-white border border-black/10 rounded-md w-[56mm] h-[36mm] p-[2mm] flex items-center gap-[2mm] print:border-0 print:rounded-none">
      <div
        className="shrink-0"
        style={{ width: "32mm", height: "32mm" }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="flex-1 min-w-0 leading-tight">
        <div className="flex items-center gap-1">
          <SgsMark size={10} />
          <div className="font-serif text-[7pt] text-sgs-teal-700">Serendib</div>
        </div>
        <div className="font-mono text-[7pt] mt-0.5 truncate">{code}</div>
        <div className="font-serif text-[9pt] truncate">{label}</div>
        <div className="text-[6pt] text-muted-foreground truncate">{detail}</div>
        <div className="text-[5.5pt] text-muted-foreground mt-0.5 truncate">
          {kind === "gemstone" ? "scan → /verify/" : "scan → /rough/"}{code}
        </div>
      </div>
    </div>
  );
}

function SheetCell({
  code, label, detail, svg,
}: {
  code: string; label: string; detail: string; svg: string; kind: "rough" | "gemstone";
}) {
  return (
    <div className="bg-white border border-black/10 rounded p-2 flex items-center gap-2 break-inside-avoid print:rounded-none">
      <div
        className="shrink-0"
        style={{ width: "22mm", height: "22mm" }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="flex-1 min-w-0 leading-tight">
        <div className="font-mono text-[7pt] truncate">{code}</div>
        <div className="font-serif text-[9pt] truncate">{label}</div>
        <div className="text-[6.5pt] text-muted-foreground truncate">{detail}</div>
      </div>
    </div>
  );
}
