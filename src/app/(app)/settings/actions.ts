"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
const opt = (v: FormDataEntryValue | null) => {
  const s = str(v).trim();
  return s ? s : null;
};

const schema = z.object({
  legalName: z.string().min(1).max(200),
  tradingName: z.string().nullable(),
  addressLine: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().min(1),
  taxId: z.string().nullable(),
  registrationNumber: z.string().nullable(),
  email: z.string().email().nullable().or(z.literal("").transform(() => null)),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  defaultCurrency: z.string().min(1).max(6),
  defaultPaymentTerms: z.string().min(1),
  defaultDeliveryTerms: z.string().min(1),
  defaultShippingTerms: z.string().min(1),
});

export async function updateCompanySettings(fd: FormData) {
  const session = await requireCapability("settings:write");
  const parsed = schema.parse({
    legalName: str(fd.get("legalName")),
    tradingName: opt(fd.get("tradingName")),
    addressLine: opt(fd.get("addressLine")),
    city: opt(fd.get("city")),
    country: str(fd.get("country")) || "Sri Lanka",
    taxId: opt(fd.get("taxId")),
    registrationNumber: opt(fd.get("registrationNumber")),
    email: opt(fd.get("email")),
    phone: opt(fd.get("phone")),
    website: opt(fd.get("website")),
    defaultCurrency: str(fd.get("defaultCurrency")) || "LKR",
    defaultPaymentTerms: str(fd.get("defaultPaymentTerms")),
    defaultDeliveryTerms: str(fd.get("defaultDeliveryTerms")),
    defaultShippingTerms: str(fd.get("defaultShippingTerms")),
  });

  await prisma.companySettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...parsed },
    update: parsed,
  });

  await writeAudit({
    entity: "CompanySettings", entityId: "singleton", entityCode: parsed.legalName,
    action: "UPDATE",
    userId: session.user.id, userName: session.user.name ?? null,
    newValue: `Company profile updated (${parsed.legalName}).`,
  });

  revalidatePath("/settings");
  revalidatePath("/quotations");
  revalidatePath("/sales");
  revalidatePath("/verify", "layout");
  revalidatePath("/catalogue", "layout");
}
