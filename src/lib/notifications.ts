import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import type { NotificationType, Role } from "@/lib/enums";

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * Users interested in an event type. A single user in more than one role
 * still only gets one notification per event because we de-duplicate on userId.
 */
const audienceByType: Record<NotificationType, Role[]> = {
  SALE_CREATED:          ["ADMINISTRATOR", "MANAGEMENT", "SALES", "FINANCE"],
  PAYMENT_RECORDED:      ["ADMINISTRATOR", "MANAGEMENT", "FINANCE"],
  RESERVATION_CREATED:   ["ADMINISTRATOR", "SALES"],
  RESERVATION_RELEASED:  ["ADMINISTRATOR", "SALES"],
  RESERVATION_EXPIRING:  ["ADMINISTRATOR", "SALES"],
  QUOTATION_ACCEPTED:    ["ADMINISTRATOR", "MANAGEMENT", "SALES"],
  QUOTATION_EXPIRING:    ["ADMINISTRATOR", "SALES"],
  CERTIFICATE_ISSUED:    ["ADMINISTRATOR", "MANAGEMENT", "GEMOLOGIST", "SALES"],
  CGI_MASTER_SET:        ["ADMINISTRATOR", "MANAGEMENT", "CGI_MEDIA", "SALES"],
  SHIPMENT_CREATED:      ["ADMINISTRATOR", "MANAGEMENT", "WAREHOUSE", "SALES"],
  SHIPMENT_DELIVERED:    ["ADMINISTRATOR", "MANAGEMENT", "WAREHOUSE", "SALES"],
  ENQUIRY_NEW:           ["ADMINISTRATOR", "SALES"],
  CUTTING_COMPLETED:     ["ADMINISTRATOR", "MANAGEMENT", "GEMOLOGIST"],
  ALERT:                 ["ADMINISTRATOR", "MANAGEMENT"],
};

export type NotifyEvent = {
  type: NotificationType;
  title: string;
  body?: string | null;
  entity?: string | null;
  entityId?: string | null;
  entityCode?: string | null;
  url?: string | null;
  extraRoles?: Role[];
  extraUserIds?: string[];
  excludeUserIds?: string[];
};

/**
 * Fan-out a single event into per-user Notification rows.
 * Runs inside the caller's transaction when one is provided.
 */
export async function notify(event: NotifyEvent, tx: Tx = defaultPrisma) {
  const client = tx as PrismaClient;
  const roles = new Set<Role>([...audienceByType[event.type], ...(event.extraRoles ?? [])]);
  const roleUsers = await client.user.findMany({
    where: { active: true, role: { in: Array.from(roles) } },
    select: { id: true },
  });
  const userIds = new Set<string>([
    ...roleUsers.map((u) => u.id),
    ...(event.extraUserIds ?? []),
  ]);
  for (const excluded of event.excludeUserIds ?? []) userIds.delete(excluded);
  if (userIds.size === 0) return;

  await client.notification.createMany({
    data: Array.from(userIds).map((uid) => ({
      userId: uid,
      type: event.type,
      title: event.title,
      body: event.body ?? null,
      entity: event.entity ?? null,
      entityId: event.entityId ?? null,
      entityCode: event.entityCode ?? null,
      url: event.url ?? null,
    })),
  });
}

export async function unreadCount(userId: string) {
  return defaultPrisma.notification.count({
    where: { userId, readAt: null, dismissedAt: null },
  });
}
