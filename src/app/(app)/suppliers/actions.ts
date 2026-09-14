"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextGlobalCode } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { parseCsvToObjects } from "@/lib/csv-parse";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

const supplierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  contact: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("").transform(() => null)),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

type SupplierData = z.infer<typeof supplierSchema>;

/**
 * If IdSequence for the SUP prefix hasn't been created yet, scan for the
 * highest existing SUP-NNNN code and seed the counter to that value so the
 * next mint doesn't collide with seed data.
 */
async function ensureSupplierCounterSeeded() {
  const row = await prisma.idSequence.findUnique({
    where: { prefix_year: { prefix: codePrefix.supplier, year: 0 } },
  });
  if (row) return;
  const suppliers = await prisma.supplier.findMany({
    where: { code: { startsWith: `${codePrefix.supplier}-` } },
    select: { code: true },
  });
  let max = 0;
  for (const s of suppliers) {
    const m = s.code.match(/^SUP-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  await prisma.idSequence.create({
    data: { prefix: codePrefix.supplier, year: 0, lastValue: max },
  });
}

export async function createSupplier(fd: FormData) {
  const session = await requireCapability("supplier:write");
  const parsed = supplierSchema.parse({
    name: str(fd.get("name")) ?? "",
    code: str(fd.get("code")),
    country: str(fd.get("country")),
    city: str(fd.get("city")),
    contact: str(fd.get("contact")),
    email: str(fd.get("email")),
    phone: str(fd.get("phone")),
    notes: str(fd.get("notes")),
  });

  await ensureSupplierCounterSeeded();

  const created = await prisma.$transaction(async (tx) => {
    const code = parsed.code ?? (await nextGlobalCode(codePrefix.supplier, tx, { pad: 4 }));
    const c = await tx.supplier.create({
      data: {
        code,
        name: parsed.name,
        country: parsed.country ?? null,
        city: parsed.city ?? null,
        contact: parsed.contact ?? null,
        email: parsed.email ?? null,
        phone: parsed.phone ?? null,
        notes: parsed.notes ?? null,
      },
    });
    await writeAudit({
      entity: "Supplier", entityId: c.id, entityCode: c.code,
      action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Supplier ${c.name} added.`,
    }, tx);
    return c;
  });

  revalidatePath("/suppliers");
  redirect(`/suppliers/${created.id}`);
}

export type ImportResult = {
  created: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
};

/**
 * Bulk-imports suppliers from a CSV. Columns supported (all optional except
 * "name"): name, code, country, city, contact, email, phone, notes.
 * Existing codes are skipped (not overwritten). Invalid rows accumulate in
 * the returned errors list without aborting the whole import.
 */
export async function importSuppliersFromCsv(fd: FormData): Promise<ImportResult> {
  const session = await requireCapability("supplier:write");
  const text = str(fd.get("csv"));
  if (!text) return { created: 0, skipped: 0, errors: [{ row: 0, reason: "No CSV provided." }] };

  const rows = parseCsvToObjects(text);
  const errors: ImportResult["errors"] = [];
  const cleanRows: Array<SupplierData & { rowIndex: number }> = [];

  rows.forEach((r, i) => {
    const rowIndex = i + 2; // header = 1, first data row = 2
    const parsed = supplierSchema.safeParse({
      name: r.name ?? r.Name ?? "",
      code: r.code ?? r.Code ?? null,
      country: r.country ?? r.Country ?? null,
      city: r.city ?? r.City ?? null,
      contact: r.contact ?? r.Contact ?? null,
      email: r.email ?? r.Email ?? null,
      phone: r.phone ?? r.Phone ?? null,
      notes: r.notes ?? r.Notes ?? null,
    });
    if (!parsed.success) {
      errors.push({ row: rowIndex, reason: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") });
      return;
    }
    cleanRows.push({ ...parsed.data, rowIndex });
  });

  await ensureSupplierCounterSeeded();

  let created = 0;
  let skipped = 0;

  for (const row of cleanRows) {
    try {
      await prisma.$transaction(async (tx) => {
        // if a code was provided AND it already exists, skip
        if (row.code) {
          const existing = await tx.supplier.findUnique({ where: { code: row.code } });
          if (existing) {
            skipped++;
            return;
          }
        }
        const code = row.code ?? (await nextGlobalCode(codePrefix.supplier, tx, { pad: 4 }));
        const c = await tx.supplier.create({
          data: {
            code,
            name: row.name,
            country: row.country ?? null,
            city: row.city ?? null,
            contact: row.contact ?? null,
            email: row.email ?? null,
            phone: row.phone ?? null,
            notes: row.notes ?? null,
          },
        });
        await writeAudit({
          entity: "Supplier", entityId: c.id, entityCode: c.code,
          action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
          newValue: `Supplier ${c.name} imported.`,
        }, tx);
        created++;
      });
    } catch (e) {
      errors.push({ row: row.rowIndex, reason: (e as Error).message });
    }
  }

  revalidatePath("/suppliers");
  return { created, skipped, errors };
}
