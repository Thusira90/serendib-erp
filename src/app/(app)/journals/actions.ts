"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { postJournal, reverseJournal } from "@/lib/accounting";
import { PERIOD_STATUSES } from "@/lib/enums";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);
const date = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const manualLineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.string(),
  credit: z.string(),
  description: z.string().nullable(),
});

const manualJournalSchema = z.object({
  transactionDate: z.date(),
  description: z.string().min(1),
  reference: z.string().nullable(),
  currency: z.string(),
  lines: z.array(manualLineSchema).min(2),
});

/**
 * Post a manual journal from the /journals/new form. The form encodes each
 * line as `line.<i>.accountId`, `line.<i>.debit`, `line.<i>.credit`,
 * `line.<i>.description`, with a `lineCount` hidden input up front.
 */
export async function postManualJournal(fd: FormData) {
  const session = await requireCapability("accounting:write");
  const lineCount = parseInt(str(fd.get("lineCount")) ?? "0", 10);
  const rawLines: z.infer<typeof manualLineSchema>[] = [];
  for (let i = 0; i < lineCount; i++) {
    const accountId = str(fd.get(`line.${i}.accountId`));
    if (!accountId) continue;
    rawLines.push({
      accountId,
      debit: str(fd.get(`line.${i}.debit`)) ?? "0",
      credit: str(fd.get(`line.${i}.credit`)) ?? "0",
      description: str(fd.get(`line.${i}.description`)),
    });
  }
  const parsed = manualJournalSchema.parse({
    transactionDate: date(fd.get("transactionDate")) ?? new Date(),
    description: str(fd.get("description")) ?? "",
    reference: str(fd.get("reference")),
    currency: str(fd.get("currency")) ?? "LKR",
    lines: rawLines,
  });

  const journal = await prisma.$transaction(async (tx) => {
    const j = await postJournal({
      transactionDate: parsed.transactionDate,
      description: parsed.description,
      reference: parsed.reference,
      currency: parsed.currency,
      sourceModule: "MANUAL",
      postedBy: session.user.name ?? null,
      lines: parsed.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
      })),
    }, tx);
    await writeAudit({
      entity: "Journal", entityId: j.id, entityCode: j.code,
      action: "POST",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Manual — ${parsed.description.slice(0, 80)}`,
    }, tx);
    return j;
  });
  revalidatePath("/journals");
  revalidatePath("/reports/trial-balance");
  redirect(`/journals/${journal.id}`);
}

const reverseSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1),
});

export async function reverseJournalEntry(fd: FormData) {
  const session = await requireCapability("accounting:write");
  const parsed = reverseSchema.parse({
    id: str(fd.get("id")),
    reason: str(fd.get("reason")) ?? "",
  });
  await prisma.$transaction(async (tx) => {
    const original = await tx.journal.findUniqueOrThrow({ where: { id: parsed.id } });
    if (original.sourceModule !== "MANUAL") {
      // Auto-posted journals must be reversed via their source module so
      // both sides stay linked (e.g. the CapitalTransaction reversal creates
      // the paired reversing journal).
      throw new Error(`Auto-posted journals (source: ${original.sourceModule}) must be reversed via their source record.`);
    }
    const reversal = await reverseJournal(parsed.id, parsed.reason, session.user.name ?? null, tx);
    await writeAudit({
      entity: "Journal", entityId: original.id, entityCode: original.code,
      action: "REVERSE",
      userId: session.user.id, userName: session.user.name ?? null,
      oldValue: "POSTED", newValue: "REVERSED",
      metadata: { reversalCode: reversal.code, reason: parsed.reason },
    }, tx);
  });
  revalidatePath("/journals");
  revalidatePath("/reports/trial-balance");
}

// ─── Period management ─────────────────────────────────────────────────────

const periodSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  status: z.enum(PERIOD_STATUSES),
  notes: z.string().nullable(),
});

export async function setPeriodStatus(fd: FormData) {
  const session = await requireCapability("period:manage");
  const parsed = periodSchema.parse({
    year: parseInt(str(fd.get("year")) ?? "0", 10),
    month: parseInt(str(fd.get("month")) ?? "0", 10),
    status: str(fd.get("status")) ?? "OPEN",
    notes: str(fd.get("notes")),
  });
  await prisma.$transaction(async (tx) => {
    const existing = await tx.accountingPeriod.upsert({
      where: { year_month: { year: parsed.year, month: parsed.month } },
      update: {
        status: parsed.status,
        notes: parsed.notes,
        closedAt: parsed.status !== "OPEN" ? new Date() : null,
        closedBy: parsed.status !== "OPEN" ? (session.user.name ?? null) : null,
      },
      create: {
        year: parsed.year,
        month: parsed.month,
        status: parsed.status,
        notes: parsed.notes,
        closedAt: parsed.status !== "OPEN" ? new Date() : null,
        closedBy: parsed.status !== "OPEN" ? (session.user.name ?? null) : null,
      },
    });
    await writeAudit({
      entity: "AccountingPeriod", entityId: existing.id,
      entityCode: `${parsed.year}-${String(parsed.month).padStart(2, "0")}`,
      action: "STATUS_CHANGE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: parsed.status,
    }, tx);
  });
  revalidatePath("/journals");
  revalidatePath("/reports/trial-balance");
}
