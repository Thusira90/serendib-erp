"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode } from "@/lib/ids";
import { writeAudit, auditDiff } from "@/lib/audit";
import { customerPreferencesSchema, splitCsv } from "@/lib/customer-preferences";
import { CUSTOMER_KINDS, CUSTOMER_TYPES } from "@/lib/enums";
import type { CustomerKind, CustomerType } from "@/lib/enums";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);
const dec = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

const customerSchema = z.object({
  kind: z.enum(CUSTOMER_KINDS),
  type: z.enum(CUSTOMER_TYPES),
  displayName: z.string().min(1),
  companyName: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  addressLine: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("").transform(() => null)),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  socialProfile: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

function fdCustomer(fd: FormData) {
  return {
    kind: (str(fd.get("kind")) ?? "INDIVIDUAL") as CustomerKind,
    type: (str(fd.get("type")) ?? "PRIVATE_BUYER") as CustomerType,
    displayName: str(fd.get("displayName")) ?? "",
    companyName: str(fd.get("companyName")),
    country: str(fd.get("country")),
    city: str(fd.get("city")),
    addressLine: str(fd.get("addressLine")),
    email: str(fd.get("email")),
    phone: str(fd.get("phone")),
    website: str(fd.get("website")),
    socialProfile: str(fd.get("socialProfile")),
    notes: str(fd.get("notes")),
  };
}

function fdPreferences(fd: FormData) {
  return customerPreferencesSchema.parse({
    gemTypes: splitCsv(fd.get("prefGemTypes")),
    varieties: splitCsv(fd.get("prefVarieties")),
    origins: splitCsv(fd.get("prefOrigins")),
    colors: splitCsv(fd.get("prefColors")),
    shapes: splitCsv(fd.get("prefShapes")),
    treatments: splitCsv(fd.get("prefTreatments")),
    minWeightCt: dec(fd.get("prefMinWeightCt")),
    maxWeightCt: dec(fd.get("prefMaxWeightCt")),
    budgetMin: dec(fd.get("prefBudgetMin")),
    budgetMax: dec(fd.get("prefBudgetMax")),
    currency: str(fd.get("prefCurrency")) ?? "USD",
  });
}

export async function createCustomer(fd: FormData) {
  const session = await requireCapability("customer:write");
  const parsed = customerSchema.parse(fdCustomer(fd));
  const prefs = fdPreferences(fd);
  const year = new Date().getUTCFullYear();

  const customer = await prisma.$transaction(async (tx) => {
    const code = await nextCode(codePrefix.customer, year, tx, { pad: 4 });
    const created = await tx.customer.create({
      data: {
        code,
        ...parsed,
        preferences: JSON.stringify(prefs),
      },
    });
    await writeAudit({
      entity: "Customer", entityId: created.id, entityCode: created.code,
      action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Customer ${created.displayName} added.`,
    }, tx);
    return created;
  });

  revalidatePath("/customers");
  redirect(`/customers/${customer.id}`);
}

export async function updateCustomer(fd: FormData) {
  const session = await requireCapability("customer:write");
  const id = str(fd.get("id"));
  if (!id) throw new Error("id required");
  const parsed = customerSchema.parse(fdCustomer(fd));
  const prefs = fdPreferences(fd);
  const before = await prisma.customer.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction(async (tx) => {
    const after = await tx.customer.update({
      where: { id },
      data: { ...parsed, preferences: JSON.stringify(prefs) },
    });
    await auditDiff(
      { entity: "Customer", entityId: id, entityCode: before.code, userId: session.user.id, userName: session.user.name ?? null },
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      ["displayName","kind","type","companyName","country","city","email","phone","website"] as never[],
      tx,
    );
  });
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
}
