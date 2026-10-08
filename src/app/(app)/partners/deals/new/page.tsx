import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, requireCapability } from "@/lib/rbac";
import { presetVisibility } from "@/lib/partner-visibility";
import type { PickerOption } from "@/components/entity-picker";
import { DEFAULT_EXCLUDED_TYPES, PARTNER_KIND_LABELS, parseStoneRef, type StoneRef } from "../deal-shared";
import { DealForm, type DealFormInitial } from "./deal-form";

export const dynamic = "force-dynamic";

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ partnerId?: string; stone?: string }> }) {
  const session = await requireCapability("partner:write");
  const sp = await searchParams;

  const partners = await prisma.partner.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, kind: true },
  });
  const options: PickerOption[] = partners.map((p) => ({ id: p.id, label: p.name, hint: `${PARTNER_KIND_LABELS[p.kind] ?? p.kind} · ${p.code}` }));
  const partnerId = partners.some((p) => p.id === sp.partnerId) ? (sp.partnerId as string) : "";

  let addStone: (StoneRef & { code: string }) | null = null;
  const ref = parseStoneRef(sp.stone);
  if (ref?.kind === "ROUGH" && can(session.user, "rough:read")) {
    const r = await prisma.roughStone.findUnique({ where: { id: ref.id }, select: { id: true, code: true } });
    if (r) addStone = { kind: "ROUGH", id: r.id, code: r.code };
  } else if (ref?.kind === "GEM" && can(session.user, "gemstone:read")) {
    const g = await prisma.gemstone.findUnique({ where: { id: ref.id }, select: { id: true, code: true } });
    if (g) addStone = { kind: "GEM", id: g.id, code: g.code };
  }

  const initial: DealFormInitial = {
    partnerId,
    title: "",
    partnerTitle: "",
    method: "PROFIT_SHARE",
    scope: "PER_STONE",
    earnOn: "PAYMENT",
    currency: "LKR",
    ratePct: "",
    fixedFee: "",
    invested: "",
    capitalProtected: false,
    excludedCostTypes: [...DEFAULT_EXCLUDED_TYPES],
    rates: [],
    visibility: presetVisibility("STANDARD"),
    partnerNote: "",
    internalNotes: "",
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/partners?tab=deals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to deals
      </Link>
      <div>
        <h1 className="font-serif text-3xl">New partner deal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The deal starts as a draft. Add its stones next, check the figures, then start it to switch the partner&apos;s link on.
        </p>
      </div>
      <DealForm mode="create" partners={options} initial={initial} addStone={addStone} cancelHref="/partners?tab=deals" />
    </div>
  );
}
