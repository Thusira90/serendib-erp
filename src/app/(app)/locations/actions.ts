"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { INVENTORY_ITEM_KINDS } from "@/lib/enums";

// ─── Create a new inventory location ─────────────────────────────────────────

const locationSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  parentId: z.string().nullable(),
});

export async function createLocation(fd: FormData) {
  const session = await requireCapability("location:write");
  const s = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);
  const parsed = locationSchema.parse({
    code: s(fd.get("code")) ?? "",
    name: s(fd.get("name")) ?? "",
    parentId: s(fd.get("parentId")),
  });
  const existing = await prisma.inventoryLocation.findUnique({ where: { code: parsed.code } });
  if (existing) throw new Error(`A location with code ${parsed.code} already exists.`);
  const created = await prisma.inventoryLocation.create({
    data: { code: parsed.code, name: parsed.name, parentId: parsed.parentId },
  });
  await writeAudit({
    entity: "InventoryLocation", entityId: created.id, entityCode: created.code,
    action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
    newValue: `Location ${created.name} added.`,
  });
  revalidatePath("/locations");
}

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);

const moveSchema = z.object({
  itemKind: z.enum(INVENTORY_ITEM_KINDS),
  roughStoneId: z.string().nullable(),
  gemstoneId: z.string().nullable(),
  toLocationId: z.string().min(1),
  reason: z.string().nullable(),
});

/**
 * Move a rough or finished gemstone to a new inventory location.
 * Writes an InventoryMovement audit row and updates the item's location
 * in a single transaction.
 */
export async function moveItem(fd: FormData) {
  const session = await requireCapability("location:write");
  const parsed = moveSchema.parse({
    itemKind: str(fd.get("itemKind")),
    roughStoneId: str(fd.get("roughStoneId")),
    gemstoneId: str(fd.get("gemstoneId")),
    toLocationId: str(fd.get("toLocationId")),
    reason: str(fd.get("reason")),
  });

  await prisma.$transaction(async (tx) => {
    const dest = await tx.inventoryLocation.findUniqueOrThrow({ where: { id: parsed.toLocationId } });

    if (parsed.itemKind === "ROUGH") {
      if (!parsed.roughStoneId) throw new Error("roughStoneId required");
      const rough = await tx.roughStone.findUniqueOrThrow({ where: { id: parsed.roughStoneId } });
      if (rough.locationId === parsed.toLocationId) return;
      await tx.inventoryMovement.create({
        data: {
          itemKind: "ROUGH",
          roughStoneId: rough.id,
          toLocationId: parsed.toLocationId,
          fromLocationId: rough.locationId,
          movedById: session.user.id,
          movedByName: session.user.name ?? null,
          reason: parsed.reason,
        },
      });
      await tx.roughStone.update({ where: { id: rough.id }, data: { locationId: parsed.toLocationId } });
      await writeAudit({
        entity: "RoughStone", entityId: rough.id, entityCode: rough.code,
        action: "MOVED", field: "locationId",
        oldValue: rough.locationId ?? "∅", newValue: parsed.toLocationId,
        userId: session.user.id, userName: session.user.name ?? null,
        metadata: { destination: dest.code, reason: parsed.reason },
      }, tx);
      revalidatePath(`/rough/${rough.id}`);
    } else {
      if (!parsed.gemstoneId) throw new Error("gemstoneId required");
      const gem = await tx.gemstone.findUniqueOrThrow({ where: { id: parsed.gemstoneId } });
      if (gem.locationId === parsed.toLocationId) return;
      await tx.inventoryMovement.create({
        data: {
          itemKind: "GEMSTONE",
          gemstoneId: gem.id,
          toLocationId: parsed.toLocationId,
          fromLocationId: gem.locationId,
          movedById: session.user.id,
          movedByName: session.user.name ?? null,
          reason: parsed.reason,
        },
      });
      await tx.gemstone.update({ where: { id: gem.id }, data: { locationId: parsed.toLocationId } });
      await writeAudit({
        entity: "Gemstone", entityId: gem.id, entityCode: gem.code,
        action: "MOVED", field: "locationId",
        oldValue: gem.locationId ?? "∅", newValue: parsed.toLocationId,
        userId: session.user.id, userName: session.user.name ?? null,
        metadata: { destination: dest.code, reason: parsed.reason },
      }, tx);
      revalidatePath(`/gemstones/${gem.id}`);
    }
  });

  revalidatePath("/locations");
}
