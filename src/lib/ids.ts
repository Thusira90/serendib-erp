import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

/**
 * Mints the next code for a given prefix within the given year, serialized
 * through a row-level transaction so concurrent callers do not collide.
 *
 * Example: nextCode("SGS-R", 2026) => "SGS-R-2026-000147"
 */
export async function nextCode(
  prefix: string,
  year: number,
  tx: PrismaClient | Prisma.TransactionClient = defaultPrisma,
  { pad = 6, sep = "-" }: { pad?: number; sep?: string } = {}
): Promise<string> {
  const row = await (tx as PrismaClient).idSequence.upsert({
    where: { prefix_year: { prefix, year } },
    update: { lastValue: { increment: 1 } },
    create: { prefix, year, lastValue: 1 },
  });
  return `${prefix}${sep}${year}${sep}${String(row.lastValue).padStart(pad, "0")}`;
}

export const codePrefix = {
  rough: "SGS-R",
  gemstone: "SGS-G",
  parcel: "PARCEL",
  cuttingJob: "CJ",
  transformation: "TX",
  certificate: "CERT",
  cgi: "CGI",
  customer: "CUST",
  enquiry: "ENQ",
  quotation: "Q",
  reservation: "RES",
  salesOrder: "SO",
  invoice: "INV",
  payment: "PAY",
  shipment: "SHP",
  expense: "EXP",
  supplier: "SUP",
  collection: "COL",
  director: "DIR",
  capital: "CC",
} as const;

/**
 * Generates a short, unambiguous public share code (default 6 chars). Omits
 * O/0 and I/1 to keep the URL readable when someone dictates it over a phone
 * call. Uniqueness is checked against the DB by the caller.
 */
export function generateShareCode(len = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Mints a year-less code (e.g. SUP-0042) using a bucket in IdSequence
 * where year=0 represents a lifetime-monotonic counter for this prefix.
 * Used for entities whose external-facing code doesn't reset per year.
 */
export async function nextGlobalCode(
  prefix: string,
  tx: PrismaClient | Prisma.TransactionClient = defaultPrisma,
  { pad = 4, sep = "-" }: { pad?: number; sep?: string } = {}
): Promise<string> {
  const row = await (tx as PrismaClient).idSequence.upsert({
    where: { prefix_year: { prefix, year: 0 } },
    update: { lastValue: { increment: 1 } },
    create: { prefix, year: 0, lastValue: 1 },
  });
  return `${prefix}${sep}${String(row.lastValue).padStart(pad, "0")}`;
}
