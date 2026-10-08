import { SgsMark } from "@/components/brand/logo";
import { StoneMediaViewer } from "@/components/stone-media-viewer";
import { formatCarat } from "@/lib/utils";
import { isVideoAsset } from "@/lib/media";
import type { getCompanySettings } from "@/lib/company-settings";
import type { Prisma } from "@prisma/client";

type Rough = Prisma.RoughStoneGetPayload<{ include: { digitalAssets: true } }>;
type Company = Awaited<ReturnType<typeof getCompanySettings>>;

/**
 * Public profile of a rough stone, reached from its QR label. UNAUTHENTICATED.
 * `show` is the QR policy for rough stones (QR codes settings page). Whatever it
 * says, purchase price, valuation, supplier, mine/source, location and internal
 * notes are never published.
 */
export function RoughVerify({ rough, company, show }: { rough: Rough; company: Company; show: Record<string, boolean> }) {
  const shareable = rough.digitalAssets.filter((a) => a.partnerHidden !== true);
  const media = [
    ...(show.photos ? shareable.filter((a) => !isVideoAsset(a)) : []),
    ...(show.videos ? shareable.filter(isVideoAsset) : []),
  ];
  const dims = [rough.lengthMm, rough.widthMm, rough.heightMm]
    .filter((v) => v != null)
    .map((v) => `${Number(v).toFixed(1)} mm`)
    .join(" × ");
  const title = show.name ? `${rough.gemType}${rough.variety ? ` · ${rough.variety}` : ""}` : "Rough stone";
  const summary = [
    show.weight ? formatCarat(Number(rough.weightCt)) : null,
    show.origin ? (rough.origin ?? "Origin undisclosed") : null,
    show.treatment ? rough.treatment : null,
  ].filter(Boolean).join(" · ");

  const rows: React.ReactNode[] = [];
  if (show.name) {
    rows.push(<KV key="type" label="Type" value={rough.gemType} />);
    rows.push(<KV key="variety" label="Variety" value={rough.variety ?? "—"} />);
  }
  if (show.species) rows.push(<KV key="species" label="Species" value={rough.species ?? "—"} />);
  if (show.origin) rows.push(<KV key="origin" label="Origin" value={rough.origin ?? "—"} />);
  if (show.treatment) rows.push(<KV key="treatment" label="Treatment" value={rough.treatment ?? "—"} />);
  if (show.weight) rows.push(<KV key="weight" label="Weight" value={formatCarat(Number(rough.weightCt))} />);
  if (show.dimensions) rows.push(<KV key="dims" label="Dimensions" value={dims || "—"} />);
  if (show.shape) rows.push(<KV key="shape" label="Shape" value={rough.shape ?? "—"} />);
  if (show.colour) rows.push(<KV key="colour" label="Colour" value={rough.color ?? "—"} />);
  if (show.clarity) {
    rows.push(<KV key="transparency" label="Transparency" value={rough.transparency ?? "—"} />);
    rows.push(<KV key="clarity" label="Clarity" value={rough.clarity ?? "—"} />);
  }
  if (show.surface && rough.surface) rows.push(<KV key="surface" label="Surface" value={rough.surface} />);
  if (show.inclusions && rough.inclusions) rows.push(<KV key="inclusions" label="Inclusions" value={rough.inclusions} span />);

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
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Stone record</div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-8">
          <div className="rounded-xl overflow-hidden border bg-white shadow-luxe self-start">
            <StoneMediaViewer items={media} alt={show.name ? rough.gemType : "Rough stone"} aspect="aspect-square" />
            {show.stoneId && (
              <div className="p-4 text-center">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Rough ID</div>
                <div className="font-mono text-lg">{rough.code}</div>
              </div>
            )}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-sgs-purple-500">Rough stone</div>
            <h1 className="font-serif text-4xl mt-2">{title}</h1>
            {summary && <div className="text-lg text-muted-foreground mt-1">{summary}</div>}
            {rows.length > 0 && <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">{rows}</div>}
          </div>
        </div>

        <footer className="text-xs text-muted-foreground text-center pt-8 border-t">
          <div>{company.legalName} · {[company.city, company.country].filter(Boolean).join(", ")}</div>
          {company.website && <div className="mt-0.5">{company.website}</div>}
          <div className="mt-1">This page shows the stone&apos;s identity only. Commercial information is not published here.</div>
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
