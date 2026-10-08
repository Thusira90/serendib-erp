import Link from "next/link";
import { z } from "zod";
import { ArrowLeft, Eye } from "lucide-react";
import { requireAuth, can } from "@/lib/rbac";
import { SCOPE_CAPS } from "@/lib/share-scope";
import { getCompanySettings } from "@/lib/company-settings";
import {
  resolveBrand, resolveContact, Watermark, BrandHeader, ContactFooter, CopyrightNotice,
  SingleStone, StoneGrid, SingleRoughStone, RoughGrid,
  titleForScope, isRoughScope, loadShareContents, loadShareableMedia, findShareGem, findShareRough,
  type ShareLinkRecord,
} from "@/app/s/[code]/shared";

// Draft preview of a time-limited share link: the same components the
// recipient's page uses, fed from the dialog's current settings. Nothing is
// saved, no link exists yet, and no view is counted.
export const dynamic = "force-dynamic";
export const metadata = { title: "Share preview", robots: { index: false, follow: false } };

const text = (max: number) => z.string().max(max).optional();
const paramsSchema = z.object({
  scope: z.enum(["CATALOGUE", "GEMSTONE", "GEMSTONES", "COLLECTION", "ROUGH", "ROUGHS"]),
  payload: text(30_000),
  ttl: z.coerce.number().int().min(1).max(60 * 24 * 30).default(60),
  msg: text(1000),
  broker: text(1),
  nocgi: text(1),
  name: text(200), phone: text(60), email: text(200),
  bName: text(200), bCompany: text(200), bPhone: text(60), bEmail: text(200),
  open: text(64),
});

type SP = Record<string, string | string[] | undefined>;

export default async function SharePreviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireAuth();
  const raw = Object.fromEntries(
    Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) return <Notice>This preview link is incomplete. Close it and click Preview again.</Notice>;
  const p = parsed.data;

  const missing = SCOPE_CAPS[p.scope].find((cap) => !can(session.user, cap));
  if (missing) return <Notice>You don&apos;t have permission to share this kind of stone.</Notice>;

  const brokerMode = p.broker === "1";
  const link: NonNullable<ShareLinkRecord> = {
    id: "preview",
    code: "PREVIEW",
    scope: p.scope,
    payload: p.payload ?? null,
    expiresAt: new Date(Date.now() + p.ttl * 60_000),
    message: p.msg?.trim() || null,
    createdById: session.user.id,
    createdByName: p.name?.trim() || session.user.name || "",
    createdByPhone: p.phone?.trim() || null,
    createdByEmail: p.email?.trim() || session.user.email || null,
    createdByPhotoUrl: null,
    hideCgi: p.nocgi === "1",
    brokerMode,
    brokerName: brokerMode ? p.bName?.trim() || null : null,
    brokerCompany: brokerMode ? p.bCompany?.trim() || null : null,
    brokerPhone: brokerMode ? p.bPhone?.trim() || null : null,
    brokerEmail: brokerMode ? p.bEmail?.trim() || null : null,
    viewCount: 0,
    firstViewedAt: null,
    lastViewedAt: null,
    revokedAt: null,
    createdAt: new Date(),
  };

  const company = await getCompanySettings();
  const brand = resolveBrand(link, company);
  const contact = resolveContact(link);
  const isRough = isRoughScope(link.scope);

  // Cards open the same preview on that stone, keeping every draft setting.
  const withOpen = (code?: string) => {
    const q = new URLSearchParams(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));
    q.delete("open");
    if (code) q.set("open", code);
    return `/share-preview?${q.toString()}`;
  };

  let body: React.ReactNode;
  let showTitle = true;
  let title = "";
  let back: string | null = null;

  if (p.open) {
    showTitle = false;
    back = link.scope === "GEMSTONE" || link.scope === "ROUGH" ? null : withOpen();
    if (isRough) {
      const rough = await findShareRough(link, p.open);
      body = rough ? <SingleRoughStone rough={rough} /> : <Notice>That stone is not part of this link.</Notice>;
    } else {
      const gem = await findShareGem(link, p.open);
      body = gem
        ? <SingleStone gem={{ ...gem, digitalAssets: await loadShareableMedia(gem.id) }} neutral={brokerMode} showCgi={!link.hideCgi} />
        : <Notice>That stone is not part of this link.</Notice>;
    }
  } else {
    const { gems, roughs } = await loadShareContents(link);
    const count = isRough ? roughs.length : gems.length;
    title = titleForScope(link.scope, count, brand.titleFallback);
    const single = (link.scope === "GEMSTONE" && gems.length === 1) || (link.scope === "ROUGH" && roughs.length === 1);
    if (isRough) {
      body = single && roughs[0]
        ? <SingleRoughStone rough={roughs[0]} />
        : <RoughGrid roughs={roughs} shareCode={link.code} hrefFor={withOpen} />;
    } else if (single && gems[0]) {
      body = <SingleStone gem={{ ...gems[0], digitalAssets: await loadShareableMedia(gems[0].id) }} neutral={brokerMode} showCgi={!link.hideCgi} />;
    } else {
      body = <StoneGrid gems={gems} shareCode={link.code} hrefFor={withOpen} showCgi={!link.hideCgi} />;
    }
  }

  return (
    <div className={`min-h-screen ${brand.pageBg}`}>
      <div className="sticky top-0 z-20 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs text-amber-900">
        <Eye className="mr-1.5 inline h-3.5 w-3.5" />
        <strong>Preview.</strong> This is how the recipient will see the page
        {brokerMode ? ", with your details hidden and the broker's shown" : ""}. No link has been created and nothing is counted as a view.
      </div>
      <Watermark label={brand.label} forName={contact.name} />

      <main className={`relative z-10 mx-auto p-6 sm:p-10 ${p.open ? "max-w-4xl" : "max-w-5xl"}`}>
        <BrandHeader brand={brand} link={link} showTitle={showTitle} title={title} />

        {back && (
          <div className="mb-4">
            <Link href={back} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Back to the selection
            </Link>
          </div>
        )}

        {body}

        <ContactFooter contact={contact} isBroker={brokerMode} />
        <CopyrightNotice brand={brand} link={link} viewCount={1} />

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

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border bg-white p-10 text-center text-sm text-muted-foreground">{children}</div>;
}
