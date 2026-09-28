import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import type { getCompanySettings } from "@/lib/company-settings";
import { ShieldCheck, Clock3, MessageCircle, Mail, User as UserIcon, Gem } from "lucide-react";
import { SgsLogo } from "@/components/brand/logo";

/**
 * Shared parts of the /s/<code> customer-facing view. Both the index
 * page (whole scope) and the nested single-stone page reuse this so
 * branding, watermark, contact card and copyright stay consistent.
 */

export type ShareLinkRecord = Awaited<ReturnType<typeof prisma.shareLink.findUnique>>;
export type Company = Awaited<ReturnType<typeof getCompanySettings>>;

export type BrandTheme = {
  label: string;
  titleFallback: string;
  showSgsLogo: boolean;
  accent: string;
  accentIcon: string;
  pageBg: string;
};

export type Contact = {
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
};

export function resolveBrand(link: NonNullable<ShareLinkRecord>, company: Company): BrandTheme {
  if (link.brokerMode) {
    return {
      label: link.brokerCompany ?? link.brokerName ?? "Private inventory",
      titleFallback: "Available inventory",
      showSgsLogo: false,
      accent: "text-slate-700",
      accentIcon: "text-slate-500",
      pageBg: "bg-slate-50",
    };
  }
  return {
    label: company.tradingName ?? company.legalName,
    titleFallback: company.tradingName ?? company.legalName,
    showSgsLogo: true,
    accent: "text-sgs-purple-500",
    accentIcon: "text-sgs-purple-500",
    pageBg: "bg-secondary/20",
  };
}

export function resolveContact(link: NonNullable<ShareLinkRecord>): Contact {
  return link.brokerMode
    ? {
        name: link.brokerName ?? "Broker",
        company: link.brokerCompany,
        phone: link.brokerPhone,
        email: link.brokerEmail,
        photoUrl: null,
      }
    : {
        name: link.createdByName,
        company: null,
        phone: link.createdByPhone,
        email: link.createdByEmail,
        photoUrl: link.createdByPhotoUrl,
      };
}

export function Watermark({ label, forName }: { label: string; forName: string }) {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 select-none opacity-[0.05] text-foreground"
        style={{ backgroundImage: `repeating-linear-gradient(-30deg, transparent 0 60px, currentColor 60px 61px)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 select-none flex flex-wrap items-center justify-around overflow-hidden text-[10px] text-foreground/[0.04] font-mono uppercase tracking-widest"
      >
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} className="p-6 whitespace-nowrap">
            {label} · Confidential · for {forName} only · do not redistribute
          </span>
        ))}
      </div>
    </>
  );
}

export function ExpiryChip({ expiresAt, now = new Date() }: { expiresAt: Date; now?: Date }) {
  const minutesLeft = Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / 60_000));
  return (
    <div className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground bg-white/60 border rounded-full px-3 py-1">
      <Clock3 className="h-3 w-3" />
      Link expires {minutesLeft < 60 ? `in ${minutesLeft} minutes` : minutesLeft < 24 * 60 ? `in ${Math.round(minutesLeft / 60)} hours` : formatDate(expiresAt)}
    </div>
  );
}

export function BrandHeader({
  brand, link, showTitle, title,
}: {
  brand: BrandTheme;
  link: NonNullable<ShareLinkRecord>;
  showTitle: boolean;
  title: string;
}) {
  return (
    <header className="text-center mb-8">
      {brand.showSgsLogo ? (
        <div className="flex justify-center mb-4"><SgsLogo /></div>
      ) : (
        <div className="font-serif text-xl mb-4">{brand.label}</div>
      )}
      <div className={`text-[11px] uppercase tracking-[0.3em] ${brand.accent} flex items-center justify-center gap-2`}>
        <ShieldCheck className="h-3.5 w-3.5" />
        Prepared for you
      </div>
      {showTitle && <h1 className="font-serif text-3xl sm:text-4xl mt-2">{title}</h1>}
      {link.message && (
        <p className="text-sm text-muted-foreground mt-3 max-w-xl mx-auto italic">
          &ldquo;{link.message}&rdquo;
        </p>
      )}
      <ExpiryChip expiresAt={link.expiresAt} />
    </header>
  );
}

export function ContactFooter({ contact, isBroker }: { contact: Contact; isBroker: boolean }) {
  return (
    <section className="mt-12 rounded-xl border bg-white p-6">
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
        Prepared by
      </div>
      <div className="flex items-start gap-4">
        <div className={`h-14 w-14 rounded-full text-white flex items-center justify-center overflow-hidden shrink-0 ${isBroker ? "bg-slate-600" : "bg-sgs-gradient"}`}>
          {contact.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={contact.photoUrl} alt={contact.name} className="h-full w-full object-cover" />
          ) : (
            <UserIcon className="h-6 w-6" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-serif text-lg">{contact.name}</div>
          {contact.company && <div className="text-sm text-muted-foreground">{contact.company}</div>}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {contact.phone && (
              <a
                href={`https://wa.me/${contact.phone.replace(/[^\d]/g, "")}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-secondary"
              >
                <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp · {contact.phone}
              </a>
            )}
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-secondary"
              >
                <Mail className="h-3.5 w-3.5 text-sgs-teal-600" /> {contact.email}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function CopyrightNotice({
  brand, link, viewCount,
}: {
  brand: BrandTheme;
  link: NonNullable<ShareLinkRecord>;
  viewCount: number;
}) {
  return (
    <section className="mt-6 rounded-xl border bg-white/60 p-5 text-xs text-muted-foreground leading-relaxed">
      <div className="flex items-start gap-2">
        <ShieldCheck className={`h-4 w-4 shrink-0 mt-0.5 ${brand.accentIcon}`} />
        <div>
          <div className="font-medium text-foreground">Confidential — for your viewing only.</div>
          <p className="mt-1">
            This page was prepared privately for the intended recipient. Images, prices and stone details
            are proprietary and may not be downloaded, screenshotted, republished, forwarded or shared
            with any third party without written permission. The link is time-limited and access is
            logged. By opening this page you agree to these terms.
          </p>
          <div className="mt-2 text-[10px] font-mono opacity-70">
            © {new Date().getFullYear()} {brand.label}. Link {link.code} · viewed {viewCount}
            {viewCount === 1 ? " time" : " times"}.
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Stone views ------------------------------ */

export type Gem = Awaited<ReturnType<typeof prisma.gemstone.findMany>>[number] & {
  digitalAssets: { url: string }[];
  cgiProjects: { versions: { renderUrl: string | null; isMaster: boolean }[] }[];
  certificates: { laboratory: { name: string }; certificateNumber: string | null }[];
};

export type Rough = Awaited<ReturnType<typeof prisma.roughStone.findMany>>[number] & {
  digitalAssets: { url: string; contentType: string | null; kind: string; isPrimary: boolean }[];
};

/** True when the share link points at rough stones (single or many). */
export function isRoughScope(scope: string): boolean {
  return scope === "ROUGH" || scope === "ROUGHS";
}

/**
 * Full-fat single-stone profile — mirrors the internal detail page.
 * Used both for scope=GEMSTONE links AND when a viewer clicks a card
 * in a multi-stone share to open its full page.
 */
export function SingleStone({ gem }: { gem: Gem }) {
  const cgi = gem.cgiProjects.flatMap((p) => p.versions).find((v) => v.isMaster);
  const hero = cgi?.renderUrl ?? gem.digitalAssets[0]?.url;
  const cert = gem.certificates[0];
  const dims = [gem.lengthMm, gem.widthMm, gem.depthMm]
    .filter((v) => v != null)
    .map((v) => `${Number(v).toFixed(2)} mm`)
    .join(" × ");

  return (
    <div className="rounded-2xl overflow-hidden bg-white border shadow-luxe">
      <div className="aspect-[16/10] bg-sgs-gradient relative">
        {hero && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt={gem.code} className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
      <div className="p-8 space-y-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-sgs-purple-500">{gem.gemType}{gem.variety ? ` · ${gem.variety}` : ""}</div>
          <h2 className="font-serif text-3xl mt-1">{formatCarat(Number(gem.weightCt))}</h2>
          <div className="text-sm text-muted-foreground mt-1">
            {gem.origin ?? "Origin undisclosed"}{gem.treatment ? ` · ${gem.treatment}` : ""}
          </div>
        </div>

        <SpecSection title="Identity">
          <KV label="Species" value={gem.species ?? "—"} />
          <KV label="Origin" value={gem.origin ?? "—"} />
          <KV label="Treatment" value={gem.treatment ?? "—"} />
          <KV label="Treatment status" value={gem.treatmentStatus ?? "—"} />
        </SpecSection>

        <SpecSection title="Cut & measurements">
          <KV label="Weight" value={formatCarat(Number(gem.weightCt))} />
          <KV label="Dimensions" value={dims || "—"} />
          <KV label="Shape" value={gem.shape ?? "—"} />
          <KV label="Cut" value={gem.cut ?? "—"} />
          {gem.facetingStyle && <KV label="Faceting style" value={gem.facetingStyle} span />}
        </SpecSection>

        <SpecSection title="Colour & clarity">
          {gem.colorDescription && <KV label="Colour" value={gem.colorDescription} span />}
          <KV label="Hue" value={gem.colorHue ?? "—"} />
          <KV label="Tone" value={gem.colorTone ?? "—"} />
          <KV label="Saturation" value={gem.colorSaturation ?? "—"} />
          <KV label="Clarity" value={gem.clarity ?? "—"} />
          <KV label="Transparency" value={gem.transparency ?? "—"} />
          <KV label="Luster" value={gem.luster ?? "—"} />
          <KV label="Fluorescence" value={gem.fluorescence ?? "—"} />
          <KV label="Symmetry" value={gem.symmetry ?? "—"} />
          <KV label="Polish" value={gem.polish ?? "—"} />
          {gem.inclusions && <KV label="Inclusions" value={gem.inclusions} span />}
        </SpecSection>

        {cert && (
          <SpecSection title="Certification">
            <KV label="Laboratory" value={cert.laboratory.name} />
            {cert.certificateNumber && <KV label="Certificate no." value={cert.certificateNumber} />}
          </SpecSection>
        )}

        {gem.askingPrice != null && (
          <div className="pt-4 border-t flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Asking</span>
            <span className="font-serif text-2xl num">{formatCurrency(Number(gem.askingPrice), gem.currency)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Grid of cards. Each card is a link into /s/<code>/<gemCode> so the
 * recipient can open the full profile without leaving the share.
 */
export function StoneGrid({ gems, shareCode }: { gems: Gem[]; shareCode: string }) {
  if (gems.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-10 text-center text-sm text-muted-foreground">
        No available stones in this selection right now.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {gems.map((g) => {
        const cgi = g.cgiProjects.flatMap((p) => p.versions).find((v) => v.isMaster);
        const heroImg = cgi?.renderUrl ?? g.digitalAssets[0]?.url;
        return (
          <Link
            key={g.id}
            href={`/s/${shareCode}/${encodeURIComponent(g.code)}`}
            className="group rounded-xl overflow-hidden bg-white border block hover:shadow-luxe-lg transition-shadow"
          >
            <div className="aspect-square bg-sgs-gradient relative">
              {heroImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroImg} alt={g.code} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-white/80">
                  <Gem className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="p-4 space-y-1.5">
              <div className="text-[10px] uppercase tracking-widest text-sgs-purple-500">
                {g.gemType}{g.variety ? ` · ${g.variety}` : ""}
              </div>
              <div className="font-serif text-lg">{formatCarat(Number(g.weightCt))}</div>
              <div className="text-xs text-muted-foreground">
                {g.origin ?? "—"}{g.treatment ? ` · ${g.treatment}` : ""}
              </div>
              {g.askingPrice != null && (
                <div className="pt-2 border-t text-sm num font-medium">
                  {formatCurrency(Number(g.askingPrice), g.currency)}
                </div>
              )}
              <div className="text-[10px] text-sgs-teal-700 group-hover:underline">View full profile →</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function SpecSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">{title}</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">{children}</div>
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

export function titleForScope(scope: string, count: number, fallbackBrand: string): string {
  if (scope === "GEMSTONE") return "A gemstone from our vault";
  if (scope === "ROUGH") return "A rough stone from our vault";
  if (scope === "COLLECTION") return "A curated collection for you";
  if (scope === "GEMSTONES") return `${count} stone${count === 1 ? "" : "s"} we picked for you`;
  if (scope === "ROUGHS") return `${count} rough stone${count === 1 ? "" : "s"} we picked for you`;
  return `${fallbackBrand} — available inventory`;
}

export function safePayloadParse(s: string | null): {
  gemstoneCode?: string;
  gemstoneCodes?: string[];
  collectionShareCode?: string;
  roughCode?: string;
  roughCodes?: string[];
} {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}

/**
 * Build the where clause that scopes gemstone queries to a share link's
 * contents. Used both by the index and the single-stone routes.
 */
export function gemsWhereForLink(link: NonNullable<ShareLinkRecord>) {
  const payload = safePayloadParse(link.payload);
  return {
    status: "AVAILABLE" as const,
    ...(link.scope === "GEMSTONE" && payload.gemstoneCode ? { code: payload.gemstoneCode } : {}),
    ...(link.scope === "GEMSTONES" && payload.gemstoneCodes?.length ? { code: { in: payload.gemstoneCodes } } : {}),
    ...(link.scope === "COLLECTION" && payload.collectionShareCode
      ? { collectionItems: { some: { collection: { shareCode: payload.collectionShareCode } } } }
      : {}),
  };
}

/** Same as gemsWhereForLink but for the rough scopes. */
export function roughsWhereForLink(link: NonNullable<ShareLinkRecord>) {
  const payload = safePayloadParse(link.payload);
  return {
    ...(link.scope === "ROUGH" && payload.roughCode ? { code: payload.roughCode } : {}),
    ...(link.scope === "ROUGHS" && payload.roughCodes?.length ? { code: { in: payload.roughCodes } } : {}),
  };
}

/* ------------------------------ Rough views ------------------------------ */

/**
 * Full-fat single-rough profile — mirrors the internal detail page.
 * Rough shares deliberately omit purchase price (internal cost) and
 * show initialValuation instead when available, otherwise "Price on
 * request".
 */
export function SingleRoughStone({ rough }: { rough: Rough }) {
  const hero = rough.digitalAssets.find((a) => a.isPrimary)?.url ?? rough.digitalAssets[0]?.url;
  const dims = [rough.lengthMm, rough.widthMm, rough.heightMm]
    .filter((v) => v != null)
    .map((v) => `${Number(v).toFixed(2)} mm`)
    .join(" × ");
  const valuation = rough.initialValuation != null
    ? formatCurrency(Number(rough.initialValuation), rough.currency)
    : null;

  return (
    <div className="rounded-2xl overflow-hidden bg-white border shadow-luxe">
      <div className="aspect-[16/10] bg-sgs-gradient relative">
        {hero && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt={rough.code} className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
      <div className="p-8 space-y-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-sgs-purple-500">
            Rough · {rough.gemType}{rough.variety ? ` · ${rough.variety}` : ""}
          </div>
          <h2 className="font-serif text-3xl mt-1">{formatCarat(Number(rough.weightCt))}</h2>
          <div className="text-sm text-muted-foreground mt-1">
            {rough.origin ?? "Origin undisclosed"}
            {rough.mineSource ? ` · ${rough.mineSource}` : ""}
            {rough.treatment ? ` · ${rough.treatment}` : ""}
          </div>
        </div>

        <SpecSection title="Identity">
          <KV label="Species" value={rough.species ?? "—"} />
          <KV label="Origin" value={rough.origin ?? "—"} />
          <KV label="Mine / source" value={rough.mineSource ?? "—"} />
          <KV label="Treatment" value={rough.treatment ?? "—"} />
        </SpecSection>

        <SpecSection title="Physical characteristics">
          <KV label="Weight" value={formatCarat(Number(rough.weightCt))} />
          <KV label="Dimensions" value={dims || "—"} />
          <KV label="Shape" value={rough.shape ?? "—"} />
          <KV label="Colour" value={rough.color ?? "—"} />
          <KV label="Transparency" value={rough.transparency ?? "—"} />
          <KV label="Clarity" value={rough.clarity ?? "—"} />
          {rough.surface && <KV label="Surface" value={rough.surface} />}
          {rough.fractures && <KV label="Fractures" value={rough.fractures} />}
          {rough.inclusions && <KV label="Inclusions" value={rough.inclusions} span />}
        </SpecSection>

        {rough.observations && (
          <SpecSection title="Notes">
            <KV label="Observations" value={rough.observations} span />
          </SpecSection>
        )}

        <div className="pt-4 border-t flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            {valuation ? "Indicative valuation" : "Price"}
          </span>
          <span className="font-serif text-2xl num">
            {valuation ?? <span className="italic text-muted-foreground text-lg">On request</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Grid of rough cards; each links to /s/<code>/r/<roughCode>. */
export function RoughGrid({ roughs, shareCode }: { roughs: Rough[]; shareCode: string }) {
  if (roughs.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-10 text-center text-sm text-muted-foreground">
        No rough stones in this selection.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {roughs.map((r) => {
        const heroImg = r.digitalAssets.find((a) => a.isPrimary)?.url ?? r.digitalAssets[0]?.url;
        return (
          <Link
            key={r.id}
            href={`/s/${shareCode}/r/${encodeURIComponent(r.code)}`}
            className="group rounded-xl overflow-hidden bg-white border block hover:shadow-luxe-lg transition-shadow"
          >
            <div className="aspect-square bg-sgs-gradient relative">
              {heroImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroImg} alt={r.code} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-white/80">
                  <Gem className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="p-4 space-y-1.5">
              <div className="text-[10px] uppercase tracking-widest text-sgs-purple-500">
                Rough · {r.gemType}{r.variety ? ` · ${r.variety}` : ""}
              </div>
              <div className="font-serif text-lg">{formatCarat(Number(r.weightCt))}</div>
              <div className="text-xs text-muted-foreground">
                {r.origin ?? "—"}{r.treatment ? ` · ${r.treatment}` : ""}
              </div>
              <div className="text-[10px] text-sgs-teal-700 group-hover:underline">View full profile →</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
