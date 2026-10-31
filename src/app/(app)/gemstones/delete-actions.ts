"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

/**
 * Permanently delete a cut and polished stone.
 *
 * Restricted to SUPER_ADMIN. Stones with commercial history (quotations,
 * reservations, sales orders) or a partner deal link are refused, so a
 * delete never rewrites revenue or partner settlements — those records
 * have to be removed first. Everything else that belongs only to the
 * stone (costs, price history, certificates, CGI, media, treatments) goes
 * with it via the FK cascades; links that don't cascade are cleared here.
 * The delete itself is written to the audit log.
 */
export async function deleteGemstone(fd: FormData) {
  const session = await requireAuth();
  if (session.user.role !== "SUPER_ADMIN") {
    throw new Error("Only the super admin can delete stones.");
  }
  const id = fd.get("id");
  if (typeof id !== "string" || !id) throw new Error("id required");

  const g = await prisma.gemstone.findUnique({
    where: { id },
    select: {
      id: true, code: true, gemType: true, variety: true, weightCt: true,
      _count: { select: { quotations: true, reservations: true, salesOrders: true, partnerDealStones: true } },
    },
  });
  if (!g) throw new Error("Stone not found");

  const blockers = [
    g._count.salesOrders && `${g._count.salesOrders} sales order(s)`,
    g._count.reservations && `${g._count.reservations} reservation(s)`,
    g._count.quotations && `${g._count.quotations} quotation(s)`,
    g._count.partnerDealStones && `${g._count.partnerDealStones} partner deal link(s)`,
  ].filter(Boolean);
  if (blockers.length) {
    return { error: `${g.code} can't be deleted: it has ${blockers.join(", ")}. Remove those first.` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.enquiry.updateMany({ where: { gemstoneId: id }, data: { gemstoneId: null } });
    await tx.collectionItem.deleteMany({ where: { gemstoneId: id } });
    await tx.transformationOutput.deleteMany({ where: { gemstoneId: id } });
    await tx.inventoryMovement.deleteMany({ where: { gemstoneId: id } });
    await tx.comment.deleteMany({ where: { entity: "Gemstone", entityId: id } });
    await tx.gemstone.delete({ where: { id } });
    await writeAudit({
      userId: session.user.id,
      userName: session.user.name ?? null,
      entity: "Gemstone",
      entityId: id,
      entityCode: g.code,
      action: "DELETE",
      newValue: `Super admin deleted ${g.code} (${g.gemType}${g.variety ? ` · ${g.variety}` : ""}, ${Number(g.weightCt).toFixed(2)} ct).`,
    }, tx);
  });

  revalidatePath("/gemstones");
  revalidatePath("/");
  redirect("/gemstones");
}
