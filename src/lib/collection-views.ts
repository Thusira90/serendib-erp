import "server-only";
import { prisma } from "@/lib/db";

/**
 * Counts one view of a live /share collection. A plain server function, not a
 * server action, so it cannot be invoked from the browser by action id.
 */
export async function trackCollectionView(shareCode: string): Promise<void> {
  await prisma.collection.updateMany({
    where: { shareCode, isArchived: false },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });
}
