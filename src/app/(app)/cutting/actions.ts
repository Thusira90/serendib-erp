"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { CUTTING_JOB_STATUSES } from "@/lib/enums";

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

// ─── Start a cutting job on a rough ──────────────────────────────────────────

const startSchema = z.object({
  roughStoneId: z.string().min(1),
  cutterId: z.string().nullable(),
  expectedCompletion: z.date().nullable(),
  plannedCut: z.string().nullable(),
  targetWeightCt: z.number().nullable(),
  expectedYieldPct: z.number().nullable(),
  notes: z.string().nullable(),
});

/**
 * Starts a cutting job on a rough stone.
 * Invariants:
 *  - Rough must be AVAILABLE / INSPECTED / RECEIVED (not already in cutting or sold).
 *  - Rough status is flipped to IN_CUTTING inside the same transaction.
 */
export async function startCuttingJob(fd: FormData) {
  const session = await requireCapability("cutting:write");
  const parsed = startSchema.parse({
    roughStoneId: str(fd.get("roughStoneId")),
    cutterId: str(fd.get("cutterId")),
    expectedCompletion: date(fd.get("expectedCompletion")),
    plannedCut: str(fd.get("plannedCut")),
    targetWeightCt: dec(fd.get("targetWeightCt")),
    expectedYieldPct: dec(fd.get("expectedYieldPct")),
    notes: str(fd.get("notes")),
  });

  const year = new Date().getUTCFullYear();
  const job = await prisma.$transaction(async (tx) => {
    const rough = await tx.roughStone.findUniqueOrThrow({ where: { id: parsed.roughStoneId } });
    if (rough.status === "IN_CUTTING") {
      throw new Error(`Rough ${rough.code} already has an active cutting job.`);
    }
    if (rough.status === "CONVERTED" || rough.status === "SOLD" || rough.status === "LOST") {
      throw new Error(`Rough ${rough.code} cannot be cut in status ${rough.status}.`);
    }
    const code = await nextCode(codePrefix.cuttingJob, year, tx, { pad: 5 });
    const created = await tx.cuttingJob.create({
      data: {
        code,
        roughStoneId: rough.id,
        cutterId: parsed.cutterId,
        startedAt: new Date(),
        expectedCompletion: parsed.expectedCompletion,
        plannedCut: parsed.plannedCut,
        targetWeightCt: parsed.targetWeightCt ?? undefined,
        expectedYieldPct: parsed.expectedYieldPct ?? undefined,
        notes: parsed.notes,
        status: parsed.cutterId ? "ASSIGNED" : "PENDING",
      },
    });
    await tx.roughStone.update({
      where: { id: rough.id },
      data: { status: "IN_CUTTING" },
    });
    await writeAudit({
      entity: "CuttingJob", entityId: created.id, entityCode: created.code,
      action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Started cutting on ${rough.code}.`,
      metadata: { roughStoneId: rough.id, roughCode: rough.code },
    }, tx);
    await writeAudit({
      entity: "RoughStone", entityId: rough.id, entityCode: rough.code,
      action: "STATUS_CHANGE", field: "status",
      oldValue: rough.status, newValue: "IN_CUTTING",
      userId: session.user.id, userName: session.user.name ?? null,
    }, tx);
    return created;
  });

  revalidatePath(`/rough/${parsed.roughStoneId}`);
  revalidatePath("/cutting");
  redirect(`/cutting/${job.id}`);
}

// ─── Update job status ───────────────────────────────────────────────────────

const jobStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(CUTTING_JOB_STATUSES),
});

export async function updateCuttingJobStatus(fd: FormData) {
  const session = await requireCapability("cutting:write");
  const parsed = jobStatusSchema.parse({
    id: str(fd.get("id")),
    status: str(fd.get("status")),
  });
  const before = await prisma.cuttingJob.findUniqueOrThrow({ where: { id: parsed.id } });
  await prisma.cuttingJob.update({
    where: { id: parsed.id },
    data: { status: parsed.status },
  });
  await writeAudit({
    entity: "CuttingJob", entityId: parsed.id, entityCode: before.code,
    action: "STATUS_CHANGE", field: "status",
    oldValue: before.status, newValue: parsed.status,
    userId: session.user.id, userName: session.user.name ?? null,
  });
  revalidatePath(`/cutting/${parsed.id}`);
  revalidatePath("/cutting");
}

// ─── Complete a cutting job (produces finished gemstones + Transformation) ───

const outputSchema = z.object({
  gemType: z.string().min(1),
  variety: z.string().nullable(),
  weightCt: z.number().positive(),
  shape: z.string().nullable(),
  cut: z.string().nullable(),
  colorDescription: z.string().nullable(),
  askingPrice: z.number().nullable(),
});

const completeSchema = z.object({
  jobId: z.string().min(1),
  actualCut: z.string().nullable(),
  cuttingCost: z.number().nonnegative().nullable(),
  laborCost: z.number().nonnegative().nullable(),
  machineCost: z.number().nonnegative().nullable(),
  currency: z.string(),
  notes: z.string().nullable(),
  outputs: z.array(outputSchema).min(1),
});

/**
 * Completes a cutting job.
 * Invariants + side-effects (all in one transaction):
 *  - Job must not already be COMPLETED / REJECTED.
 *  - Mints one finished Gemstone per output row (SGS-G-YYYY-######).
 *  - Creates a GemstoneTransformation linking the rough → outputs, with
 *    computed yield, waste, and per-output allocated cost proportional to
 *    output weight.
 *  - Each output gets a per-stone CostAllocation for its share of the rough
 *    cost + its share of the cutting job cost.
 *  - Rough status flips to CONVERTED. Job status flips to COMPLETED.
 *  - Job also gets the actual-yield computed.
 *  - Notifies stakeholders.
 */
export async function completeCuttingJob(fd: FormData) {
  const session = await requireCapability("cutting:write");

  const outputCount = parseInt(String(fd.get("outputCount") ?? "0"), 10);
  const outputs: z.infer<typeof outputSchema>[] = [];
  for (let i = 0; i < outputCount; i++) {
    const w = dec(fd.get(`out.${i}.weightCt`));
    if (w == null || w <= 0) continue;
    outputs.push(outputSchema.parse({
      gemType: str(fd.get(`out.${i}.gemType`)) ?? "",
      variety: str(fd.get(`out.${i}.variety`)),
      weightCt: w,
      shape: str(fd.get(`out.${i}.shape`)),
      cut: str(fd.get(`out.${i}.cut`)),
      colorDescription: str(fd.get(`out.${i}.colorDescription`)),
      askingPrice: dec(fd.get(`out.${i}.askingPrice`)),
    }));
  }
  const parsed = completeSchema.parse({
    jobId: str(fd.get("jobId")),
    actualCut: str(fd.get("actualCut")),
    cuttingCost: dec(fd.get("cuttingCost")),
    laborCost: dec(fd.get("laborCost")),
    machineCost: dec(fd.get("machineCost")),
    currency: str(fd.get("currency")) ?? "USD",
    notes: str(fd.get("notes")),
    outputs,
  });

  const totalCost = (parsed.cuttingCost ?? 0) + (parsed.laborCost ?? 0) + (parsed.machineCost ?? 0);
  const outputTotalWt = parsed.outputs.reduce((s, o) => s + o.weightCt, 0);

  const year = new Date().getUTCFullYear();

  await prisma.$transaction(async (tx) => {
    const job = await tx.cuttingJob.findUniqueOrThrow({
      where: { id: parsed.jobId },
      include: { roughStone: true },
    });
    if (job.status === "COMPLETED" || job.status === "REJECTED") {
      throw new Error(`Cutting job ${job.code} is already ${job.status}.`);
    }
    const rough = job.roughStone;
    const roughWeight = Number(rough.weightCt);
    const roughCost = Number(rough.purchasePrice);
    if (outputTotalWt > roughWeight + 0.001) {
      throw new Error(`Total output weight (${outputTotalWt.toFixed(2)}ct) exceeds rough weight (${roughWeight.toFixed(2)}ct).`);
    }
    const yieldPct = roughWeight > 0 ? (outputTotalWt / roughWeight) * 100 : 0;
    const wasteWt = Math.max(0, roughWeight - outputTotalWt);

    // Mint gemstones.
    const gemRows: { id: string; code: string; weight: number; allocatedCost: number; askingPrice: number | null }[] = [];
    for (const o of parsed.outputs) {
      const code = await nextCode(codePrefix.gemstone, year, tx);
      const share = outputTotalWt > 0 ? o.weightCt / outputTotalWt : 0;
      const roughShare = roughCost * share;
      const cutShare = totalCost * share;
      const totalGemCost = roughShare + cutShare;
      const costPerCt = o.weightCt > 0 ? totalGemCost / o.weightCt : 0;
      const gem = await tx.gemstone.create({
        data: {
          code,
          gemType: o.gemType,
          variety: o.variety,
          origin: rough.origin,
          weightCt: o.weightCt,
          shape: o.shape,
          cut: o.cut,
          colorDescription: o.colorDescription,
          treatment: "Untested", // to be confirmed by gemologist
          totalCost: totalGemCost,
          costPerCt,
          currency: parsed.currency,
          askingPrice: o.askingPrice ?? undefined,
          pricePerCt: o.askingPrice != null && o.weightCt > 0 ? o.askingPrice / o.weightCt : undefined,
          status: "AVAILABLE",
        },
      });
      // Allocation lines for the true-cost trail.
      await tx.costAllocation.createMany({
        data: [
          {
            gemstoneId: gem.id,
            type: "ROUGH_PURCHASE",
            description: `Allocated share of ${rough.code} (${(share * 100).toFixed(1)}%)`,
            amount: roughShare,
            currency: parsed.currency,
          },
          ...(totalCost > 0 ? [{
            gemstoneId: gem.id,
            type: "CUTTING",
            description: `Allocated share of cutting job ${job.code} (${(share * 100).toFixed(1)}%)`,
            amount: cutShare,
            currency: parsed.currency,
          } as const] : []),
        ],
      });
      gemRows.push({ id: gem.id, code: gem.code, weight: o.weightCt, allocatedCost: totalGemCost, askingPrice: o.askingPrice ?? null });
    }

    // Transformation record.
    const txCode = await nextCode(codePrefix.transformation, year, tx, { pad: 5 });
    await tx.gemstoneTransformation.create({
      data: {
        code: txCode,
        type: "CUTTING",
        performedAt: new Date(),
        operator: session.user.name ?? null,
        cost: totalCost,
        currency: parsed.currency,
        cuttingJobId: job.id,
        notes: parsed.notes,
        totalInputWeightCt: roughWeight,
        totalOutputWeightCt: outputTotalWt,
        wasteWeightCt: wasteWt,
        yieldPct,
        inputs: {
          create: [{
            roughStoneId: rough.id,
            inputWeightCt: roughWeight,
            inputCost: roughCost,
          }],
        },
        outputs: {
          create: gemRows.map((g) => ({
            gemstoneId: g.id,
            outputWeightCt: g.weight,
            allocatedCost: g.allocatedCost,
          })),
        },
      },
    });

    // Finalize the job + the rough.
    await tx.cuttingJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        actualCut: parsed.actualCut,
        actualYieldPct: yieldPct,
        cuttingCost: parsed.cuttingCost ?? 0,
        laborCost: parsed.laborCost ?? 0,
        machineCost: parsed.machineCost ?? 0,
        currency: parsed.currency,
      },
    });
    await tx.roughStone.update({
      where: { id: rough.id },
      data: { status: "CONVERTED" },
    });

    await writeAudit({
      entity: "CuttingJob", entityId: job.id, entityCode: job.code,
      action: "COMPLETED",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `${outputTotalWt.toFixed(2)}ct output from ${roughWeight.toFixed(2)}ct rough — yield ${yieldPct.toFixed(1)}%.`,
      metadata: { outputs: gemRows.map((g) => ({ code: g.code, weight: g.weight })), yieldPct, wasteWt },
    }, tx);
    await notify({
      type: "CUTTING_COMPLETED",
      title: `Cutting complete — ${job.code}`,
      body: `Yield ${yieldPct.toFixed(1)}% · ${gemRows.length} finished stone${gemRows.length === 1 ? "" : "s"}`,
      entity: "CuttingJob", entityId: job.id, entityCode: job.code,
      url: `/cutting/${job.id}`,
      excludeUserIds: [session.user.id],
    }, tx);
  });

  revalidatePath(`/cutting/${parsed.jobId}`);
  revalidatePath("/cutting");
  revalidatePath("/gemstones");
  revalidatePath("/genealogy");
}
