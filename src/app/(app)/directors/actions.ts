"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode, nextGlobalCode } from "@/lib/ids";
import { writeAudit, auditDiff } from "@/lib/audit";
import { saveUpload } from "@/lib/uploads";
import { PAYMENT_METHODS } from "@/lib/enums";

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

const createDirectorSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  nationalId: z.string().nullable(),
  address: z.string().nullable(),
  sharePct: z.number().min(0).max(100).nullable(),
  joinedAt: z.date().nullable(),
  notes: z.string().nullable(),
});

export async function createDirector(fd: FormData) {
  const session = await requireCapability("director:write");
  const parsed = createDirectorSchema.parse({
    name: str(fd.get("name")) ?? "",
    role: str(fd.get("role")) ?? "Director",
    email: str(fd.get("email")),
    phone: str(fd.get("phone")),
    nationalId: str(fd.get("nationalId")),
    address: str(fd.get("address")),
    sharePct: dec(fd.get("sharePct")),
    joinedAt: date(fd.get("joinedAt")),
    notes: str(fd.get("notes")),
  });

  await prisma.$transaction(async (tx) => {
    const code = await nextGlobalCode(codePrefix.director, tx, { pad: 4 });
    const created = await tx.director.create({
      data: {
        code,
        name: parsed.name,
        role: parsed.role,
        email: parsed.email,
        phone: parsed.phone,
        nationalId: parsed.nationalId,
        address: parsed.address,
        sharePct: parsed.sharePct ?? 0,
        joinedAt: parsed.joinedAt ?? new Date(),
        notes: parsed.notes,
      },
    });
    await writeAudit({
      entity: "Director", entityId: created.id, entityCode: created.code,
      action: "CREATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `${parsed.name} (${parsed.role})${parsed.sharePct != null ? ` · ${parsed.sharePct}%` : ""}`,
    }, tx);
  });
  revalidatePath("/directors");
  revalidatePath("/");
}

const updateDirectorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  nationalId: z.string().nullable(),
  address: z.string().nullable(),
  sharePct: z.number().min(0).max(100).nullable(),
  active: z.boolean(),
  joinedAt: z.date().nullable(),
  leftAt: z.date().nullable(),
  notes: z.string().nullable(),
});

export async function updateDirector(fd: FormData) {
  const session = await requireCapability("director:write");
  const parsed = updateDirectorSchema.parse({
    id: str(fd.get("id")),
    name: str(fd.get("name")) ?? "",
    role: str(fd.get("role")) ?? "Director",
    email: str(fd.get("email")),
    phone: str(fd.get("phone")),
    nationalId: str(fd.get("nationalId")),
    address: str(fd.get("address")),
    sharePct: dec(fd.get("sharePct")),
    active: str(fd.get("active")) === "true",
    joinedAt: date(fd.get("joinedAt")),
    leftAt: date(fd.get("leftAt")),
    notes: str(fd.get("notes")),
  });

  await prisma.$transaction(async (tx) => {
    const before = await tx.director.findUniqueOrThrow({ where: { id: parsed.id } });
    const after = await tx.director.update({
      where: { id: parsed.id },
      data: {
        name: parsed.name,
        role: parsed.role,
        email: parsed.email,
        phone: parsed.phone,
        nationalId: parsed.nationalId,
        address: parsed.address,
        sharePct: parsed.sharePct ?? 0,
        active: parsed.active,
        joinedAt: parsed.joinedAt ?? before.joinedAt,
        leftAt: parsed.leftAt,
        notes: parsed.notes,
      },
    });
    await auditDiff(
      {
        entity: "Director", entityId: parsed.id, entityCode: before.code,
        userId: session.user.id, userName: session.user.name ?? null,
      },
      {
        name: before.name, role: before.role, email: before.email, phone: before.phone,
        sharePct: Number(before.sharePct), active: before.active, notes: before.notes,
      },
      {
        name: after.name, role: after.role, email: after.email, phone: after.phone,
        sharePct: Number(after.sharePct), active: after.active, notes: after.notes,
      },
      ["name", "role", "email", "phone", "sharePct", "active", "notes"],
      tx,
    );
  });
  revalidatePath("/directors");
  revalidatePath(`/directors/${parsed.id}`);
}

const contributionSchema = z.object({
  directorId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().nullable(),
  contributedAt: z.date().nullable(),
  notes: z.string().nullable(),
});

/**
 * Record a capital contribution by a director. The amount is stored in the
 * currency the user picked — reporting rolls that up using the same
 * exchange-rate hint that quotations and expenses use. We deliberately do
 * NOT auto-adjust the director's sharePct: cap-table changes happen on
 * legal grounds, not on cash contributions.
 */
export async function recordCapitalContribution(fd: FormData) {
  const session = await requireCapability("director:write");
  const parsed = contributionSchema.parse({
    directorId: str(fd.get("directorId")),
    amount: dec(fd.get("amount")),
    currency: str(fd.get("currency")) ?? "LKR",
    method: str(fd.get("method")) ?? "BANK_TRANSFER",
    reference: str(fd.get("reference")),
    contributedAt: date(fd.get("contributedAt")),
    notes: str(fd.get("notes")),
  });

  const receiptFile = fd.get("receiptFile") as File | null;
  const receipt = await saveUpload(receiptFile, "capital");

  const year = new Date(parsed.contributedAt ?? new Date()).getUTCFullYear();
  await prisma.$transaction(async (tx) => {
    const director = await tx.director.findUniqueOrThrow({ where: { id: parsed.directorId } });
    const code = await nextCode(codePrefix.capital, year, tx, { pad: 4 });
    const created = await tx.capitalContribution.create({
      data: {
        code,
        directorId: director.id,
        amount: parsed.amount,
        currency: parsed.currency,
        method: parsed.method,
        reference: parsed.reference,
        contributedAt: parsed.contributedAt ?? new Date(),
        receiptUrl: receipt?.url ?? null,
        notes: parsed.notes,
        recordedBy: session.user.name ?? null,
      },
    });
    await writeAudit({
      entity: "CapitalContribution", entityId: created.id, entityCode: created.code,
      action: "CREATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `${director.name}: ${parsed.amount.toFixed(2)} ${parsed.currency} via ${parsed.method}`,
      metadata: { directorId: director.id, directorCode: director.code },
    }, tx);
  });
  revalidatePath("/directors");
  revalidatePath(`/directors/${parsed.directorId}`);
  revalidatePath("/");
}

const deleteContributionSchema = z.object({ id: z.string().min(1) });

export async function deleteCapitalContribution(fd: FormData) {
  const session = await requireCapability("director:write");
  const parsed = deleteContributionSchema.parse({ id: str(fd.get("id")) });
  const directorId = await prisma.$transaction(async (tx) => {
    const cc = await tx.capitalContribution.findUniqueOrThrow({ where: { id: parsed.id } });
    await tx.capitalContribution.delete({ where: { id: parsed.id } });
    await writeAudit({
      entity: "CapitalContribution", entityId: cc.id, entityCode: cc.code,
      action: "DELETE",
      userId: session.user.id, userName: session.user.name ?? null,
      oldValue: `${cc.amount} ${cc.currency} via ${cc.method}`,
    }, tx);
    return cc.directorId;
  });
  revalidatePath("/directors");
  revalidatePath(`/directors/${directorId}`);
  revalidatePath("/");
}
