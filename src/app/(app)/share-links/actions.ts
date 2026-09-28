"use server";

import { z } from "zod";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);

const createSchema = z.object({
  scope: z.enum(["CATALOGUE", "GEMSTONE", "GEMSTONES", "COLLECTION"]),
  payload: z.string().nullable(),                 // JSON string, per-scope shape
  ttlMinutes: z.number().int().positive().max(60 * 24 * 30), // hard cap 30 days
  message: z.string().nullable(),

  createdByName: z.string().min(1),
  createdByPhone: z.string().nullable(),
  createdByEmail: z.string().nullable(),

  brokerMode: z.boolean().default(false),
  brokerName: z.string().nullable(),
  brokerCompany: z.string().nullable(),
  brokerPhone: z.string().nullable(),
  brokerEmail: z.string().nullable(),
});

/** URL-safe short slug, ~48 bits of entropy — hard to guess in the wild. */
function slug(): string {
  return randomBytes(6).toString("base64url").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 10);
}

export async function createShareLink(fd: FormData): Promise<{ code: string }> {
  const session = await requireAuth();
  const parsed = createSchema.parse({
    scope: str(fd.get("scope")) ?? "CATALOGUE",
    payload: str(fd.get("payload")),
    ttlMinutes: Number(str(fd.get("ttlMinutes")) ?? "60"),
    message: str(fd.get("message")),
    createdByName: str(fd.get("createdByName")) ?? session.user.name ?? "",
    createdByPhone: str(fd.get("createdByPhone")),
    createdByEmail: str(fd.get("createdByEmail")) ?? session.user.email ?? null,
    brokerMode: str(fd.get("brokerMode")) === "on" || str(fd.get("brokerMode")) === "true",
    brokerName: str(fd.get("brokerName")),
    brokerCompany: str(fd.get("brokerCompany")),
    brokerPhone: str(fd.get("brokerPhone")),
    brokerEmail: str(fd.get("brokerEmail")),
  });

  // Slug uniqueness: retry a couple of times on collision — 6 random bytes
  // (~48 bits) makes clashes vanishingly unlikely, so 3 tries is plenty.
  let code = slug();
  for (let attempt = 0; attempt < 3; attempt++) {
    const clash = await prisma.shareLink.findUnique({ where: { code } });
    if (!clash) break;
    code = slug();
  }

  const expiresAt = new Date(Date.now() + parsed.ttlMinutes * 60_000);

  const link = await prisma.shareLink.create({
    data: {
      code,
      scope: parsed.scope,
      payload: parsed.payload,
      expiresAt,
      message: parsed.message,
      createdById: session.user.id,
      createdByName: parsed.createdByName,
      createdByPhone: parsed.createdByPhone,
      createdByEmail: parsed.createdByEmail,
      brokerMode: parsed.brokerMode,
      brokerName: parsed.brokerMode ? parsed.brokerName : null,
      brokerCompany: parsed.brokerMode ? parsed.brokerCompany : null,
      brokerPhone: parsed.brokerMode ? parsed.brokerPhone : null,
      brokerEmail: parsed.brokerMode ? parsed.brokerEmail : null,
    },
  });
  await writeAudit({
    entity: "ShareLink", entityId: link.id, entityCode: link.code,
    action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
    newValue: `${parsed.scope} link · expires ${expiresAt.toISOString()}${parsed.brokerMode ? " · broker mode" : ""}`,
    metadata: { scope: parsed.scope, ttlMinutes: parsed.ttlMinutes },
  });
  revalidatePath("/share-links");
  return { code };
}

export async function revokeShareLink(fd: FormData) {
  const session = await requireAuth();
  const id = str(fd.get("id"));
  if (!id) throw new Error("id required");
  const before = await prisma.shareLink.findUniqueOrThrow({ where: { id } });
  if (before.createdById !== session.user.id && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMINISTRATOR") {
    throw new Error("You can only revoke your own links.");
  }
  await prisma.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
  await writeAudit({
    entity: "ShareLink", entityId: id, entityCode: before.code,
    action: "REVOKE", userId: session.user.id, userName: session.user.name ?? null,
  });
  revalidatePath("/share-links");
}
