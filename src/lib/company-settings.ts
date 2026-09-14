import "server-only";
import { prisma } from "@/lib/db";

/**
 * Fetches the singleton company-settings row, creating a sensible default
 * on first read so downstream renderers (quotations, invoices, verify page)
 * never have to handle a missing row.
 */
export async function getCompanySettings() {
  const existing = await prisma.companySettings.findUnique({ where: { id: "singleton" } });
  if (existing) return existing;
  return prisma.companySettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      legalName: "Serendib Gemstones (Pvt) Ltd",
      city: "Colombo",
      country: "Sri Lanka",
      email: "sales@serendib.lk",
    },
  });
}
