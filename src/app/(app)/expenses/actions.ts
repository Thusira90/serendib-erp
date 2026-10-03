"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { saveUpload } from "@/lib/uploads";
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, STONE_BILL_CATEGORIES } from "@/lib/enums";
import { captureRate, getExchangeRates } from "@/lib/money";
import {
  allocateExpenseToStone, lockExpense, lockRoughStone, removeExpenseAllocation,
} from "@/lib/bill-allocation";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);
const dec = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};
const date = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const createSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive(),
  currency: z.string(),
  vendor: z.string().nullable(),
  description: z.string().min(1),
  incurredAt: z.date().nullable(),
  relatedEntity: z.string().nullable(),
  relatedId: z.string().nullable(),
  relatedCode: z.string().nullable(),
  notes: z.string().nullable(),
});

export async function createExpense(fd: FormData) {
  const session = await requireCapability("expense:write");
  const parsed = createSchema.parse({
    category: str(fd.get("category")) ?? "OTHER",
    amount: dec(fd.get("amount")),
    currency: str(fd.get("currency")) ?? "LKR",
    vendor: str(fd.get("vendor")),
    description: str(fd.get("description")) ?? "",
    incurredAt: date(fd.get("incurredAt")),
    relatedEntity: str(fd.get("relatedEntity")),
    relatedId: str(fd.get("relatedId")),
    relatedCode: str(fd.get("relatedCode")),
    notes: str(fd.get("notes")),
  });

  const receiptFile = fd.get("receiptFile") as File | null;
  const receipt = await saveUpload(receiptFile, "receipts");

  const year = new Date(parsed.incurredAt ?? new Date()).getUTCFullYear();
  const rates = await getExchangeRates();
  await prisma.$transaction(async (tx) => {
    const code = await nextCode(codePrefix.expense, year, tx, { pad: 4 });
    const created = await tx.expense.create({
      data: {
        code,
        category: parsed.category,
        amount: parsed.amount,
        currency: parsed.currency,
        fxRateLkr: captureRate(rates, parsed.currency),
        vendor: parsed.vendor,
        description: parsed.description,
        incurredAt: parsed.incurredAt ?? new Date(),
        relatedEntity: parsed.relatedEntity,
        relatedId: parsed.relatedId,
        relatedCode: parsed.relatedCode,
        receiptUrl: receipt?.url ?? str(fd.get("receiptUrl")),
        recordedBy: session.user.name ?? null,
        notes: parsed.notes,
        status: "RECORDED",
      },
    });
    await writeAudit({
      entity: "Expense", entityId: created.id, entityCode: created.code,
      action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `${parsed.category} · ${parsed.amount.toFixed(2)} ${parsed.currency} — ${parsed.description.slice(0,80)}`,
    }, tx);
  });
  revalidatePath("/expenses");
  revalidatePath("/");
  revalidatePath("/reports/pnl");
}

/**
 * "Add bill" for a specific stone. Creates an Expense (so it shows on the
 * expenses ledger, the P&L, and the finance dashboards) AND a CostAllocation
 * on the stone (so its true cost + margin update in real time). The two
 * rows are linked, so opening either surfaces the other.
 *
 * `kind` picks which stone: "rough" attaches the allocation to a rough
 * (bills paid before cutting — transport, valuation, storage, insurance,
 * appraisal); "gemstone" attaches to a finished stone (cutting labour,
 * cert fees, photography, CGI, packaging).
 *
 * A bill on an already-cut rough is also copied onto the gems derived from it
 * (output-weight share), so their true cost includes it. Only
 * STONE_BILL_CATEGORIES may be filed: overhead (rent, salaries, ...) must not
 * be capitalised into stone cost.
 */
const stoneBillSchema = z.object({
  kind: z.enum(["rough", "gemstone"]),
  stoneId: z.string().min(1),
  category: z.string(),
  amount: z.number().positive(),
  currency: z.string(),
  vendor: z.string().nullable(),
  description: z.string().min(1),
  incurredAt: z.date().nullable(),
  notes: z.string().nullable(),
});

export async function addStoneBill(fd: FormData) {
  const session = await requireCapability("expense:write");
  const parsed = stoneBillSchema.parse({
    kind: str(fd.get("kind")),
    stoneId: str(fd.get("stoneId")),
    category: str(fd.get("category")) ?? "OTHER",
    amount: dec(fd.get("amount")),
    currency: str(fd.get("currency")) ?? "LKR",
    vendor: str(fd.get("vendor")),
    description: str(fd.get("description")) ?? "",
    incurredAt: date(fd.get("incurredAt")),
    notes: str(fd.get("notes")),
  });
  if (!(STONE_BILL_CATEGORIES as readonly string[]).includes(parsed.category)) {
    throw new Error(
      `"${parsed.category.replaceAll("_", " ").toLowerCase()}" is an overhead category and cannot be filed as a stone bill. Record it as a general expense instead.`,
    );
  }

  // Resolve the stone up front so we can build the Expense's relatedCode
  // (visible on the expenses list) and validate the id.
  let relatedEntity: "RoughStone" | "Gemstone";
  let relatedCode: string;
  if (parsed.kind === "rough") {
    const r = await prisma.roughStone.findUniqueOrThrow({
      where: { id: parsed.stoneId }, select: { code: true },
    });
    relatedEntity = "RoughStone";
    relatedCode = r.code;
  } else {
    const g = await prisma.gemstone.findUniqueOrThrow({
      where: { id: parsed.stoneId }, select: { code: true },
    });
    relatedEntity = "Gemstone";
    relatedCode = g.code;
  }

  const receiptFile = fd.get("receiptFile") as File | null;
  const receipt = await saveUpload(receiptFile, "receipts");

  const incurredAt = parsed.incurredAt ?? new Date();
  const year = incurredAt.getUTCFullYear();
  const rates = await getExchangeRates();
  let gemIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    // Serialise against cutting of the same rough: the bill must land either
    // before the cut (copied by it) or after (copied here), never in between.
    if (parsed.kind === "rough") await lockRoughStone(tx, parsed.stoneId);
    const code = await nextCode(codePrefix.expense, year, tx, { pad: 4 });
    const expense = await tx.expense.create({
      data: {
        code,
        category: parsed.category,
        amount: parsed.amount,
        currency: parsed.currency,
        fxRateLkr: captureRate(rates, parsed.currency),
        vendor: parsed.vendor,
        description: parsed.description,
        incurredAt,
        relatedEntity,
        relatedId: parsed.stoneId,
        relatedCode,
        receiptUrl: receipt?.url ?? null,
        recordedBy: session.user.name ?? null,
        notes: parsed.notes,
        status: "RECORDED",
      },
    });

    // Mirror the expense onto the stone's cost history (gem: recompute its
    // cost; rough: also copy the bill onto gems already cut from it).
    const allocated = await allocateExpenseToStone(tx, rates, expense);
    if (!allocated) throw new Error("Could not allocate the bill to the stone.");
    gemIds = allocated.gemIds;

    await writeAudit({
      entity: relatedEntity, entityId: parsed.stoneId, entityCode: relatedCode,
      action: "BILL_ADDED",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `${parsed.category} · ${parsed.amount.toFixed(2)} ${parsed.currency}${parsed.vendor ? ` from ${parsed.vendor}` : ""} — ${parsed.description.slice(0, 80)}`,
      metadata: {
        expenseId: expense.id, expenseCode: expense.code,
        ...(parsed.kind === "rough" ? { gemIds: allocated.gemIds } : {}),
      },
    }, tx);
  }, { timeout: 15_000 });

  if (parsed.kind === "gemstone") revalidatePath(`/gemstones/${parsed.stoneId}`);
  else revalidatePath(`/rough/${parsed.stoneId}`);
  if (parsed.kind === "rough") for (const id of gemIds) revalidatePath(`/gemstones/${id}`);
  revalidatePath("/expenses");
  revalidatePath("/reports/pnl");
  revalidatePath("/");
}

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(EXPENSE_STATUSES),
});

/**
 * Status change on an expense. Rejecting a stone bill takes its cost off the
 * stone (and off every gem cut from that rough); moving it back out of
 * REJECTED puts the cost back. Safe to repeat: both directions check the
 * current state first.
 */
export async function updateExpenseStatus(fd: FormData) {
  const session = await requireCapability("expense:write");
  const parsed = statusSchema.parse({
    id: str(fd.get("id")),
    status: str(fd.get("status")),
  });
  const rates = await getExchangeRates();
  let touched: { entity: string | null; stoneId: string | null; gemIds: string[] } = {
    entity: null, stoneId: null, gemIds: [],
  };

  await prisma.$transaction(async (tx) => {
    await lockExpense(tx, parsed.id);
    const before = await tx.expense.findUniqueOrThrow({ where: { id: parsed.id } });
    if (before.status === parsed.status) return;
    const stoneEntity = before.relatedEntity === "RoughStone" || before.relatedEntity === "Gemstone"
      ? before.relatedEntity : null;
    if (before.relatedEntity === "RoughStone" && before.relatedId) await lockRoughStone(tx, before.relatedId);

    await tx.expense.update({
      where: { id: parsed.id },
      data: {
        status: parsed.status,
        approvedBy: parsed.status === "APPROVED" ? session.user.name ?? null : before.approvedBy,
        approvedAt: parsed.status === "APPROVED" && !before.approvedAt ? new Date() : before.approvedAt,
      },
    });
    await writeAudit({
      entity: "Expense", entityId: parsed.id, entityCode: before.code,
      action: "STATUS_CHANGE", field: "status",
      oldValue: before.status, newValue: parsed.status,
      userId: session.user.id, userName: session.user.name ?? null,
    }, tx);

    let note: { action: string; text: string; gemIds: string[]; lines: number } | null = null;
    if (parsed.status === "REJECTED") {
      const r = await removeExpenseAllocation(tx, rates, before.id);
      if (r.allocationId) {
        note = {
          action: "BILL_REJECTED", gemIds: r.gemIds, lines: r.removedLines,
          text: `${before.code} rejected: removed ${r.removedLines} cost line${r.removedLines === 1 ? "" : "s"}, ${r.gemIds.length} gem${r.gemIds.length === 1 ? "" : "s"} recomputed`,
        };
      }
    } else if (before.status === "REJECTED" && stoneEntity && before.relatedId) {
      const r = await allocateExpenseToStone(tx, rates, before);
      if (r) {
        note = {
          action: "BILL_RESTORED", gemIds: r.gemIds, lines: 1,
          text: `${before.code} restored: cost re-allocated${stoneEntity === "RoughStone" ? `, ${r.gemIds.length} derived gem${r.gemIds.length === 1 ? "" : "s"} recomputed` : ""}`,
        };
      }
    }
    if (note && before.relatedEntity && before.relatedId) {
      await writeAudit({
        entity: before.relatedEntity, entityId: before.relatedId, entityCode: before.relatedCode,
        action: note.action,
        userId: session.user.id, userName: session.user.name ?? null,
        newValue: note.text,
        metadata: { expenseId: before.id, expenseCode: before.code, gemIds: note.gemIds },
      }, tx);
      touched = { entity: before.relatedEntity, stoneId: before.relatedId, gemIds: note.gemIds };
    }
  }, { timeout: 15_000 });

  if (touched.stoneId) {
    revalidatePath(touched.entity === "RoughStone" ? `/rough/${touched.stoneId}` : `/gemstones/${touched.stoneId}`);
    for (const id of touched.gemIds) revalidatePath(`/gemstones/${id}`);
    revalidatePath("/gemstones");
    revalidatePath("/");
  }
  revalidatePath("/expenses");
  revalidatePath("/reports/pnl");
}
