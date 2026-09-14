"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { saveUpload } from "@/lib/uploads";
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES } from "@/lib/enums";

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
    currency: str(fd.get("currency")) ?? "USD",
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
  await prisma.$transaction(async (tx) => {
    const code = await nextCode(codePrefix.expense, year, tx, { pad: 4 });
    const created = await tx.expense.create({
      data: {
        code,
        category: parsed.category,
        amount: parsed.amount,
        currency: parsed.currency,
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

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(EXPENSE_STATUSES),
});

export async function updateExpenseStatus(fd: FormData) {
  const session = await requireCapability("expense:write");
  const parsed = statusSchema.parse({
    id: str(fd.get("id")),
    status: str(fd.get("status")),
  });
  const before = await prisma.expense.findUniqueOrThrow({ where: { id: parsed.id } });
  await prisma.expense.update({
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
  });
  revalidatePath("/expenses");
}
