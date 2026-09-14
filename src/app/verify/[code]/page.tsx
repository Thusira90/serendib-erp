import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatCarat, formatDate } from "@/lib/utils";
import { renderQrSvg, publicVerifyUrl } from "@/lib/qr";
import { SgsMark } from "@/components/brand/logo";
import { getCompanySettings } from "@/lib/company-settings";
import { Badge } from "@/components/ui/badge";
import { Award, Gem, Star, CheckCircle2 } from "lucide-react";
import Link from "next/link";

/**
 * Public verification page. UNAUTHENTICATED.
 * Deliberately narrow: name, weight, origin, treatment, cert, and approved media.
 * Never expose: cost, supplier, purchase price, customer, sale amount,
 * minimum price, margin, internal notes, private assets.
 */
export const metadata = { title: "Verify — Serendib Gemstones" };

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const gem = await prisma.gemstone.findUnique({
    where: { code },
    include: {
      certificates: {
        where: { status: "ISSUED" },
        orderBy: { issueDate: "desc" },
        include: { laboratory: true },
      },
      cgiProjects: {
        include: { versions: { where: { isMaster: true } } },
      },
      digitalAssets: {
        where: {
          isPrimary: true,
          kind: { in: ["FINISHED_PHOTO", "MACRO_PHOTO", "CATALOGUE_IMAGE"] },
        },
        take: 1,
      },
    },
  });
  if (!gem) return notFound();
  const company = await getCompanySettings();

  const masterCgi = gem.cgiProjects.flatMap((p) => p.versions).find((v) => v.isMaster);
  const heroImg = masterCgi?.renderUrl ?? gem.digitalAssets[0]?.url;
  const cert = gem.certificates[0];
  const qr = await renderQrSvg(publicVerifyUrl(gem.code));

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
          <div className="rounded-xl overflow-hidden border bg-white shadow-luxe">
            <div className="aspect-square bg-sgs-gradient relative">
              {heroImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroImg} alt={gem.code} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full grid place-items-center text-white/70">
                  <Gem className="h-16 w-16" />
                </div>
              )}
            </div>
            <div className="p-4 text-center">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Gem ID</div>
              <div className="font-mono text-lg">{gem.code}</div>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-sgs-purple-500">
              <CheckCircle2 className="h-4 w-4" /> Authenticated by Serendib Gemstones
            </div>
            <h1 className="font-serif text-4xl mt-2">{gem.gemType}{gem.variety ? ` · ${gem.variety}` : ""}</h1>
            <div className="text-lg text-muted-foreground mt-1">
              {formatCarat(Number(gem.weightCt))} · {gem.origin ?? "Origin undisclosed"}
              {gem.treatment ? ` · ${gem.treatment}` : ""}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <KV label="Type" value={gem.gemType} />
              <KV label="Variety" value={gem.variety ?? "—"} />
              <KV label="Species" value={gem.species ?? "—"} />
              <KV label="Origin" value={gem.origin ?? "—"} />
              <KV label="Treatment" value={gem.treatment ?? "—"} />
              <KV label="Weight" value={formatCarat(Number(gem.weightCt))} />
              <KV label="Dimensions" value={[gem.lengthMm, gem.widthMm, gem.depthMm].filter(Boolean).map(v => `${Number(v).toFixed(1)}mm`).join(" × ") || "—"} />
              <KV label="Shape / Cut" value={[gem.shape, gem.cut].filter(Boolean).join(" · ") || "—"} />
              <KV label="Colour" value={gem.colorDescription ?? "—"} span />
            </div>
          </div>
        </div>

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
              <KV label="Origin determination" value={cert.originDetermination ?? "—"} span />
              <KV label="Treatment determination" value={cert.treatmentDetermination ?? "—"} span />
              {cert.colorGrade && <KV label="Colour grade" value={cert.colorGrade} span />}
              {cert.documentUrl && (
                <div className="col-span-2">
                  <Link href={cert.documentUrl} target="_blank" className="text-sm text-sgs-teal-700 hover:underline">
                    View certificate document →
                  </Link>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="rounded-xl border bg-white p-6 shadow-luxe grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-sgs-purple-500" /> Scan to verify
            </div>
            <div className="font-serif text-lg mt-1">Anyone with the stone's ID can confirm it here.</div>
            <div className="text-sm text-muted-foreground mt-1">
              This QR code links to the exact page you are on now. Serendib Gemstones will publish the same details for as long as the stone exists.
            </div>
          </div>
          <div className="mx-auto sm:mx-0" dangerouslySetInnerHTML={{ __html: qr }} />
        </section>

        <footer className="text-xs text-muted-foreground text-center pt-8 border-t">
          <div>{company.legalName} · {[company.city, company.country].filter(Boolean).join(", ")}</div>
          {company.website && <div className="mt-0.5">{company.website}</div>}
          <div className="mt-1">This page shows the stone's identity only. Commercial information is not published here.</div>
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
