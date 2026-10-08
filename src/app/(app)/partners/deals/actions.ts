"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { codePrefix, nextCode } from "@/lib/ids";
import { EARN_ON, PARTNER_CURRENCIES, PARTNER_SCOPES, PAYOUT_METHODS } from "@/lib/enums";
import { can } from "@/lib/rbac";
import { tryPartnerCapability } from "@/lib/partner-auth";
import type { Capability } from "@/lib/rbac";
import { EngineInvariantError, validateTerms, type EarnOn, type Method, type TermsDraft } from "@/lib/partner-engine";
import {
  OPEN_DEAL_STATUSES,
  PartnerGatherError,
  derivedGemIdsByRough,
  findOverlappingDeals,
  footprintKeys,
  unitKeyOf,
} from "@/lib/partner-gather";
import {
  allocateAcquisition as ledgerAllocateAcquisition,
  allocateAcquisitionIn,
  allocateInvestment as ledgerAllocateInvestment,
  allocateInvestmentIn,
  checkObligations,
  computeEstimate,
  dealLockKey,
  fmtMinor,
  getLedger,
  membershipLockReason,
  validateDealForActivation,
} from "@/lib/partner-ledger";
import { bpFromPct, decimalToMinor, minorToDecimalString, parseScaled } from "@/lib/partner-money";
import { getDealFootprint, validateCoPartnerCaps } from "@/lib/partner-queries";
import { adminPreview, buildPartnerPortalDto } from "@/lib/partner-view";
import type { PartnerPortalDto } from "@/lib/partner-dto";
import {
  VISIBILITY_KEYS,
  normalizeVisibility,
  parseVisibility,
  presetOf,
  serializeVisibility,
  type PartnerVisibility,
} from "@/lib/partner-visibility";
import type {
  AllocationRow,
  AllocationSpecInput,
  CloseRequirements,
  DealInput,
  SaleDecision,
  StoneKind,
  StoneRef,
  StoneSearchRow,
} from "./deal-shared";

type Fail = { ok: false; error: string };
type Actor = { id: string; name: string | null };
type Tx = Prisma.TransactionClient;

const GENERIC = "Something went wrong and nothing was changed. Try again.";
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;
const LIVE_SALE_STATUSES: readonly string[] = ["CONFIRMED", "INVOICED", "PARTIAL", "PAID", "SHIPPED", "DELIVERED"];
const RATE_RE = /^\d{1,9}(\.\d{1,6})?$/;
const MAX_SAFE_BIG = BigInt(Number.MAX_SAFE_INTEGER);
/** Switches that only make sense on top of another one; they are cleared the moment their base goes dark. */
const DEPENDENT_KEYS = ["receipts", "certificateFiles", "mediaCaptions"] as const;
const insensitive = "insensitive" as const;

const fail = (error: string): Fail => ({ ok: false, error });
const firstIssue = (e: z.ZodError): string => e.issues[0]?.message ?? "Check the details and try again.";
const uniq = <T>(xs: Iterable<T>): T[] => [...new Set(xs)];

/** Thrown inside a transaction to roll it back with a message the caller can show. */
class Rollback extends Error {}

async function gate(cap: Capability): Promise<{ ok: true; actor: Actor; user: Session["user"] } | Fail> {
  const g = await tryPartnerCapability(cap);
  if (!g.ok) return fail(g.error);
  const u = g.session.user;
  return { ok: true, actor: { id: u.id, name: u.name ?? null }, user: u };
}

function describe(where: string, e: unknown): string {
  if (e instanceof Rollback) return e.message;
  if (e instanceof PartnerGatherError || e instanceof EngineInvariantError) return e.message;
  if (e instanceof Error && /terms are frozen/i.test(e.message)) return "The terms are frozen because the deal already has a settlement, adjustment or payout.";
  console.error(`${where} failed`, e);
  return GENERIC;
}

async function lockDeal(tx: Tx, dealId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dealLockKey(dealId)}))`;
}

function revalidateDeal(deal: { id: string; partnerId: string }): void {
  revalidatePath("/partners");
  revalidatePath(`/partners/${deal.partnerId}`);
  revalidatePath(`/partners/deals/${deal.id}`);
}

async function auditDeal(
  tx: Tx,
  actor: Actor,
  deal: { id: string; code: string },
  action: string,
  newValue: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await writeAudit(
    {
      entity: "PartnerDeal", entityId: deal.id, entityCode: deal.code, action,
      userId: actor.id, userName: actor.name, newValue,
      metadata: { dealId: deal.id, ...metadata },
    },
    tx,
  );
}

// ---------------------------------------------------------------------------
// Input schemas and normalisation
// ---------------------------------------------------------------------------

const idSchema = z.string().min(1).max(64);
const optText = (max: number, msg: string) =>
  z.string().max(max, msg).nullish().transform((v) => {
    const t = v?.trim();
    return t ? t : null;
  });

const dealSchema = z.object({
  partnerId: idSchema,
  title: z.string().trim().min(1, "Give the deal an internal title").max(120, "The title is too long (120 characters at most)"),
  partnerTitle: optText(120, "The partner-visible title is too long (120 characters at most)"),
  method: z.enum(PAYOUT_METHODS, { errorMap: () => ({ message: "Choose a payout method" }) }),
  scope: z.enum(PARTNER_SCOPES, { errorMap: () => ({ message: "Choose per stone or pooled" }) }),
  earnOn: z.enum(EARN_ON, { errorMap: () => ({ message: "Choose when the partner earns" }) }),
  currency: z.string().trim().max(3, "Choose a deal currency"),
  ratePct: optText(12, "The rate is not valid"),
  fixedFee: optText(24, "The fixed fee is not valid"),
  invested: optText(24, "The invested amount is not valid"),
  capitalProtected: z.boolean(),
  excludedCostTypes: z.array(z.string().regex(/^[A-Z][A-Z_]{1,39}$/, "A cost type is not valid")).max(40),
  rates: z.record(z.string().regex(/^[A-Z]{3}$/, "A currency code is not valid"), z.string().trim().max(20, "A manual rate is not valid")),
  visibility: z.record(z.string(), z.unknown()),
  partnerNote: optText(500, "The partner note is too long (500 characters at most)"),
  internalNotes: optText(2000, "The internal notes are too long (2000 characters at most)"),
});
type ParsedDeal = z.infer<typeof dealSchema>;

interface NormalTerms {
  method: Method;
  scope: ParsedDeal["scope"];
  earnOn: EarnOn;
  currency: string;
  ratePct: string | null;
  fixedFee: string | null;
  invested: string | null;
  capitalProtected: boolean;
}

/** A method keeps only its own fields; everything else is cleared before it is validated or stored. */
function normalizeTerms(d: ParsedDeal): { ok: true; terms: NormalTerms } | Fail {
  const draft: TermsDraft = {
    method: d.method,
    scope: d.scope,
    earnOn: d.earnOn,
    currency: d.currency,
    ratePct: d.method === "FIXED_FEE" ? null : d.ratePct,
    fixedFee: d.method === "FIXED_FEE" ? d.fixedFee : null,
    invested: d.method === "INVESTMENT" ? d.invested : null,
    capitalProtected: d.method === "INVESTMENT" ? d.capitalProtected : false,
  };
  const errors = validateTerms(draft);
  if (errors.length > 0) return fail(errors[0]);
  const bp = draft.ratePct === null || draft.ratePct === undefined ? null : bpFromPct(String(draft.ratePct).trim());
  const money = (v: string | number | null | undefined): string | null =>
    v === null || v === undefined ? null : minorToDecimalString(decimalToMinor(String(v).trim()));
  return {
    ok: true,
    terms: {
      method: d.method,
      scope: d.scope,
      earnOn: d.earnOn,
      currency: d.currency,
      ratePct: bp === null ? null : `${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, "0")}`,
      fixedFee: money(draft.fixedFee),
      invested: money(draft.invested),
      capitalProtected: d.method === "INVESTMENT" ? d.capitalProtected : false,
    },
  };
}

/** Manual rates as the 6-decimal strings the gatherer reads; null when there are none. */
function normalizeRates(rates: Record<string, string>): { ok: true; json: string | null } | Fail {
  const out: Record<string, string> = {};
  for (const ccy of Object.keys(rates).sort()) {
    const text = rates[ccy].trim();
    if (ccy === "LKR") return fail("LKR is the base currency and has no rate.");
    if (!(PARTNER_CURRENCIES as readonly string[]).includes(ccy)) return fail(`${ccy} cannot be used on a deal.`);
    if (!RATE_RE.test(text)) return fail(`The ${ccy} rate must be a number with at most 6 decimal places.`);
    const micro = parseScaled(text, 6);
    if (micro <= 0n || micro > MAX_SAFE_BIG) return fail(`The ${ccy} rate must be greater than 0.`);
    out[ccy] = `${micro / 1_000_000n}.${(micro % 1_000_000n).toString().padStart(6, "0")}`;
  }
  return { ok: true, json: Object.keys(out).length === 0 ? null : JSON.stringify(out) };
}

function coerceVisibility(raw: Record<string, unknown>): PartnerVisibility {
  return parseVisibility(JSON.stringify({ ...raw, version: 1 }));
}

/** Clears a dependent switch that is on but cannot show anything, so a later change cannot reveal it by surprise. */
function cleanDependencies(raw: PartnerVisibility, method: Method, earnOn: EarnOn): PartnerVisibility {
  const { effective } = normalizeVisibility(raw, method, earnOn);
  const out: PartnerVisibility = { ...raw };
  for (const k of DEPENDENT_KEYS) if (out[k] && !effective[k]) out[k] = false;
  return out;
}

const cleanExcluded = (types: string[]): string[] => uniq(types.filter((t) => t !== "ROUGH_PURCHASE")).sort();

function weightMilliOf(ct: { toString(): string } | null | undefined): number {
  if (ct === null || ct === undefined) return 0;
  try {
    return Math.max(0, Number(parseScaled(ct.toString(), 3)));
  } catch {
    return 0;
  }
}

const parseNum = (v: { toString(): string } | null): number | null => (v === null ? null : Number(v.toString()));

// ---------------------------------------------------------------------------
// Deal create / edit / amend
// ---------------------------------------------------------------------------

export async function createDeal(input: DealInput): Promise<{ ok: true; id: string; code: string } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const parsed = dealSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const d = parsed.data;
  const terms = normalizeTerms(d);
  if (!terms.ok) return terms;
  const rates = normalizeRates(d.rates);
  if (!rates.ok) return rates;
  const flags = cleanDependencies(coerceVisibility(d.visibility), d.method, d.earnOn);

  try {
    const partner = await prisma.partner.findUnique({ where: { id: d.partnerId }, select: { id: true, active: true } });
    if (!partner) return fail("Choose a partner for the deal.");
    if (!partner.active) return fail("This partner is inactive. Reactivate them before creating a deal.");

    const created = await prisma.$transaction(async (tx) => {
      const code = await nextCode(codePrefix.partnerDeal, new Date().getFullYear(), tx, { pad: 4 });
      const deal = await tx.partnerDeal.create({
        data: {
          code,
          partnerId: partner.id,
          title: d.title,
          partnerTitle: d.partnerTitle,
          status: "DRAFT",
          method: terms.terms.method,
          scope: terms.terms.scope,
          earnOn: terms.terms.earnOn,
          currency: terms.terms.currency,
          ratePct: terms.terms.ratePct,
          fixedFee: terms.terms.fixedFee,
          invested: terms.terms.invested,
          capitalProtected: terms.terms.capitalProtected,
          excludedCostTypes: JSON.stringify(cleanExcluded(d.excludedCostTypes)),
          rateOverrides: rates.json,
          visibility: serializeVisibility(flags),
          visibilityPreset: presetOf(flags),
          partnerNote: d.partnerNote,
          internalNotes: d.internalNotes,
          createdById: g.actor.id,
          createdByName: g.actor.name,
        },
        select: { id: true, code: true, partnerId: true },
      });
      await auditDeal(tx, g.actor, deal, "CREATE", `Deal ${deal.code} created`, {
        method: terms.terms.method, scope: terms.terms.scope, earnOn: terms.terms.earnOn, currency: terms.terms.currency,
      });
      return deal;
    }, TX_OPTIONS);
    revalidateDeal(created);
    return { ok: true, id: created.id, code: created.code };
  } catch (e) {
    return fail(describe("createDeal", e));
  }
}

const updateSchema = z.object({
  dealId: idSchema,
  reason: z.string().max(300, "The reason is too long (300 characters at most)").nullish(),
});

/**
 * Edits a draft freely (`updateDealDraft`), or amends the terms of an active deal (`amendTerms`: reason mandatory, only while
 * no settlement, adjustment or payout exists). Visibility is edited on its own tab; here it is only re-cleaned when the method
 * or earn-on rule changes.
 */
async function updateDealCore(args: { dealId: string; input: DealInput; reason?: string | null }, expect: "DRAFT" | "ACTIVE"): Promise<{ ok: true } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const head = updateSchema.safeParse({ dealId: args?.dealId, reason: args?.reason });
  if (!head.success) return fail(firstIssue(head.error));
  const parsed = dealSchema.safeParse(args.input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const d = parsed.data;
  const terms = normalizeTerms(d);
  if (!terms.ok) return terms;
  const rates = normalizeRates(d.rates);
  if (!rates.ok) return rates;
  const reason = head.data.reason?.trim() ?? "";

  try {
    await prisma.$transaction(async (tx) => {
      await lockDeal(tx, head.data.dealId);
      const deal = await tx.partnerDeal.findUnique({
        where: { id: head.data.dealId },
        select: {
          id: true, code: true, status: true, partnerId: true, method: true, scope: true, earnOn: true, currency: true, ratePct: true,
          fixedFee: true, invested: true, capitalProtected: true, visibility: true, rateOverrides: true,
        },
      });
      if (!deal) throw new Rollback("The deal was not found.");
      if (deal.status !== "DRAFT" && deal.status !== "ACTIVE") throw new Rollback("A closed or cancelled deal cannot be edited.");
      if (deal.status !== expect) {
        throw new Rollback(expect === "DRAFT" ? "Only a draft can be edited this way. Use Amend terms on an active deal." : "Only the terms of an active deal can be amended. Use Edit draft on a draft.");
      }
      const draft = expect === "DRAFT";

      const t = terms.terms;
      const changed: string[] = [];
      const diff = (name: string, a: unknown, b: unknown) => {
        if (String(a ?? "") !== String(b ?? "")) changed.push(name);
      };
      diff("method", deal.method, t.method);
      diff("scope", deal.scope, t.scope);
      diff("earnOn", deal.earnOn, t.earnOn);
      diff("currency", deal.currency, t.currency);
      diff("ratePct", deal.ratePct === null ? null : Number(deal.ratePct.toString()), t.ratePct === null ? null : Number(t.ratePct));
      diff("fixedFee", deal.fixedFee === null ? null : Number(deal.fixedFee.toString()), t.fixedFee === null ? null : Number(t.fixedFee));
      diff("invested", deal.invested === null ? null : Number(deal.invested.toString()), t.invested === null ? null : Number(t.invested));
      diff("capitalProtected", deal.capitalProtected, t.capitalProtected);
      const termsChanged = changed.length > 0;

      let frozen = false;
      if (!draft) {
        if (d.partnerId !== deal.partnerId) throw new Rollback("The partner cannot be changed once the deal is active.");
        const ledgerRows =
          (await tx.partnerSettlement.count({ where: { dealId: deal.id } })) +
          (await tx.partnerAdjustment.count({ where: { dealId: deal.id } })) +
          (await tx.partnerPayout.count({ where: { dealId: deal.id } }));
        frozen = ledgerRows > 0;
        if (termsChanged) {
          if (frozen) throw new Rollback("The terms are frozen because the deal already has a settlement, adjustment or payout. Close this deal and create a new one.");
          if (reason.length === 0) throw new Rollback("Say why the terms are being amended.");
        }
      } else if (d.partnerId !== deal.partnerId) {
        const partner = await tx.partner.findUnique({ where: { id: d.partnerId }, select: { active: true } });
        if (!partner) throw new Rollback("Choose a partner for the deal.");
        if (!partner.active) throw new Rollback("This partner is inactive.");
      }

      const stones = await tx.partnerDealStone.findMany({
        where: { dealId: deal.id, removedAt: null },
        select: { roughStoneId: true, gemstoneId: true },
      });
      if (termsChanged && stones.length > 0) {
        const caps = await validateCoPartnerCaps(tx, {
          dealId: deal.id,
          method: t.method,
          ratePct: t.ratePct === null ? null : Number(t.ratePct),
          stones: stones.map((s) => (s.roughStoneId ? { kind: "ROUGH" as const, id: s.roughStoneId } : { kind: "GEM" as const, id: s.gemstoneId! })),
        });
        if (caps.errors.length > 0) throw new Rollback(caps.errors[0]);
      }

      const flags = cleanDependencies(parseVisibility(deal.visibility), t.method, t.earnOn);
      const data: Prisma.PartnerDealUpdateInput = {
        title: d.title,
        partnerTitle: d.partnerTitle,
        partnerNote: d.partnerNote,
        internalNotes: d.internalNotes,
        method: t.method,
        scope: t.scope,
        earnOn: t.earnOn,
        currency: t.currency,
        ratePct: t.ratePct,
        fixedFee: t.fixedFee,
        invested: t.invested,
        capitalProtected: t.capitalProtected,
        visibility: serializeVisibility(flags),
        visibilityPreset: presetOf(flags),
      };
      // Once a ledger row exists the rates are frozen on the deal and cost types change only through their own action.
      if (!frozen) {
        data.rateOverrides = rates.json;
        data.excludedCostTypes = JSON.stringify(cleanExcluded(d.excludedCostTypes));
      }
      if (draft && d.partnerId !== deal.partnerId) data.partner = { connect: { id: d.partnerId } };
      if (t.scope !== "POOLED") {
        data.poolAcquisitionCost = null;
        data.poolCurrency = null;
      }
      if (!draft && termsChanged) {
        data.termsVersion = { increment: 1 };
        data.termsAmendedAt = new Date();
        data.termsAmendReason = reason;
      }
      await tx.partnerDeal.update({ where: { id: deal.id }, data });
      if (deal.method === "INVESTMENT" && t.method !== "INVESTMENT") {
        await tx.partnerDealStone.updateMany({ where: { dealId: deal.id }, data: { investedAlloc: null } });
      }

      if (!draft && termsChanged) {
        await auditDeal(tx, g.actor, deal, "TERMS_AMENDED", `Terms of deal ${deal.code} amended`, { changedFields: changed });
      } else {
        await auditDeal(tx, g.actor, deal, "UPDATE", `Deal ${deal.code} updated`, { changedFields: changed });
      }
      revalidateDeal(deal);
      if (draft && d.partnerId !== deal.partnerId) revalidatePath(`/partners/${d.partnerId}`);
    }, TX_OPTIONS);
    return { ok: true };
  } catch (e) {
    return fail(describe("updateDeal", e));
  }
}

export async function updateDealDraft(args: { dealId: string; input: DealInput }): Promise<{ ok: true } | Fail> {
  return updateDealCore({ dealId: args?.dealId, input: args?.input }, "DRAFT");
}

export async function amendTerms(args: { dealId: string; input: DealInput; reason?: string | null }): Promise<{ ok: true } | Fail> {
  return updateDealCore(args, "ACTIVE");
}

const excludedSchema = z.object({
  dealId: idSchema,
  types: z.array(z.string().regex(/^[A-Z][A-Z_]{1,39}$/, "A cost type is not valid")).max(40),
});

/** The "Cost types in this deal" table: which cost types are never charged to the partner. */
export async function setExcludedCostTypes(args: { dealId: string; types: string[] }): Promise<{ ok: true } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const parsed = excludedSchema.safeParse(args);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const types = cleanExcluded(parsed.data.types);
  try {
    const deal = await prisma.partnerDeal.findUnique({ where: { id: parsed.data.dealId }, select: { id: true, code: true, status: true, partnerId: true } });
    if (!deal) return fail("The deal was not found.");
    if (deal.status !== "DRAFT" && deal.status !== "ACTIVE") return fail("Cost types can only be changed on a draft or active deal.");
    await prisma.$transaction(async (tx) => {
      await tx.partnerDeal.update({ where: { id: deal.id }, data: { excludedCostTypes: JSON.stringify(types) } });
      await auditDeal(tx, g.actor, deal, "UPDATE", `Cost types charged to the partner changed on deal ${deal.code}`, { excludedCostTypes: types });
    }, TX_OPTIONS);
    revalidateDeal(deal);
    return { ok: true };
  } catch (e) {
    return fail(describe("setExcludedCostTypes", e));
  }
}

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

export async function checkDealActivation(dealId: string): Promise<{ ok: true; errors: string[]; warnings: string[] } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const id = idSchema.safeParse(dealId);
  if (!id.success) return fail("The deal was not found.");
  try {
    const r = await validateDealForActivation(id.data);
    return { ok: true, errors: r.errors, warnings: r.warnings };
  } catch (e) {
    return fail(describe("checkDealActivation", e));
  }
}

export async function activateDeal(dealId: string): Promise<{ ok: true } | (Fail & { errors?: string[] })> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const id = idSchema.safeParse(dealId);
  if (!id.success) return fail("The deal was not found.");
  try {
    const check = await validateDealForActivation(id.data);
    if (!check.ok) return { ok: false, error: check.errors[0] ?? "The deal cannot be started yet.", errors: check.errors };
    await prisma.$transaction(async (tx) => {
      await lockDeal(tx, id.data);
      const deal = await tx.partnerDeal.findUnique({ where: { id: id.data }, select: { id: true, code: true, partnerId: true } });
      if (!deal) throw new Rollback("The deal was not found.");
      const r = await tx.partnerDeal.updateMany({ where: { id: deal.id, status: "DRAFT" }, data: { status: "ACTIVE", activatedAt: new Date() } });
      if (r.count === 0) throw new Rollback("Only a draft deal can be started.");
      await auditDeal(tx, g.actor, deal, "STATUS_CHANGE", `Deal ${deal.code} started`, { from: "DRAFT", to: "ACTIVE", warnings: check.warnings.length });
      revalidateDeal(deal);
    }, TX_OPTIONS);
    return { ok: true };
  } catch (e) {
    return fail(describe("activateDeal", e));
  }
}

async function computeCloseRequirements(dealId: string): Promise<{ ok: true; req: CloseRequirements; code: string; status: string; partnerId: string } | Fail> {
  const deal = await prisma.partnerDeal.findUnique({ where: { id: dealId }, select: { id: true, code: true, status: true, method: true, currency: true, partnerId: true } });
  if (!deal) return fail("The deal was not found.");
  const ledger = await getLedger(prisma, deal.id);
  let capitalOutstandingMinor: number | null = null;
  let cancelledWithPayments = false;
  let estimateFailed = false;
  try {
    const est = await computeEstimate(prisma, deal.id);
    capitalOutstandingMinor = est.result.capitalOutstandingMinor;
    cancelledWithPayments = est.flags.some((f) => f.code === "CANCELLED_WITH_PAYMENTS");
  } catch (e) {
    if (!(e instanceof PartnerGatherError || e instanceof EngineInvariantError)) console.error("close requirements estimate failed", e);
    estimateFailed = true;
  }
  const needsBalanceNote = ledger.balance !== 0;
  const needsCapitalNote = deal.method === "INVESTMENT" && (estimateFailed || (capitalOutstandingMinor ?? 0) !== 0);
  return {
    ok: true,
    code: deal.code,
    status: deal.status,
    partnerId: deal.partnerId,
    req: {
      balanceMinor: ledger.balance,
      currency: deal.currency,
      needsTypedConfirm: needsBalanceNote || cancelledWithPayments || estimateFailed,
      needsBalanceNote,
      needsCapitalNote,
      capitalOutstandingMinor,
      cancelledWithPayments,
      estimateFailed,
    },
  };
}

/** What closing this deal will ask for, read fresh each time the dialog opens. */
export async function closeDealRequirements(dealId: string): Promise<{ ok: true; req: CloseRequirements } | Fail> {
  const g = await gate("partner:read");
  if (!g.ok) return g;
  const id = idSchema.safeParse(dealId);
  if (!id.success) return fail("The deal was not found.");
  try {
    const r = await computeCloseRequirements(id.data);
    return r.ok ? { ok: true, req: r.req } : r;
  } catch (e) {
    return fail(describe("closeDealRequirements", e));
  }
}

const closeSchema = z.object({
  dealId: idSchema,
  confirm: z.string().max(60).nullish(),
  note: z.string().max(500, "The note is too long (500 characters at most)").nullish(),
  capitalNote: z.string().max(500, "The note is too long (500 characters at most)").nullish(),
});

const stamp = (d: Date): string => d.toISOString().slice(0, 10);
const appendNote = (existing: string | null, line: string): string => (existing ? `${existing}\n${line}` : line).slice(-4000);

export async function closeDeal(args: { dealId: string; confirm?: string | null; note?: string | null; capitalNote?: string | null }): Promise<{ ok: true } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const parsed = closeSchema.safeParse(args);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const note = parsed.data.note?.trim() ?? "";
  const capitalNote = parsed.data.capitalNote?.trim() ?? "";
  try {
    const r = await computeCloseRequirements(parsed.data.dealId);
    if (!r.ok) return r;
    if (r.status !== "ACTIVE") return fail("Only an active deal can be closed.");
    if (r.req.needsTypedConfirm && (parsed.data.confirm ?? "").trim().toUpperCase() !== r.code.toUpperCase()) {
      return fail(`Type the deal code ${r.code} to confirm.`);
    }
    if (r.req.needsBalanceNote && note.length === 0) return fail("Explain how the remaining balance will be settled.");
    if (r.req.needsCapitalNote && capitalNote.length === 0) return fail("Name the stones whose capital is written off, or say how the capital was resolved.");

    await prisma.$transaction(async (tx) => {
      await lockDeal(tx, parsed.data.dealId);
      const deal = await tx.partnerDeal.findUnique({ where: { id: parsed.data.dealId }, select: { id: true, code: true, partnerId: true, internalNotes: true } });
      if (!deal) throw new Rollback("The deal was not found.");
      const now = new Date();
      const lines = [note && `Closed ${stamp(now)}: ${note}`, capitalNote && `Capital on close ${stamp(now)}: ${capitalNote}`].filter(Boolean);
      const res = await tx.partnerDeal.updateMany({
        where: { id: deal.id, status: "ACTIVE" },
        data: { status: "CLOSED", closedAt: now, ...(lines.length ? { internalNotes: appendNote(deal.internalNotes, lines.join("\n")) } : {}) },
      });
      if (res.count === 0) throw new Rollback("Only an active deal can be closed.");
      await auditDeal(tx, g.actor, deal, "STATUS_CHANGE", `Deal ${deal.code} closed`, {
        from: "ACTIVE", to: "CLOSED", balanceMinor: r.req.balanceMinor, capitalOutstandingMinor: r.req.capitalOutstandingMinor, hadNote: note.length > 0,
      });
      revalidateDeal(deal);
    }, TX_OPTIONS);
    return { ok: true };
  } catch (e) {
    return fail(describe("closeDeal", e));
  }
}

const cancelSchema = z.object({ dealId: idSchema, reason: z.string().max(300, "The reason is too long (300 characters at most)").nullish() });

/** A draft, or an active deal that has no settlement, adjustment or payout yet. */
export async function cancelDeal(args: { dealId: string; reason?: string | null }): Promise<{ ok: true } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const parsed = cancelSchema.safeParse(args);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const reason = parsed.data.reason?.trim() ?? "";
  try {
    await prisma.$transaction(async (tx) => {
      await lockDeal(tx, parsed.data.dealId);
      const deal = await tx.partnerDeal.findUnique({ where: { id: parsed.data.dealId }, select: { id: true, code: true, status: true, partnerId: true, internalNotes: true } });
      if (!deal) throw new Rollback("The deal was not found.");
      if (deal.status !== "DRAFT" && deal.status !== "ACTIVE") throw new Rollback("Only a draft or active deal can be cancelled.");
      if (deal.status === "ACTIVE") {
        const rows =
          (await tx.partnerSettlement.count({ where: { dealId: deal.id } })) +
          (await tx.partnerAdjustment.count({ where: { dealId: deal.id } })) +
          (await tx.partnerPayout.count({ where: { dealId: deal.id } }));
        if (rows > 0) throw new Rollback("This deal already has settlements, adjustments or payouts. Close it instead.");
      }
      const now = new Date();
      const res = await tx.partnerDeal.updateMany({
        where: { id: deal.id, status: deal.status },
        data: { status: "CANCELLED", closedAt: now, ...(reason ? { internalNotes: appendNote(deal.internalNotes, `Cancelled ${stamp(now)}: ${reason}`) } : {}) },
      });
      if (res.count === 0) throw new Rollback("The deal changed while you were working. Reload and try again.");
      await auditDeal(tx, g.actor, deal, "STATUS_CHANGE", `Deal ${deal.code} cancelled`, { from: deal.status, to: "CANCELLED", hadReason: reason.length > 0 });
      revalidateDeal(deal);
    }, TX_OPTIONS);
    return { ok: true };
  } catch (e) {
    return fail(describe("cancelDeal", e));
  }
}

// ---------------------------------------------------------------------------
// Stones: search, attach, detach
// ---------------------------------------------------------------------------

const ROUGH_PICK = {
  id: true, code: true, gemType: true, variety: true, weightCt: true, status: true,
  parcel: { select: { id: true, code: true } },
} satisfies Prisma.RoughStoneSelect;
const GEM_PICK = {
  id: true, code: true, gemType: true, variety: true, weightCt: true, status: true,
  transformationsAsOutput: { select: { transformation: { select: { inputs: { select: { roughStone: { select: { code: true } } } } } } } },
} satisfies Prisma.GemstoneSelect;
type RoughPick = Prisma.RoughStoneGetPayload<{ select: typeof ROUGH_PICK }>;
type GemPick = Prisma.GemstoneGetPayload<{ select: typeof GEM_PICK }>;

async function buildSearchRows(dealId: string | null, roughs: RoughPick[], gems: GemPick[]): Promise<StoneSearchRow[]> {
  const derived = await derivedGemIdsByRough(prisma, roughs.map((r) => r.id));
  const footprint = dealId ? await getDealFootprint(prisma, dealId) : { roughIds: [], gemIds: [], derivedGemIds: [] };
  const inRoughs = new Set(footprint.roughIds);
  const inGems = new Set(footprint.gemIds);
  const inDerived = new Set(footprint.derivedGemIds);

  const gemIds = gems.map((x) => x.id);
  const liveGems = gemIds.length
    ? new Set(
        (await prisma.salesOrder.findMany({
          where: { gemstoneId: { in: gemIds }, status: { in: [...LIVE_SALE_STATUSES] } },
          select: { gemstoneId: true },
          distinct: ["gemstoneId"],
        })).map((o) => o.gemstoneId),
      )
    : new Set<string>();

  const stoneRefs: StoneRef[] = [...roughs.map((r) => ({ kind: "ROUGH" as const, id: r.id })), ...gems.map((x) => ({ kind: "GEM" as const, id: x.id }))];
  const keys = stoneRefs.length ? await footprintKeys(prisma, stoneRefs) : new Set<string>();
  const others = keys.size
    ? await findOverlappingDeals(prisma, { ...(dealId ? { excludeDealId: dealId } : {}), keys, statuses: OPEN_DEAL_STATUSES })
    : [];
  const dealsFor = (own: string[]): StoneSearchRow["otherDeals"] => {
    const set = new Set(own);
    return others
      .filter((o) => o.overlap.some((k) => set.has(k)))
      .map((o) => ({ code: o.code, partnerName: o.partnerName, status: o.status }));
  };

  const rows: StoneSearchRow[] = [];
  for (const r of roughs) {
    const gemList = derived.get(r.id) ?? [];
    const note = inRoughs.has(r.id)
      ? "Already in this deal"
      : gemList.some((id) => inGems.has(id))
        ? "One of its gems is in this deal"
        : null;
    rows.push({
      kind: "ROUGH", id: r.id, code: r.code, gemType: r.gemType, variety: r.variety, weightCt: Number(r.weightCt.toString()), status: r.status,
      parcel: r.parcel, derivedGems: gemList.length, parentRoughCode: null, hasLiveOrder: false, inDealNote: note,
      otherDeals: dealsFor([unitKeyOf("ROUGH", r.id), ...gemList.map((id) => unitKeyOf("GEM", id))]),
    });
  }
  for (const x of gems) {
    const parent = x.transformationsAsOutput.flatMap((o) => o.transformation.inputs.map((i) => i.roughStone.code))[0] ?? null;
    const note = inGems.has(x.id) ? "Already in this deal" : inDerived.has(x.id) ? "Covered by its rough in this deal" : null;
    rows.push({
      kind: "GEM", id: x.id, code: x.code, gemType: x.gemType, variety: x.variety, weightCt: Number(x.weightCt.toString()), status: x.status,
      parcel: null, derivedGems: null, parentRoughCode: parent, hasLiveOrder: liveGems.has(x.id), inDealNote: note,
      otherDeals: dealsFor([unitKeyOf("GEM", x.id)]),
    });
  }
  return rows;
}

const searchSchema = z.object({
  dealId: idSchema.nullish(),
  q: z.string().max(80, "The search is too long").default(""),
  kinds: z.array(z.enum(["ROUGH", "GEM"])).min(1).max(2),
});

export async function searchDealStones(args: { dealId?: string | null; q: string; kinds: StoneKind[] }): Promise<{ ok: true; rows: StoneSearchRow[] } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const parsed = searchSchema.safeParse(args);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const kinds = uniq(parsed.data.kinds);
  const wantRough = kinds.includes("ROUGH") && can(g.user, "rough:read");
  const wantGem = kinds.includes("GEM") && can(g.user, "gemstone:read");
  if (!wantRough && !wantGem) return fail("You do not have access to those stones.");
  const term = parsed.data.q.trim();
  const textWhere = term
    ? {
        OR: [
          { code: { contains: term, mode: insensitive } },
          { gemType: { contains: term, mode: insensitive } },
          { variety: { contains: term, mode: insensitive } },
          { origin: { contains: term, mode: insensitive } },
        ],
      }
    : {};
  try {
    const [roughs, gems] = await Promise.all([
      wantRough ? prisma.roughStone.findMany({ where: textWhere, orderBy: { createdAt: "desc" }, take: 20, select: ROUGH_PICK }) : Promise.resolve([]),
      wantGem ? prisma.gemstone.findMany({ where: textWhere, orderBy: { createdAt: "desc" }, take: 20, select: GEM_PICK }) : Promise.resolve([]),
    ]);
    return { ok: true, rows: await buildSearchRows(parsed.data.dealId ?? null, roughs, gems) };
  } catch (e) {
    return fail(describe("searchDealStones", e));
  }
}

/** "Add all roughs of parcel X": the parcel's roughs as explicit rows, and how far the parcel total is from the stones' prices. */
export async function listParcelRoughs(args: { dealId: string; parcelId: string }): Promise<{ ok: true; parcelCode: string; rows: StoneSearchRow[]; drift: string | null } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const parsed = z.object({ dealId: idSchema, parcelId: idSchema }).safeParse(args);
  if (!parsed.success) return fail("The parcel was not found.");
  if (!can(g.user, "rough:read")) return fail("You do not have access to roughs.");
  try {
    const parcel = await prisma.parcel.findUnique({
      where: { id: parsed.data.parcelId },
      select: { id: true, code: true, totalCost: true, currency: true, roughStones: { orderBy: { code: "asc" }, select: { ...ROUGH_PICK, purchasePrice: true, currency: true } } },
    });
    if (!parcel) return fail("The parcel was not found.");
    const rows = await buildSearchRows(parsed.data.dealId, parcel.roughStones, []);
    let drift: string | null = null;
    if (parcel.roughStones.every((r) => r.currency === parcel.currency)) {
      const sum = parcel.roughStones.reduce((s, r) => s + decimalToMinor(r.purchasePrice), 0);
      const diff = decimalToMinor(parcel.totalCost) - sum;
      drift = diff === 0 ? "The parcel total matches the sum of its stones' prices." : `The parcel total is ${fmtMinor(Math.abs(diff))} ${parcel.currency} ${diff > 0 ? "more" : "less"} than its stones' prices added together.`;
    } else {
      drift = "The parcel's stones are priced in different currencies, so the parcel total cannot be compared directly.";
    }
    return { ok: true, parcelCode: parcel.code, rows, drift };
  } catch (e) {
    return fail(describe("listParcelRoughs", e));
  }
}

const attachSchema = z.object({
  dealId: idSchema,
  stones: z.array(z.object({ kind: z.enum(["ROUGH", "GEM"]), id: idSchema })).min(1, "Choose at least one stone").max(100, "Add at most 100 stones at a time"),
  sales: z
    .record(
      z.string(),
      z.union([
        z.object({ mode: z.literal("IGNORE_EARLIER"), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid count-from date") }),
        z.object({ mode: z.literal("INCLUDE_EARLIER") }),
      ]),
    )
    .optional(),
});

export type AttachResult =
  | { ok: true; added: number; warnings: string[] }
  | { ok: false; error: string; needsSaleDecision?: { kind: StoneKind; id: string; code: string; soldOn: string }[] };

export async function attachStonesToDeal(args: { dealId: string; stones: StoneRef[]; sales?: Record<string, SaleDecision> }): Promise<AttachResult> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const parsed = attachSchema.safeParse(args);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { dealId } = parsed.data;
  const wanted = uniq(parsed.data.stones.map((s) => `${s.kind}:${s.id}`)).map((k) => {
    const [kind, id] = k.split(":");
    return { kind: kind as StoneKind, id };
  });
  if (wanted.some((s) => s.kind === "ROUGH") && !can(g.user, "rough:read")) return fail("You do not have access to roughs.");
  if (wanted.some((s) => s.kind === "GEM") && !can(g.user, "gemstone:read")) return fail("You do not have access to gems.");

  try {
    const deal = await prisma.partnerDeal.findUnique({
      where: { id: dealId },
      select: { id: true, code: true, status: true, method: true, ratePct: true, partnerId: true },
    });
    if (!deal) return fail("The deal was not found.");
    if (deal.status !== "DRAFT" && deal.status !== "ACTIVE") return fail("Stones can only be added to a draft or active deal.");

    const roughIds = wanted.filter((s) => s.kind === "ROUGH").map((s) => s.id);
    const gemIds = wanted.filter((s) => s.kind === "GEM").map((s) => s.id);
    const [roughs, gems] = await Promise.all([
      roughIds.length ? prisma.roughStone.findMany({ where: { id: { in: roughIds } }, select: { id: true, code: true, status: true, weightCt: true } }) : [],
      gemIds.length ? prisma.gemstone.findMany({ where: { id: { in: gemIds } }, select: { id: true, code: true, status: true, weightCt: true } }) : [],
    ]);
    if (roughs.length !== roughIds.length || gems.length !== gemIds.length) return fail("One of the stones was not found.");
    for (const r of roughs) if (r.status === "LOST") return fail(`${r.code} is marked lost and cannot join a deal.`);
    for (const x of gems) if (x.status === "LOST" || x.status === "ARCHIVED") return fail(`${x.code} is ${x.status.toLowerCase()} and cannot join a deal.`);

    const lock = await membershipLockReason(prisma, deal.id, "ATTACH");
    if (lock) return fail(lock);

    const existing = await prisma.partnerDealStone.findMany({
      where: { dealId, OR: [{ roughStoneId: { in: roughIds } }, { gemstoneId: { in: gemIds } }] },
      select: { id: true, roughStoneId: true, gemstoneId: true, removedAt: true },
    });
    const codeOf = new Map<string, string>([...roughs.map((r) => [`ROUGH:${r.id}`, r.code] as const), ...gems.map((x) => [`GEM:${x.id}`, x.code] as const)]);
    for (const e of existing) {
      if (e.removedAt !== null) continue;
      const key = e.roughStoneId ? `ROUGH:${e.roughStoneId}` : `GEM:${e.gemstoneId}`;
      return fail(`${codeOf.get(key) ?? "A stone"} is already in this deal.`);
    }

    // A rough and a gem cut from it can never both be deal stones.
    const live = await prisma.partnerDealStone.findMany({ where: { dealId, removedAt: null }, select: { roughStoneId: true, gemstoneId: true } });
    const allRoughs = uniq([...live.map((s) => s.roughStoneId).filter((x): x is string => x !== null), ...roughIds]);
    const allGems = new Set([...live.map((s) => s.gemstoneId).filter((x): x is string => x !== null), ...gemIds]);
    const derivedAll = await derivedGemIdsByRough(prisma, allRoughs);
    for (const [roughId, list] of derivedAll) {
      const clash = list.find((id) => allGems.has(id));
      if (clash) {
        const [r, x] = await Promise.all([
          prisma.roughStone.findUnique({ where: { id: roughId }, select: { code: true } }),
          prisma.gemstone.findUnique({ where: { id: clash }, select: { code: true } }),
        ]);
        return fail(`${x?.code ?? "A gem"} was cut from ${r?.code ?? "a rough"}, and a deal cannot hold both. Keep one of them.`);
      }
    }

    const caps = await validateCoPartnerCaps(prisma, {
      dealId,
      method: deal.method,
      ratePct: parseNum(deal.ratePct),
      stones: [
        ...live.map((s) => (s.roughStoneId ? { kind: "ROUGH" as const, id: s.roughStoneId } : { kind: "GEM" as const, id: s.gemstoneId! })),
        ...wanted,
      ],
    });
    if (caps.errors.length > 0) return fail(caps.errors[0]);

    // Stones that already have a live sale need an explicit decision.
    const footprintGems = new Map<string, string[]>();
    const newDerived = await derivedGemIdsByRough(prisma, roughIds);
    for (const s of wanted) footprintGems.set(`${s.kind}:${s.id}`, s.kind === "GEM" ? [s.id] : newDerived.get(s.id) ?? []);
    const everyGem = uniq([...footprintGems.values()].flat());
    const orders = everyGem.length
      ? await prisma.salesOrder.findMany({ where: { gemstoneId: { in: everyGem }, status: { in: [...LIVE_SALE_STATUSES] } }, select: { gemstoneId: true, saleDate: true } })
      : [];
    const soldOn = new Map<string, Date>();
    for (const [key, ids] of footprintGems) {
      const dates = orders.filter((o) => ids.includes(o.gemstoneId)).map((o) => o.saleDate);
      if (dates.length > 0) soldOn.set(key, new Date(Math.max(...dates.map((d) => d.getTime()))));
    }
    const decisions = parsed.data.sales ?? {};
    const undecided = [...soldOn].filter(([key]) => decisions[key] === undefined);
    if (undecided.length > 0) {
      return {
        ok: false,
        error: "STONE_ALREADY_SOLD",
        needsSaleDecision: undecided.map(([key, date]) => {
          const [kind, id] = key.split(":");
          return { kind: kind as StoneKind, id, code: codeOf.get(key) ?? key, soldOn: stamp(date) };
        }),
      };
    }
    const countFrom = new Map<string, Date | null>();
    for (const [key, date] of soldOn) {
      const dec = decisions[key];
      if (dec.mode === "INCLUDE_EARLIER") {
        if (deal.method === "INVESTMENT") return fail(`${codeOf.get(key)} was sold before it joined. Investment deals need a count-from date for it.`);
        countFrom.set(key, null);
        continue;
      }
      const from = new Date(`${dec.from}T00:00:00.000Z`);
      if (Number.isNaN(from.getTime())) return fail("Choose a valid count-from date.");
      if (from.getTime() <= date.getTime()) return fail(`Choose a count-from date after the earlier sale of ${codeOf.get(key)} (${stamp(date)}), or include that sale.`);
      countFrom.set(key, from);
    }

    const created = await prisma.$transaction(async (tx) => {
      await lockDeal(tx, dealId);
      const relock = await membershipLockReason(tx, dealId, "ATTACH");
      if (relock) throw new Rollback(relock);
      const now = new Date();
      let n = 0;
      for (const s of wanted) {
        const key = `${s.kind}:${s.id}`;
        const stone = s.kind === "ROUGH" ? roughs.find((r) => r.id === s.id)! : gems.find((x) => x.id === s.id)!;
        const data = {
          weightMilli: weightMilliOf(stone.weightCt),
          countSalesFrom: countFrom.get(key) ?? null,
          addedAt: now,
          addedById: g.actor.id,
          addedByName: g.actor.name,
          removedAt: null,
          removedReason: null,
          acquisitionOverride: null,
          acquisitionCurrency: null,
          acquisitionSource: null,
          investedAlloc: null,
          writtenOffAt: null,
          writtenOffNote: null,
        };
        const prior = existing.find((e) => (s.kind === "ROUGH" ? e.roughStoneId === s.id : e.gemstoneId === s.id));
        const row = prior
          ? await tx.partnerDealStone.update({ where: { id: prior.id }, data, select: { id: true } })
          : await tx.partnerDealStone.create({
              data: { ...data, dealId, ...(s.kind === "ROUGH" ? { roughStoneId: s.id } : { gemstoneId: s.id }) },
              select: { id: true },
            });
        await writeAudit(
          {
            entity: "PartnerDealStone", entityId: row.id, entityCode: deal.code, action: "ADD_STONE",
            userId: g.actor.id, userName: g.actor.name,
            newValue: `Stone ${codeOf.get(key)} added to deal ${deal.code}`,
            metadata: { dealId, stoneKind: s.kind, stoneId: s.id, weightMilli: data.weightMilli, countSalesFrom: data.countSalesFrom?.toISOString() ?? null },
          },
          tx,
        );
        n++;
      }
      try {
        const ob = await checkObligations(tx, dealId);
        if (ob.blocked) throw new Rollback("Together with the other partner deals on these stones, the amounts owed would exceed the revenue. Nothing was added.");
      } catch (e) {
        if (!(e instanceof PartnerGatherError || e instanceof EngineInvariantError)) throw e;
      }
      return n;
    }, TX_OPTIONS);

    revalidateDeal(deal);
    for (const s of wanted) revalidatePath(s.kind === "ROUGH" ? `/rough/${s.id}` : `/gemstones/${s.id}`);
    return { ok: true, added: created, warnings: caps.warnings };
  } catch (e) {
    return fail(describe("attachStonesToDeal", e));
  }
}

const detachSchema = z.object({ dealId: idSchema, dealStoneId: idSchema, reason: z.string().max(300, "The reason is too long (300 characters at most)").nullish() });

export async function detachStone(args: { dealId: string; dealStoneId: string; reason?: string | null }): Promise<{ ok: true } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const parsed = detachSchema.safeParse(args);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { dealId, dealStoneId } = parsed.data;
  const reason = parsed.data.reason?.trim() ?? "";
  try {
    const deal = await prisma.partnerDeal.findUnique({ where: { id: dealId }, select: { id: true, code: true, status: true, partnerId: true } });
    if (!deal) return fail("The deal was not found.");
    if (deal.status !== "DRAFT" && deal.status !== "ACTIVE") return fail("Stones can only be removed from a draft or active deal.");
    if (deal.status === "ACTIVE" && reason.length === 0) return fail("Say why the stone is being removed.");

    const stone = await prisma.$transaction(async (tx) => {
      await lockDeal(tx, dealId);
      const lock = await membershipLockReason(tx, dealId, "DETACH", dealStoneId);
      if (lock) throw new Rollback(lock);
      const ds = await tx.partnerDealStone.findFirst({
        where: { id: dealStoneId, dealId, removedAt: null },
        select: { id: true, roughStoneId: true, gemstoneId: true, roughStone: { select: { code: true } }, gemstone: { select: { code: true } } },
      });
      if (!ds) throw new Rollback("That stone is not in this deal.");
      await tx.partnerDealStone.update({ where: { id: ds.id }, data: { removedAt: new Date(), removedReason: reason || null } });
      const code = ds.roughStone?.code ?? ds.gemstone?.code ?? "Stone";
      await writeAudit(
        {
          entity: "PartnerDealStone", entityId: ds.id, entityCode: deal.code, action: "REMOVE_STONE",
          userId: g.actor.id, userName: g.actor.name,
          newValue: `Stone ${code} removed from deal ${deal.code}`,
          metadata: { dealId, stoneKind: ds.roughStoneId ? "ROUGH" : "GEM", stoneId: ds.roughStoneId ?? ds.gemstoneId, hadReason: reason.length > 0 },
        },
        tx,
      );
      return ds;
    }, TX_OPTIONS);

    revalidateDeal(deal);
    revalidatePath(stone.roughStoneId ? `/rough/${stone.roughStoneId}` : `/gemstones/${stone.gemstoneId}`);
    return { ok: true };
  } catch (e) {
    return fail(describe("detachStone", e));
  }
}

// ---------------------------------------------------------------------------
// Allocators (the ledger does the work; these add the session, a rolled-back preview and revalidation)
// ---------------------------------------------------------------------------

const manualRows = z.array(z.object({ dealStoneId: idSchema, amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) })).max(500);
const allocationSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("POOL_LUMP"),
    basis: z.enum(["WEIGHT", "EQUAL"]),
    amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    currency: z.string().max(3),
  }),
  z.object({ source: z.literal("PARCEL_TOTAL") }),
  z.object({ source: z.literal("MANUAL"), currency: z.string().max(3), manual: manualRows }),
]);

class DryRun extends Error {
  constructor(readonly rows: AllocationRow[]) {
    super("dry run");
  }
}

async function readAllocation(tx: Tx, dealId: string, field: "acquisition" | "investment"): Promise<AllocationRow[]> {
  const rows = await tx.partnerDealStone.findMany({
    where: { dealId, removedAt: null },
    orderBy: [{ addedAt: "asc" }, { id: "asc" }],
    select: {
      id: true, acquisitionOverride: true, acquisitionCurrency: true, investedAlloc: true,
      roughStone: { select: { code: true } }, gemstone: { select: { code: true } },
    },
  });
  return rows.map((r) => {
    const value = field === "acquisition" ? r.acquisitionOverride : r.investedAlloc;
    return {
      dealStoneId: r.id,
      code: r.roughStone?.code ?? r.gemstone?.code ?? "Stone",
      amountMinor: value === null ? 0 : decimalToMinor(value),
      currency: field === "acquisition" ? r.acquisitionCurrency : null,
    };
  });
}

/** What an allocation would write, computed by the real allocator inside a transaction that is always rolled back. */
export async function previewAllocation(args: { dealId: string; kind: "ACQUISITION"; spec: AllocationSpecInput } | { dealId: string; kind: "INVESTMENT"; manual?: { dealStoneId: string; amountMinor: number }[] }): Promise<{ ok: true; rows: AllocationRow[]; totalMinor: number } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const id = idSchema.safeParse(args?.dealId);
  if (!id.success) return fail("The deal was not found.");
  let spec: z.infer<typeof allocationSchema> | null = null;
  let manual: z.infer<typeof manualRows> | undefined;
  if (args.kind === "ACQUISITION") {
    const s = allocationSchema.safeParse(args.spec);
    if (!s.success) return fail(firstIssue(s.error));
    spec = s.data;
  } else if (args.manual !== undefined) {
    const m = manualRows.safeParse(args.manual);
    if (!m.success) return fail("The invested amounts are not valid.");
    manual = m.data;
  }
  try {
    await prisma.$transaction(async (tx) => {
      const r = spec
        ? await allocateAcquisitionIn(tx, id.data, spec, g.actor.id)
        : await allocateInvestmentIn(tx, id.data, g.actor.id, manual);
      if (!r.ok) throw new Rollback(r.error);
      throw new DryRun(await readAllocation(tx, id.data, spec ? "acquisition" : "investment"));
    }, TX_OPTIONS);
    return fail(GENERIC);
  } catch (e) {
    if (e instanceof DryRun) return { ok: true, rows: e.rows, totalMinor: e.rows.reduce((s, r) => s + r.amountMinor, 0) };
    return fail(describe("previewAllocation", e));
  }
}

export async function allocateAcquisitionAction(args: { dealId: string; spec: AllocationSpecInput }): Promise<{ ok: true } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const id = idSchema.safeParse(args?.dealId);
  if (!id.success) return fail("The deal was not found.");
  const spec = allocationSchema.safeParse(args.spec);
  if (!spec.success) return fail(firstIssue(spec.error));
  try {
    const r = await ledgerAllocateAcquisition(id.data, spec.data, g.actor.id);
    if (!r.ok) return r;
    const deal = await prisma.partnerDeal.findUnique({ where: { id: id.data }, select: { id: true, partnerId: true } });
    if (deal) revalidateDeal(deal);
    return { ok: true };
  } catch (e) {
    return fail(describe("allocateAcquisitionAction", e));
  }
}

export async function allocateInvestmentAction(args: { dealId: string; manual?: { dealStoneId: string; amountMinor: number }[] }): Promise<{ ok: true } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const id = idSchema.safeParse(args?.dealId);
  if (!id.success) return fail("The deal was not found.");
  let manual: z.infer<typeof manualRows> | undefined;
  if (args.manual !== undefined) {
    const m = manualRows.safeParse(args.manual);
    if (!m.success) return fail("The invested amounts are not valid.");
    manual = m.data;
  }
  try {
    const r = await ledgerAllocateInvestment(id.data, g.actor.id, manual);
    if (!r.ok) return r;
    const deal = await prisma.partnerDeal.findUnique({ where: { id: id.data }, select: { id: true, partnerId: true } });
    if (deal) revalidateDeal(deal);
    return { ok: true };
  } catch (e) {
    return fail(describe("allocateInvestmentAction", e));
  }
}

// ---------------------------------------------------------------------------
// Visibility and media
// ---------------------------------------------------------------------------

const visibilityArgs = z.object({ dealId: idSchema, visibility: z.record(z.string(), z.unknown()) });

export async function saveVisibility(args: { dealId: string; visibility: PartnerVisibility }): Promise<{ ok: true; preset: string } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const parsed = visibilityArgs.safeParse(args);
  if (!parsed.success) return fail("The visibility settings are not valid.");
  try {
    const result = await prisma.$transaction(async (tx) => {
      const deal = await tx.partnerDeal.findUnique({ where: { id: parsed.data.dealId }, select: { id: true, code: true, partnerId: true, method: true, earnOn: true, visibility: true } });
      if (!deal) throw new Rollback("The deal was not found.");
      const method = deal.method as Method;
      const earnOn = deal.earnOn as EarnOn;
      const flags = cleanDependencies(coerceVisibility(parsed.data.visibility), method, earnOn);
      const before = parseVisibility(deal.visibility);
      const preset = presetOf(flags);
      await tx.partnerDeal.update({ where: { id: deal.id }, data: { visibility: serializeVisibility(flags), visibilityPreset: preset } });
      const turnedOn = VISIBILITY_KEYS.filter((k) => flags[k] && !before[k]);
      const turnedOff = VISIBILITY_KEYS.filter((k) => !flags[k] && before[k]);
      await auditDeal(tx, g.actor, deal, "VISIBILITY_UPDATED", `Partner visibility updated for deal ${deal.code}`, { preset, turnedOn, turnedOff });
      return { deal, preset };
    }, TX_OPTIONS);
    revalidateDeal(result.deal);
    return { ok: true, preset: result.preset };
  } catch (e) {
    return fail(describe("saveVisibility", e));
  }
}

/** Read-only: the partner page as it would look with these (unsaved) switches. Nothing is logged or counted. */
export async function previewVisibility(dealId: string, json: string): Promise<{ ok: true; dto: PartnerPortalDto } | Fail> {
  const g = await gate("partner:read");
  if (!g.ok) return g;
  const id = idSchema.safeParse(dealId);
  if (!id.success || typeof json !== "string" || json.length > 4000) return fail("The preview request is not valid.");
  try {
    const dto = await buildPartnerPortalDto({ dealId: id.data, viewer: adminPreview(id.data), visibility: parseVisibility(json) });
    return { ok: true, dto };
  } catch (e) {
    console.error("previewVisibility failed:", e instanceof Error ? e.name : "unknown");
    return fail(e instanceof Error && e.message ? `The preview could not be built: ${e.message}` : "The preview could not be built.");
  }
}

/** Per-asset exclusion. The asset must belong to a stone, a derived gem or a cutting job of this deal. */
export async function setAssetPartnerHidden(assetId: string, hidden: boolean, dealId: string): Promise<{ ok: true } | Fail> {
  const g = await gate("partner:write");
  if (!g.ok) return g;
  const parsed = z.object({ assetId: idSchema, hidden: z.boolean(), dealId: idSchema }).safeParse({ assetId, hidden, dealId });
  if (!parsed.success) return fail("The photo was not found.");
  try {
    const deal = await prisma.partnerDeal.findUnique({ where: { id: parsed.data.dealId }, select: { id: true, code: true, partnerId: true } });
    if (!deal) return fail("The deal was not found.");
    const asset = await prisma.digitalAsset.findUnique({
      where: { id: parsed.data.assetId },
      select: { id: true, gemstoneId: true, roughStoneId: true, cuttingJob: { select: { roughStoneId: true } } },
    });
    if (!asset) return fail("The photo was not found.");
    const fp = await getDealFootprint(prisma, deal.id);
    const gems = new Set([...fp.gemIds, ...fp.derivedGemIds]);
    const roughs = new Set(fp.roughIds);
    const belongs =
      (asset.gemstoneId !== null && gems.has(asset.gemstoneId)) ||
      (asset.roughStoneId !== null && roughs.has(asset.roughStoneId)) ||
      (asset.cuttingJob !== null && roughs.has(asset.cuttingJob.roughStoneId));
    if (!belongs) return fail("That photo does not belong to a stone in this deal.");
    await prisma.$transaction(async (tx) => {
      await tx.digitalAsset.update({ where: { id: asset.id }, data: { partnerHidden: parsed.data.hidden ? true : null } });
      await auditDeal(tx, g.actor, deal, "ASSET_HIDDEN", parsed.data.hidden ? `A photo was hidden from partners on deal ${deal.code}` : `A photo was released to partners on deal ${deal.code}`, {
        assetId: asset.id, hidden: parsed.data.hidden,
      });
    }, TX_OPTIONS);
    revalidatePath(`/partners/deals/${deal.id}`);
    return { ok: true };
  } catch (e) {
    return fail(describe("setAssetPartnerHidden", e));
  }
}
