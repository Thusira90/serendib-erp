import "server-only";
import { PrismaClient, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import type { AccountType, AccountSubtype } from "@/lib/enums";

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * The default Chart of Accounts from the SGS ERP architecture spec §10.
 * Anything with a `subtype` is a system account: the app looks these up
 * by subtype so users can renumber accounts without breaking auto-posting.
 * Anything without a `subtype` is still seeded but can be freely renamed,
 * moved, or deactivated.
 *
 * The tree is expressed as a flat list ordered so parents are inserted
 * before their children; each row optionally names its parent by code.
 */
type SeedRow = {
  code: string;
  name: string;
  type: AccountType;
  subtype?: AccountSubtype;
  parent?: string;
  description?: string;
};

const ROWS: SeedRow[] = [
  // Assets
  { code: "1000", name: "Assets", type: "ASSET", description: "Root category" },
  { code: "1100", name: "Cash",                              type: "ASSET",     subtype: "CASH",               parent: "1000" },
  { code: "1110", name: "Petty Cash",                        type: "ASSET",     subtype: "CASH",               parent: "1000" },
  { code: "1200", name: "Bank Accounts",                     type: "ASSET",     subtype: "BANK",               parent: "1000" },
  { code: "1300", name: "Accounts Receivable",               type: "ASSET",     subtype: "AR",                 parent: "1000" },
  { code: "1400", name: "Rough Gemstone Inventory",          type: "ASSET",     subtype: "INVENTORY_ROUGH",    parent: "1000" },
  { code: "1410", name: "Cut & Polished Gemstone Inventory", type: "ASSET",     subtype: "INVENTORY_GEMSTONE", parent: "1000" },
  { code: "1420", name: "Gemstone Parcels",                  type: "ASSET",     subtype: "INVENTORY_PARCEL",   parent: "1000" },
  { code: "1500", name: "Prepayments",                       type: "ASSET",     subtype: "PREPAYMENTS",        parent: "1000" },
  { code: "1600", name: "Fixed Assets",                      type: "ASSET",     subtype: "FIXED_ASSETS",       parent: "1000" },
  { code: "1700", name: "Accumulated Depreciation",          type: "ASSET",     subtype: "ACC_DEPRECIATION",   parent: "1000" },

  // Liabilities
  { code: "2000", name: "Liabilities", type: "LIABILITY", description: "Root category" },
  { code: "2100", name: "Accounts Payable",                  type: "LIABILITY", subtype: "AP",                 parent: "2000" },
  { code: "2200", name: "Director Loans",                    type: "LIABILITY", subtype: "DIRECTOR_LOAN",      parent: "2000" },
  { code: "2300", name: "Other Loans",                       type: "LIABILITY", subtype: "OTHER_LOANS",        parent: "2000" },
  { code: "2400", name: "Accrued Expenses",                  type: "LIABILITY", subtype: "ACCRUED_EXPENSES",   parent: "2000" },
  { code: "2500", name: "Taxes Payable",                     type: "LIABILITY", subtype: "TAXES_PAYABLE",      parent: "2000" },

  // Equity
  { code: "3000", name: "Equity", type: "EQUITY", description: "Root category" },
  { code: "3100", name: "Share Capital",                     type: "EQUITY",    subtype: "SHARE_CAPITAL",      parent: "3000" },
  { code: "3200", name: "Share Premium",                     type: "EQUITY",    subtype: "SHARE_PREMIUM",      parent: "3000" },
  { code: "3300", name: "Retained Earnings",                 type: "EQUITY",    subtype: "RETAINED_EARNINGS",  parent: "3000" },
  { code: "3400", name: "Current Year Profit/Loss",          type: "EQUITY",    subtype: "CURRENT_YEAR_PL",    parent: "3000" },

  // Revenue
  { code: "4000", name: "Revenue", type: "REVENUE", description: "Root category" },
  { code: "4100", name: "Gemstone Sales",                    type: "REVENUE",   subtype: "REVENUE_SALES",      parent: "4000" },
  { code: "4200", name: "Other Revenue",                     type: "REVENUE",   subtype: "REVENUE_OTHER",      parent: "4000" },

  // Cost of sales
  { code: "5000", name: "Cost of Sales", type: "COST_OF_SALES", description: "Root category" },
  { code: "5100", name: "Gemstone Cost of Sales",            type: "COST_OF_SALES", subtype: "COS_GEMSTONE",       parent: "5000" },
  { code: "5200", name: "Cutting Costs",                     type: "COST_OF_SALES", subtype: "COS_CUTTING",        parent: "5000" },
  { code: "5300", name: "Certification Costs",               type: "COST_OF_SALES", subtype: "COS_CERTIFICATION",  parent: "5000" },
  { code: "5400", name: "Packaging",                         type: "COST_OF_SALES", subtype: "COS_PACKAGING",      parent: "5000" },
  { code: "5500", name: "Direct Selling Costs",              type: "COST_OF_SALES", subtype: "COS_DIRECT_SELLING", parent: "5000" },

  // Operating expenses
  { code: "6000", name: "Expenses", type: "EXPENSE", description: "Root category" },
  { code: "6100", name: "Salaries",                          type: "EXPENSE",   subtype: "EXP_SALARIES",     parent: "6000" },
  { code: "6200", name: "Rent",                              type: "EXPENSE",   subtype: "EXP_RENT",         parent: "6000" },
  { code: "6300", name: "Utilities",                         type: "EXPENSE",   subtype: "EXP_UTILITIES",    parent: "6000" },
  { code: "6400", name: "Marketing",                         type: "EXPENSE",   subtype: "EXP_MARKETING",    parent: "6000" },
  { code: "6500", name: "Exhibition Expenses",               type: "EXPENSE",   subtype: "EXP_EXHIBITION",   parent: "6000" },
  { code: "6600", name: "Transport",                         type: "EXPENSE",   subtype: "EXP_TRANSPORT",    parent: "6000" },
  { code: "6700", name: "Professional Fees",                 type: "EXPENSE",   subtype: "EXP_PROFESSIONAL", parent: "6000" },
  { code: "6800", name: "Bank Charges",                      type: "EXPENSE",   subtype: "EXP_BANK_CHARGES", parent: "6000" },
  { code: "6900", name: "Depreciation",                      type: "EXPENSE",   subtype: "EXP_DEPRECIATION", parent: "6000" },
];

/**
 * Seed the default CoA if it isn't already present. Idempotent — running
 * this twice is a no-op. Returns the number of accounts created.
 */
export async function seedDefaultChartOfAccounts(tx: Tx = defaultPrisma): Promise<{ created: number; total: number }> {
  const client = tx as PrismaClient;
  const existing = await client.chartAccount.findMany({ select: { code: true } });
  const existingCodes = new Set(existing.map((a) => a.code));
  const byCode: Record<string, string> = {};   // code → id, populated as we go
  for (const a of existing) byCode[a.code] = ""; // placeholder; will be filled by parent lookups below
  let created = 0;
  for (const row of ROWS) {
    if (existingCodes.has(row.code)) continue;
    let parentId: string | null = null;
    if (row.parent) {
      const parent = await client.chartAccount.findUnique({ where: { code: row.parent }, select: { id: true } });
      parentId = parent?.id ?? null;
    }
    const acct = await client.chartAccount.create({
      data: {
        code: row.code,
        name: row.name,
        type: row.type,
        subtype: row.subtype ?? null,
        parentId,
        isSystem: true,
        description: row.description ?? null,
      },
    });
    byCode[row.code] = acct.id;
    created++;
  }
  return { created, total: existing.length + created };
}

/**
 * Look up a system account by its subtype tag. Throws if the tag is not
 * mapped — auto-posting relies on the seed being present.
 */
export async function accountBySubtype(subtype: AccountSubtype, tx: Tx = defaultPrisma) {
  const acct = await (tx as PrismaClient).chartAccount.findFirst({
    where: { subtype, isActive: true },
    orderBy: { code: "asc" },
  });
  if (!acct) throw new Error(`Chart of Accounts is missing a "${subtype}" system account. Run the CoA seed.`);
  return acct;
}
