"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { codePrefix, nextGlobalCode } from "@/lib/ids";
import { revalidatePath } from "next/cache";

/**
 * Lightweight "create just enough to reference" server actions used by
 * inline "+ Add" affordances on other forms. Each returns the created
 * record's id + display so the caller can select it immediately.
 *
 * The full detail pages remain the place to edit these — quick-create
 * only captures a name/code so the parent record can be saved without
 * leaving the form.
 */

async function ensureSupplierCounter() {
  const seq = await prisma.idSequence.findFirst({
    where: { prefix: codePrefix.supplier, year: 0 },
  });
  if (seq) return;
  const suppliers = await prisma.supplier.findMany({
    where: { code: { startsWith: `${codePrefix.supplier}-` } },
    select: { code: true },
  });
  let max = 0;
  for (const s of suppliers) {
    const n = Number(s.code.split("-").pop());
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  await prisma.idSequence.create({
    data: { prefix: codePrefix.supplier, year: 0, lastValue: max },
  });
}

export async function quickCreateSupplier(name: string): Promise<{ id: string; name: string; code: string }> {
  const session = await requireCapability("supplier:write");
  const clean = name.trim();
  if (!clean) throw new Error("Supplier name required");
  await ensureSupplierCounter();
  const created = await prisma.$transaction(async (tx) => {
    const code = await nextGlobalCode(codePrefix.supplier, tx, { pad: 4 });
    const c = await tx.supplier.create({ data: { code, name: clean } });
    await writeAudit({
      entity: "Supplier", entityId: c.id, entityCode: c.code,
      action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Supplier ${c.name} quick-added from form.`,
    }, tx);
    return c;
  });
  revalidatePath("/suppliers");
  return { id: created.id, name: created.name, code: created.code };
}

export async function quickCreateLocation(name: string, code?: string): Promise<{ id: string; name: string; code: string }> {
  const session = await requireCapability("location:write");
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Location name required");
  const cleanCode = (code ?? cleanName).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "-").slice(0, 40);
  const existing = await prisma.inventoryLocation.findUnique({ where: { code: cleanCode } });
  if (existing) throw new Error(`Location code ${cleanCode} already exists.`);
  const created = await prisma.inventoryLocation.create({ data: { code: cleanCode, name: cleanName } });
  await writeAudit({
    entity: "InventoryLocation", entityId: created.id, entityCode: created.code,
    action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
    newValue: `Location ${created.name} quick-added from form.`,
  });
  revalidatePath("/locations");
  return { id: created.id, name: created.name, code: created.code };
}

export async function quickCreateLaboratory(name: string): Promise<{ id: string; name: string; code: string }> {
  const session = await requireCapability("certificate:write");
  const clean = name.trim();
  if (!clean) throw new Error("Laboratory name required");
  // A short code from the name (GIA, SSEF, "Gem Lab Sri Lanka" -> GEM-LAB-SRI-LANKA), made unique with a number if taken.
  const base = clean.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "LAB";
  let code = base;
  for (let n = 2; await prisma.laboratory.findUnique({ where: { code } }); n++) code = `${base}-${n}`;
  const created = await prisma.laboratory.create({ data: { code, name: clean } });
  await writeAudit({
    entity: "Laboratory", entityId: created.id, entityCode: created.code,
    action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
    newValue: `Laboratory ${created.name} quick-added from the certificate form.`,
  });
  revalidatePath("/certificates");
  return { id: created.id, name: created.name, code: created.code };
}

// Parcels require supplier + totals up-front, so they can't be quick-created
// from a stone form — users create them through the full /parcels/new flow.
