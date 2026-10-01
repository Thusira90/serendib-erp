"use server";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

/**
 * Delete a single audit log row from the Recent Activity feed.
 * Restricted to SUPER_ADMIN — audit entries are usually immutable, so
 * we deliberately don't expose this to Administrator or anyone else.
 * A record of the deletion itself is written to the audit log, so the
 * fact that a row was pruned is never invisible.
 */
export async function deleteAuditEntry(fd: FormData) {
  const session = await requireAuth();
  if (session.user.role !== "SUPER_ADMIN") {
    throw new Error("Only the super admin can delete activity entries.");
  }
  const id = fd.get("id");
  if (typeof id !== "string" || !id) throw new Error("id required");
  const before = await prisma.auditLog.findUnique({ where: { id } });
  if (!before) throw new Error("Entry not found");
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.delete({ where: { id } });
    // Meta-audit: log the deletion so nothing disappears silently.
    await tx.auditLog.create({
      data: {
        entity: "AuditLog",
        entityId: id,
        entityCode: before.entityCode ?? null,
        action: "DELETE",
        userId: session.user.id,
        userName: session.user.name ?? null,
        newValue: `Super admin removed activity entry for ${before.entity} ${before.entityCode ?? before.entityId} (${before.action}).`,
      },
    });
  });
  revalidatePath("/");
  revalidatePath("/audit-log");
}
