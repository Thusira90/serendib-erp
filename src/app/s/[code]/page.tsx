import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCompanySettings } from "@/lib/company-settings";
import {
  resolveBrand, resolveContact, Watermark, BrandHeader, ContactFooter, CopyrightNotice,
  SingleStone, StoneGrid, SingleRoughStone, RoughGrid,
  titleForScope, gemsWhereForLink, roughsWhereForLink, isRoughScope,
} from "./shared";
import { ExpiredView } from "./expired";

export const dynamic = "force-dynamic";
export const metadata = { title: "Serendib Gemstones" };

export default async function TimedSharePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await prisma.shareLink.findUnique({ where: { code } });
  if (!link) return notFound();

  const now = new Date();
  if (link.revokedAt || link.expiresAt < now) {
    return <ExpiredView expiresAt={link.expiresAt} revokedAt={link.revokedAt} brokerMode={link.brokerMode} brandLabel={link.brokerCompany ?? link.brokerName ?? null} />;
  }

  // Fire-and-forget view counter.
  prisma.shareLink.update({
    where: { id: link.id },
    data: {
      viewCount: { increment: 1 },
      firstViewedAt: link.firstViewedAt ?? now,
      lastViewedAt: now,
    },
  }).catch(() => {});

  const company = await getCompanySettings();
  const brand = resolveBrand(link, company);
  const contact = resolveContact(link);

  // Branch on scope: rough-scoped links query rough stones, everything
  // else queries the finished-gemstone catalogue.
  const isRough = isRoughScope(link.scope);
  const [gems, roughs] = await Promise.all([
    isRough
      ? Promise.resolve([])
      : prisma.gemstone.findMany({
          where: gemsWhereForLink(link),
          include: {
            digitalAssets: {
              where: { isPrimary: true, kind: { in: ["FINISHED_PHOTO", "MACRO_PHOTO", "CATALOGUE_IMAGE"] } },
              take: 1,
            },
            cgiProjects: { include: { versions: { where: { isMaster: true }, take: 1 } } },
            certificates: { where: { status: "ISSUED" }, include: { laboratory: true }, take: 1 },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
    isRough
      ? prisma.roughStone.findMany({
          where: roughsWhereForLink(link),
          include: {
            digitalAssets: {
              where: { kind: { in: ["ROUGH_PHOTO", "MACRO_PHOTO", "INSPECTION_PHOTO", "CATALOGUE_IMAGE"] } },
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              take: 5,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : Promise.resolve([]),
  ]);

  const count = isRough ? roughs.length : gems.length;
  const isSingle = (link.scope === "GEMSTONE" && gems.length === 1)
                 || (link.scope === "ROUGH" && roughs.length === 1);
  const heroTitle = titleForScope(link.scope, count, brand.titleFallback);

  return (
    <div className={`min-h-screen ${brand.pageBg}`}>
      <Watermark label={brand.label} forName={contact.name} />

      <main className="relative z-10 max-w-5xl mx-auto p-6 sm:p-10">
        <BrandHeader brand={brand} link={link} showTitle title={heroTitle} />

        {isRough
          ? (isSingle && roughs[0]
              ? <SingleRoughStone rough={roughs[0]} />
              : <RoughGrid roughs={roughs} shareCode={link.code} />)
          : (isSingle && gems[0]
              ? <SingleStone gem={gems[0]} />
              : <StoneGrid gems={gems} shareCode={link.code} />)}

        <ContactFooter contact={contact} isBroker={link.brokerMode} />
        <CopyrightNotice brand={brand} link={link} viewCount={link.viewCount + 1} />

        <div className="text-center mt-6 text-[10px] text-muted-foreground uppercase tracking-[0.25em]">
          {brand.label}
        </div>
      </main>

      <style>{`
        main img { -webkit-user-drag: none; user-select: none; pointer-events: none; }
        main { -webkit-touch-callout: none; }
      `}</style>
    </div>
  );
}
