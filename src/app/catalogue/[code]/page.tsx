import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { Award, ArrowLeft } from "lucide-react";
import { renderQrSvg, publicVerifyUrl } from "@/lib/qr";
import { publicOrigin } from "@/lib/public-url";
import { Badge } from "@/components/ui/badge";
import { CgiBadge, CgiBreakdownCard, CgiMethodologyCard } from "@/components/cgi-badge";
import { StoneMediaViewer } from "@/components/stone-media-viewer";
import { isVideoAsset } from "@/lib/media";

export const metadata = { title: "Gemstone — Serendib Gemstones" };
// Public page — cache 60s so repeat views don't hit the DB.
export const revalidate = 60;

export default async function CatalogueDetail({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const g = await prisma.gemstone.findUnique({
    where: { code },
    include: {
      certificates: { where: { status: "ISSUED" }, orderBy: { issueDate: "desc" }, include: { laboratory: true } },
      cgiProjects: { include: { versions: { where: { isMaster: true } } } },
      digitalAssets: {
        where: { kind: { in: ["FINISHED_PHOTO", "MACRO_PHOTO", "CATALOGUE_IMAGE", "VIDEO"] } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
      },
    },
  });
  if (!g || g.status !== "AVAILABLE") return notFound();

  // Media an admin marked never-for-buyers stays off the page. Master CGI first, then photos, then videos.
  const shareable = g.digitalAssets.filter((a) => a.partnerHidden !== true);
  const master = g.cgiProjects.flatMap((p) => p.versions).find((v) => v.isMaster);
  const media = [
    ...(master?.renderUrl ? [{ url: master.renderUrl, kind: "CGI_RENDER" }] : []),
    ...shareable.filter((a) => !isVideoAsset(a)),
    ...shareable.filter(isVideoAsset),
  ];
  const cert = g.certificates[0];
  const qr = await renderQrSvg(publicVerifyUrl(g.code, await publicOrigin()), { size: 160 });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Link href="/catalogue" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to catalogue
        </Link>
        <Link href={`/verify/${g.code}`} target="_blank" rel="noreferrer" className="text-xs text-sgs-teal-700 hover:underline">Public verification page →</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-8">
        <div className="rounded-xl overflow-hidden border bg-white shadow-luxe self-start">
          <StoneMediaViewer items={media} alt={g.gemType} aspect="aspect-square" />
        </div>

        <div className="space-y-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-sgs-purple-500">{g.gemType}{g.variety ? ` · ${g.variety}` : ""}</div>
            <h1 className="font-serif text-4xl mt-2">{formatCarat(Number(g.weightCt))}</h1>
            <div className="text-sm text-muted-foreground mt-1 font-mono">{g.code}</div>
            <div className="text-sm mt-2">
              {[g.origin, g.treatment].filter(Boolean).join(" · ") || "—"}
            </div>
            <div className="mt-3"><CgiBadge score={g.cgiScore} band={g.cgiBand} size="lg" /></div>
          </div>

          {g.askingPrice != null && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Price on request</div>
              <div className="font-serif text-3xl num text-sgs-teal-700">{formatCurrency(Number(g.askingPrice), g.currency)}</div>
              {g.pricePerCt && <div className="text-xs text-muted-foreground">{formatCurrency(Number(g.pricePerCt), g.currency)} per carat</div>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm border-t border-b py-4">
            <KV label="Shape" value={g.shape ?? "—"} />
            <KV label="Cut" value={g.cut ?? "—"} />
            <KV label="Dimensions" value={[g.lengthMm, g.widthMm, g.depthMm].filter(Boolean).map(v => `${Number(v).toFixed(1)}mm`).join(" × ") || "—"} />
            <KV label="Colour" value={g.colorDescription ?? "—"} />
            <KV label="Clarity" value={g.clarity ?? "—"} />
            <KV label="Symmetry" value={g.symmetry ?? "—"} />
          </div>

          {cert && (
            <div className="rounded-md border bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Award className="h-3.5 w-3.5 text-sgs-purple-500" /> Independent certification
                  </div>
                  <div className="font-serif text-lg mt-1">{cert.laboratory.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {cert.certificateNumber ? `Report ${cert.certificateNumber}` : "—"}
                    {cert.issueDate && ` · issued ${formatDate(cert.issueDate)}`}
                  </div>
                </div>
                <Badge variant="success">Issued</Badge>
              </div>
              {cert.originDetermination && <div className="text-sm mt-2"><span className="text-muted-foreground">Origin:</span> {cert.originDetermination}</div>}
              {cert.treatmentDetermination && <div className="text-sm"><span className="text-muted-foreground">Treatment:</span> {cert.treatmentDetermination}</div>}
            </div>
          )}

          <div className="rounded-md border bg-white p-4 grid grid-cols-[1fr_auto] gap-3 items-center">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Interested?</div>
              <div className="text-sm mt-1">Email us at <a href={`mailto:sales@serendib.lk?subject=Enquiry%20about%20${g.code}`} className="text-sgs-teal-700 hover:underline">sales@serendib.lk</a> quoting <span className="font-mono">{g.code}</span>.</div>
              <div className="text-xs text-muted-foreground mt-1">We reply within one business day.</div>
            </div>
            <div dangerouslySetInnerHTML={{ __html: qr }} />
          </div>
        </div>
      </div>

      {g.cgiScore != null && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CgiBreakdownCard
            score={g.cgiScore}
            band={g.cgiBand}
            breakdown={safeBreakdown(g.cgiBreakdown)}
            title="This stone's Ceylon Gem Identity"
          />
          <CgiMethodologyCard />
        </section>
      )}
    </div>
  );
}

function safeBreakdown(json: string | null): Record<string, number> | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json);
    return typeof o === "object" && o ? (o as Record<string, number>) : null;
  } catch { return null; }
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
