import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

type Tx = PrismaClient | Prisma.TransactionClient;

export type AuditEvent = {
  userId?: string | null;
  userName?: string | null;
  entity: string;
  entityId: string;
  entityCode?: string | null;
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
};

export async function writeAudit(event: AuditEvent, tx: Tx = defaultPrisma) {
  // If the caller passes a userId, make sure it still exists — otherwise
  // (stale JWT after a reseed, deleted user, etc.) fall back to a null FK
  // and keep only the userName, so the audit trail never blocks the
  // business transaction.
  let userId: string | null = event.userId ?? null;
  if (userId) {
    const exists = await (tx as PrismaClient).user.findUnique({
      where: { id: userId }, select: { id: true },
    });
    if (!exists) userId = null;
  }
  await (tx as PrismaClient).auditLog.create({
    data: {
      userId,
      userName: event.userName ?? null,
      entity: event.entity,
      entityId: event.entityId,
      entityCode: event.entityCode ?? null,
      action: event.action,
      field: event.field ?? null,
      oldValue: event.oldValue ?? null,
      newValue: event.newValue ?? null,
      metadata: event.metadata == null ? null : JSON.stringify(event.metadata),
      ipAddress: event.ipAddress ?? null,
    },
  });
}

/**
 * Diff two objects and write one audit row per changed scalar field.
 * Only fields present in `fields` are considered.
 */
export async function auditDiff<T extends Record<string, unknown>>(
  base: {
    entity: string;
    entityId: string;
    entityCode?: string | null;
    userId?: string | null;
    userName?: string | null;
    action?: string;
  },
  before: T,
  after: T,
  fields: (keyof T)[],
  tx: Tx = defaultPrisma
) {
  const action = base.action ?? "UPDATE";
  for (const field of fields) {
    const oldV = before[field];
    const newV = after[field];
    if (String(oldV ?? "") === String(newV ?? "")) continue;
    await writeAudit(
      {
        ...base,
        action,
        field: String(field),
        oldValue: oldV == null ? null : String(oldV),
        newValue: newV == null ? null : String(newV),
      },
      tx
    );
  }
}
