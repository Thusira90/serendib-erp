"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);
const dec = (v: FormDataEntryValue | null) => {
  if (!v || typeof v !== "string" || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

const planSchema = z.object({
  roughStoneId: z.string().min(1),
  name: z.string().min(1),
  proposedShape: z.string().optional().nullable(),
  expectedWeightCt: z.number().nullable().optional(),
  expectedYieldPct: z.number().nullable().optional(),
  expectedValue: z.number().nullable().optional(),
  cutterRecommendation: z.string().optional().nullable(),
  riskAssessment: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function createCuttingPlan(fd: FormData) {
  const session = await requireCapability("cutting:plan");
  const parsed = planSchema.parse({
    roughStoneId: str(fd.get("roughStoneId")),
    name: str(fd.get("name")),
    proposedShape: str(fd.get("proposedShape")),
    expectedWeightCt: dec(fd.get("expectedWeightCt")),
    expectedYieldPct: dec(fd.get("expectedYieldPct")),
    expectedValue: dec(fd.get("expectedValue")),
    cutterRecommendation: str(fd.get("cutterRecommendation")),
    riskAssessment: str(fd.get("riskAssessment")),
    notes: str(fd.get("notes")),
  });
  const rough = await prisma.roughStone.findUniqueOrThrow({ where: { id: parsed.roughStoneId } });
  const plan = await prisma.cuttingPlan.create({ data: parsed });
  await writeAudit({
    entity: "CuttingPlan", entityId: plan.id, entityCode: `${rough.code}·${plan.name}`,
    action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
    newValue: `Plan ${plan.name} added to ${rough.code}.`,
  });
  revalidatePath(`/rough/${parsed.roughStoneId}`);
}

export async function selectCuttingPlan(fd: FormData) {
  const session = await requireCapability("cutting:plan");
  const id = str(fd.get("id"));
  if (!id) throw new Error("id required");
  const plan = await prisma.cuttingPlan.findUniqueOrThrow({
    where: { id }, include: { roughStone: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.cuttingPlan.updateMany({ where: { roughStoneId: plan.roughStoneId }, data: { selected: false } });
    await tx.cuttingPlan.update({ where: { id }, data: { selected: true } });
    await writeAudit({
      entity: "CuttingPlan", entityId: id, entityCode: `${plan.roughStone.code}·${plan.name}`,
      action: "SELECTED", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Plan ${plan.name} selected for ${plan.roughStone.code}.`,
    }, tx);
  });
  revalidatePath(`/rough/${plan.roughStoneId}`);
}
