import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCompanySettings } from "@/lib/company-settings";
import { ArrowLeft } from "lucide-react";
import {
  resolveBrand, resolveContact, Watermark, BrandHeader, ContactFooter, CopyrightNotice,
  SingleRoughStone, roughsWhereForLink, shareMetadata, opaqueStoneToken, findShareRough,
} from "../../shared";
import { ExpiredView } from "../../expired";

// Deep-dive view for a single rough within a rough-scoped share link.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  return shareMetadata((await params).code);
}

export default async function TimedShareRoughPage({
  params,
}: {
  params: Promise<{ code: string; roughCode: string }>;
}) {
  const { code, roughCode } = await params;
  const link = await prisma.shareLink.findUnique({ where: { code } });
  if (!link) return notFound();

  const now = new Date();
  if (link.revokedAt || link.expiresAt < now) {
    return <ExpiredView expiresAt={link.expiresAt} revokedAt={link.revokedAt} brokerMode={link.brokerMode} brandLabel={link.brokerCompany ?? link.brokerName ?? null} />;
  }

  // Broker links address stones by an opaque token (never the "SGS-" code).
  let requestedCode = roughCode;
  if (link.brokerMode) {
    const inScope = await prisma.roughStone.findMany({
      where: roughsWhereForLink(link),
      select: { id: true, code: true },
      take: 500,
    });
    const match = inScope.find((r) => opaqueStoneToken(link.id, r.id) === roughCode);
    if (!match) return notFound();
    requestedCode = match.code;
  }

  // Validate the requested rough is actually part of this link's scope,
  // so a leaked URL can't enumerate the rest of the vault.
  const rough = await findShareRough(link, requestedCode);
  if (!rough) return notFound();

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
  const showBackLink = link.scope !== "ROUGH"; // single-rough link has nothing to go back to

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

        <SingleRoughStone rough={rough} />

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
