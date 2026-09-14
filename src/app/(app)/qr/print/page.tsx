import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { renderQrSvg, publicVerifyUrl } from "@/lib/qr";
import { formatCarat } from "@/lib/utils";
import { SgsMark } from "@/components/brand/logo";
import { PrintTrigger } from "./print-trigger";

/**
 * Printable QR label sheet. Renders a single tag-sized card the user can print
 * to a sticker or paste inside a gemstone box. Uses browser print CSS.
 */
export default async function QrPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; kind?: "gemstone" | "rough" }>;
}) {
  await requireAuth();
  const sp = await searchParams;
  const code = sp.code;
  const kind = sp.kind ?? "gemstone";
  if (!code) return notFound();

  let label = code;
  let detail = "";
  if (kind === "gemstone") {
    const g = await prisma.gemstone.findUnique({ where: { code } });
    if (!g) return notFound();
    label = `${g.gemType}${g.variety ? ` · ${g.variety}` : ""}`;
    detail = `${formatCarat(Number(g.weightCt))}${g.origin ? ` · ${g.origin}` : ""}`;
  } else {
    const r = await prisma.roughStone.findUnique({ where: { code } });
    if (!r) return notFound();
    label = `${r.gemType}${r.variety ? ` · ${r.variety}` : ""}`;
    detail = `${formatCarat(Number(r.weightCt))}${r.origin ? ` · ${r.origin}` : ""}`;
  }

  const url = kind === "gemstone" ? publicVerifyUrl(code) : `/rough/${code}`;
  const svg = await renderQrSvg(url, { size: 240 });

  return (
    <div className="min-h-[600px] flex items-center justify-center p-6 print:p-0">
      <div className="bg-white rounded-xl border shadow-luxe p-6 w-[360px] print:shadow-none print:border">
        <div className="flex items-center gap-2 mb-4">
          <SgsMark size={24} />
          <div className="leading-tight">
            <div className="font-serif text-sm text-sgs-teal-700">Serendib</div>
            <div className="text-[8px] uppercase tracking-[0.22em] text-sgs-purple-500 -mt-0.5">Gemstones</div>
          </div>
        </div>
        <div className="grid place-items-center py-2">
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
        <div className="mt-3 text-center">
          <div className="font-mono text-xs">{code}</div>
          <div className="font-serif text-lg">{label}</div>
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
        <div className="mt-3 text-[10px] text-muted-foreground text-center">
          {kind === "gemstone" ? "Scan to verify this stone" : "Internal record"}
        </div>
      </div>
      <div className="fixed top-4 right-4 print:hidden"><PrintTrigger /></div>
    </div>
  );
}
