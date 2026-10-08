"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { isQrKind, normalizeFields } from "@/lib/qr-fields";

/** Save what a QR scan shows for one kind of stone. */
export async function saveQrProfile(kind: string, fields: Record<string, boolean>) {
  const session = await requireCapability("settings:write");
  if (!isQrKind(kind)) throw new Error("Unknown stone kind.");
  const clean = normalizeFields(kind, fields);
  try {
    await prisma.qrProfile.upsert({
      where: { kind },
      update: { fields: JSON.stringify(clean), updatedBy: session.user.name ?? null },
      create: { kind, fields: JSON.stringify(clean), updatedBy: session.user.name ?? null },
    });
  } catch {
    throw new Error(
      "Could not save. If QR settings have never been used, the database table has to be created once (run `npm run db:push`).",
    );
  }
  const shown = Object.entries(clean).filter(([, on]) => on).map(([k]) => k);
  await writeAudit({
    entity: "QrProfile", entityId: kind, entityCode: kind, action: "UPDATE",
    userId: session.user.id, userName: session.user.name ?? null,
    newValue: `QR scan page for ${kind === "ROUGH" ? "rough" : "cut and polished"} stones now shows: ${shown.join(", ") || "nothing"}.`,
  });
  revalidatePath("/qr");
  revalidatePath("/verify/[code]", "page");
}
