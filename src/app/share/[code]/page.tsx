import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCarat, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EnquireButton } from "./enquire-button";
import { Gem, Award, ShieldCheck, Sparkles } from "lucide-react";
import { trackCollectionView } from "@/app/(app)/collections/actions";

// Public share pages must always reflect the latest state, not a build-time
// snapshot: the collection contents, prices, and availability can change any
// moment and we track every view.
export const dynamic = "force-dynamic";

export default async function ShareCollectionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const collection = await prisma.collection.findUnique({
    where: { shareCode: code },
    include: {
      items: {
        orderBy: { displayOrder: "asc" },
        include: {
          gemstone: {
            include: {
              digitalAssets: {
                orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
                where: { kind: { in: ["FINISHED_PHOTO", "MACRO_PHOTO", "CATALOGUE_IMAGE"] } },
                take: 3,
              },
              cgiProjects: {
                include: {
                  versions: {
                    where: { isMaster: true },
                    take: 1,
                  },
                },
              },
              certificates: {
                where: { status: "ISSUED" },
                include: { laboratory: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!collection || collection.isArchived) return notFound();
  const now = new Date();
  const expired = collection.expiresAt && collection.expiresAt < now;

  // Fire-and-forget view increment. Awaiting keeps it inside this request
  // context so the write is scheduled before the response streams.
  await trackCollectionView(code).catch(() => {});

  if (expired) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <h1 className="font-serif text-3xl">This shared collection has expired</h1>
        <p className="text-muted-foreground">
          The link you used is no longer active. Please contact us and we&rsquo;ll send you an updated selection.
        </p>
        <Link href="/catalogue" className="inline-block text-sgs-teal-700 hover:underline">
          Browse our current catalogue →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">A private selection</div>
        <h1 className="font-serif text-4xl">{collection.name}</h1>
        {collection.intro && (
          <p className="text-muted-foreground whitespace-pre-wrap max-w-3xl">{collection.intro}</p>
        )}
        <div className="text-xs text-muted-foreground">
          {collection.items.length} stone{collection.items.length === 1 ? "" : "s"} in this collection
          {collection.expiresAt && (
            <> · valid until {collection.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</>
          )}
        </div>
      </header>

      {collection.items.length === 0 ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          This collection is being prepared. Please check back shortly.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {collection.items.map((item) => {
            const gem = item.gemstone;
            const primaryImg = gem.digitalAssets[0]?.url;
            const masterCgi = gem.cgiProjects.flatMap((p) => p.versions)[0];
            const cert = gem.certificates[0];
            const displayPrice = item.priceOverride != null ? Number(item.priceOverride) : gem.askingPrice != null ? Number(gem.askingPrice) : null;
            const displayCurrency = item.currency ?? gem.currency;
            const gemLabel = `${gem.gemType}${gem.variety ? ` · ${gem.variety}` : ""}`;
            const isAvailable = gem.status === "AVAILABLE";

            return (
              <div key={item.id} className="border rounded-lg bg-card overflow-hidden shadow-luxe hover:shadow-luxe-lg transition-shadow flex flex-col">
                <div className="aspect-square bg-sgs-gradient-soft relative">
                  {primaryImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={primaryImg} alt={gem.code} className="h-full w-full object-cover" />
                  ) : masterCgi?.thumbnailUrl || masterCgi?.renderUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={masterCgi.thumbnailUrl ?? masterCgi.renderUrl ?? ""} alt={gem.code} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full grid place-items-center">
                      <Gem className="h-16 w-16 text-sgs-purple-300" />
                    </div>
                  )}
                  {!isAvailable && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="muted">{gem.status.replaceAll("_", " ")}</Badge>
                    </div>
                  )}
                </div>

                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  <div>
                    <div className="font-serif text-xl">{gemLabel}</div>
                    <div className="text-sm text-muted-foreground num">
                      {formatCarat(Number(gem.weightCt))}
                      {gem.origin && <> · {gem.origin}</>}
                      {gem.treatment && <> · {gem.treatment}</>}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground grid grid-cols-2 gap-y-0.5">
                    {gem.shape && <><span>Shape</span><span className="text-foreground">{gem.shape}</span></>}
                    {gem.cut && <><span>Cut</span><span className="text-foreground">{gem.cut}</span></>}
                    {gem.colorDescription && <><span>Colour</span><span className="text-foreground">{gem.colorDescription}</span></>}
                    {gem.clarity && <><span>Clarity</span><span className="text-foreground">{gem.clarity}</span></>}
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {cert && (
                      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sgs-teal-800 bg-sgs-teal-50 border-sgs-teal-200">
                        <Award className="h-3 w-3" /> {cert.laboratory.name} certified
                      </span>
                    )}
                    {masterCgi?.animationUrl && (
                      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sgs-purple-800 bg-sgs-purple-50 border-sgs-purple-200">
                        <Sparkles className="h-3 w-3" /> 360° view
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-muted-foreground">
                      <ShieldCheck className="h-3 w-3" /> ID {gem.code}
                    </span>
                  </div>

                  {item.note && (
                    <div className="text-sm italic text-muted-foreground border-l-2 border-sgs-purple-200 pl-2">
                      &ldquo;{item.note}&rdquo;
                    </div>
                  )}

                  <div className="flex-1" />

                  <div className="pt-2 border-t space-y-2">
                    {displayPrice != null ? (
                      <div className="font-serif text-2xl num text-sgs-purple-700">
                        {formatCurrency(displayPrice, displayCurrency)}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Price on request</div>
                    )}
                    <div className="flex gap-2">
                      <Link
                        href={`/verify/${gem.code}`}
                        target="_blank"
                        className="flex-1 inline-flex items-center justify-center h-9 rounded-md border text-sm hover:bg-secondary"
                      >
                        Full details
                      </Link>
                      <div className="flex-1">
                        <EnquireButton
                          shareCode={collection.shareCode}
                          gemstoneId={gem.id}
                          gemstoneCode={gem.code}
                          gemstoneLabel={gemLabel}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
