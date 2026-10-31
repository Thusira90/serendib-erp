"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

/**
 * Permanently delete a rough stone.
 *
 * Restricted to SUPER_ADMIN. A rough that has already been cut into
 * finished stones (it is the input of a transformation) or is linked to a
 * partner deal is refused — deleting it would break those stones'
 * genealogy and costing, or the deal's settlements. Cutting plans and
 * unfinished cutting jobs go with it; costs, treatments and media follow
 * via the FK cascades. The delete itself is written to the audit log.
 */
export async function deleteRoughStone(fd: FormData) {
  const session = await requireAuth();
  if (session.user.role !== "SUPER_ADMIN") {
    throw new Error("Only the super admin can delete stones.");
  }
  const id = fd.get("id");
  if (typeof id !== "string" || !id) throw new Error("id required");

  const r = await prisma.roughStone.findUnique({
    where: { id },
    select: {
      id: true, code: true, gemType: true, variety: true, weightCt: true,
      _count: { select: { transformationsAsInput: true, partnerDealStones: true } },
      cuttingJobs: { select: { id: true, code: true, transformation: { select: { id: true } } } },
    },
  });
  if (!r) throw new Error("Stone not found");

  const cutJobs = r.cuttingJobs.filter((j) => j.transformation);
  const blockers = [
    (r._count.transformationsAsInput || cutJobs.length) && "already been cut into finished stones",
    r._count.partnerDealStones && `${r._count.partnerDealStones} partner deal link(s)`,
  ].filter(Boolean);
  if (blockers.length) {
    return { error: `${r.code} can't be deleted: it has ${blockers.join(", ")}. Remove those first.` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.cuttingJob.deleteMany({ where: { roughStoneId: id } });
    await tx.cuttingPlan.deleteMany({ where: { roughStoneId: id } });
    await tx.inventoryMovement.deleteMany({ where: { roughStoneId: id } });
    await tx.comment.deleteMany({ where: { entity: "RoughStone", entityId: id } });
    await tx.roughStone.delete({ where: { id } });
    await writeAudit({
      userId: session.user.id,
      userName: session.user.name ?? null,
      entity: "RoughStone",
      entityId: id,
      entityCode: r.code,
      action: "DELETE",
      newValue: `Super admin deleted ${r.code} (${r.gemType}${r.variety ? ` · ${r.variety}` : ""}, ${Number(r.weightCt).toFixed(2)} ct).`,
    }, tx);
  });

  revalidatePath("/rough");
  revalidatePath("/");
  redirect("/rough");
}
