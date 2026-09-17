"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { COST_TYPES } from "@/lib/enums";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);
const parseDec = (v: FormDataEntryValue | null) => {
  if (!v || typeof v !== "string" || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

const costSchema = z.object({
  gemstoneId: z.string().min(1),
  type: z.enum(COST_TYPES),
  amount: z.number().positive(),
  description: z.string().optional().nullable(),
  currency: z.string().default("LKR"),
});

export async function addCostAllocation(fd: FormData) {
  const session = await requireCapability("cost:write");
  const parsed = costSchema.parse({
    gemstoneId: str(fd.get("gemstoneId")),
    type: str(fd.get("type")),
    amount: parseDec(fd.get("amount")),
    description: str(fd.get("description")),
    currency: str(fd.get("currency")) ?? "LKR",
  });

  await prisma.$transaction(async (tx) => {
    await tx.costAllocation.create({
      data: {
        gemstoneId: parsed.gemstoneId,
        type: parsed.type,
        description: parsed.description ?? null,
        amount: parsed.amount,
        currency: parsed.currency,
      },
    });
    const totals = await tx.costAllocation.aggregate({
      where: { gemstoneId: parsed.gemstoneId },
      _sum: { amount: true },
    });
    const gem = await tx.gemstone.findUniqueOrThrow({ where: { id: parsed.gemstoneId } });
    const totalCost = Number(totals._sum.amount ?? 0);
    const costPerCt = Number(gem.weightCt) > 0 ? totalCost / Number(gem.weightCt) : 0;
    const updated = await tx.gemstone.update({
      where: { id: parsed.gemstoneId },
      data: { totalCost, costPerCt },
    });
    await writeAudit({
      entity: "Gemstone", entityId: parsed.gemstoneId, entityCode: updated.code,
      action: "COST_ALLOCATED",
      userId: session.user.id, userName: session.user.name ?? null,
      field: "totalCost",
      oldValue: String(Number(gem.totalCost)),
      newValue: String(totalCost),
      metadata: {
        type: parsed.type,
        amount: parsed.amount,
        currency: parsed.currency,
        description: parsed.description ?? null,
      },
    }, tx);
  });

  revalidatePath(`/gemstones/${parsed.gemstoneId}`);
}

const priceSchema = z.object({
  gemstoneId: z.string().min(1),
  newPrice: z.number().nonnegative(),
  currency: z.string().default("LKR"),
  reason: z.string().optional().nullable(),
});

export async function changeAskingPrice(fd: FormData) {
  const session = await requireCapability("price:write");
  const parsed = priceSchema.parse({
    gemstoneId: str(fd.get("gemstoneId")),
    newPrice: parseDec(fd.get("newPrice")),
    currency: str(fd.get("currency")) ?? "LKR",
    reason: str(fd.get("reason")),
  });

  await prisma.$transaction(async (tx) => {
    const gem = await tx.gemstone.findUniqueOrThrow({ where: { id: parsed.gemstoneId } });
    const oldPrice = gem.askingPrice != null ? Number(gem.askingPrice) : null;
    const pricePerCt = Number(gem.weightCt) > 0 ? parsed.newPrice / Number(gem.weightCt) : null;
    await tx.gemstone.update({
      where: { id: parsed.gemstoneId },
      data: {
        askingPrice: parsed.newPrice,
        currency: parsed.currency,
        pricePerCt,
      },
    });
    await tx.priceHistory.create({
      data: {
        gemstoneId: parsed.gemstoneId,
        oldPrice,
        newPrice: parsed.newPrice,
        currency: parsed.currency,
        reason: parsed.reason ?? null,
        changedBy: session.user.name ?? null,
      },
    });
    await writeAudit({
      entity: "Gemstone", entityId: parsed.gemstoneId, entityCode: gem.code,
      action: "PRICE_CHANGE", field: "askingPrice",
      oldValue: oldPrice != null ? String(oldPrice) : null,
      newValue: String(parsed.newPrice),
      userId: session.user.id, userName: session.user.name ?? null,
      metadata: { reason: parsed.reason },
    }, tx);
  });

  revalidatePath(`/gemstones/${parsed.gemstoneId}`);
}
