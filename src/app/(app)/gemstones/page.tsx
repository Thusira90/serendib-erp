import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Gem, Plus } from "lucide-react";
import { ShareCatalogueButton } from "@/components/share-catalogue-button";
import { QrPrintButton } from "@/components/qr-print-button";
import { TimedShareButton } from "@/components/timed-share-button";
import { SelectableGemGrid, type GemCard } from "@/components/selectable-gem-grid";

export default async function GemstoneListPage() {
  const session = await requireCapability("gemstone:read");
  const canWrite = can(session.user.role, "gemstone:write");
  const gems = await prisma.gemstone.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      location: true,
      transformationsAsOutput: { include: { transformation: { include: { inputs: { include: { roughStone: true } } } } } },
    },
  });

  const cards: GemCard[] = gems.map((g) => {
    const parents = g.transformationsAsOutput.flatMap((o) => o.transformation.inputs.map((i) => i.roughStone.code));
    return {
      id: g.id, code: g.code,
      gemType: g.gemType, variety: g.variety,
      weightCt: Number(g.weightCt),
      status: g.status,
      origin: g.origin,
      currency: g.currency,
      askingPrice: g.askingPrice != null ? Number(g.askingPrice) : null,
      totalCost: Number(g.totalCost),
      heroBadge: parents[0] ?? null,
      cgiScore: g.cgiScore,
      cgiBand: g.cgiBand,
      cgiEnabled: g.cgiEnabled,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><Gem className="h-7 w-7 text-sgs-purple-500" /> Cut and Polished Stones</h1>
          <p className="text-sm text-muted-foreground">Each stone carries its lineage, cost and price history forever.</p>
        </div>
        <div className="flex items-center gap-2">
          <TimedShareButton
            scope="CATALOGUE"
            label="Timed link"
            sharerDefaults={{ name: session.user.name ?? "", email: session.user.email ?? undefined }}
          />
          {gems.length > 0 && (
            <QrPrintButton codes={gems.map((g) => g.code)} kind="gemstone" layout="sheet" label={`Print all ${gems.length} labels`} />
          )}
          <ShareCatalogueButton />
          {canWrite && (
            <Button asChild variant="accent"><Link href="/gemstones/new"><Plus className="h-4 w-4" /> Register gemstone</Link></Button>
          )}
        </div>
      </div>

      {gems.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12 border rounded-lg">
          No cut and polished stones yet. Complete a cutting job to see one here.
        </div>
      ) : (
        <SelectableGemGrid
          gems={cards}
          sharerName={session.user.name ?? ""}
          sharerEmail={session.user.email ?? ""}
        />
      )}
    </div>
  );
}
