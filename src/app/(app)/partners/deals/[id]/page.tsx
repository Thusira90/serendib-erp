import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, requireCapability } from "@/lib/rbac";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { decimalToMinor, minorToDecimalString } from "@/lib/partner-money";
import { parseVisibility } from "@/lib/partner-visibility";
import type { EarnOn, PartnerScope, PayoutMethod } from "@/lib/enums";
import type { PickerOption } from "@/components/entity-picker";
import { DealForm, type DealFormInitial, type DealFormMode } from "../new/deal-form";
import {
  DEFAULT_EXCLUDED_TYPES,
  METHOD_LABEL,
  PARTNER_KIND_LABELS,
  SCOPE_LABEL,
  STATUS_LABEL,
  STATUS_VARIANT,
  TAB_KEYS,
  TAB_LABEL,
  parseStoneRef,
  type DealTab,
} from "../deal-shared";
import { OverviewTab } from "./overview-tab";
import { StonesTab } from "./stones-tab";
import { VisibilityEditor } from "./visibility-editor";
import MoneyTab from "./money-tab";
import AccessTab from "./access-tab";

export const dynamic = "force-dynamic";

type SearchParams = { tab?: string; edit?: string; add?: string };

const isTab = (t: string | undefined): t is DealTab => (TAB_KEYS as readonly string[]).includes(t ?? "");

function parseList(text: string): string[] {
  try {
    const v: unknown = JSON.parse(text);
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v as string[];
  } catch {
    // fall through to the default
  }
  return [...DEFAULT_EXCLUDED_TYPES];
}

function parseRates(text: string | null): { ccy: string; rate: string }[] {
  if (!text) return [];
  try {
    const v: unknown = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.entries(v as Record<string, unknown>)
        .filter(([, r]) => typeof r === "string" || typeof r === "number")
        .map(([ccy, r]) => ({ ccy, rate: String(r) }))
        .sort((a, b) => a.ccy.localeCompare(b.ccy));
    }
  } catch {
    // an unreadable value counts as none
  }
  return [];
}

const moneyText = (v: { toString(): string } | null): string => (v === null ? "" : minorToDecimalString(decimalToMinor(v)));
const Loading = () => <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">Loading...</div>;

export default async function DealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const session = await requireCapability("partner:read");
  const canWrite = can(session.user, "partner:write");
  const { id } = await params;
  const sp = await searchParams;

  const deal = await prisma.partnerDeal.findUnique({
    where: { id },
    select: {
      id: true, code: true, title: true, status: true, method: true, scope: true, earnOn: true, currency: true, ratePct: true, fixedFee: true,
      visibility: true, partnerId: true,
      partner: { select: { name: true } },
    },
  });
  if (!deal) notFound();

  const method = deal.method as PayoutMethod;
  const scope = deal.scope as PartnerScope;
  const earnOn = deal.earnOn as EarnOn;

  if (sp.edit === "1") return <EditView dealId={deal.id} canWrite={canWrite} />;

  const tab: DealTab = isTab(sp.tab) ? sp.tab : "overview";
  const termText =
    method === "FIXED_FEE"
      ? deal.fixedFee === null ? "no fee set" : `${formatCurrency(Number(moneyText(deal.fixedFee)), deal.currency)}${scope === "PER_STONE" ? " per stone" : ""}`
      : deal.ratePct === null ? "no rate set" : `${Number(deal.ratePct.toString())}%`;
  const href = (t: DealTab): string => (t === "overview" ? `/partners/deals/${deal.id}` : `/partners/deals/${deal.id}?tab=${t}`);

  return (
    <div className="space-y-6">
      <Link href="/partners?tab=deals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to deals
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono">{deal.code}</span>
            <Badge variant={STATUS_VARIANT[deal.status as keyof typeof STATUS_VARIANT] ?? "muted"}>{STATUS_LABEL[deal.status as keyof typeof STATUS_LABEL] ?? deal.status}</Badge>
          </div>
          <h1 className="mt-1 break-words font-serif text-3xl">{deal.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link href={`/partners/${deal.partnerId}`} className="text-sgs-teal-700 hover:underline">{deal.partner.name}</Link>
            {" · "}{METHOD_LABEL[method]} {termText} · {SCOPE_LABEL[scope].toLowerCase()} · {deal.currency}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/partners/deals/${deal.id}/preview`}><Eye className="h-4 w-4" /> View as partner</Link>
        </Button>
      </div>

      <nav aria-label="Deal sections" className="max-w-full overflow-x-auto">
        <div className="inline-flex h-10 items-center gap-1 rounded-lg border bg-card p-1 text-muted-foreground">
          {TAB_KEYS.map((t) => (
            <Link
              key={t}
              href={href(t)}
              aria-current={tab === t ? "page" : undefined}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === t ? "bg-sgs-teal-500 text-white shadow-sm" : "hover:bg-secondary"}`}
            >
              {TAB_LABEL[t]}
            </Link>
          ))}
        </div>
      </nav>

      <Suspense key={tab} fallback={<Loading />}>
        {tab === "overview" && <OverviewTab dealId={deal.id} />}
        {tab === "stones" && <StonesTab dealId={deal.id} preselect={parseStoneRef(sp.add)} />}
        {tab === "visibility" && (
          <div className="space-y-4">
            <p className="max-w-3xl text-sm text-muted-foreground">
              Choose exactly what this partner sees. The partner&apos;s own account (estimate, settled, adjustments, paid, balance) and their terms are always shown. Some switches are locked on or
              off when hiding them would be pointless; each lock says why.
            </p>
            <VisibilityEditor dealId={deal.id} method={method} earnOn={earnOn} initial={parseVisibility(deal.visibility)} canWrite={canWrite} />
          </div>
        )}
        {tab === "money" && <MoneyTab dealId={deal.id} />}
        {tab === "access" && <AccessTab dealId={deal.id} />}
      </Suspense>
    </div>
  );
}

/** The deal form for a draft (edit) or an active deal without ledger rows (amend). */
async function EditView({ dealId, canWrite }: { dealId: string; canWrite: boolean }) {
  const back = `/partners/deals/${dealId}`;
  const notice = (text: string) => (
    <div className="space-y-4">
      <Link href={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to the deal
      </Link>
      <p className="rounded-lg border bg-secondary/30 p-4 text-sm">{text}</p>
    </div>
  );
  if (!canWrite) return notice("You can view this deal but not edit it.");

  const deal = await prisma.partnerDeal.findUnique({
    where: { id: dealId },
    select: {
      id: true, code: true, status: true, partnerId: true, title: true, partnerTitle: true, method: true, scope: true, earnOn: true, currency: true,
      ratePct: true, fixedFee: true, invested: true, capitalProtected: true, excludedCostTypes: true, rateOverrides: true, ratesFrozenAt: true,
      visibility: true, partnerNote: true, internalNotes: true,
      partner: { select: { name: true } },
    },
  });
  if (!deal) notFound();

  let mode: DealFormMode;
  if (deal.status === "DRAFT") {
    mode = "edit";
  } else if (deal.status === "ACTIVE") {
    const rows =
      (await prisma.partnerSettlement.count({ where: { dealId } })) +
      (await prisma.partnerAdjustment.count({ where: { dealId } })) +
      (await prisma.partnerPayout.count({ where: { dealId } }));
    if (rows > 0) return notice("The terms are frozen because this deal already has a settlement, adjustment or payout. Close it and create a new deal to change them.");
    mode = "amend";
  } else {
    return notice("A closed or cancelled deal cannot be edited.");
  }

  const partners = await prisma.partner.findMany({
    where: { OR: [{ active: true }, { id: deal.partnerId }] },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, kind: true },
  });
  const options: PickerOption[] = partners.map((p) => ({ id: p.id, label: p.name, hint: `${PARTNER_KIND_LABELS[p.kind] ?? p.kind} · ${p.code}` }));
  const initial: DealFormInitial = {
    partnerId: deal.partnerId,
    title: deal.title,
    partnerTitle: deal.partnerTitle ?? "",
    method: deal.method as PayoutMethod,
    scope: deal.scope as PartnerScope,
    earnOn: deal.earnOn as EarnOn,
    currency: deal.currency,
    ratePct: deal.ratePct === null ? "" : String(Number(deal.ratePct.toString())),
    fixedFee: moneyText(deal.fixedFee),
    invested: moneyText(deal.invested),
    capitalProtected: deal.capitalProtected,
    excludedCostTypes: parseList(deal.excludedCostTypes),
    rates: parseRates(deal.rateOverrides),
    visibility: parseVisibility(deal.visibility),
    partnerNote: deal.partnerNote ?? "",
    internalNotes: deal.internalNotes ?? "",
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to the deal
      </Link>
      <div>
        <h1 className="font-serif text-3xl">{mode === "amend" ? "Amend terms" : "Edit draft"}</h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">{deal.code}</p>
      </div>
      <DealForm
        mode={mode}
        dealId={deal.id}
        dealCode={deal.code}
        partners={options}
        partnerName={deal.partner.name}
        initial={initial}
        ratesFrozen={deal.ratesFrozenAt !== null}
        cancelHref={back}
      />
    </div>
  );
}
