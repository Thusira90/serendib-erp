import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCompanySettings } from "@/lib/company-settings";
import { ArrowLeft } from "lucide-react";
import {
  resolveBrand, resolveContact, Watermark, BrandHeader, ContactFooter, CopyrightNotice,
  SingleStone, gemsWhereForLink, shareMetadata, opaqueStoneToken,
} from "../shared";
import { ExpiredView } from "../expired";

// Deep-dive view for a single stone within a share link. Same expiry
// checks + view tracking as the parent /s/<code> route.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  return shareMetadata((await params).code);
}

export default async function TimedShareGemPage({
  params,
}: {
  params: Promise<{ code: string; gemCode: string }>;
}) {
  const { code, gemCode } = await params;
  const link = await prisma.shareLink.findUnique({ where: { code } });
  if (!link) return notFound();

  const now = new Date();
  if (link.revokedAt || link.expiresAt < now) {
    return <ExpiredView expiresAt={link.expiresAt} revokedAt={link.revokedAt} brokerMode={link.brokerMode} brandLabel={link.brokerCompany ?? link.brokerName ?? null} />;
  }

  // Broker links address stones by an opaque token (never the "SGS-" code);
  // raw codes are refused so they cannot be used to probe the catalogue.
  let requestedCode = gemCode;
  if (link.brokerMode) {
    const inScope = await prisma.gemstone.findMany({
      where: gemsWhereForLink(link),
      select: { id: true, code: true },
      take: 500,
    });
    const match = inScope.find((g) => opaqueStoneToken(link.id, g.id) === gemCode);
    if (!match) return notFound();
    requestedCode = match.code;
  }

  // Validate the requested gem is actually part of this link's scope,
  // otherwise a leaked URL could be used to enumerate the whole
  // catalogue by trying different codes.
  const gem = await prisma.gemstone.findFirst({
    where: {
      AND: [
        { code: requestedCode },
        gemsWhereForLink(link),
      ],
    },
    include: {
      digitalAssets: {
        where: { isPrimary: true, kind: { in: ["FINISHED_PHOTO", "MACRO_PHOTO", "CATALOGUE_IMAGE"] } },
        take: 1,
      },
      cgiProjects: { include: { versions: { where: { isMaster: true }, take: 1 } } },
      certificates: { where: { status: "ISSUED" }, include: { laboratory: true }, take: 1 },
    },
  });
  if (!gem) return notFound();

  // Awaited so serverless does not drop the write when the response finishes.
  await prisma.shareLink.update({
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
  const showBackLink = link.scope !== "GEMSTONE"; // for a single-stone link there's nowhere to go back to

  return (
    <div className={`min-h-screen ${brand.pageBg}`}>
      <Watermark label={brand.label} forName={contact.name} />

      <main className="relative z-10 max-w-4xl mx-auto p-6 sm:p-10">
        <BrandHeader brand={brand} link={link} showTitle={false} title="" />

        {showBackLink && (
          <div className="mb-4">
            <Link href={`/s/${link.code}`} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Back to the selection
            </Link>
          </div>
        )}

        <SingleStone gem={gem} neutral={link.brokerMode} />

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
