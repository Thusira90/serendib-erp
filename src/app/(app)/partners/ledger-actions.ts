"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ADJUSTMENT_REASONS, PAYOUT_PAYMENT_METHODS } from "@/lib/enums";
import { tryPartnerCapability } from "@/lib/partner-auth";
import type { GatherFlag } from "@/lib/partner-engine";
import { PartnerGatherError } from "@/lib/partner-gather";
import {
  commitReconcile,
  createAdjustment,
  previewReconcile,
  recordPayout,
  reversePayout,
  revalueRates,
  writeOffStone,
  type CommitResult,
  type ProposalRow,
} from "@/lib/partner-ledger";
import { EngineInvariantError, decimalToMinor, type RateMap } from "@/lib/partner-money";

// Every money action is partner:settle with a fresh read of the user. The ledger functions re-check the actor inside
// their own transaction and write the neutral audit row (and the blocked-reconcile notification) themselves, so these
// wrappers validate, call, and revalidate; auditing here as well would record every event twice.

type Fail = { ok: false; error: string };

export type ReconcileView = {
  dealId: string;
  inputsHash: string;
  asOf: string;
  currency: string;
  rates: RateMap;
  totalMinor: number;
  position: number;
  balance: number;
  proposal: ProposalRow[];
  flags: GatherFlag[];
  blocking: string[];
  needsAck: string[];
};
export type PreviewOutcome = { ok: true; view: ReconcileView } | Fail;
export type LedgerOutcome = { ok: true } | Fail;
export type LedgerCodeOutcome = { ok: true; code: string } | Fail;

const GENERIC_ERROR = "Something went wrong and nothing was changed. Try again.";

const fail = (error: string): Fail => ({ ok: false, error });
const firstIssue = (e: z.ZodError): string => e.issues[0]?.message ?? "Check the details and try again.";

function describe(e: unknown): string {
  if (e instanceof PartnerGatherError || e instanceof EngineInvariantError) return e.message;
  console.error("partner ledger action failed:", e instanceof Error ? e.name : "unknown");
  return GENERIC_ERROR;
}

async function authorise(): Promise<{ ok: true; actor: { id: string; name: string | null } } | Fail> {
  const gate = await tryPartnerCapability("partner:settle", { fresh: true });
  if (!gate.ok) return fail(gate.error);
  return { ok: true, actor: { id: gate.session.user.id, name: gate.session.user.name ?? null } };
}

async function revalidateDeal(dealId: string): Promise<void> {
  revalidatePath("/partners");
  revalidatePath(`/partners/deals/${dealId}`);
  const deal = await prisma.partnerDeal.findUnique({ where: { id: dealId }, select: { partnerId: true } });
  if (deal) revalidatePath(`/partners/${deal.partnerId}`);
}

const ID = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Unknown record");
const cleanAmount = (v: unknown): unknown => (typeof v === "string" ? v.replace(/[,\s]/g, "") : v);
const NOT_ZERO = (v: string): boolean => /[1-9]/.test(v);
const POSITIVE_AMOUNT = z.preprocess(
  cleanAmount,
  z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount with at most 2 decimals").refine(NOT_ZERO, "The amount must be more than zero"),
);
const SIGNED_AMOUNT = z.preprocess(
  cleanAmount,
  z.string().regex(/^[+-]?\d{1,12}(\.\d{1,2})?$/, "Enter an amount with at most 2 decimals").refine(NOT_ZERO, "The amount must be more than zero"),
);
const RATE = z.string().trim().regex(/^\d{1,9}(\.\d{1,6})?$/, "A rate must be a positive number with at most 6 decimals");
const CURRENCY = z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code");
const DATE_ONLY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of the payment");

/** The lib is the authority on which codes a reconcile row may carry; this list is its RECONCILE_REASONS. */
const RECONCILE_REASON_CODES = ["COST_CHANGE", "PRICE_CHANGE", "FX_CORRECTION", "CORRECTION", "NETTING", "SALE_CANCELLED"] as const;

// ---------------------------------------------------------------------------
// Reconcile
// ---------------------------------------------------------------------------

/** Read-only, but it exposes costs and prices, so partner:read is not enough. */
export async function previewReconcileAction(dealId: string): Promise<PreviewOutcome> {
  const parsed = ID.safeParse(dealId);
  if (!parsed.success) return fail("Unknown deal");
  const gate = await authorise();
  if (!gate.ok) return gate;
  try {
    const deal = await prisma.partnerDeal.findUnique({ where: { id: parsed.data }, select: { status: true } });
    if (!deal) return fail("The deal was not found.");
    if (deal.status !== "ACTIVE" && deal.status !== "CLOSED") return fail("Only an active or closed deal can be reconciled.");
    const p = await previewReconcile(parsed.data);
    return {
      ok: true,
      view: {
        dealId: p.dealId,
        inputsHash: p.inputsHash,
        asOf: p.asOf,
        currency: p.ledger.currency,
        rates: p.rates,
        totalMinor: p.result.totalMinor,
        position: p.ledger.position,
        balance: p.ledger.balance,
        proposal: p.proposal,
        flags: p.flags,
        blocking: p.blocking,
        needsAck: p.needsAck,
      },
    };
  } catch (e) {
    return fail(describe(e));
  }
}

const reasonSchema = z.object({
  code: z.enum(RECONCILE_REASON_CODES),
  text: z.string().trim().min(1, "Explain each adjustment in 1 to 500 characters").max(500, "An explanation can be at most 500 characters"),
  partnerNote: z.string().trim().max(280, "A partner note can be at most 280 characters").optional(),
}).strict();

const commitSchema = z.object({
  dealId: ID,
  inputsHash: z.string().regex(/^[0-9a-f]{64}$/, "The review reference is missing. Preview again."),
  rates: z.object({
    base: z.literal("LKR"),
    fetchedAt: z.string().max(40),
    perUnit: z.record(CURRENCY, z.object({ rate: z.string().max(24), source: z.enum(["LIVE", "FALLBACK", "MANUAL"]) }).strict()),
  }).strict(),
  ackedFlags: z.array(z.string().max(64)).max(100),
  forceBelowMateriality: z.array(z.string().max(64)).max(200).optional(),
  reasons: z.record(z.string().min(1).max(64), reasonSchema),
  settlementNote: z.string().trim().max(500, "The settlement note can be at most 500 characters").optional(),
  settlementPartnerNote: z.string().trim().max(280, "A partner note can be at most 280 characters").optional(),
}).strict();

export async function commitReconcileAction(input: z.input<typeof commitSchema>): Promise<CommitResult> {
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID", detail: [firstIssue(parsed.error)] };
  const gate = await authorise();
  if (!gate.ok) return { ok: false, error: "FORBIDDEN", detail: [gate.error] };
  const v = parsed.data;
  try {
    const res = await commitReconcile({
      dealId: v.dealId,
      inputsHash: v.inputsHash,
      rates: v.rates,
      ackedFlags: v.ackedFlags,
      forceBelowMateriality: v.forceBelowMateriality,
      reasons: v.reasons,
      settlementNote: v.settlementNote || undefined,
      settlementPartnerNote: v.settlementPartnerNote || undefined,
      actor: gate.actor,
    });
    if (res.ok) await revalidateDeal(v.dealId);
    return res;
  } catch (e) {
    return { ok: false, error: "INVALID", detail: [describe(e)] };
  }
}

// ---------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------

const adjustmentSchema = z.object({
  dealId: ID,
  bucketKey: z.string().min(1).max(64).nullable(),
  amount: SIGNED_AMOUNT,
  reasonCode: z.enum(ADJUSTMENT_REASONS, { errorMap: () => ({ message: "Choose a reason for the adjustment" }) }),
  reason: z.string().trim().min(1, "Explain the adjustment in 1 to 500 characters").max(500, "The explanation can be at most 500 characters"),
  partnerNote: z.string().trim().max(280, "A partner note can be at most 280 characters").optional(),
  settlementId: ID.optional(),
}).strict();

export async function createAdjustmentAction(input: z.input<typeof adjustmentSchema>): Promise<LedgerCodeOutcome> {
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const gate = await authorise();
  if (!gate.ok) return gate;
  const v = parsed.data;
  try {
    const res = await createAdjustment({
      dealId: v.dealId,
      bucketKey: v.bucketKey,
      amountMinor: decimalToMinor(v.amount),
      reasonCode: v.reasonCode,
      reason: v.reason,
      partnerNote: v.partnerNote || undefined,
      settlementId: v.settlementId,
      actor: gate.actor,
    });
    if (res.ok) await revalidateDeal(v.dealId);
    return res;
  } catch (e) {
    return fail(describe(e));
  }
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

const payoutSchema = z.object({
  dealId: ID,
  direction: z.enum(["PAID", "RECEIVED"], { errorMap: () => ({ message: "Choose whether this is a payment or a repayment" }) }),
  amount: POSITIVE_AMOUNT,
  paidAt: DATE_ONLY,
  method: z.enum(PAYOUT_PAYMENT_METHODS, { errorMap: () => ({ message: "Choose how the money was paid" }) }).optional(),
  reference: z.string().trim().max(200, "The reference can be at most 200 characters").optional(),
  partnerNote: z.string().trim().max(280, "A partner note can be at most 280 characters").optional(),
  originalAmount: POSITIVE_AMOUNT.optional(),
  originalCurrency: CURRENCY.optional(),
  ackPayingAhead: z.boolean().optional(),
}).strict();

export async function recordPayoutAction(input: z.input<typeof payoutSchema>): Promise<LedgerCodeOutcome> {
  const parsed = payoutSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  if ((v.originalAmount === undefined) !== (v.originalCurrency === undefined)) {
    return fail("Give both the original amount and its currency, or neither.");
  }
  const paidAt = new Date(`${v.paidAt}T00:00:00.000Z`);
  if (Number.isNaN(paidAt.getTime()) || paidAt.toISOString().slice(0, 10) !== v.paidAt) return fail("Enter a valid payment date.");
  const gate = await authorise();
  if (!gate.ok) return gate;
  try {
    const res = await recordPayout({
      dealId: v.dealId,
      direction: v.direction,
      amountMinor: decimalToMinor(v.amount),
      paidAt,
      method: v.method,
      reference: v.reference || undefined,
      originalAmountMinor: v.originalAmount === undefined ? undefined : decimalToMinor(v.originalAmount),
      originalCurrency: v.originalCurrency,
      partnerNote: v.partnerNote || undefined,
      ackPayingAhead: v.ackPayingAhead === true,
      actor: gate.actor,
    });
    if (res.ok) await revalidateDeal(v.dealId);
    return res;
  } catch (e) {
    return fail(describe(e));
  }
}

const reverseSchema = z.object({
  payoutId: ID,
  reason: z.string().trim().min(1, "Explain the reversal in 1 to 200 characters").max(200, "The reason can be at most 200 characters"),
}).strict();

export async function reversePayoutAction(input: z.input<typeof reverseSchema>): Promise<LedgerCodeOutcome> {
  const parsed = reverseSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const gate = await authorise();
  if (!gate.ok) return gate;
  try {
    const payout = await prisma.partnerPayout.findUnique({ where: { id: parsed.data.payoutId }, select: { dealId: true } });
    if (!payout) return fail("The payout was not found.");
    const res = await reversePayout({ payoutId: parsed.data.payoutId, reason: parsed.data.reason, actor: gate.actor });
    if (res.ok) await revalidateDeal(payout.dealId);
    return res;
  } catch (e) {
    return fail(describe(e));
  }
}

// ---------------------------------------------------------------------------
// Write-off and revalue
// ---------------------------------------------------------------------------

const writeOffSchema = z.object({
  dealId: ID,
  dealStoneId: ID,
  note: z.string().trim().min(1, "Explain the write-off in 1 to 500 characters").max(500, "The note can be at most 500 characters"),
}).strict();

export async function writeOffStoneAction(input: z.input<typeof writeOffSchema>): Promise<LedgerOutcome> {
  const parsed = writeOffSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const gate = await authorise();
  if (!gate.ok) return gate;
  const v = parsed.data;
  try {
    const res = await writeOffStone({ dealId: v.dealId, dealStoneId: v.dealStoneId, note: v.note, actor: gate.actor });
    if (res.ok) await revalidateDeal(v.dealId);
    return res;
  } catch (e) {
    return fail(describe(e));
  }
}

const revalueSchema = z.object({
  dealId: ID,
  rates: z.record(CURRENCY, RATE).refine((r) => Object.keys(r).length > 0, "Change at least one exchange rate"),
  reason: z.string().trim().min(1, "Explain the revaluation in 1 to 500 characters").max(500, "The reason can be at most 500 characters"),
}).strict();

export async function revalueRatesAction(input: z.input<typeof revalueSchema>): Promise<LedgerOutcome> {
  const parsed = revalueSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const gate = await authorise();
  if (!gate.ok) return gate;
  const v = parsed.data;
  try {
    const res = await revalueRates({ dealId: v.dealId, rates: v.rates, reason: v.reason, actor: gate.actor });
    if (res.ok) await revalidateDeal(v.dealId);
    return res;
  } catch (e) {
    return fail(describe(e));
  }
}
