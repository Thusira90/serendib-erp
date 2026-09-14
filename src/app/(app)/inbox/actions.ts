"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";

export async function markNotificationRead(fd: FormData) {
  const session = await requireAuth();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await prisma.notification.updateMany({
    where: { id, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/inbox");
}

export async function markAllRead() {
  const session = await requireAuth();
  await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/inbox");
}

export async function dismissNotification(fd: FormData) {
  const session = await requireAuth();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await prisma.notification.updateMany({
    where: { id, userId: session.user.id, dismissedAt: null },
    data: { dismissedAt: new Date(), readAt: new Date() },
  });
  revalidatePath("/inbox");
}
