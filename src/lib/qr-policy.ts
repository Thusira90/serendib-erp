import "server-only";
import { prisma } from "@/lib/db";
import { defaultsFor, normalizeFields, type QrKind } from "@/lib/qr-fields";

/**
 * What the public QR pages may show for this kind of stone. Falls back to the
 * defaults when nothing is saved yet, or when the table has not been created
 * on this database, so a scan never errors because of the setting.
 */
export async function getQrPolicy(kind: QrKind): Promise<Record<string, boolean>> {
  try {
    const row = await prisma.qrProfile.findUnique({ where: { kind } });
    if (!row) return defaultsFor(kind);
    return normalizeFields(kind, JSON.parse(row.fields));
  } catch {
    return defaultsFor(kind);
  }
}
