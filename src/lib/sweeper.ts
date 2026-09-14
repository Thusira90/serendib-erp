import "server-only";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

/**
 * Sweep ACTIVE reservations whose expiresAt is in the past.
 *
 * We don't run this on a real cron — Next.js server-render pages that care
 * (dashboard, /reservations) call this on every load, so any user hitting
 * the app naturally advances the state. Idempotent + cheap.
 *
 * Returns the number of reservations that were expired.
 */
export async function sweepExpiredReservations(): Promise<number> {
  const now = new Date();
  const overdue = await prisma.reservation.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { not: null, lt: now },
    },
    include: { gemstone: true, customer: true },
    take: 100,
  });
  if (overdue.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    for (const r of overdue) {
      await tx.reservation.update({
        where: { id: r.id },
        data: { status: "EXPIRED", releasedAt: now, releasedReason: "Auto-expired: past expiresAt" },
      });
      if (r.gemstone.status === "RESERVED") {
        await tx.gemstone.update({
          where: { id: r.gemstoneId },
          data: { status: "AVAILABLE" },
        });
        await writeAudit({
          entity: "Gemstone", entityId: r.gemstoneId, entityCode: r.gemstone.code,
          action: "RESERVATION_EXPIRED", field: "status",
          oldValue: "RESERVED", newValue: "AVAILABLE",
          userName: "system",
          metadata: { reservationCode: r.code, customer: r.customer.displayName },
        }, tx);
        await notify({
          type: "RESERVATION_EXPIRING",
          title: `Reservation ${r.code} expired`,
          body: `${r.gemstone.code} — ${r.customer.displayName}`,
          entity: "Reservation", entityId: r.id, entityCode: r.code,
          url: `/gemstones/${r.gemstoneId}`,
        }, tx);
      }
    }
  });

  return overdue.length;
}
