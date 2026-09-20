"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ACCOUNT_TYPES, ACCOUNT_SUBTYPES } from "@/lib/enums";
import { seedDefaultChartOfAccounts } from "@/lib/coa-seed";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);

const createSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1),
  type: z.enum(ACCOUNT_TYPES),
  subtype: z.enum(ACCOUNT_SUBTYPES).nullable(),
  parentCode: z.string().nullable(),
  currency: z.string(),
  description: z.string().nullable(),
});

export async function createAccount(fd: FormData) {
  const session = await requireCapability("accounting:write");
  const parsed = createSchema.parse({
    code: str(fd.get("code")) ?? "",
    name: str(fd.get("name")) ?? "",
    type: str(fd.get("type")) ?? "ASSET",
    subtype: str(fd.get("subtype")) as z.infer<typeof createSchema>["subtype"],
    parentCode: str(fd.get("parentCode")),
    currency: str(fd.get("currency")) ?? "LKR",
    description: str(fd.get("description")),
  });
  await prisma.$transaction(async (tx) => {
    let parentId: string | null = null;
    if (parsed.parentCode) {
      const parent = await tx.chartAccount.findUnique({ where: { code: parsed.parentCode } });
      if (!parent) throw new Error(`Parent account ${parsed.parentCode} not found.`);
      parentId = parent.id;
    }
    const created = await tx.chartAccount.create({
      data: {
        code: parsed.code,
        name: parsed.name,
        type: parsed.type,
        subtype: parsed.subtype,
        parentId,
        currency: parsed.currency,
        description: parsed.description,
        isSystem: false,
      },
    });
    await writeAudit({
      entity: "ChartAccount", entityId: created.id, entityCode: created.code,
      action: "CREATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `${parsed.code} · ${parsed.name} (${parsed.type})`,
    }, tx);
  });
  revalidatePath("/accounts");
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean(),
  description: z.string().nullable(),
});

export async function updateAccount(fd: FormData) {
  const session = await requireCapability("accounting:write");
  const parsed = updateSchema.parse({
    id: str(fd.get("id")),
    name: str(fd.get("name")) ?? "",
    isActive: str(fd.get("isActive")) === "true",
    description: str(fd.get("description")),
  });
  await prisma.$transaction(async (tx) => {
    const before = await tx.chartAccount.findUniqueOrThrow({ where: { id: parsed.id } });
    const patch: { name?: string; isActive?: boolean; description?: string | null } = {
      isActive: parsed.isActive,
      description: parsed.description,
    };
    // System accounts keep their canonical name.
    if (!before.isSystem) patch.name = parsed.name;

    await tx.chartAccount.update({ where: { id: parsed.id }, data: patch });
    await writeAudit({
      entity: "ChartAccount", entityId: parsed.id, entityCode: before.code,
      action: "UPDATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `active=${parsed.isActive}${!before.isSystem ? `, name=${parsed.name}` : ""}`,
    }, tx);
  });
  revalidatePath("/accounts");
}

/**
 * Idempotently seed the default Chart of Accounts. Triggered from the empty
 * state on the /accounts page — the SGS ERP requires a CoA before any
 * accounting can happen.
 */
export async function seedChartOfAccounts() {
  const session = await requireCapability("accounting:write");
  // Default interactive-transaction timeout (5s) isn't enough for 38 inserts
  // on the Supabase pooler round-trip. 30s is plenty of headroom.
  const result = await prisma.$transaction((tx) => seedDefaultChartOfAccounts(tx), { timeout: 30_000 });
  await writeAudit({
    entity: "ChartAccount", entityId: "seed", entityCode: "COA",
    action: "SEED",
    userId: session.user.id, userName: session.user.name ?? null,
    newValue: `${result.created} account(s) created, ${result.total} total.`,
  });
  revalidatePath("/accounts");
  return result;
}
