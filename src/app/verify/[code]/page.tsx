import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { renderQrSvg, publicVerifyUrl } from "@/lib/qr";
import { publicOrigin } from "@/lib/public-url";
import { isVideoAsset } from "@/lib/media";
import { getQrPolicy } from "@/lib/qr-policy";
import { StoneMediaViewer } from "@/components/stone-media-viewer";
import { RoughVerify } from "./rough-verify";
import { SgsMark } from "@/components/brand/logo";
import { getCompanySettings } from "@/lib/company-settings";
import { Badge } from "@/components/ui/badge";
import { Award, Star, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { CgiBadge, CgiBreakdownCard, CgiMethodologyCard } from "@/components/cgi-badge";

// Public verify pages change rarely (edits to a stone's identity are rare).
// Cache the rendered page for 60 seconds so repeat scans / shares are served
// from the CDN edge instead of round-tripping to Singapore every time.
// Saving the QR settings revalidates these pages straight away.
export const revalidate = 60;

/**
 * Public verification page. UNAUTHENTICATED.
 * What it shows is chosen on the QR codes settings page (see lib/qr-fields.ts);
 * every block below is gated on that policy, and hidden details are never sent.
 * Never expose, whatever the settings: cost, supplier, purchase price, customer,
 * sale amount, minimum price, margin, internal notes, private assets.
 */
export const metadata = { title: "Verify — Serendib Gemstones" };

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const gem = await prisma.gemstone.findUnique({
    where: { code },
    include: {
      transformationsAsOutput: {
        include: {
          transformation: {
            include: { inputs: { include: { roughStone: { select: { code: true, purchaseDate: true } } } } },
          },
        },
      },
      certificates: {
        where: { status: "ISSUED" },
        orderBy: { issueDate: "desc" },
        include: { laboratory: true },
      },
      cgiProjects: {
        include: { versions: { where: { isMaster: true } } },
      },
      digitalAssets: {
        where: { kind: { in: ["FINISHED_PHOTO", "MACRO_PHOTO", "CATALOGUE_IMAGE", "VIDEO"] } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        take: 24,
      },
    },
  });
  if (!gem) {
    // Rough stones share this address space (SGS-R-... labels); show their price-free profile.
    const rough = await prisma.roughStone.findUnique({
      where: { code },
      include: {
        digitalAssets: {
          where: { kind: { in: ["ROUGH_PHOTO", "MACRO_PHOTO", "INSPECTION_PHOTO", "CATALOGUE_IMAGE", "VIDEO"] } },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 24,
        },
      },
    });
    if (!rough) return notFound();
    const [company, show] = await Promise.all([getCompanySettings(), getQrPolicy("ROUGH")]);
    return <RoughVerify rough={rough} company={company} show={show} />;
  }
  const [company, show] = await Promise.all([getCompanySettings(), getQrPolicy("GEMSTONE")]);

  const masterCgi = gem.cgiProjects.flatMap((p) => p.versions).find((v) => v.isMaster);
  // Master CGI first, then photos, then videos; only what the settings allow, and never media an admin marked never-for-buyers.
  const shareable = gem.digitalAssets.filter((a) => a.partnerHidden !== true);
  const media = [
    ...(show.photos && masterCgi?.renderUrl ? [{ url: masterCgi.renderUrl, kind: "CGI_RENDER" }] : []),
    ...(show.photos ? shareable.filter((a) => !isVideoAsset(a)) : []),
    ...(show.videos ? shareable.filter(isVideoAsset) : []),
  ];
  const cert = show.certificate ? gem.certificates[0] : undefined;
  const qr = show.scanToVerify ? await renderQrSvg(publicVerifyUrl(gem.code, await publicOrigin())) : null;
  const parentRough = show.provenance ? gem.transformationsAsOutput[0]?.transformation.inputs[0]?.roughStone : undefined;

  const summary = [
    show.weight ? formatCarat(Number(gem.weightCt)) : null,
    show.origin ? (gem.origin ?? "Origin undisclosed") : null,
    show.treatment ? gem.treatment : null,
  ].filter(Boolean).join(" · ");

  const dims = [gem.lengthMm, gem.widthMm, gem.depthMm].filter(Boolean).map((v) => `${Number(v).toFixed(1)}mm`).join(" × ");
  const rows: React.ReactNode[] = [];
  if (show.name) {
    rows.push(<KV key="type" label="Type" value={gem.gemType} />);
    rows.push(<KV key="variety" label="Variety" value={gem.variety ?? "—"} />);
  }
  if (show.species) rows.push(<KV key="species" label="Species" value={gem.species ?? "—"} />);
  if (show.origin) rows.push(<KV key="origin" label="Origin" value={gem.origin ?? "—"} />);
  if (show.treatment) rows.push(<KV key="treatment" label="Treatment" value={gem.treatment ?? "—"} />);
  if (show.weight) rows.push(<KV key="weight" label="Weight" value={formatCarat(Number(gem.weightCt))} />);
  if (show.dimensions) rows.push(<KV key="dims" label="Dimensions" value={dims || "—"} />);
  if (show.shapeCut) rows.push(<KV key="shape" label="Shape / Cut" value={[gem.shape, gem.cut].filter(Boolean).join(" · ") || "—"} />);
  if (show.colour) rows.push(<KV key="colour" label="Colour" value={gem.colorDescription ?? "—"} span />);
  if (show.clarity) {
    rows.push(<KV key="clarity" label="Clarity" value={gem.clarity ?? "—"} />);
    rows.push(<KV key="transparency" label="Transparency" value={gem.transparency ?? "—"} />);
  }
  if (show.finish) {
    rows.push(<KV key="luster" label="Luster" value={gem.luster ?? "—"} />);
    rows.push(<KV key="fluor" label="Fluorescence" value={gem.fluorescence ?? "—"} />);
    rows.push(<KV key="symmetry" label="Symmetry" value={gem.symmetry ?? "—"} />);
    rows.push(<KV key="polish" label="Polish" value={gem.polish ?? "—"} />);
  }
  if (show.inclusions && gem.inclusions) rows.push(<KV key="inclusions" label="Inclusions" value={gem.inclusions} span />);
  if (show.askingPrice && gem.askingPrice != null) {
    rows.push(<KV key="price" label="Asking price" value={formatCurrency(Number(gem.askingPrice), gem.currency)} span />);
  }

  return (
    <div className="min-h-screen bg-sgs-bone">
      <header className="border-b bg-white">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SgsMark size={32} />
            <div className="leading-tight">
              <div className="font-serif text-lg tracking-tight text-sgs-teal-700">Serendib</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-sgs-purple-500 -mt-0.5">Gemstones</div>
            </div>
          </div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Public verification</div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-8">
          <div className="rounded-xl overflow-hidden border bg-white shadow-luxe self-start">
            <StoneMediaViewer items={media} alt={show.name ? gem.gemType : "Gemstone"} aspect="aspect-square" />
            {show.stoneId && (
              <div className="p-4 text-center">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Gem ID</div>
                <div className="font-mono text-lg">{gem.code}</div>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-sgs-purple-500">
              <CheckCircle2 className="h-4 w-4" /> Authenticated by Serendib Gemstones
            </div>
            <h1 className="font-serif text-4xl mt-2">
              {show.name ? `${gem.gemType}${gem.variety ? ` · ${gem.variety}` : ""}` : "Gemstone"}
            </h1>
            {summary && <div className="text-lg text-muted-foreground mt-1">{summary}</div>}
            {show.cgi && <div className="mt-3"><CgiBadge score={gem.cgiScore} band={gem.cgiBand} size="lg" /></div>}
            {parentRough && (
              <div className="text-sm text-muted-foreground mt-2 italic">
                Cut and polished by Serendib from our own rough{" "}
                <span className="font-mono not-italic text-sgs-teal-700">{parentRough.code}</span>
                {parentRough.purchaseDate && (
                  <> · acquired {formatDate(parentRough.purchaseDate)}</>
                )}
              </div>
            )}

            {rows.length > 0 && <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">{rows}</div>}
          </div>
        </div>

        {show.cgi && show.cgiBreakdown && gem.cgiScore != null && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CgiBreakdownCard
              score={gem.cgiScore}
              band={gem.cgiBand}
              breakdown={safeBreakdown(gem.cgiBreakdown)}
              title="This stone's Ceylon Gem Identity"
            />
            <CgiMethodologyCard />
          </section>
        )}

        {cert && (
          <section className="rounded-xl border bg-white p-6 shadow-luxe">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Award className="h-3.5 w-3.5 text-sgs-purple-500" />
                  <span>Independent laboratory certification</span>
                </div>
                <div className="font-serif text-xl mt-1">{cert.laboratory.name}</div>
                <div className="text-sm text-muted-foreground">
                  {cert.laboratory.country ?? ""}{cert.certificateNumber ? ` · Report ${cert.certificateNumber}` : ""}
                </div>
              </div>
              <Badge variant="success">Issued</Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <KV label="Type" value={cert.type} />
              <KV label="Issued" value={formatDate(cert.issueDate)} />
              {/* The lab's findings repeat the stone's origin, treatment and colour, so they follow those switches. */}
              {show.origin && <KV label="Origin determination" value={cert.originDetermination ?? "—"} span />}
              {show.treatment && <KV label="Treatment determination" value={cert.treatmentDetermination ?? "—"} span />}
              {show.colour && cert.colorGrade && <KV label="Colour grade" value={cert.colorGrade} span />}
              {show.certificateDocument && cert.documentUrl && (
                <div className="col-span-2">
                  <Link href={cert.documentUrl} target="_blank" className="text-sm text-sgs-teal-700 hover:underline">
                    View certificate document →
                  </Link>
                </div>
              )}
            </div>
          </section>
        )}

        {qr && (
          <section className="rounded-xl border bg-white p-6 shadow-luxe grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-sgs-purple-500" /> Scan to verify
              </div>
              <div className="font-serif text-lg mt-1">Anyone with the stone&apos;s ID can confirm it here.</div>
              <div className="text-sm text-muted-foreground mt-1">
                This QR code links to the exact page you are on now. Serendib Gemstones will publish the same details for as long as the stone exists.
              </div>
            </div>
            <div className="mx-auto sm:mx-0" dangerouslySetInnerHTML={{ __html: qr }} />
          </section>
        )}

        <footer className="text-xs text-muted-foreground text-center pt-8 border-t">
          <div>{company.legalName} · {[company.city, company.country].filter(Boolean).join(", ")}</div>
          {company.website && <div className="mt-0.5">{company.website}</div>}
          {!show.askingPrice && (
            <div className="mt-1">This page shows the stone&apos;s identity only. Commercial information is not published here.</div>
          )}
        </footer>
      </main>
    </div>
  );
}

function KV({ label, value, span = false }: { label: string; value: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
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
