"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { parseCsvToObjects } from "@/lib/csv-parse";
import { CUSTOMER_KINDS, CUSTOMER_TYPES } from "@/lib/enums";

export type ImportResult = {
  created: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
};

const customerImportSchema = z.object({
  displayName: z.string().min(1, "displayName is required"),
  kind: z.enum(CUSTOMER_KINDS).optional().default("INDIVIDUAL"),
  type: z.enum(CUSTOMER_TYPES).optional().default("PRIVATE_BUYER"),
  companyName: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  addressLine: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("").transform(() => null)),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  socialProfile: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const norm = (s: string | null | undefined) => (typeof s === "string" && s.trim() ? s.trim() : null);

/**
 * Bulk-imports customers from a CSV. Required column: displayName. All other
 * columns match the Customer model: kind, type, companyName, country, city,
 * addressLine, email, phone, website, socialProfile, notes.
 * Duplicate (case-insensitive) displayName + email pairs are skipped.
 */
export async function importCustomersFromCsv(fd: FormData): Promise<ImportResult> {
  const session = await requireCapability("customer:write");
  const text = norm(fd.get("csv") as string | null);
  if (!text) return { created: 0, skipped: 0, errors: [{ row: 0, reason: "No CSV provided." }] };

  const rows = parseCsvToObjects(text);
  const errors: ImportResult["errors"] = [];
  const cleanRows: Array<z.infer<typeof customerImportSchema> & { rowIndex: number }> = [];

  rows.forEach((r, i) => {
    const rowIndex = i + 2;
    const parsed = customerImportSchema.safeParse({
      displayName: r.displayName ?? r.DisplayName ?? r.name ?? r.Name ?? "",
      kind: r.kind ?? r.Kind ?? undefined,
      type: r.type ?? r.Type ?? undefined,
      companyName: r.companyName ?? r.company ?? r.Company ?? null,
      country: r.country ?? r.Country ?? null,
      city: r.city ?? r.City ?? null,
      addressLine: r.addressLine ?? r.address ?? r.Address ?? null,
      email: r.email ?? r.Email ?? null,
      phone: r.phone ?? r.Phone ?? null,
      website: r.website ?? r.Website ?? null,
      socialProfile: r.socialProfile ?? r.social ?? r.Social ?? null,
      notes: r.notes ?? r.Notes ?? null,
    });
    if (!parsed.success) {
      errors.push({ row: rowIndex, reason: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") });
      return;
    }
    cleanRows.push({ ...parsed.data, rowIndex });
  });

  const year = new Date().getUTCFullYear();
  let created = 0;
  let skipped = 0;

  for (const row of cleanRows) {
    try {
      await prisma.$transaction(async (tx) => {
        // duplicate detection: same displayName + email (case-insensitive)
        if (row.email) {
          const dup = await tx.customer.findFirst({
            where: {
              email: { equals: row.email },
              displayName: { equals: row.displayName },
            },
          });
          if (dup) {
            skipped++;
            return;
          }
        }
        const code = await nextCode(codePrefix.customer, year, tx, { pad: 4 });
        const c = await tx.customer.create({
          data: {
            code,
            kind: row.kind,
            type: row.type,
            displayName: row.displayName,
            companyName: row.companyName ?? null,
            country: row.country ?? null,
            city: row.city ?? null,
            addressLine: row.addressLine ?? null,
            email: row.email ?? null,
            phone: row.phone ?? null,
            website: row.website ?? null,
            socialProfile: row.socialProfile ?? null,
            notes: row.notes ?? null,
          },
        });
        await writeAudit({
          entity: "Customer", entityId: c.id, entityCode: c.code,
          action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
          newValue: `Customer ${c.displayName} imported.`,
        }, tx);
        created++;
      });
    } catch (e) {
      errors.push({ row: row.rowIndex, reason: (e as Error).message });
    }
  }

  revalidatePath("/customers");
  return { created, skipped, errors };
}
