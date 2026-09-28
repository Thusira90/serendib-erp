import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { getCompanySettings } from "@/lib/company-settings";
import { Gem, ShieldCheck, Clock3, MessageCircle, Mail, User as UserIcon, Building2 } from "lucide-react";
import { SgsLogo } from "@/components/brand/logo";

// Time-boxed customer-facing view. Never prerendered — expiry checks and
// view tracking must run on every request.
export const dynamic = "force-dynamic";
export const metadata = { title: "Serendib Gemstones" };

type Payload = {
  gemstoneCode?: string;
  gemstoneCodes?: string[];
  collectionShareCode?: string;
};

export default async function TimedSharePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await prisma.shareLink.findUnique({ where: { code } });
  if (!link) return notFound();

  const now = new Date();
  if (link.revokedAt || link.expiresAt < now) {
    return <ExpiredView expiresAt={link.expiresAt} revokedAt={link.revokedAt} />;
  }

  // Bump view counter (fire-and-forget; no need to block render).
  prisma.shareLink.update({
    where: { id: link.id },
    data: {
      viewCount: { increment: 1 },
      firstViewedAt: link.firstViewedAt ?? now,
      lastViewedAt: now,
    },
  }).catch(() => {});

  const payload: Payload = link.payload ? safeParse(link.payload) : {};
  const company = await getCompanySettings();

  // Resolve the stones this link points at, based on scope.
  const gemsQuery = {
    where: {
      status: "AVAILABLE" as const,
      ...(link.scope === "GEMSTONE" && payload.gemstoneCode ? { code: payload.gemstoneCode } : {}),
      ...(link.scope === "GEMSTONES" && payload.gemstoneCodes?.length ? { code: { in: payload.gemstoneCodes } } : {}),
      ...(link.scope === "COLLECTION" && payload.collectionShareCode
        ? { collectionItems: { some: { collection: { shareCode: payload.collectionShareCode } } } }
        : {}),
    },
    include: {
      digitalAssets: {
        where: { isPrimary: true, kind: { in: ["FINISHED_PHOTO", "MACRO_PHOTO", "CATALOGUE_IMAGE"] } },
        take: 1,
      },
      cgiProjects: { include: { versions: { where: { isMaster: true }, take: 1 } } },
      certificates: { where: { status: "ISSUED" }, include: { laboratory: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" as const },
    take: 200,
  };
  const gems = await prisma.gemstone.findMany(gemsQuery);

  // Choose which contact identity to show on the public page.
  const contact = link.brokerMode
    ? {
        kind: "broker" as const,
        name: link.brokerName ?? "Broker",
        company: link.brokerCompany,
        phone: link.brokerPhone,
        email: link.brokerEmail,
        photoUrl: null as string | null,
      }
    : {
        kind: "direct" as const,
        name: link.createdByName,
        company: null as string | null,
        phone: link.createdByPhone,
        email: link.createdByEmail,
        photoUrl: link.createdByPhotoUrl,
      };

  const minutesLeft = Math.max(0, Math.round((link.expiresAt.getTime() - now.getTime()) / 60_000));
  const isSingle = gems.length === 1 && link.scope === "GEMSTONE";
  const heroTitle = titleForScope(link.scope, gems.length, (company.tradingName ?? company.legalName));

  return (
    <div className="min-h-screen bg-secondary/20">
      {/* Ambient watermark — subtle diagonal repeating text to discourage
          screenshotting the imagery for reuse. Uses the company name and
          the viewer contact so the same asset is unique per link. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 select-none opacity-[0.05] text-foreground"
        style={{
          backgroundImage: `repeating-linear-gradient(-30deg, transparent 0 60px, currentColor 60px 61px)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 select-none flex flex-wrap items-center justify-around overflow-hidden text-[10px] text-foreground/[0.04] font-mono uppercase tracking-widest"
      >
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} className="p-6 whitespace-nowrap">
            {(company.tradingName ?? company.legalName)} · Confidential · for {contact.name} only · do not redistribute
          </span>
        ))}
      </div>

      <main
        className="relative z-10 max-w-5xl mx-auto p-6 sm:p-10"
        onContextMenu={undefined /* server-rendered; note applies via CSS below */}
      >
        {/* Header */}
        <header className="text-center mb-8">
          <div className="flex justify-center mb-4"><SgsLogo /></div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-sgs-purple-500 flex items-center justify-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            Prepared for you
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl mt-2">{heroTitle}</h1>
          {link.message && (
            <p className="text-sm text-muted-foreground mt-3 max-w-xl mx-auto italic">
              &ldquo;{link.message}&rdquo;
            </p>
          )}
          <div className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground bg-white/60 border rounded-full px-3 py-1">
            <Clock3 className="h-3 w-3" />
            Link expires {minutesLeft < 60 ? `in ${minutesLeft} minutes` : minutesLeft < 24 * 60 ? `in ${Math.round(minutesLeft / 60)} hours` : formatDate(link.expiresAt)}
          </div>
        </header>

        {/* Body */}
        {isSingle && gems[0] ? <SingleStone gem={gems[0]} /> : <StoneGrid gems={gems} />}

        {/* Sharer footer */}
        <section className="mt-12 rounded-xl border bg-white p-6">
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
            {contact.kind === "broker" ? "Shared through" : "Prepared by"}
          </div>
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-full bg-sgs-gradient text-white flex items-center justify-center overflow-hidden shrink-0">
              {contact.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={contact.photoUrl} alt={contact.name} className="h-full w-full object-cover" />
              ) : (
                (contact.kind === "broker" ? <Building2 className="h-6 w-6" /> : <UserIcon className="h-6 w-6" />)
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

        {/* Copyright / do-not-share notice */}
        <section className="mt-6 rounded-xl border bg-white/60 p-5 text-xs text-muted-foreground leading-relaxed">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-sgs-purple-500" />
            <div>
              <div className="font-medium text-foreground">Confidential — for your viewing only.</div>
              <p className="mt-1">
                This page was prepared privately for the intended recipient. Images, prices and stone details
                are the copyrighted property of {(company.tradingName ?? company.legalName)} and may not be downloaded, screenshotted,
                republished, forwarded or shared with any third party without written permission. The link
                is time-limited and access is logged. By opening this page you agree to these terms.
              </p>
              <div className="mt-2 text-[10px] font-mono opacity-70">
                © {new Date().getFullYear()} {(company.tradingName ?? company.legalName)}. Link {code} · viewed {link.viewCount + 1}
                {link.viewCount + 1 === 1 ? " time" : " times"}.
              </div>
            </div>
          </div>
        </section>

        <div className="text-center mt-6 text-[10px] text-muted-foreground uppercase tracking-[0.25em]">
          {(company.tradingName ?? company.legalName)}
        </div>
      </main>

      {/* CSS-only guards against casual copy/download of the imagery. Not a
          security boundary — anyone determined can still screenshot — but
          enough to discourage a casual "save image as" or drag-out. */}
      <style>{`
        main img { -webkit-user-drag: none; user-select: none; pointer-events: none; }
        main { -webkit-touch-callout: none; }
      `}</style>
    </div>
  );
}

function titleForScope(scope: string, count: number, companyName: string): string {
  if (scope === "GEMSTONE") return "A gemstone from our vault";
  if (scope === "COLLECTION") return "A curated collection for you";
  if (scope === "GEMSTONES") return `${count} stone${count === 1 ? "" : "s"} we picked for you`;
  return `${companyName} — available inventory`;
}

function safeParse(s: string): Payload {
  try { return JSON.parse(s); } catch { return {}; }
}

/* --------------------------------- Views --------------------------------- */

type Gem = Awaited<ReturnType<typeof prisma.gemstone.findMany>>[number] & {
  digitalAssets: { url: string }[];
  cgiProjects: { versions: { renderUrl: string | null; isMaster: boolean }[] }[];
  certificates: { laboratory: { name: string }; certificateNumber: string | null }[];
};

function SingleStone({ gem }: { gem: Gem }) {
  const cgi = gem.cgiProjects.flatMap((p) => p.versions).find((v) => v.isMaster);
  const hero = cgi?.renderUrl ?? gem.digitalAssets[0]?.url;
  const cert = gem.certificates[0];
  return (
    <div className="rounded-2xl overflow-hidden bg-white border shadow-luxe">
      <div className="aspect-[16/10] bg-sgs-gradient relative">
        {hero && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt={gem.code} className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
      <div className="p-8 space-y-5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-sgs-purple-500">{gem.gemType}{gem.variety ? ` · ${gem.variety}` : ""}</div>
          <h2 className="font-serif text-3xl mt-1">{formatCarat(Number(gem.weightCt))}</h2>
          <div className="text-sm text-muted-foreground mt-1">
            {gem.origin ?? "Origin undisclosed"}{gem.treatment ? ` · ${gem.treatment}` : ""}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {gem.shape && <KV label="Shape" value={gem.shape} />}
          {gem.cut && <KV label="Cut" value={gem.cut} />}
          {gem.colorDescription && <KV label="Colour" value={gem.colorDescription} span />}
          {gem.clarity && <KV label="Clarity" value={gem.clarity} />}
          {[gem.lengthMm, gem.widthMm, gem.depthMm].some(Boolean) && (
            <KV
              label="Dimensions"
              value={[gem.lengthMm, gem.widthMm, gem.depthMm].filter(Boolean).map((v) => `${Number(v).toFixed(1)}mm`).join(" × ")}
            />
          )}
          {cert && <KV label="Certification" value={`${cert.laboratory.name}${cert.certificateNumber ? ` · #${cert.certificateNumber}` : ""}`} span />}
        </div>

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

function StoneGrid({ gems }: { gems: Gem[] }) {
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
          <div key={g.id} className="rounded-xl overflow-hidden bg-white border">
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
            </div>
          </div>
        );
      })}
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

function ExpiredView({ expiresAt, revokedAt }: { expiresAt: Date; revokedAt: Date | null }) {
  return (
    <div className="min-h-screen bg-secondary/20 flex items-center justify-center p-6">
      <div className="max-w-md text-center bg-white border rounded-xl p-10">
        <div className="flex justify-center mb-4"><SgsLogo /></div>
        <div className="text-[11px] uppercase tracking-[0.3em] text-red-700">
          {revokedAt ? "Link revoked" : "Link expired"}
        </div>
        <h1 className="font-serif text-2xl mt-2">This share link is no longer active.</h1>
        <p className="text-sm text-muted-foreground mt-3">
          {revokedAt
            ? "The sender revoked access to this page."
            : `The link expired ${formatDate(expiresAt)}. Please ask the sender for a fresh one.`}
        </p>
        <div className="mt-6">
          <Link href="/catalogue" className="text-sm text-sgs-teal-700 hover:underline">
            Browse our public catalogue →
          </Link>
        </div>
      </div>
    </div>
  );
}
