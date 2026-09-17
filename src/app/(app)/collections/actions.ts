"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode, generateShareCode } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);
const dec = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};
const date = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const int = (v: FormDataEntryValue | null, fallback = 0) => {
  if (typeof v !== "string" || v === "") return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  intro: z.string().nullable(),
  customerId: z.string().nullable(),
  expiresAt: z.date().nullable(),
});

/**
 * Mints a share code that we've verified is unique. Retries up to a small
 * number of times before giving up — 32^6 = ~1B combinations, collisions
 * are effectively impossible within a business's lifetime.
 */
async function mintUniqueShareCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateShareCode(6);
    const existing = await prisma.collection.findUnique({ where: { shareCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error("Could not mint a unique share code.");
}

export async function createCollection(fd: FormData) {
  const session = await requireCapability("collection:write");
  const parsed = createSchema.parse({
    name: str(fd.get("name")) ?? "",
    intro: str(fd.get("intro")),
    customerId: str(fd.get("customerId")),
    expiresAt: date(fd.get("expiresAt")),
  });
  const year = new Date().getUTCFullYear();

  const created = await prisma.$transaction(async (tx) => {
    const code = await nextCode(codePrefix.collection, year, tx, { pad: 4 });
    const shareCode = await mintUniqueShareCode();
    const c = await tx.collection.create({
      data: {
        code,
        shareCode,
        name: parsed.name,
        intro: parsed.intro,
        customerId: parsed.customerId,
        expiresAt: parsed.expiresAt,
        createdById: session.user.id,
        createdByName: session.user.name ?? null,
      },
    });
    await writeAudit({
      entity: "Collection", entityId: c.id, entityCode: c.code,
      action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Collection "${c.name}" created (share: ${shareCode}).`,
    }, tx);
    return c;
  });

  revalidatePath("/collections");
  redirect(`/collections/${created.id}`);
}

export async function updateCollectionMeta(fd: FormData) {
  const session = await requireCapability("collection:write");
  const id = str(fd.get("id"));
  if (!id) throw new Error("id required");
  const parsed = createSchema.parse({
    name: str(fd.get("name")) ?? "",
    intro: str(fd.get("intro")),
    customerId: str(fd.get("customerId")),
    expiresAt: date(fd.get("expiresAt")),
  });
  await prisma.collection.update({
    where: { id },
    data: {
      name: parsed.name,
      intro: parsed.intro,
      customerId: parsed.customerId,
      expiresAt: parsed.expiresAt,
    },
  });
  await writeAudit({
    entity: "Collection", entityId: id,
    action: "UPDATE", userId: session.user.id, userName: session.user.name ?? null,
    newValue: `Updated collection metadata.`,
  });
  revalidatePath(`/collections/${id}`);
  revalidatePath("/collections");
}

const addItemSchema = z.object({
  collectionId: z.string().min(1),
  gemstoneId: z.string().min(1),
  note: z.string().nullable(),
  priceOverride: z.number().nullable(),
  currency: z.string().nullable(),
});

export async function addStoneToCollection(fd: FormData) {
  const session = await requireCapability("collection:write");
  const parsed = addItemSchema.parse({
    collectionId: str(fd.get("collectionId")),
    gemstoneId: str(fd.get("gemstoneId")),
    note: str(fd.get("note")),
    priceOverride: dec(fd.get("priceOverride")),
    currency: str(fd.get("currency")),
  });

  await prisma.$transaction(async (tx) => {
    // dedupe: existing (collectionId, gemstoneId) tuple is a no-op
    const existing = await tx.collectionItem.findUnique({
      where: { collectionId_gemstoneId: { collectionId: parsed.collectionId, gemstoneId: parsed.gemstoneId } },
    });
    if (existing) return;
    const nextOrder = await tx.collectionItem.count({ where: { collectionId: parsed.collectionId } });
    await tx.collectionItem.create({
      data: {
        collectionId: parsed.collectionId,
        gemstoneId: parsed.gemstoneId,
        displayOrder: nextOrder,
        note: parsed.note,
        priceOverride: parsed.priceOverride,
        currency: parsed.priceOverride != null ? parsed.currency ?? "LKR" : null,
      },
    });
    await tx.collection.update({ where: { id: parsed.collectionId }, data: { updatedAt: new Date() } });
    await writeAudit({
      entity: "Collection", entityId: parsed.collectionId,
      action: "ADD_STONE", newValue: parsed.gemstoneId,
      userId: session.user.id, userName: session.user.name ?? null,
    }, tx);
  });

  revalidatePath(`/collections/${parsed.collectionId}`);
}

export async function removeStoneFromCollection(fd: FormData) {
  const session = await requireCapability("collection:write");
  const itemId = str(fd.get("itemId"));
  if (!itemId) throw new Error("itemId required");
  const item = await prisma.collectionItem.findUniqueOrThrow({ where: { id: itemId } });
  await prisma.collectionItem.delete({ where: { id: itemId } });
  await writeAudit({
    entity: "Collection", entityId: item.collectionId,
    action: "REMOVE_STONE", oldValue: item.gemstoneId,
    userId: session.user.id, userName: session.user.name ?? null,
  });
  revalidatePath(`/collections/${item.collectionId}`);
}

export async function updateCollectionItem(fd: FormData) {
  const session = await requireCapability("collection:write");
  const itemId = str(fd.get("itemId"));
  if (!itemId) throw new Error("itemId required");
  const note = str(fd.get("note"));
  const priceOverride = dec(fd.get("priceOverride"));
  const currency = str(fd.get("currency"));
  const displayOrder = int(fd.get("displayOrder"), 0);
  const item = await prisma.collectionItem.findUniqueOrThrow({ where: { id: itemId } });
  await prisma.collectionItem.update({
    where: { id: itemId },
    data: {
      note, priceOverride, displayOrder,
      currency: priceOverride != null ? currency ?? "LKR" : null,
    },
  });
  await writeAudit({
    entity: "Collection", entityId: item.collectionId,
    action: "UPDATE_ITEM",
    userId: session.user.id, userName: session.user.name ?? null,
  });
  revalidatePath(`/collections/${item.collectionId}`);
}

export async function archiveCollection(fd: FormData) {
  const session = await requireCapability("collection:write");
  const id = str(fd.get("id"));
  if (!id) throw new Error("id required");
  const c = await prisma.collection.update({
    where: { id },
    data: { isArchived: true },
  });
  await writeAudit({
    entity: "Collection", entityId: id, entityCode: c.code,
    action: "ARCHIVE", userId: session.user.id, userName: session.user.name ?? null,
  });
  revalidatePath("/collections");
  redirect("/collections");
}

/**
 * Public-safe increment. Called from the /share page whenever a viewer
 * loads a collection. Does not require auth — the share code itself is the
 * capability.
 */
export async function trackCollectionView(shareCode: string) {
  await prisma.collection.update({
    where: { shareCode },
    data: {
      viewCount: { increment: 1 },
      lastViewedAt: new Date(),
    },
  });
}
