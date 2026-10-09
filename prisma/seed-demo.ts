/**
 * Serendib ERP — FULL DEMO dataset.
 *
 * Fills every module with realistic, connected dummy data (Jan–Oct 2026) so the whole
 * ERP can be demonstrated: purchasing → cutting → certification → CGI → sales → shipping →
 * accounting → shareholders → partner deals.
 *
 * SAFETY: this script WIPES every table first. It refuses to run unless DATABASE_URL points at
 * localhost, so it can never touch the production database.
 *
 * Run:  npm run db:seed:demo
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { nextCode, nextGlobalCode, codePrefix, generateShareCode } from "@/lib/ids";
import { seedDefaultChartOfAccounts } from "@/lib/coa-seed";
import { postJournal } from "@/lib/accounting";
import { recomputeCgiForGemstone } from "@/lib/cgi-service";
import { QR_FIELDS } from "@/lib/qr-fields";
import { imgGem, imgRough, imgCert, type Shape } from "./demo/images";

const prisma = new PrismaClient();
const YEAR = 2026;
const USD = 300;   // LKR per USD in the demo
const EUR = 330;
const GBP = 385;

const d = (s: string) => new Date(`${s}T09:30:00.000Z`);
const n = (v: number, dp = 2) => Number(v.toFixed(dp));
const log = (m: string) => console.log(`  ${m}`);

function assertLocal() {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try { host = new URL(url).hostname; } catch { /* handled below */ }
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    console.error(`\nREFUSING TO RUN: DATABASE_URL host is "${host || "unset"}". This script wipes all data and may only run against a local database.\n`);
    process.exit(1);
  }
}

async function wipe() {
  const tables = (await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`).filter((t) => t.tablename !== "_prisma_migrations");
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function main() {
  assertLocal();
  console.log("Wiping local demo database…");
  await wipe();

  // ───────────────────────────── Company, QR, users ─────────────────────────────
  console.log("Company settings, QR profiles, users…");
  await prisma.companySettings.create({
    data: {
      id: "singleton",
      legalName: "Serendib Gemstones (Pvt) Ltd",
      tradingName: "Serendib Gems",
      addressLine: "No. 42, Galle Face Terrace, Colombo 03",
      city: "Colombo", country: "Sri Lanka",
      taxId: "114523678-7000", registrationNumber: "PV 00245871",
      email: "hello@serendibgems.example", phone: "+94 11 234 5678", website: "https://serendibgems.example",
      defaultCurrency: "LKR",
      defaultPaymentTerms: "50% on order, 50% before shipping",
      defaultDeliveryTerms: "Insured courier, 5–7 business days",
      defaultShippingTerms: "DAP customer address",
    },
  });
  for (const kind of ["GEMSTONE", "ROUGH"] as const) {
    await prisma.qrProfile.create({
      data: { kind, fields: JSON.stringify(Object.fromEntries(QR_FIELDS[kind].map((f) => [f.key, f.default]))), updatedBy: "Demo seed" },
    });
  }

  const passwordHash = await bcrypt.hash("password123", 10);
  const mkUser = (email: string, name: string, role: string, extra: object = {}) =>
    prisma.user.create({ data: { email, name, passwordHash, role, ...extra } });
  const owner   = await mkUser("super@serendib.lk",      "Nuwan Abeysekera",   "SUPER_ADMIN");
  const admin   = await mkUser("admin@serendib.lk",      "Dilani Ratnayake",   "ADMINISTRATOR");
  const mgmt    = await mkUser("management@serendib.lk", "Rohan Wickrama",     "MANAGEMENT");
  const buyer   = await mkUser("buyer@serendib.lk",      "Priyantha Silva",    "GEM_BUYER");
  const gemo    = await mkUser("gem@serendib.lk",        "Dr Kavindi Perera",  "GEMOLOGIST");
  const cutter  = await mkUser("cutter@serendib.lk",     "Nimal Fernando",     "CUTTER");
  const cutter2 = await mkUser("cutter2@serendib.lk",    "Saman Kumara",       "CUTTER");
  const sales   = await mkUser("sales@serendib.lk",      "Ishara Jayawardena", "SALES", { capabilityGrants: JSON.stringify(["report:read"]) });
  const media   = await mkUser("media@serendib.lk",      "Malin De Silva",     "CGI_MEDIA");
  const finance = await mkUser("finance@serendib.lk",    "Chamari Dissanayake","FINANCE");
  const whouse  = await mkUser("warehouse@serendib.lk",  "Kasun Madushanka",   "WAREHOUSE");
  await mkUser("former.staff@serendib.lk", "Tharindu Bandara (left)", "SALES", { active: false });

  // ───────────────────────────── Locations ─────────────────────────────
  console.log("Locations…");
  const loc: Record<string, string> = {};
  const mkLoc = async (code: string, name: string, parent?: string) => {
    const r = await prisma.inventoryLocation.create({ data: { code, name, parentId: parent ? loc[parent] : null } });
    loc[code] = r.id;
  };
  await mkLoc("MAIN", "Main Facility — Colombo");
  await mkLoc("VAULT", "Vault", "MAIN");
  await mkLoc("VAULT-A", "Cabinet A — Rough", "VAULT");
  await mkLoc("VAULT-A-T01", "Tray 01", "VAULT-A");
  await mkLoc("VAULT-A-T02", "Tray 02", "VAULT-A");
  await mkLoc("VAULT-A-T03", "Tray 03", "VAULT-A");
  await mkLoc("VAULT-B", "Cabinet B — Finished", "VAULT");
  await mkLoc("VAULT-B-T01", "Tray 01", "VAULT-B");
  await mkLoc("VAULT-B-T02", "Tray 02", "VAULT-B");
  await mkLoc("VAULT-C", "Cabinet C — Premium (> 5 ct)", "VAULT");
  await mkLoc("CUTTING", "Cutting Department", "MAIN");
  await mkLoc("QC", "Quality Control", "MAIN");
  await mkLoc("SHOWROOM", "Showroom Display", "MAIN");
  await mkLoc("OUT-LAB", "Out at laboratory");
  await mkLoc("OUT-HEAT", "Out for heat treatment");

  // ───────────────────────────── Suppliers ─────────────────────────────
  console.log("Suppliers…");
  const sup: Record<string, string> = {};
  const mkSup = async (key: string, name: string, country: string, city: string, contact: string, email: string, phone: string, notes: string) => {
    const code = await nextGlobalCode(codePrefix.supplier);
    sup[key] = (await prisma.supplier.create({ data: { code, name, country, city, contact, email, phone, notes } })).id;
  };
  await mkSup("ratna", "Ratnapura Rough Traders",   "Sri Lanka", "Ratnapura", "Sarath Bandara", "sarath@ratnapurarough.example", "+94 45 222 3344", "Long-standing supplier of Ratnapura sapphire and padparadscha. Pays on 30-day terms.");
  await mkSup("beru",  "Beruwala Gem Market",       "Sri Lanka", "Beruwala",  "Anil Perera",    "anil@beruwala.example",         "+94 34 227 1188", "Finished stones and melee. Cash on delivery.");
  await mkSup("mogok", "Mogok Rough Imports",       "Myanmar",   "Mogok",     "Zaw Min",        "zaw@mogokrough.example",        "+95 9 255 123 456", "Spinel and padparadscha rough. Import via Bangkok; allow 3 weeks.");
  await mkSup("ela",   "Elahera Mining Syndicate",  "Sri Lanka", "Elahera",   "Upali Jayasekara","upali@elahera.example",        "+94 66 228 9021", "Large Ceylon blue sapphire parcels. Bulk discounts above 30 ct.");
  await mkSup("bala",  "Balangoda Gem Pit (Pvt) Ltd","Sri Lanka","Balangoda", "Chaminda Rathnayake","chaminda@balangodapit.example","+94 45 228 7766","Pink and yellow sapphires, star stones.");
  await mkSup("mahe",  "Mahenge Gem Co.",           "Tanzania",  "Morogoro",  "Juma Mwakyusa",  "juma@mahengegem.example",       "+255 754 330 118", "Mahenge spinel, garnet, alexandrite. Pays via SWIFT, USD invoices.");
  await mkSup("chan",  "Chanthaburi Stone House",   "Thailand",  "Chanthaburi","Somchai Wattana","somchai@chanstone.example",     "+66 39 312 455",  "Treated and finished stones; heat-treatment partner.");
  await mkSup("mada",  "Ambanja Rough Exports",     "Madagascar","Antananarivo","Hery Rakoto",   "hery@ambanja.example",          "+261 34 11 223 44","Aquamarine, tourmaline, sapphire rough.");

  // ───────────────────────────── Rough stones & parcels ─────────────────────────────
  console.log("Parcels & rough stones…");
  type RoughDef = {
    k: string; sup: string; parcel: string; loc?: string; date: string; gemType: string; variety: string; species: string;
    origin: string; mine?: string; wt: number; dims?: [number, number, number]; shape: string; color: string; transp: string;
    clarity: string; incl?: string; surface?: string; fract?: string; obs?: string; treat?: string; price: number;
    val?: [number, string, string, string]; status: string; hex: string;
  };
  const roughDefs: RoughDef[] = [
    { k: "R1", sup: "ratna", parcel: "P1", loc: "VAULT-A-T01", date: "2026-01-12", gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum", origin: "Sri Lanka", mine: "Ratnapura", wt: 25.4, dims: [22.1, 15.6, 12.3], shape: "Hexagonal", color: "Deep blue", transp: "Semi-transparent", clarity: "Moderately included", incl: "Rutile silk, minor feathers", surface: "Water-worn, slightly pitted", fract: "One small healed fracture near the termination", obs: "Colour zoning visible along the c-axis; best colour in the lower third.", treat: "Unheated", price: 1850000, val: [2600000, "Priyantha Silva", "2026-01-13", "Comparable Ratnapura rough sold at 95–105k/ct in Q4 2025."], status: "CONVERTED", hex: "#1f4fd8" },
    { k: "R2", sup: "ratna", parcel: "P1", loc: "VAULT-A-T01", date: "2026-01-12", gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum", origin: "Sri Lanka", mine: "Ratnapura", wt: 18.7, dims: [19.0, 13.8, 10.5], shape: "Water-worn", color: "Cornflower blue", transp: "Transparent", clarity: "Slightly included", incl: "Fine needles, a few crystals", surface: "Smooth, polished by river action", obs: "Heated in Chanthaburi in March to improve saturation.", treat: "Heated (traditional)", price: 1050000, val: [1500000, "Priyantha Silva", "2026-01-13", ""], status: "CONVERTED", hex: "#4a74e8" },
    { k: "R3", sup: "ratna", parcel: "P1", loc: "VAULT-A-T02", date: "2026-01-12", gemType: "Sapphire", variety: "Yellow Sapphire", species: "Corundum", origin: "Sri Lanka", mine: "Balangoda", wt: 12.2, dims: [15.2, 11.4, 9.1], shape: "Irregular", color: "Golden yellow", transp: "Transparent", clarity: "Eye clean", surface: "Slightly frosted", obs: "Clean window through the centre. Good candidate for a cushion.", treat: "Unheated", price: 520000, val: [640000, "Priyantha Silva", "2026-01-14", ""], status: "AVAILABLE", hex: "#e6b422" },
    { k: "R4", sup: "mogok", parcel: "P2", loc: "CUTTING", date: "2026-02-05", gemType: "Spinel", variety: "Red Spinel", species: "Spinel", origin: "Myanmar", mine: "Mogok", wt: 9.8, dims: [14.0, 10.5, 8.2], shape: "Octahedral fragment", color: "Vivid red", transp: "Transparent", clarity: "Eye clean", incl: "Tiny octahedral crystals", surface: "Natural octahedral faces", obs: "Strong red fluorescence under UV.", treat: "Unheated", price: 1350000, val: [1800000, "Dr Kavindi Perera", "2026-02-10", "Mogok red spinel is in high demand; reserve price is conservative."], status: "IN_CUTTING", hex: "#d41f3a" },
    { k: "R5", sup: "mogok", parcel: "P2", loc: "QC", date: "2026-02-05", gemType: "Sapphire", variety: "Padparadscha", species: "Corundum", origin: "Myanmar", mine: "Mogok", wt: 6.4, dims: [11.8, 9.0, 7.5], shape: "Rounded", color: "Pink-orange", transp: "Transparent", clarity: "Slightly included", incl: "Fine silk, one small fingerprint", surface: "Water-worn", obs: "Colour sits on the borderline of pink and orange; lab opinion recommended after cutting.", treat: "Unheated", price: 1980000, val: [2800000, "Dr Kavindi Perera", "2026-02-10", ""], status: "INSPECTED", hex: "#f08a5d" },
    { k: "R6", sup: "ela", parcel: "P3", loc: "VAULT-A-T03", date: "2026-03-02", gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum", origin: "Sri Lanka", mine: "Elahera", wt: 32.8, dims: [27.4, 19.8, 15.1], shape: "Barrel", color: "Royal blue", transp: "Transparent", clarity: "Slightly included", incl: "Silk, small crystals", surface: "Frosted with a window", fract: "None visible", obs: "Exceptional size; window shows royal blue colour.", treat: "Unheated", price: 3400000, val: [5200000, "Priyantha Silva", "2026-03-03", "Top-end Ceylon rough; likely cut to a >10 ct cushion."], status: "CONVERTED", hex: "#143fa8" },
    { k: "R7", sup: "bala", parcel: "P4", loc: "VAULT-A-T02", date: "2026-04-10", gemType: "Sapphire", variety: "Pink Sapphire", species: "Corundum", origin: "Sri Lanka", mine: "Balangoda", wt: 14.6, dims: [17.5, 12.9, 10.2], shape: "Tabular", color: "Hot pink", transp: "Transparent", clarity: "Eye clean", surface: "Smooth", obs: "Very even colour.", treat: "Heated (traditional)", price: 720000, val: [950000, "Priyantha Silva", "2026-04-11", ""], status: "CONVERTED", hex: "#e0488f" },
    { k: "R8", sup: "mahe", parcel: "P5", loc: "VAULT-A-T03", date: "2026-04-28", gemType: "Spinel", variety: "Mahenge Spinel", species: "Spinel", origin: "Tanzania", mine: "Mahenge", wt: 21.3, dims: [20.0, 16.2, 12.0], shape: "Irregular", color: "Hot pink-red", transp: "Transparent", clarity: "Very slightly included", surface: "Natural", obs: "Neon glow in daylight.", treat: "Unheated", price: 1260000, val: [1700000, "Dr Kavindi Perera", "2026-04-30", ""], status: "CONVERTED", hex: "#e83a6a" },
    { k: "R9", sup: "ela", parcel: "P3", loc: "VAULT-A-T02", date: "2026-03-02", gemType: "Chrysoberyl", variety: "Chrysoberyl Cat's Eye", species: "Chrysoberyl", origin: "Sri Lanka", mine: "Elahera", wt: 8.9, dims: [13.1, 10.6, 8.0], shape: "Rounded", color: "Honey yellow-green", transp: "Translucent", clarity: "Silk-rich", obs: "Sharp eye when lit from a single source.", treat: "Unheated", price: 380000, status: "AVAILABLE", hex: "#b7a63a" },
    { k: "R10", sup: "bala", parcel: "P4", loc: "OUT-HEAT", date: "2026-04-10", gemType: "Sapphire", variety: "Star Sapphire", species: "Corundum", origin: "Sri Lanka", mine: "Balangoda", wt: 5.2, dims: [10.2, 8.7, 6.1], shape: "Rounded", color: "Blue-grey", transp: "Translucent", clarity: "Silk-rich", obs: "Six-ray star visible in raw state; sent for heating to improve body colour.", treat: "Heat treatment in progress", price: 260000, status: "RECEIVED", hex: "#5b6f94" },
    { k: "R11", sup: "mada", parcel: "P6", date: "2026-05-20", gemType: "Aquamarine", variety: "Santa Maria Aquamarine", species: "Beryl", origin: "Madagascar", mine: "Ambanja", wt: 40.1, dims: [34.0, 18.5, 16.0], shape: "Prismatic crystal", color: "Sky blue", transp: "Transparent", clarity: "Eye clean", obs: "Terminated crystal; may be cut into a large emerald-cut.", treat: "Unknown", price: 860000, status: "PURCHASED", hex: "#7fd4e8" },
    { k: "R12", sup: "ela", parcel: "P3", loc: "VAULT-A-T03", date: "2026-03-02", gemType: "Garnet", variety: "Rhodolite", species: "Garnet", origin: "Sri Lanka", mine: "Elahera", wt: 11.7, dims: [14.2, 11.5, 9.8], shape: "Irregular", color: "Raspberry red-purple", transp: "Transparent", clarity: "Eye clean", treat: "Unheated", price: 140000, status: "AVAILABLE", hex: "#a3203f" },
    { k: "R13", sup: "ratna", parcel: "P7", loc: "VAULT-A-T01", date: "2026-05-30", gemType: "Sapphire", variety: "Padparadscha", species: "Corundum", origin: "Sri Lanka", mine: "Ratnapura", wt: 16.4, dims: [18.2, 13.5, 11.0], shape: "Rounded", color: "Pinkish-orange (lotus)", transp: "Transparent", clarity: "Slightly included", incl: "Fine silk, healed fissure", surface: "Smooth", obs: "A genuine Ceylon padparadscha rough — rare at this size.", treat: "Unheated", price: 4900000, val: [7200000, "Dr Kavindi Perera", "2026-06-01", "Valued against SSEF-certified padparadscha sales of 2025."], status: "CONVERTED", hex: "#f59a76" },
    { k: "R14", sup: "mahe", parcel: "P5", loc: "VAULT-A-T01", date: "2026-04-28", gemType: "Chrysoberyl", variety: "Alexandrite", species: "Chrysoberyl", origin: "Tanzania", mine: "Lake Manyara", wt: 7.3, dims: [12.1, 9.4, 7.7], shape: "Fragment", color: "Green to purplish-red (colour change)", transp: "Transparent", clarity: "Slightly included", surface: "Natural", obs: "Strong colour change under incandescent vs daylight.", treat: "Unheated", price: 2100000, val: [2900000, "Dr Kavindi Perera", "2026-04-30", ""], status: "CONVERTED", hex: "#2f7d5a" },
    { k: "R15", sup: "mada", parcel: "P6", loc: "VAULT-A-T02", date: "2026-05-20", gemType: "Tourmaline", variety: "Indicolite", species: "Tourmaline", origin: "Madagascar", wt: 3.8, shape: "Prismatic", color: "Teal blue", transp: "Transparent", clarity: "Eye clean", treat: "Unheated", price: 95000, status: "SOLD", hex: "#1c8c9a" },
  ];
  const parcelDefs: Record<string, { sup: string; date: string; origin: string; notes: string }> = {
    P1: { sup: "ratna", date: "2026-01-12", origin: "Ratnapura, Sri Lanka", notes: "Mixed Ratnapura sapphire parcel — two blues and a yellow." },
    P2: { sup: "mogok", date: "2026-02-05", origin: "Mogok, Myanmar", notes: "Spinel / padparadscha parcel imported via Bangkok." },
    P3: { sup: "ela", date: "2026-03-02", origin: "Elahera, Sri Lanka", notes: "Large Elahera lot: a 32 ct blue plus chrysoberyl and garnet." },
    P4: { sup: "bala", date: "2026-04-10", origin: "Balangoda, Sri Lanka", notes: "Pink sapphire and star stone." },
    P5: { sup: "mahe", date: "2026-04-28", origin: "Tanzania", notes: "Mahenge spinel and alexandrite, USD invoice." },
    P6: { sup: "mada", date: "2026-05-20", origin: "Madagascar", notes: "Aquamarine crystal and indicolite." },
    P7: { sup: "ratna", date: "2026-05-30", origin: "Ratnapura, Sri Lanka", notes: "Single padparadscha — the best rough of the year." },
  };
  const parcelId: Record<string, string> = {};
  for (const [pk, p] of Object.entries(parcelDefs)) {
    const members = roughDefs.filter((r) => r.parcel === pk);
    const row = await prisma.parcel.create({
      data: {
        code: await nextCode(codePrefix.parcel, YEAR, prisma, { pad: 4 }), supplierId: sup[p.sup], purchaseDate: d(p.date), origin: p.origin,
        totalWeightCt: n(members.reduce((s, m) => s + m.wt, 0)), totalCost: members.reduce((s, m) => s + m.price, 0),
        currency: "LKR", notes: p.notes,
      },
    });
    parcelId[pk] = row.id;
  }
  const rough: Record<string, { id: string; code: string; wt: number; price: number; hex: string }> = {};
  for (const r of roughDefs) {
    const code = await nextCode(codePrefix.rough, YEAR);
    const row = await prisma.roughStone.create({
      data: {
        code, supplierId: sup[r.sup], parcelId: parcelId[r.parcel], locationId: r.loc ? loc[r.loc] : null, purchaseDate: d(r.date),
        gemType: r.gemType, variety: r.variety, species: r.species, origin: r.origin, mineSource: r.mine ?? null,
        weightCt: r.wt, lengthMm: r.dims?.[0] ?? null, widthMm: r.dims?.[1] ?? null, heightMm: r.dims?.[2] ?? null,
        shape: r.shape, color: r.color, transparency: r.transp, clarity: r.clarity, inclusions: r.incl ?? null, surface: r.surface ?? null,
        fractures: r.fract ?? null, observations: r.obs ?? null, treatment: r.treat ?? null,
        purchasePrice: r.price, currency: "LKR", pricePerCt: n(r.price / r.wt),
        initialValuation: r.val?.[0] ?? null, valuationBy: r.val?.[1] ?? null, valuationDate: r.val ? d(r.val[2]) : null, valuationNotes: r.val?.[3] || null,
        status: r.status,
      },
    });
    rough[r.k] = { id: row.id, code, wt: r.wt, price: r.price, hex: r.hex };
  }

  // ───────────────────────────── Laboratories ─────────────────────────────
  console.log("Laboratories…");
  const lab: Record<string, { id: string; name: string }> = {};
  const mkLab = async (code: string, name: string, country: string, website: string, notes: string) => {
    lab[code] = { id: (await prisma.laboratory.create({ data: { code, name, country, website, notes } })).id, name };
  };
  await mkLab("GRS", "GRS Gemresearch Swisslab", "Switzerland", "https://gemresearch.ch", "Preferred for origin reports; 5–7 day turnaround.");
  await mkLab("GIA", "Gemological Institute of America", "USA", "https://www.gia.edu", "Identification and quality reports. Ships via Malca-Amit.");
  await mkLab("SSEF", "Swiss Gemmological Institute SSEF", "Switzerland", "https://www.ssef.ch", "Used for padparadscha and untreated top-end stones.");
  await mkLab("GIC", "Gem & Jewellery Research Lab — GIC Colombo", "Sri Lanka", "https://gic.example", "Local lab; fast (2 days) and low cost.");
  await mkLab("GUB", "Gübelin Gem Lab", "Switzerland", "https://gubelinlab.example", "Emerald and ruby specialists.");
  await mkLab("AGL", "American Gemological Laboratories", "USA", "https://aglgemlab.example", "Colour-origin reports for coloured stones.");

  // ───────────────────────────── Cutting plans ─────────────────────────────
  console.log("Cutting plans…");
  const plans = (rk: string, rows: [string, string, number, number, number, number, number, boolean, string, string][]) =>
    prisma.cuttingPlan.createMany({
      data: rows.map(([name, shape, w, y, v, l, wd, sel, rec, risk]) => ({
        roughStoneId: rough[rk].id, name, proposedShape: shape, expectedWeightCt: w, expectedYieldPct: y, expectedValue: v,
        proposedLengthMm: l, proposedWidthMm: wd, proposedDepthMm: n(wd * 0.62), selected: sel, cutterRecommendation: rec, riskAssessment: risk,
        notes: sel ? "Selected after gemologist review." : null,
      })),
    });
  await plans("R1", [
    ["Plan A", "Oval", 8.5, 33.5, 5100000, 13.4, 10.1, true, "Highest value; cleaner centre.", "Low — one feather will be cut away."],
    ["Plan B", "Cushion", 7.8, 30.7, 4600000, 12.0, 10.0, false, "More classic Ceylon shape.", "Medium — fracture near girdle."],
    ["Plan C", "Pear", 6.9, 27.2, 4000000, 14.2, 9.0, false, "Best colour saturation.", "Low."],
  ]);
  await plans("R2", [
    ["Plan A", "Cushion", 6.4, 34.2, 2000000, 11.4, 9.6, true, "Keep the window centred.", "Low."],
    ["Plan B", "Oval", 5.9, 31.5, 1750000, 12.2, 9.0, false, "Slightly less weight, better ratio.", "Low."],
  ]);
  await plans("R4", [
    ["Plan A", "Cushion", 3.4, 34.7, 3200000, 8.5, 7.6, true, "Follow the octahedral planes.", "Medium — cleavage along {111}."],
    ["Plan B", "Round", 2.9, 29.6, 2700000, 8.0, 8.0, false, "More waste but safer.", "Low."],
  ]);
  await plans("R5", [
    ["Plan A", "Oval", 2.4, 37.5, 4800000, 9.0, 7.0, false, "Maximises weight; colour may tilt pinker.", "Medium."],
    ["Plan B", "Cushion", 2.1, 32.8, 5200000, 8.2, 6.8, false, "Best chance to hold the orange hue.", "Medium — depth control critical."],
  ]);
  await plans("R6", [
    ["Plan A", "Cushion", 11.5, 35.1, 9800000, 16.0, 13.5, true, "Retain maximum weight with window centred.", "Medium."],
    ["Plan B", "Oval", 10.2, 31.1, 8600000, 17.0, 12.0, false, "Longer shape.", "Low."],
  ]);
  await plans("R13", [
    ["Plan A", "Oval", 5.6, 34.1, 14500000, 12.4, 9.4, true, "Hold colour; shallow pavilion avoided.", "Medium — fissure near table."],
  ]);

  // ───────────────────────────── Finished gems + cutting ─────────────────────────────
  console.log("Cutting jobs and finished gemstones…");
  type GemDef = {
    k: string; from?: string; wt: number; dims: [number, number, number]; shape: Shape; hex: string;
    gemType: string; variety: string; species: string; origin: string; treatment: string; treatmentStatus?: string;
    cut: string; faceting: string; hue: string; tone: string; sat: string; colorDesc: string; clarity: string; transp: string;
    luster: string; fluor: string; incl: string; symmetry: string; polish: string; ask: number; min: number; status: string;
    loc: string; cgi: { origin: string; treat: string; color: string; clarity: string; cut: string; notes?: string } | null;
    buyCost?: number; buySup?: string; buyDate?: string;
  };
  const gemDefs: GemDef[] = [
    { k: "G1", from: "R1", wt: 8.72, dims: [13.4, 10.1, 6.8], shape: "oval", hex: "#1f4fd8", gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum", origin: "Sri Lanka", treatment: "Unheated", treatmentStatus: "Verified", cut: "Mixed", faceting: "Ceylon oval", hue: "vB", tone: "5", sat: "5", colorDesc: "Royal blue, medium-dark tone", clarity: "Eye clean", transp: "Transparent", luster: "Vitreous", fluor: "Inert", incl: "Fine rutile silk", symmetry: "Very good", polish: "Excellent", ask: 5400000, min: 4650000, status: "RESERVED", loc: "VAULT-C", cgi: { origin: "CONFIRMED_TIER_A", treat: "NO_HEAT_CERTIFIED", color: "PRIME", clarity: "EYE_CLEAN", cut: "VERY_GOOD", notes: "Flagship unheated royal blue." } },
    { k: "G2", from: "R1", wt: 2.14, dims: [8.9, 6.9, 4.5], shape: "oval", hex: "#2a5ae0", gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum", origin: "Sri Lanka", treatment: "Unheated", treatmentStatus: "Verified", cut: "Brilliant", faceting: "Modified brilliant", hue: "B", tone: "5", sat: "5", colorDesc: "Cornflower blue", clarity: "Eye clean", transp: "Transparent", luster: "Vitreous", fluor: "Inert", incl: "Minor silk", symmetry: "Good", polish: "Very good", ask: 640000, min: 560000, status: "SOLD", loc: "VAULT-B-T01", cgi: { origin: "CONFIRMED_TIER_A", treat: "NO_HEAT_CERTIFIED", color: "FINE", clarity: "EYE_CLEAN", cut: "GOOD" } },
    { k: "G3", from: "R1", wt: 1.06, dims: [7.9, 5.4, 3.6], shape: "pear", hex: "#2f62e0", gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum", origin: "Sri Lanka", treatment: "Unheated", cut: "Brilliant", faceting: "Pear brilliant", hue: "B", tone: "4", sat: "4", colorDesc: "Cornflower blue accent", clarity: "Slightly included", transp: "Transparent", luster: "Vitreous", fluor: "Inert", incl: "Silk", symmetry: "Good", polish: "Good", ask: 290000, min: 250000, status: "AVAILABLE", loc: "VAULT-B-T01", cgi: { origin: "DECLARED", treat: "NO_HEAT_DECLARED", color: "FINE", clarity: "SLIGHTLY", cut: "GOOD" } },
    { k: "G4", from: "R2", wt: 6.35, dims: [11.4, 9.6, 6.1], shape: "cushion", hex: "#4a74e8", gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum", origin: "Sri Lanka", treatment: "Heated (traditional)", treatmentStatus: "Certified", cut: "Mixed", faceting: "Cushion mixed", hue: "B", tone: "4", sat: "5", colorDesc: "Vivid cornflower blue", clarity: "Slightly included", transp: "Transparent", luster: "Vitreous", fluor: "Inert", incl: "Dissolved silk", symmetry: "Very good", polish: "Very good", ask: 2100000, min: 1850000, status: "AVAILABLE", loc: "VAULT-B-T02", cgi: { origin: "CONFIRMED_TIER_B", treat: "HEAT", color: "FINE", clarity: "SLIGHTLY", cut: "VERY_GOOD" } },
    { k: "G5", from: "R2", wt: 1.9, dims: [7.4, 7.4, 4.6], shape: "round", hex: "#5b82ec", gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum", origin: "Sri Lanka", treatment: "Heated (traditional)", cut: "Brilliant", faceting: "Round brilliant", hue: "B", tone: "4", sat: "4", colorDesc: "Medium blue", clarity: "Eye clean", transp: "Transparent", luster: "Vitreous", fluor: "Inert", incl: "—", symmetry: "Good", polish: "Good", ask: 380000, min: 330000, status: "AVAILABLE", loc: "VAULT-B-T02", cgi: { origin: "DECLARED", treat: "HEAT", color: "COMMERCIAL", clarity: "EYE_CLEAN", cut: "GOOD" } },
    { k: "G6", from: "R6", wt: 11.48, dims: [15.9, 13.2, 8.4], shape: "cushion", hex: "#143fa8", gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum", origin: "Sri Lanka", treatment: "Unheated", treatmentStatus: "Verified", cut: "Mixed", faceting: "Cushion mixed", hue: "vB", tone: "5", sat: "6", colorDesc: "Royal blue, vivid saturation", clarity: "Eye clean", transp: "Transparent", luster: "Vitreous", fluor: "Inert", incl: "Fine silk, tiny crystals", symmetry: "Excellent", polish: "Excellent", ask: 9800000, min: 8700000, status: "AVAILABLE", loc: "VAULT-C", cgi: { origin: "CONFIRMED_TIER_A", treat: "NO_HEAT_CERTIFIED", color: "PRIME", clarity: "EYE_CLEAN", cut: "EXCELLENT", notes: "Collector-grade; museum-quality colour." } },
    { k: "G7", from: "R6", wt: 3.2, dims: [10.0, 8.1, 5.2], shape: "oval", hex: "#1a47b8", gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum", origin: "Sri Lanka", treatment: "Unheated", treatmentStatus: "Verified", cut: "Brilliant", faceting: "Oval brilliant", hue: "B", tone: "5", sat: "5", colorDesc: "Rich royal blue", clarity: "Slightly included", transp: "Transparent", luster: "Vitreous", fluor: "Inert", incl: "Silk", symmetry: "Very good", polish: "Very good", ask: 1400000, min: 1250000, status: "SOLD", loc: "VAULT-B-T01", cgi: { origin: "CONFIRMED_TIER_A", treat: "NO_HEAT_CERTIFIED", color: "FINE", clarity: "SLIGHTLY", cut: "VERY_GOOD" } },
    { k: "G8", from: "R7", wt: 4.9, dims: [12.6, 8.9, 5.8], shape: "pear", hex: "#e0488f", gemType: "Sapphire", variety: "Pink Sapphire", species: "Corundum", origin: "Sri Lanka", treatment: "Heated (traditional)", treatmentStatus: "Certified", cut: "Brilliant", faceting: "Pear brilliant", hue: "pR", tone: "4", sat: "5", colorDesc: "Vivid hot pink", clarity: "Eye clean", transp: "Transparent", luster: "Vitreous", fluor: "Weak red", incl: "Minor silk", symmetry: "Very good", polish: "Excellent", ask: 1350000, min: 1150000, status: "SOLD", loc: "VAULT-B-T02", cgi: { origin: "CONFIRMED_TIER_B", treat: "HEAT", color: "FINE", clarity: "EYE_CLEAN", cut: "VERY_GOOD" } },
    { k: "G9", from: "R8", wt: 6.8, dims: [12.1, 9.8, 6.4], shape: "oval", hex: "#e83a6a", gemType: "Spinel", variety: "Mahenge Spinel", species: "Spinel", origin: "Tanzania", treatment: "Unheated", treatmentStatus: "Verified", cut: "Brilliant", faceting: "Oval brilliant", hue: "pR", tone: "4", sat: "6", colorDesc: "Neon hot pink-red", clarity: "Eye clean", transp: "Transparent", luster: "Vitreous", fluor: "Strong red", incl: "Minor crystals", symmetry: "Excellent", polish: "Excellent", ask: 2300000, min: 2000000, status: "AVAILABLE", loc: "VAULT-C", cgi: { origin: "DECLARED", treat: "NO_HEAT_DECLARED", color: "PRIME", clarity: "EYE_CLEAN", cut: "EXCELLENT" } },
    { k: "G10", from: "R8", wt: 2.4, dims: [8.0, 8.0, 4.9], shape: "round", hex: "#ee5379", gemType: "Spinel", variety: "Mahenge Spinel", species: "Spinel", origin: "Tanzania", treatment: "Unheated", cut: "Brilliant", faceting: "Round brilliant (pre-polish)", hue: "pR", tone: "4", sat: "5", colorDesc: "Hot pink", clarity: "Eye clean", transp: "Transparent", luster: "Vitreous", fluor: "Strong red", incl: "—", symmetry: "Good", polish: "Awaiting final polish", ask: 640000, min: 560000, status: "IN_PROGRESS", loc: "CUTTING", cgi: null },
    { k: "G11", from: "R13", wt: 5.6, dims: [12.4, 9.4, 6.1], shape: "oval", hex: "#f59a76", gemType: "Sapphire", variety: "Padparadscha", species: "Corundum", origin: "Sri Lanka", treatment: "Unheated", treatmentStatus: "Verified", cut: "Mixed", faceting: "Oval mixed", hue: "pO", tone: "3", sat: "5", colorDesc: "Pinkish-orange lotus, even colour", clarity: "Slightly included", transp: "Transparent", luster: "Vitreous", fluor: "Weak orange", incl: "Fine silk, healed fissure", symmetry: "Excellent", polish: "Excellent", ask: 14500000, min: 12800000, status: "AVAILABLE", loc: "VAULT-C", cgi: { origin: "CONFIRMED_TIER_A", treat: "NO_HEAT_CERTIFIED", color: "PRIME", clarity: "SLIGHTLY", cut: "EXCELLENT", notes: "Certified padparadscha, SSEF." } },
    { k: "G12", from: "R13", wt: 1.3, dims: [7.6, 6.0, 3.9], shape: "oval", hex: "#f2a07f", gemType: "Sapphire", variety: "Padparadscha", species: "Corundum", origin: "Sri Lanka", treatment: "Unheated", treatmentStatus: "Verified", cut: "Brilliant", faceting: "Oval brilliant", hue: "pO", tone: "3", sat: "4", colorDesc: "Light pinkish-orange", clarity: "Eye clean", transp: "Transparent", luster: "Vitreous", fluor: "Weak orange", incl: "Minor silk", symmetry: "Good", polish: "Very good", ask: 2600000, min: 2300000, status: "SOLD", loc: "VAULT-B-T01", cgi: { origin: "CONFIRMED_TIER_A", treat: "NO_HEAT_CERTIFIED", color: "FINE", clarity: "EYE_CLEAN", cut: "GOOD" } },
    { k: "G19", from: "R14", wt: 1.95, dims: [8.4, 6.5, 4.4], shape: "oval", hex: "#2f7d5a", gemType: "Chrysoberyl", variety: "Alexandrite", species: "Chrysoberyl", origin: "Tanzania", treatment: "Unheated", treatmentStatus: "Verified", cut: "Mixed", faceting: "Oval mixed", hue: "G", tone: "4", sat: "4", colorDesc: "Bluish-green to purplish-red", clarity: "Eye clean", transp: "Transparent", luster: "Vitreous", fluor: "Weak red", incl: "Minor fingerprints", symmetry: "Very good", polish: "Excellent", ask: 3400000, min: 3000000, status: "SOLD", loc: "VAULT-B-T02", cgi: { origin: "DECLARED", treat: "NO_HEAT_DECLARED", color: "FINE", clarity: "EYE_CLEAN", cut: "VERY_GOOD" } },
    // bought as finished stones
    { k: "G13", wt: 2.05, dims: [8.4, 6.5, 4.2], shape: "oval", hex: "#c4192f", gemType: "Ruby", variety: "Ruby", species: "Corundum", origin: "Mozambique", treatment: "Heated (traditional)", treatmentStatus: "Certified", cut: "Brilliant", faceting: "Oval brilliant", hue: "R", tone: "5", sat: "6", colorDesc: "Vivid red", clarity: "Slightly included", transp: "Transparent", luster: "Vitreous", fluor: "Strong red", incl: "Healed fissures", symmetry: "Very good", polish: "Very good", ask: 1150000, min: 1000000, status: "SOLD", loc: "VAULT-B-T01", cgi: { origin: "CONFIRMED_TIER_A", treat: "HEAT", color: "FINE", clarity: "SLIGHTLY", cut: "VERY_GOOD" }, buyCost: 780000, buySup: "chan", buyDate: "2026-02-18" },
    { k: "G14", wt: 3.2, dims: [10.2, 8.0, 5.6], shape: "emerald", hex: "#1c8a52", gemType: "Emerald", variety: "Colombian Emerald", species: "Beryl", origin: "Colombia", treatment: "Minor oil", treatmentStatus: "Certified", cut: "Step", faceting: "Emerald cut", hue: "G", tone: "4", sat: "5", colorDesc: "Vivid green", clarity: "Moderately included", transp: "Transparent", luster: "Vitreous", fluor: "Inert", incl: "Jardin (three-phase inclusions)", symmetry: "Good", polish: "Good", ask: 2600000, min: 2250000, status: "AVAILABLE", loc: "VAULT-B-T02", cgi: { origin: "CONFIRMED_TIER_A", treat: "FILLED", color: "FINE", clarity: "MODERATELY", cut: "GOOD" }, buyCost: 1750000, buySup: "chan", buyDate: "2026-03-20" },
    { k: "G15", wt: 1.8, dims: [7.2, 6.4, 4.0], shape: "cushion", hex: "#2fa84f", gemType: "Garnet", variety: "Tsavorite", species: "Garnet", origin: "Tanzania", treatment: "Unheated", cut: "Brilliant", faceting: "Cushion brilliant", hue: "G", tone: "4", sat: "5", colorDesc: "Rich forest green", clarity: "Eye clean", transp: "Transparent", luster: "Vitreous", fluor: "Inert", incl: "—", symmetry: "Good", polish: "Very good", ask: 480000, min: 420000, status: "SOLD", loc: "VAULT-B-T02", cgi: { origin: "DECLARED", treat: "NO_HEAT_DECLARED", color: "FINE", clarity: "EYE_CLEAN", cut: "GOOD" }, buyCost: 290000, buySup: "mahe", buyDate: "2026-04-28" },
    { k: "G16", wt: 5.4, dims: [10.9, 9.2, 6.7], shape: "cushion", hex: "#e6b422", gemType: "Sapphire", variety: "Yellow Sapphire", species: "Corundum", origin: "Sri Lanka", treatment: "Unheated", treatmentStatus: "Verified", cut: "Mixed", faceting: "Cushion mixed", hue: "Y", tone: "4", sat: "5", colorDesc: "Golden yellow", clarity: "Eye clean", transp: "Transparent", luster: "Vitreous", fluor: "Inert", incl: "—", symmetry: "Very good", polish: "Excellent", ask: 760000, min: 650000, status: "SOLD", loc: "VAULT-B-T01", cgi: { origin: "DECLARED", treat: "NO_HEAT_DECLARED", color: "FINE", clarity: "EYE_CLEAN", cut: "VERY_GOOD" }, buyCost: 470000, buySup: "beru", buyDate: "2026-03-06" },
    { k: "G17", wt: 2.2, dims: [7.9, 7.9, 4.9], shape: "round", hex: "#d9dde8", gemType: "Sapphire", variety: "White Sapphire", species: "Corundum", origin: "Sri Lanka", treatment: "Unheated", cut: "Brilliant", faceting: "Round brilliant", hue: "—", tone: "1", sat: "1", colorDesc: "Colourless to near-colourless", clarity: "Eye clean", transp: "Transparent", luster: "Vitreous", fluor: "Inert", incl: "—", symmetry: "Good", polish: "Good", ask: 150000, min: 120000, status: "AVAILABLE", loc: "SHOWROOM", cgi: null, buyCost: 72000, buySup: "beru", buyDate: "2026-04-02" },
    { k: "G18", wt: 3.1, dims: [10.0, 8.2, 5.7], shape: "oval", hex: "#b7a63a", gemType: "Chrysoberyl", variety: "Chrysoberyl Cat's Eye", species: "Chrysoberyl", origin: "Sri Lanka", treatment: "Unheated", treatmentStatus: "Certified", cut: "Cabochon", faceting: "Oval cabochon", hue: "yG", tone: "4", sat: "5", colorDesc: "Honey with sharp milk-and-honey eye", clarity: "Translucent", transp: "Translucent", luster: "Vitreous", fluor: "Inert", incl: "Parallel silk", symmetry: "Very good", polish: "Excellent", ask: 2400000, min: 2100000, status: "RESERVED", loc: "VAULT-C", cgi: { origin: "CONFIRMED_TIER_B", treat: "NO_HEAT_CERTIFIED", color: "FINE", clarity: "SLIGHTLY", cut: "EXCELLENT" }, buyCost: 1480000, buySup: "ela", buyDate: "2026-03-05" },
    { k: "G20", wt: 6.2, dims: [11.3, 9.4, 6.5], shape: "oval", hex: "#a3203f", gemType: "Garnet", variety: "Rhodolite", species: "Garnet", origin: "Sri Lanka", treatment: "Unheated", cut: "Brilliant", faceting: "Oval brilliant", hue: "R", tone: "4", sat: "4", colorDesc: "Raspberry", clarity: "Eye clean", transp: "Transparent", luster: "Vitreous", fluor: "Inert", incl: "—", symmetry: "Fair", polish: "Good", ask: 220000, min: 180000, status: "ARCHIVED", loc: "VAULT-B-T02", cgi: null, buyCost: 95000, buySup: "beru", buyDate: "2026-01-22" },
  ];

  type CutDef = { r: string; cutter: string; start: string; end: string | null; due: string; planned: string; actual: string | null; target: number; expYield: number; actYield: number | null; cost: [number, number, number]; status: string; notes: string; outs: string[] };
  const cutDefs: CutDef[] = [
    { r: "R1", cutter: cutter.id, start: "2026-01-18", end: "2026-01-27", due: "2026-01-28", planned: "Oval", actual: "Oval + accents", target: 8.5, expYield: 33.5, actYield: 46.9, cost: [180000, 95000, 40000], status: "COMPLETED", notes: "Cutter salvaged additional accent stones from clean corner material.", outs: ["G1", "G2", "G3"] },
    { r: "R2", cutter: cutter.id, start: "2026-03-18", end: "2026-03-29", due: "2026-03-30", planned: "Cushion", actual: "Cushion + round", target: 6.4, expYield: 34.2, actYield: 44.0, cost: [120000, 60000, 30000], status: "COMPLETED", notes: "Cut after heat treatment in Chanthaburi.", outs: ["G4", "G5"] },
    { r: "R6", cutter: cutter2.id, start: "2026-03-10", end: "2026-04-05", due: "2026-04-08", planned: "Cushion", actual: "Cushion + oval", target: 11.5, expYield: 35.1, actYield: 44.9, cost: [260000, 140000, 60000], status: "COMPLETED", notes: "Exceptional yield. Window centred; table slightly shallow to keep weight.", outs: ["G6", "G7"] },
    { r: "R7", cutter: cutter.id, start: "2026-04-20", end: "2026-05-04", due: "2026-05-06", planned: "Pear", actual: "Pear", target: 4.8, expYield: 32.0, actYield: 33.6, cost: [95000, 45000, 25000], status: "COMPLETED", notes: "Straightforward pear; polish excellent.", outs: ["G8"] },
    { r: "R8", cutter: cutter2.id, start: "2026-05-12", end: "2026-06-10", due: "2026-06-14", planned: "Oval", actual: null, target: 6.8, expYield: 32.0, actYield: null, cost: [130000, 65000, 35000], status: "QUALITY_CHECK", notes: "Main oval finished; round still needs final polish.", outs: ["G9", "G10"] },
    { r: "R13", cutter: cutter.id, start: "2026-06-12", end: "2026-07-01", due: "2026-07-03", planned: "Oval", actual: "Oval + accent", target: 5.6, expYield: 34.1, actYield: 42.1, cost: [250000, 120000, 50000], status: "COMPLETED", notes: "Slow, careful cut under gemologist supervision to hold the colour.", outs: ["G11", "G12"] },
    { r: "R14", cutter: cutter2.id, start: "2026-06-20", end: "2026-07-14", due: "2026-07-15", planned: "Oval", actual: "Oval", target: 2.0, expYield: 27.0, actYield: 26.7, cost: [110000, 55000, 25000], status: "COMPLETED", notes: "Colour change retained after faceting.", outs: ["G19"] },
  ];
  // open job with no output yet, plus pending / rejected examples
  const openJobs: { r: string; cutter: string | null; start: string | null; due: string | null; planned: string; target: number; expYield: number; cost: [number, number, number]; status: string; notes: string }[] = [
    { r: "R4", cutter: cutter.id, start: "2026-09-22", due: "2026-10-18", planned: "Cushion", target: 3.4, expYield: 34.7, cost: [0, 0, 0], status: "IN_PROGRESS", notes: "Pre-forming complete; starting crown facets." },
    { r: "R5", cutter: null, start: null, due: null, planned: "Cushion", target: 2.1, expYield: 32.8, cost: [0, 0, 0], status: "PENDING", notes: "Waiting on gemologist decision between Plan A and B." },
    { r: "R3", cutter: cutter2.id, start: null, due: "2026-10-30", planned: "Cushion", target: 5.4, expYield: 44.0, cost: [0, 0, 0], status: "ASSIGNED", notes: "Assigned to Saman; start after the spinel is polished." },
  ];

  const gem: Record<string, { id: string; code: string; def: GemDef }> = {};
  const jobIds: Record<string, string> = {};
  const mkGem = async (g: GemDef) => {
    const code = await nextCode(codePrefix.gemstone, YEAR);
    const row = await prisma.gemstone.create({
      data: {
        code, locationId: loc[g.loc], gemType: g.gemType, variety: g.variety, species: g.species, origin: g.origin, treatment: g.treatment,
        treatmentStatus: g.treatmentStatus ?? null, weightCt: g.wt, lengthMm: g.dims[0], widthMm: g.dims[1], depthMm: g.dims[2],
        shape: g.shape[0].toUpperCase() + g.shape.slice(1), cut: g.cut, facetingStyle: g.faceting,
        colorHue: g.hue, colorTone: g.tone, colorSaturation: g.sat, colorDescription: g.colorDesc, clarity: g.clarity, transparency: g.transp,
        luster: g.luster, fluorescence: g.fluor, inclusions: g.incl, symmetry: g.symmetry, polish: g.polish,
        askingPrice: g.ask, minimumPrice: g.min, pricePerCt: n(g.ask / g.wt), currency: "LKR", status: g.status,
        cgiEnabled: g.cgi !== null,
        cgiOriginBand: g.cgi?.origin ?? null, cgiTreatmentBand: g.cgi?.treat ?? null, cgiColorBand: g.cgi?.color ?? null,
        cgiClarityBand: g.cgi?.clarity ?? null, cgiCutBand: g.cgi?.cut ?? null, cgiQualityNotes: g.cgi?.notes ?? null,
      },
    });
    gem[g.k] = { id: row.id, code, def: g };
    return row;
  };

  // rough-level bills (transport, insurance …) filed against a rough BEFORE cutting; copied to the gems at cut time.
  const roughBills: Record<string, { type: string; desc: string; amount: number; date: string; expenseCat: string; vendor: string }[]> = {
    R1: [{ type: "TRANSPORT", desc: "Courier — rough from Ratnapura to Colombo vault", amount: 12500, date: "2026-01-13", expenseCat: "SHIPPING", vendor: "Pronto Logistics" }],
    R6: [{ type: "INSURANCE", desc: "Goods-in-transit insurance — Elahera lot", amount: 28000, date: "2026-03-03", expenseCat: "INSURANCE", vendor: "Sri Lanka Insurance" }],
    R13: [
      { type: "TRANSPORT", desc: "Armed courier — padparadscha rough", amount: 18000, date: "2026-05-31", expenseCat: "SHIPPING", vendor: "Pronto Logistics" },
      { type: "OTHER", desc: "Gemological valuation of rough (Dr Perera)", amount: 40000, date: "2026-06-01", expenseCat: "PROFESSIONAL_FEES", vendor: "Dr K. Perera Gemological Services" },
    ],
  };
  const roughBillRows: Record<string, { id: string; type: string; description: string; amount: number; incurredAt: Date }[]> = {};
  let expenseSeq = 0;
  const mkExpense = async (o: { cat: string; amount: number; desc: string; date: string; vendor?: string; related?: [string, string, string]; status?: string; recordedBy?: string; approvedBy?: string | null; notes?: string; currency?: string; fx?: number; stoneBill?: boolean }) => {
    expenseSeq++;
    const status = o.status ?? "APPROVED";
    return prisma.expense.create({
      data: {
        code: await nextCode(codePrefix.expense, YEAR, prisma, { pad: 4 }), category: o.cat, amount: o.amount, currency: o.currency ?? "LKR", fxRateLkr: o.fx ?? null,
        vendor: o.vendor ?? null, description: o.desc, incurredAt: d(o.date),
        relatedEntity: o.related?.[0] ?? null, relatedId: o.related?.[1] ?? null, relatedCode: o.related?.[2] ?? null,
        receiptUrl: null, status, recordedBy: o.recordedBy ?? finance.name,
        approvedBy: status === "APPROVED" || status === "REIMBURSED" ? (o.approvedBy ?? admin.name) : null,
        approvedAt: status === "APPROVED" || status === "REIMBURSED" ? d(o.date) : null, notes: o.notes ?? null,
      },
    });
  };
  for (const [rk, bills] of Object.entries(roughBills)) {
    roughBillRows[rk] = [];
    for (const b of bills) {
      const exp = await mkExpense({ cat: b.expenseCat, amount: b.amount, desc: b.desc, date: b.date, vendor: b.vendor, related: ["RoughStone", rough[rk].id, rough[rk].code], recordedBy: buyer.name });
      const alloc = await prisma.costAllocation.create({ data: { roughStoneId: rough[rk].id, expenseId: exp.id, type: b.type, description: b.desc, amount: b.amount, incurredAt: d(b.date) } });
      roughBillRows[rk].push({ id: alloc.id, type: b.type, description: b.desc, amount: b.amount, incurredAt: d(b.date) });
    }
  }

  const txIds: Record<string, string> = {};
  const addAlloc = (gemId: string, type: string, description: string, amount: number, when: string, extra: object = {}) =>
    prisma.costAllocation.create({ data: { gemstoneId: gemId, type, description, amount: n(amount), incurredAt: d(when), ...extra } });

  for (const c of cutDefs) {
    const jobCode = await nextCode(codePrefix.cuttingJob, YEAR, prisma, { pad: 5 });
    const job = await prisma.cuttingJob.create({
      data: {
        code: jobCode, roughStoneId: rough[c.r].id, cutterId: c.cutter, startedAt: d(c.start), expectedCompletion: d(c.due),
        completedAt: c.end ? d(c.end) : null, plannedCut: c.planned, actualCut: c.actual, targetWeightCt: c.target,
        expectedYieldPct: c.expYield, actualYieldPct: c.actYield, cuttingCost: c.cost[0], laborCost: c.cost[1], machineCost: c.cost[2],
        currency: "LKR", notes: c.notes, status: c.status,
      },
    });
    jobIds[c.r] = job.id;
    const outs: typeof gem[string][] = [];
    for (const gk of c.outs) { await mkGem(gemDefs.find((g) => g.k === gk)!); outs.push(gem[gk]); }
    const outWt = outs.reduce((s, o) => s + o.def.wt, 0);
    const inWt = rough[c.r].wt;
    const jobCost = c.cost[0] + c.cost[1] + c.cost[2];
    const txCode = await nextCode(codePrefix.transformation, YEAR, prisma, { pad: 5 });
    const tx = await prisma.gemstoneTransformation.create({
      data: {
        code: txCode, type: "CUTTING", performedAt: d(c.end ?? c.start), operator: c.cutter === cutter.id ? cutter.name : cutter2.name,
        cost: jobCost, currency: "LKR", cuttingJobId: job.id, notes: c.notes,
        totalInputWeightCt: inWt, totalOutputWeightCt: n(outWt), wasteWeightCt: n(inWt - outWt), yieldPct: n((outWt / inWt) * 100),
        inputs: { create: [{ roughStoneId: rough[c.r].id, inputWeightCt: inWt, inputCost: rough[c.r].price }] },
        outputs: { create: outs.map((o) => ({ gemstoneId: o.id, outputWeightCt: o.def.wt, allocatedCost: n(((rough[c.r].price + jobCost) * o.def.wt) / outWt) })) },
      },
    });
    txIds[c.r] = tx.id;
    for (const o of outs) {
      const frac = o.def.wt / outWt;
      await addAlloc(o.id, "ROUGH_PURCHASE", `Allocated share of ${rough[c.r].code}`, rough[c.r].price * frac, c.start);
      await addAlloc(o.id, "CUTTING", `Allocated share of cutting job ${jobCode}`, jobCost * frac, c.end ?? c.start);
      for (const b of roughBillRows[c.r] ?? []) await addAlloc(o.id, b.type, `${b.description} (share)`, b.amount * frac, c.end ?? c.start, { sourceAllocationId: b.id });
    }
  }
  for (const j of openJobs) {
    const code = await nextCode(codePrefix.cuttingJob, YEAR, prisma, { pad: 5 });
    const row = await prisma.cuttingJob.create({
      data: {
        code, roughStoneId: rough[j.r].id, cutterId: j.cutter, startedAt: j.start ? d(j.start) : null, expectedCompletion: j.due ? d(j.due) : null,
        plannedCut: j.planned, targetWeightCt: j.target, expectedYieldPct: j.expYield, currency: "LKR", status: j.status, notes: j.notes,
      },
    });
    jobIds[j.r] = row.id;
  }
  // a rejected job on the garnet rough, for the status mix
  {
    const code = await nextCode(codePrefix.cuttingJob, YEAR, prisma, { pad: 5 });
    jobIds.R12 = (await prisma.cuttingJob.create({
      data: { code, roughStoneId: rough.R12.id, cutterId: cutter2.id, startedAt: d("2026-07-20"), expectedCompletion: d("2026-08-01"), plannedCut: "Oval", targetWeightCt: 5.0, expectedYieldPct: 42, status: "REJECTED", notes: "Rejected by the gemologist: hidden fracture would cost > 40% of weight. Returned to stock.", currency: "LKR" },
    })).id;
  }

  // finished stones that were purchased already cut
  for (const g of gemDefs.filter((x) => !x.from)) {
    const row = await mkGem(g);
    await addAlloc(row.id, "ROUGH_PURCHASE", `Purchased as finished stone from ${g.buySup}`, g.buyCost!, g.buyDate!);
  }

  // extra gem costs: certification, photography, CGI, packaging
  console.log("Certificates, CGI, media…");
  type CertDef = { g: string; lab: string; no: string | null; type: string; status: string; sub?: string; ret?: string; issue?: string; origin?: string; treat?: string; colour?: string; comments?: string; fee: number; accent: string };
  const certDefs: CertDef[] = [
    { g: "G1", lab: "GRS", no: "GRS2026-041872", type: "ORIGIN", status: "ISSUED", sub: "2026-02-02", ret: "2026-02-07", issue: "2026-02-07", origin: "Sri Lanka (Ceylon)", treat: "No indications of heating", colour: "Royal Blue", comments: "GRS type: 'royal blue'.", fee: 114000, accent: "#7a1f2b" },
    { g: "G2", lab: "GIA", no: "2231987654", type: "IDENTIFICATION", status: "ISSUED", sub: "2026-02-15", ret: "2026-03-01", issue: "2026-03-01", origin: "Sri Lanka", treat: "No indications of heating", colour: "Blue", fee: 27000, accent: "#0b3d91" },
    { g: "G3", lab: "GIC", no: null, type: "IDENTIFICATION", status: "NOT_SUBMITTED", comments: "To be sent with next local batch.", fee: 6500, accent: "#2f6f4e" },
    { g: "G4", lab: "GIC", no: "GIC-26-3340", type: "IDENTIFICATION", status: "ISSUED", sub: "2026-04-02", ret: "2026-04-04", issue: "2026-04-04", origin: "Sri Lanka", treat: "Heated", colour: "Blue", comments: "Indications of heating consistent with traditional treatment.", fee: 9500, accent: "#2f6f4e" },
    { g: "G6", lab: "SSEF", no: "SSEF-123456", type: "ORIGIN", status: "ISSUED", sub: "2026-04-14", ret: "2026-05-05", issue: "2026-05-05", origin: "Sri Lanka (Ceylon)", treat: "No indications of heating", colour: "Royal blue", comments: "Exceptional untreated sapphire.", fee: 210000, accent: "#12345b" },
    { g: "G6", lab: "GRS", no: "GRS2026-052201", type: "QUALITY", status: "UNDER_EXAMINATION", sub: "2026-09-20", comments: "Second opinion for the auction listing.", fee: 120000, accent: "#7a1f2b" },
    { g: "G7", lab: "GRS", no: "GRS2026-047003", type: "ORIGIN", status: "ISSUED", sub: "2026-04-20", ret: "2026-04-27", issue: "2026-04-27", origin: "Sri Lanka (Ceylon)", treat: "No indications of heating", colour: "Blue", fee: 90000, accent: "#7a1f2b" },
    { g: "G8", lab: "GIC", no: "GIC-26-4471", type: "IDENTIFICATION", status: "ISSUED", sub: "2026-05-10", ret: "2026-05-12", issue: "2026-05-12", origin: "Sri Lanka", treat: "Heated", colour: "Pink", fee: 9500, accent: "#2f6f4e" },
    { g: "G9", lab: "GRS", no: null, type: "ORIGIN", status: "SUBMITTED", sub: "2026-09-28", comments: "Awaiting return from GRS.", fee: 105000, accent: "#7a1f2b" },
    { g: "G11", lab: "SSEF", no: "SSEF-130982", type: "ORIGIN", status: "ISSUED", sub: "2026-07-08", ret: "2026-07-31", issue: "2026-07-31", origin: "Sri Lanka (Ceylon)", treat: "No indications of heating", colour: "Padparadscha", comments: "Padparadscha: a delicate mixture of pink and orange.", fee: 240000, accent: "#12345b" },
    { g: "G12", lab: "GRS", no: "GRS2026-049517", type: "IDENTIFICATION", status: "ISSUED", sub: "2026-07-08", ret: "2026-07-15", issue: "2026-07-15", origin: "Sri Lanka", treat: "No indications of heating", colour: "Padparadscha", fee: 75000, accent: "#7a1f2b" },
    { g: "G13", lab: "GIA", no: "2231990211", type: "IDENTIFICATION", status: "ISSUED", sub: "2026-02-25", ret: "2026-03-12", issue: "2026-03-12", origin: "Mozambique", treat: "Heated", colour: "Red", fee: 27000, accent: "#0b3d91" },
    { g: "G14", lab: "GUB", no: "GUB-26-11870", type: "QUALITY", status: "ISSUED", sub: "2026-03-28", ret: "2026-04-15", issue: "2026-04-15", origin: "Colombia", treat: "Minor clarity enhancement (oil)", colour: "Vivid green", fee: 135000, accent: "#5a2d82" },
    { g: "G18", lab: "GIC", no: "GIC-26-3912", type: "IDENTIFICATION", status: "ISSUED", sub: "2026-03-10", ret: "2026-03-12", issue: "2026-03-12", origin: "Sri Lanka", treat: "No indications of heating", colour: "Honey with eye", fee: 9500, accent: "#2f6f4e" },
    { g: "G19", lab: "AGL", no: "AGL-26-5543", type: "ORIGIN", status: "ISSUED", sub: "2026-07-18", ret: "2026-08-08", issue: "2026-08-08", origin: "Tanzania", treat: "No indications of heating", colour: "Alexandrite", fee: 95000, accent: "#8a5a00" },
    { g: "G16", lab: "GIC", no: null, type: "IDENTIFICATION", status: "REJECTED", sub: "2026-04-18", ret: "2026-04-20", comments: "Lab could not confirm — repolishing required before resubmission.", fee: 0, accent: "#2f6f4e" },
  ];
  for (const c of certDefs) {
    const g = gem[c.g];
    const code = await nextCode(codePrefix.certificate, YEAR, prisma, { pad: 5 });
    let imageUrl: string | null = null;
    if (c.status === "ISSUED" && c.no) {
      imageUrl = await imgCert(`${c.no.replace(/[^A-Za-z0-9]/g, "")}.png`, {
        lab: lab[c.lab].name, number: c.no, stone: `${g.def.variety} — ${g.def.shape}`, weight: `${g.def.wt.toFixed(2)} ct`,
        dims: `${g.def.dims[0].toFixed(2)} × ${g.def.dims[1].toFixed(2)} × ${g.def.dims[2].toFixed(2)} mm`, colour: c.colour ?? g.def.colorDesc,
        origin: c.origin ?? g.def.origin, treatment: c.treat ?? g.def.treatment, date: c.issue!, accent: c.accent,
      });
    }
    await prisma.certificate.create({
      data: {
        code, gemstoneId: g.id, laboratoryId: lab[c.lab].id, certificateNumber: c.no, type: c.type, status: c.status,
        submissionDate: c.sub ? d(c.sub) : null, returnDate: c.ret ? d(c.ret) : null, issueDate: c.issue ? d(c.issue) : null,
        originDetermination: c.origin ?? null, treatmentDetermination: c.treat ?? null,
        weightCt: c.status === "ISSUED" ? g.def.wt : null, dimensions: c.status === "ISSUED" ? `${g.def.dims[0].toFixed(2)} × ${g.def.dims[1].toFixed(2)} × ${g.def.dims[2].toFixed(2)} mm` : null,
        colorGrade: c.colour ?? null, comments: c.comments ?? null, laboratoryFees: c.fee || null, currency: "LKR", imageUrl, documentUrl: imageUrl,
      },
    });
    if (c.fee > 0 && c.sub) await addAlloc(g.id, "CERTIFICATION", `Lab fees — ${lab[c.lab].name}`, c.fee, c.sub);
  }

  // CGI projects (3D renders) for the showpiece stones
  const cgiDefs: { g: string; artist: string; sw: string; ver: string; status: string; notes: string; versions: { n: number; notes: string; master?: boolean; by?: string; at?: string }[]; cost: number }[] = [
    { g: "G1", artist: "Studio Malin", sw: "Blender", ver: "4.2 LTS", status: "APPROVED", notes: "Hero shot + 360° turntable for the flagship royal blue.", cost: 120000, versions: [{ n: 1, notes: "Initial pass; too warm." }, { n: 2, notes: "Colour rebalanced." }, { n: 3, notes: "Final; approved as master.", master: true, by: mgmt.name, at: "2026-02-09" }] },
    { g: "G6", artist: "Studio Malin", sw: "KeyShot", ver: "2024", status: "APPROVED", notes: "Auction-quality render of the 11.48 ct cushion.", cost: 150000, versions: [{ n: 1, notes: "Lighting study." }, { n: 2, notes: "Master — approved by owner.", master: true, by: owner.name, at: "2026-05-20" }] },
    { g: "G11", artist: "Pixel Gem Lab", sw: "Blender", ver: "4.2 LTS", status: "INTERNAL_REVIEW", notes: "Padparadscha is hard to render — hue balance under review.", cost: 135000, versions: [{ n: 1, notes: "First pass: too pink." }, { n: 2, notes: "Warmer; awaiting sign-off." }] },
    { g: "G9", artist: "Studio Malin", sw: "Blender", ver: "4.2 LTS", status: "IN_PROGRESS", notes: "Mahenge neon glow study.", cost: 0, versions: [{ n: 1, notes: "Modelled, rendering." }] },
    { g: "G14", artist: "Pixel Gem Lab", sw: "KeyShot", ver: "2024", status: "REQUESTED", notes: "Requested for the Emerald lookbook.", cost: 0, versions: [] },
  ];
  for (const c of cgiDefs) {
    const code = await nextCode(codePrefix.cgi, YEAR, prisma, { pad: 5 });
    const proj = await prisma.cGIProject.create({ data: { code, gemstoneId: gem[c.g].id, artist: c.artist, software: c.sw, softwareVersion: c.ver, status: c.status, notes: c.notes } });
    for (const v of c.versions) {
      const thumb = await imgGem(gem[c.g].code, gem[c.g].def.shape, gem[c.g].def.hex, `-cgi-v${v.n}`);
      await prisma.cGIVersion.create({
        data: { projectId: proj.id, version: v.n, code: `${code}-V${v.n}`, isMaster: !!v.master, approvedAt: v.at ? d(v.at) : null, approvedBy: v.by ?? null, renderUrl: thumb, thumbnailUrl: thumb, notes: v.notes },
      });
    }
    if (c.cost > 0) await addAlloc(gem[c.g].id, "CGI", `CGI project ${code}`, c.cost, "2026-05-15");
  }
  // photography + packaging costs on a handful of stones
  for (const k of ["G1", "G6", "G11", "G9", "G4"]) await addAlloc(gem[k].id, "PHOTOGRAPHY", "Studio photography — Studio Malin", 35000, "2026-06-01");
  for (const k of ["G2", "G7", "G8", "G12", "G19"]) await addAlloc(gem[k].id, "PACKAGING", "Presentation box and sealed insurance pouch", 8500, "2026-06-01");

  // Media: photos at every stage for the key stones
  const asset = (o: object) => prisma.digitalAsset.create({ data: o as any });
  for (const [rk, r] of Object.entries(rough)) {
    const url = await imgRough(r.code, r.hex, "rough");
    await asset({ roughStoneId: r.id, kind: "ROUGH_PHOTO", stage: "ROUGH_INTAKE", url, contentType: "image/png", originalName: `${r.code}.png`, caption: "Rough as received", isPrimary: true, capturedAt: d(roughDefs.find((x) => x.k === rk)!.date), createdBy: buyer.name });
  }
  for (const rk of ["R1", "R6", "R13", "R5", "R4"]) {
    const r = rough[rk];
    await asset({ roughStoneId: r.id, kind: "INSPECTION_PHOTO", stage: "PLANNING", url: await imgRough(r.code, r.hex, "marked"), contentType: "image/png", originalName: `${r.code}-marked.png`, caption: "Marked with the selected cutting plan", capturedAt: d("2026-03-05"), createdBy: gemo.name });
  }
  for (const rk of ["R1", "R6", "R13", "R4"]) {
    const r = rough[rk];
    await asset({ cuttingJobId: jobIds[rk], roughStoneId: r.id, kind: "INSPECTION_PHOTO", stage: "CUTTING", url: await imgRough(r.code, r.hex, "cutting"), contentType: "image/png", originalName: `${r.code}-cutting.png`, caption: "Pre-forming on the wheel", capturedAt: d("2026-04-01"), createdBy: cutter.name });
  }
  for (const g of Object.values(gem)) {
    const url = await imgGem(g.code, g.def.shape, g.def.hex);
    await asset({ gemstoneId: g.id, kind: "FINISHED_PHOTO", stage: "FINAL", url, contentType: "image/png", originalName: `${g.code}.png`, caption: "Finished stone — top view", isPrimary: true, capturedAt: d("2026-06-01"), createdBy: media.name });
    if (["G1", "G6", "G11", "G9", "G4", "G14", "G13", "G19"].includes(g.def.k)) {
      await asset({ gemstoneId: g.id, kind: "MACRO_PHOTO", stage: "INSPECTION", url: await imgGem(g.code, g.def.shape, g.def.hex, "-macro"), contentType: "image/png", originalName: `${g.code}-macro.png`, caption: "Macro — crown detail", capturedAt: d("2026-06-02"), createdBy: media.name });
    }
  }

  // Treatments
  console.log("Treatments…");
  const trt = async (o: { r?: string; g?: string; type: string; status: string; kind: string; name: string; contact?: string; start?: string; end?: string; cost: number; before?: number; after?: number; notes: string }) =>
    prisma.treatment.create({
      data: {
        code: await nextCode(codePrefix.treatment, YEAR, prisma, { pad: 5 }), roughStoneId: o.r ? rough[o.r].id : null, gemstoneId: o.g ? gem[o.g].id : null,
        type: o.type, status: o.status, providerKind: o.kind, providerName: o.name, providerContact: o.contact ?? null,
        startDate: o.start ? d(o.start) : null, endDate: o.end ? d(o.end) : null, cost: o.cost, currency: "LKR",
        weightBeforeCt: o.before ?? null, weightAfterCt: o.after ?? null, notes: o.notes, createdBy: gemo.name,
      },
    });
  await trt({ r: "R2", type: "Heat treatment", status: "COMPLETED", kind: "COMPANY", name: "Chanthaburi Thermal Works", contact: "+66 39 455 120", start: "2026-02-20", end: "2026-03-10", cost: 45000, before: 18.7, after: 18.7, notes: "Traditional heating in air; colour improved from pale to cornflower." });
  await trt({ g: "G14", type: "Oiling (minor)", status: "COMPLETED", kind: "PERSON", name: "Mr. Sunil Gamage", contact: "+94 77 123 8890", start: "2026-03-25", end: "2026-03-27", cost: 6500, notes: "Cedar oil, minor. Disclosed on the certificate." });
  await trt({ r: "R10", type: "Heat treatment", status: "IN_PROGRESS", kind: "COMPANY", name: "Chanthaburi Thermal Works", contact: "+66 39 455 120", start: "2026-09-25", cost: 38000, before: 5.2, notes: "Star stone — heated gently to preserve asterism." });
  await trt({ r: "R3", type: "Heat treatment", status: "PLANNED", kind: "IN_HOUSE", name: "In-house furnace", cost: 9000, before: 12.2, notes: "Planned; decision pending since the stone is already clean unheated." });
  await trt({ g: "G5", type: "Re-polish", status: "COMPLETED", kind: "IN_HOUSE", name: "Cutting department", start: "2026-04-05", end: "2026-04-05", cost: 3500, before: 1.92, after: 1.9, notes: "Removed a girdle chip." });
  await trt({ r: "R12", type: "Heat treatment", status: "CANCELLED", kind: "COMPANY", name: "Chanthaburi Thermal Works", start: "2026-07-22", cost: 0, notes: "Cancelled — fracture found during inspection (see rejected cutting job)." });

  // Totals on gems
  for (const g of Object.values(gem)) {
    const agg = await prisma.costAllocation.aggregate({ where: { gemstoneId: g.id }, _sum: { amount: true } });
    const total = Number(agg._sum.amount ?? 0);
    await prisma.gemstone.update({ where: { id: g.id }, data: { totalCost: n(total), costPerCt: n(total / g.def.wt) } });
    if (g.def.cgi) await recomputeCgiForGemstone(g.id);
  }

  // Price history
  for (const [k, steps] of Object.entries({
    G1: [[null, 4800000, "Initial listing"], [4800000, 5100000, "Market uplift"], [5100000, 5400000, "GRS certificate received"]],
    G6: [[null, 9000000, "Initial listing"], [9000000, 9800000, "SSEF certificate received"]],
    G11: [[null, 13500000, "Initial listing"], [13500000, 14500000, "SSEF padparadscha report"]],
    G4: [[null, 2300000, "Initial listing"], [2300000, 2100000, "Price reduced — slow enquiry"]],
    G9: [[null, 2300000, "Initial listing"]],
  } as Record<string, [number | null, number, string][]>)) {
    let i = 0;
    for (const [oldP, newP, reason] of steps) {
      await prisma.priceHistory.create({ data: { gemstoneId: gem[k].id, oldPrice: oldP, newPrice: newP, currency: "LKR", reason, changedBy: sales.name, changedAt: d(`2026-0${3 + i}-1${i + 2}`) } });
      i++;
    }
  }

  // Movements
  console.log("Inventory movements…");
  for (const [k, from, to, reason, when] of [
    ["R1", "VAULT-A-T01", "CUTTING", "Sent for cutting", "2026-01-18"], ["R1", "CUTTING", "VAULT-A-T01", "Returned after cutting", "2026-01-27"],
    ["R10", "VAULT-A-T02", "OUT-HEAT", "Sent for heat treatment", "2026-09-25"], ["R4", "VAULT-A-T01", "CUTTING", "Cutting started", "2026-09-22"],
    ["R5", "VAULT-A-T01", "QC", "Gemologist inspection", "2026-02-10"],
  ] as [string, string, string, string, string][]) {
    await prisma.inventoryMovement.create({ data: { itemKind: "ROUGH", roughStoneId: rough[k].id, fromLocationId: loc[from], toLocationId: loc[to], movedById: whouse.id, movedByName: whouse.name, reason, movedAt: d(when) } });
  }
  for (const [k, from, to, reason, when] of [
    ["G1", "QC", "VAULT-C", "Moved to premium cabinet", "2026-02-08"], ["G6", "QC", "VAULT-C", "Moved to premium cabinet", "2026-05-06"],
    ["G9", "CUTTING", "QC", "Quality check", "2026-06-11"], ["G11", "QC", "OUT-LAB", "Sent to SSEF", "2026-07-08"], ["G11", "OUT-LAB", "VAULT-C", "Returned from SSEF", "2026-07-31"],
    ["G17", "VAULT-B-T02", "SHOWROOM", "Showroom display", "2026-08-01"],
  ] as [string, string, string, string, string][]) {
    await prisma.inventoryMovement.create({ data: { itemKind: "GEMSTONE", gemstoneId: gem[k].id, fromLocationId: loc[from], toLocationId: loc[to], movedById: whouse.id, movedByName: whouse.name, reason, movedAt: d(when) } });
  }

  // ───────────────────────────── Customers → sales ─────────────────────────────
  console.log("Customers, enquiries, quotations, reservations…");
  const cust: Record<string, { id: string; name: string }> = {};
  const mkCust = async (k: string, o: { kind: string; type: string; name: string; company?: string; country: string; city: string; addr: string; email: string; phone: string; web?: string; social?: string; notes: string; prefs: object }) => {
    const code = await nextCode(codePrefix.customer, YEAR, prisma, { pad: 4 });
    const row = await prisma.customer.create({ data: { code, kind: o.kind, type: o.type, displayName: o.name, companyName: o.company ?? null, country: o.country, city: o.city, addressLine: o.addr, email: o.email, phone: o.phone, website: o.web ?? null, socialProfile: o.social ?? null, notes: o.notes, preferences: JSON.stringify(o.prefs) } });
    cust[k] = { id: row.id, name: o.name };
  };
  await mkCust("chen", { kind: "INDIVIDUAL", type: "COLLECTOR", name: "James Chen", country: "Singapore", city: "Singapore", addr: "18 Cluny Road, #04-02", email: "james.chen@example.com", phone: "+65 8123 4567", social: "https://linkedin.example/in/jameschen", notes: "High-end collector; prefers unheated Ceylon sapphires. Pays promptly.", prefs: { gemTypes: ["Sapphire"], varieties: ["Blue Sapphire", "Padparadscha"], origins: ["Sri Lanka"], colors: ["royal blue", "cornflower"], shapes: ["Oval", "Cushion"], treatments: ["Unheated"], minWeightCt: 3, maxWeightCt: 12, budgetMin: 10000, budgetMax: 40000, currency: "USD", extras: [{ label: "Language", value: "English / Mandarin" }, { label: "Birthday", value: "14 March" }, { label: "Referred by", value: "Dr. Anika Fernando" }] } });
  await mkCust("aurel", { kind: "COMPANY", type: "JEWELLERY_BRAND", name: "Maison Aurel", company: "Maison Aurel SA", country: "France", city: "Paris", addr: "12 Rue de la Paix, 75002", email: "sourcing@maison-aurel.example", phone: "+33 1 42 00 11 22", web: "https://maison-aurel.example", notes: "Boutique house sourcing for a signature bespoke line. Buys matched accents.", prefs: { gemTypes: ["Sapphire", "Spinel"], varieties: [], origins: ["Sri Lanka", "Myanmar"], colors: [], shapes: [], treatments: ["Unheated"], minWeightCt: 2, maxWeightCt: null, budgetMin: null, budgetMax: null, currency: "EUR", extras: [{ label: "Contact person", value: "Camille Laurent, Head of Sourcing" }] } });
  await mkCust("sofia", { kind: "INDIVIDUAL", type: "PRIVATE_BUYER", name: "Sofia Marchetti", country: "Italy", city: "Milan", addr: "Via Montenapoleone 8", email: "sofia.marchetti@example.com", phone: "+39 02 7600 1234", notes: "Commissions custom engagement rings.", prefs: { gemTypes: ["Sapphire"], varieties: ["Blue Sapphire"], origins: ["Sri Lanka"], colors: ["blue"], shapes: ["Oval"], treatments: [], minWeightCt: 2, maxWeightCt: 5, budgetMin: 3000, budgetMax: 9000, currency: "EUR", extras: [] } });
  await mkCust("alnoor", { kind: "COMPANY", type: "DEALER", name: "Al Noor Gems Trading", company: "Al Noor Gems Trading LLC", country: "United Arab Emirates", city: "Dubai", addr: "Gold Souk Extension, Shop 114, Deira", email: "trade@alnoorgems.example", phone: "+971 4 223 9087", web: "https://alnoorgems.example", notes: "Fast-moving dealer. Buys pink and fancy-colour sapphire. Often also a broker partner.", prefs: { gemTypes: ["Sapphire", "Spinel"], varieties: ["Pink Sapphire"], origins: [], colors: ["pink", "orange"], shapes: [], treatments: [], minWeightCt: 2, maxWeightCt: null, budgetMin: 2000, budgetMax: 15000, currency: "USD", extras: [] } });
  await mkCust("kenji", { kind: "COMPANY", type: "RETAILER", name: "Tokyo Jewel Atelier", company: "Atelier Watanabe K.K.", country: "Japan", city: "Tokyo", addr: "5-2-1 Ginza, Chuo-ku", email: "kenji@tokyojewel.example", phone: "+81 3 5550 1234", web: "https://tokyojewel.example", notes: "Prefers untreated stones with lab reports. Requires Japanese invoice wording.", prefs: { gemTypes: ["Sapphire", "Spinel"], varieties: [], origins: ["Sri Lanka"], colors: [], shapes: ["Round", "Oval"], treatments: ["Unheated"], minWeightCt: 1, maxWeightCt: 6, budgetMin: 1000, budgetMax: 12000, currency: "USD", extras: [{ label: "Language", value: "Japanese / English" }] } });
  await mkCust("rohan", { kind: "INDIVIDUAL", type: "PRIVATE_BUYER", name: "Rohan Perera", country: "Sri Lanka", city: "Colombo", addr: "27/B Flower Road, Colombo 07", email: "rohan.perera@example.lk", phone: "+94 77 765 4321", notes: "Local buyer; pays in LKR by instalments.", prefs: { gemTypes: ["Sapphire"], varieties: ["Padparadscha", "Pink Sapphire"], origins: ["Sri Lanka"], colors: [], shapes: [], treatments: [], minWeightCt: null, maxWeightCt: null, budgetMin: 1000000, budgetMax: 3000000, currency: "LKR", extras: [] } });
  await mkCust("emily", { kind: "INDIVIDUAL", type: "COLLECTOR", name: "Emily Carter", country: "United Kingdom", city: "London", addr: "44 Pont Street, SW1X 0BX", email: "emily.carter@example.co.uk", phone: "+44 20 7946 0123", notes: "Colour-change specialist collector.", prefs: { gemTypes: ["Chrysoberyl", "Sapphire"], varieties: ["Alexandrite", "Padparadscha"], origins: [], colors: [], shapes: [], treatments: ["Unheated"], minWeightCt: 1, maxWeightCt: null, budgetMin: 2000, budgetMax: 25000, currency: "GBP", extras: [] } });
  await mkCust("hkw", { kind: "COMPANY", type: "WHOLESALER", name: "Hong Kong Gem Wholesale", company: "HKGW Trading Ltd", country: "Hong Kong", city: "Hong Kong", addr: "Room 1204, Tsim Sha Tsui Centre", email: "wong@hkgw.example", phone: "+852 2368 4411", notes: "Buys parcels and larger stones; negotiates hard. Contact: Wong Ka-Ming.", prefs: { gemTypes: ["Sapphire", "Ruby"], varieties: [], origins: [], colors: [], shapes: [], treatments: ["Heated (traditional)"], minWeightCt: 3, maxWeightCt: null, budgetMin: 3000, budgetMax: 30000, currency: "USD", extras: [] } });
  await mkCust("anika", { kind: "INDIVIDUAL", type: "INTERNATIONAL_BUYER", name: "Dr. Anika Fernando", country: "Australia", city: "Sydney", addr: "9 Harbour View Crescent, Lavender Bay", email: "anika.fernando@example.com.au", phone: "+61 2 9955 0102", notes: "Sri Lankan-born collector in Sydney. Loves cat's-eye and star stones.", prefs: { gemTypes: ["Chrysoberyl", "Sapphire"], varieties: ["Chrysoberyl Cat's Eye", "Star Sapphire"], origins: ["Sri Lanka"], colors: [], shapes: ["Cabochon"], treatments: ["Unheated"], minWeightCt: 2, maxWeightCt: 10, budgetMin: 5000, budgetMax: 15000, currency: "AUD", extras: [] } });

  const quotes: Record<string, { id: string }> = {};
  const mkQuote = async (key: string, o: { c: string; g: string; enq?: string; price: number; cur: string; valid: string; status: string; sent?: string; resp?: string; notes?: string }) => {
    const q = await prisma.quotation.create({
      data: {
        code: await nextCode(codePrefix.quotation, YEAR, prisma, { pad: 4 }), customerId: cust[o.c].id, gemstoneId: gem[o.g].id, enquiryId: o.enq ?? null,
        price: o.price, currency: o.cur, validUntil: d(o.valid), paymentTerms: "50% on order, 50% before shipping", deliveryTerms: "Insured courier, 5–7 business days",
        shippingTerms: "DAP customer address", notes: o.notes ?? null, status: o.status, sentAt: o.sent ? d(o.sent) : null, respondedAt: o.resp ? d(o.resp) : null, salespersonId: sales.id,
      },
    });
    quotes[key] = { id: q.id };
    return q;
  };
  const enqs: Record<string, string> = {};
  const mkEnq = async (key: string, o: { c: string; g?: string; req: string; origin?: string; treat?: string; shape?: string; min?: number; max?: number; bmin?: number; bmax?: number; cur: string; qty?: number; follow?: string; status: string; notes?: string; created: string }) => {
    const e = await prisma.enquiry.create({
      data: {
        code: await nextCode(codePrefix.enquiry, YEAR, prisma, { pad: 4 }), customerId: cust[o.c].id, gemstoneId: o.g ? gem[o.g].id : null, requirement: o.req,
        preferredOrigin: o.origin ?? null, preferredTreatment: o.treat ?? null, preferredShape: o.shape ?? null, minWeightCt: o.min ?? null, maxWeightCt: o.max ?? null,
        budgetMin: o.bmin ?? null, budgetMax: o.bmax ?? null, currency: o.cur, quantity: o.qty ?? 1, salespersonId: sales.id, followUpDate: o.follow ? d(o.follow) : null,
        status: o.status, notes: o.notes ?? null, createdAt: d(o.created),
      },
    });
    enqs[key] = e.id;
  };
  await mkEnq("e1", { c: "chen", g: "G1", req: "Looking for a 6ct+ unheated royal blue Ceylon sapphire, oval or cushion, budget up to $22k.", origin: "Sri Lanka", treat: "Unheated", shape: "Oval", min: 6, max: 12, bmin: 18000, bmax: 22000, cur: "USD", follow: "2026-02-16", status: "WON", notes: "Reserved with 30% deposit.", created: "2026-02-05" });
  await mkEnq("e2", { c: "aurel", req: "Matched pair of spinels, 2–3 ct each, vivid pink or red, for a necklace commission.", origin: "Tanzania", treat: "Unheated", shape: "Round", min: 2, max: 3, bmin: 6000, bmax: 12000, cur: "EUR", qty: 2, follow: "2026-10-16", status: "NEGOTIATING", notes: "G9 (6.8 ct) too large; waiting on the round G10 to finish polishing.", created: "2026-09-12" });
  await mkEnq("e3", { c: "kenji", req: "Three round blue sapphires, ~1 ct each, unheated, with lab reports.", treat: "Unheated", shape: "Round", min: 0.9, max: 1.2, bmin: 1500, bmax: 4000, cur: "USD", qty: 3, follow: "2026-10-12", status: "NEW", created: "2026-10-05" });
  await mkEnq("e4", { c: "anika", g: "G18", req: "Interested in the cat's-eye chrysoberyl; wants a video of the eye.", origin: "Sri Lanka", treat: "Unheated", min: 2, max: 5, bmin: 6000, bmax: 9000, cur: "AUD", follow: "2026-10-11", status: "RESERVED", notes: "Reserved until 14 October pending wire.", created: "2026-09-28" });
  await mkEnq("e5", { c: "emily", g: "G11", req: "Padparadscha, ideally certified, under £35,000.", origin: "Sri Lanka", treat: "Unheated", min: 2, bmax: 35000, cur: "GBP", status: "LOST", notes: "Went with another dealer; price was above her budget.", created: "2026-08-04" });
  await mkEnq("e6", { c: "hkw", g: "G4", req: "6 ct+ blue sapphire, heated is fine, for a wholesale order.", min: 6, bmin: 5000, bmax: 7500, cur: "USD", follow: "2026-06-20", status: "LOST", notes: "Order cancelled after the deposit; refunded.", created: "2026-05-25" });
  await mkEnq("e7", { c: "sofia", g: "G7", req: "Blue sapphire ~3 ct for an engagement ring; must be unheated.", origin: "Sri Lanka", treat: "Unheated", shape: "Oval", min: 3, max: 4, bmin: 3000, bmax: 4500, cur: "EUR", status: "WON", created: "2026-04-22" });
  await mkEnq("e8", { c: "alnoor", g: "G8", req: "Hot pink sapphire pear, 4–5 ct.", min: 4, max: 5, bmin: 3500, bmax: 5000, cur: "USD", status: "WON", created: "2026-08-20" });
  await mkEnq("e9", { c: "rohan", g: "G12", req: "Small padparadscha for a pendant — budget 2.5M LKR.", bmax: 2500000, cur: "LKR", status: "WON", created: "2026-06-18" });
  await mkEnq("e10", { c: "chen", req: "Interested in the 11 ct royal blue (G6) for investment; send certificates.", min: 10, bmin: 30000, bmax: 40000, cur: "USD", follow: "2026-10-14", status: "QUOTED", created: "2026-09-30" });

  await mkQuote("q1", { c: "chen", g: "G1", enq: enqs.e1, price: 18000, cur: "USD", valid: "2026-03-14", status: "ACCEPTED", sent: "2026-02-14", resp: "2026-02-16", notes: "Offer includes GRS origin certificate." });
  await mkQuote("q2", { c: "aurel", g: "G2", price: 2100, cur: "USD", valid: "2026-03-31", status: "ACCEPTED", sent: "2026-03-05", resp: "2026-03-10" });
  await mkQuote("q3", { c: "sofia", g: "G7", enq: enqs.e7, price: 4100, cur: "EUR", valid: "2026-05-31", status: "ACCEPTED", sent: "2026-04-28", resp: "2026-05-06" });
  await mkQuote("q4", { c: "hkw", g: "G4", enq: enqs.e6, price: 6900, cur: "USD", valid: "2026-06-30", status: "ACCEPTED", sent: "2026-05-28", resp: "2026-06-01" });
  await mkQuote("q5", { c: "rohan", g: "G12", enq: enqs.e9, price: 2450000, cur: "LKR", valid: "2026-07-15", status: "ACCEPTED", sent: "2026-06-25", resp: "2026-07-01" });
  await mkQuote("q6", { c: "alnoor", g: "G8", enq: enqs.e8, price: 4300, cur: "USD", valid: "2026-09-30", status: "ACCEPTED", sent: "2026-09-03", resp: "2026-09-09" });
  await mkQuote("q7", { c: "emily", g: "G19", price: 7800, cur: "GBP", valid: "2026-09-30", status: "ACCEPTED", sent: "2026-09-12", resp: "2026-09-17" });
  await mkQuote("q8", { c: "emily", g: "G11", enq: enqs.e5, price: 49000, cur: "USD", valid: "2026-08-31", status: "EXPIRED", sent: "2026-08-06", notes: "Customer did not respond before expiry." });
  await mkQuote("q9", { c: "chen", g: "G6", enq: enqs.e10, price: 32500, cur: "USD", valid: "2026-11-15", status: "SENT", sent: "2026-10-02", notes: "Includes SSEF origin + GRS quality reports." });
  await mkQuote("q10", { c: "aurel", g: "G9", price: 7800, cur: "EUR", valid: "2026-11-01", status: "DRAFT", notes: "Draft — waiting for the round spinel to be finished so we can quote both." });
  await mkQuote("q11", { c: "anika", g: "G13", price: 3900, cur: "AUD", valid: "2026-07-31", status: "DECLINED", sent: "2026-07-05", resp: "2026-07-10", notes: "Customer wanted unheated stones only." });
  await mkQuote("q13", { c: "kenji", g: "G13", price: 3900, cur: "USD", valid: "2026-10-31", status: "ACCEPTED", sent: "2026-09-29", resp: "2026-10-02", notes: "Heated ruby with GIA report." });
  await mkQuote("q14", { c: "sofia", g: "G15", price: 1650, cur: "EUR", valid: "2026-08-31", status: "ACCEPTED", sent: "2026-08-10", resp: "2026-08-12" });
  await mkQuote("q15", { c: "rohan", g: "G16", price: 720000, cur: "LKR", valid: "2026-06-30", status: "ACCEPTED", sent: "2026-06-18", resp: "2026-06-22" });
  await mkQuote("q12", { c: "anika", g: "G18", enq: enqs.e4, price: 8100, cur: "AUD", valid: "2026-10-14", status: "ACCEPTED", sent: "2026-09-29", resp: "2026-10-01" });

  const reservations: Record<string, string> = {};
  const mkRes = async (key: string, o: { c: string; g: string; q?: string; price: number; dep?: number; cur: string; at: string; exp?: string; status: string; rel?: string; relWhy?: string; notes?: string }) => {
    const r = await prisma.reservation.create({
      data: {
        code: await nextCode(codePrefix.reservation, YEAR, prisma, { pad: 4 }), customerId: cust[o.c].id, gemstoneId: gem[o.g].id, quotationId: o.q ? quotes[o.q].id : null,
        price: o.price, deposit: o.dep ?? null, currency: o.cur, reservedAt: d(o.at), expiresAt: o.exp ? d(o.exp) : null, releasedAt: o.rel ? d(o.rel) : null, releasedReason: o.relWhy ?? null,
        salespersonId: sales.id, status: o.status, notes: o.notes ?? null,
      },
    });
    reservations[key] = r.id;
  };
  await mkRes("r1", { c: "chen", g: "G1", q: "q1", price: 18000, dep: 5400, cur: "USD", at: "2026-02-16", exp: "2026-10-31", status: "ACTIVE", notes: "Deposit received via bank transfer. Extended twice at the customer's request." });
  await mkRes("r2", { c: "anika", g: "G18", q: "q12", price: 8100, dep: 2430, cur: "AUD", at: "2026-10-01", exp: "2026-10-14", status: "ACTIVE", notes: "Expires in 5 days — chase the balance wire." });
  await mkRes("r3", { c: "hkw", g: "G4", q: "q4", price: 6900, dep: 1000, cur: "USD", at: "2026-06-01", exp: "2026-06-30", status: "RELEASED", rel: "2026-06-20", relWhy: "Customer withdrew; deposit refunded in full.", notes: "Deposit USD 1,000 refunded 22 June." });
  await mkRes("r4", { c: "emily", g: "G11", price: 49000, dep: 4900, cur: "USD", at: "2026-08-06", exp: "2026-08-20", status: "EXPIRED", rel: "2026-08-21", relWhy: "Expired without payment; stone returned to stock.", notes: "10% holding deposit returned." });
  await mkRes("r5", { c: "aurel", g: "G2", q: "q2", price: 2100, dep: 1050, cur: "USD", at: "2026-03-10", exp: "2026-03-25", status: "CONVERTED" });
  await mkRes("r6", { c: "sofia", g: "G7", q: "q3", price: 3400, dep: 1020, cur: "EUR", at: "2026-05-06", exp: "2026-05-20", status: "CONVERTED" });
  await mkRes("r7", { c: "alnoor", g: "G8", q: "q6", price: 4300, dep: 1290, cur: "USD", at: "2026-09-09", exp: "2026-09-23", status: "CONVERTED" });

  console.log("Sales orders, payments, shipments…");
  type SaleDef = { key: string; c: string; g: string; q: string; res?: string; price: number; cur: string; fx: number | null; tax?: number; date: string; status: string; notes: string };
  const saleDefs: SaleDef[] = [
    { key: "s7", c: "kenji", g: "G13", q: "q13", price: 3900, cur: "USD", fx: USD, date: "2026-10-03", status: "SHIPPED", notes: "Courier insured to Tokyo; customs invoice in English and Japanese." },
    { key: "s8", c: "sofia", g: "G15", q: "q14", price: 1650, cur: "EUR", fx: EUR, date: "2026-08-14", status: "DELIVERED", notes: "Tsavorite for a pendant." },
    { key: "s9", c: "rohan", g: "G16", q: "q15", price: 720000, cur: "LKR", fx: null, date: "2026-06-24", status: "PAID", notes: "Hand-delivered at the showroom." },
    { key: "s1", c: "aurel", g: "G2", q: "q2", res: "r5", price: 2100, cur: "USD", fx: USD, date: "2026-03-12", status: "DELIVERED", notes: "Included in the Paris batch with the matching accent." },
    { key: "s2", c: "sofia", g: "G7", q: "q3", res: "r6", price: 4100, cur: "EUR", fx: EUR, date: "2026-05-08", status: "DELIVERED", notes: "Delivered to the Milan setter; ring due in July." },
    { key: "s3", c: "hkw", g: "G4", q: "q4", price: 6900, cur: "USD", fx: USD, date: "2026-06-02", status: "CANCELLED", notes: "Cancelled 20 June — buyer withdrew. Deposit refunded." },
    { key: "s4", c: "rohan", g: "G12", q: "q5", price: 2450000, cur: "LKR", fx: null, date: "2026-07-02", status: "PARTIAL", notes: "Balance LKR 450,000 due by 30 October." },
    { key: "s5", c: "alnoor", g: "G8", q: "q6", res: "r7", price: 4300, cur: "USD", fx: USD, date: "2026-09-10", status: "SHIPPED", notes: "Hand-carry by the buyer's courier; vault-to-vault." },
    { key: "s6", c: "emily", g: "G19", q: "q7", price: 7800, cur: "GBP", fx: GBP, date: "2026-09-18", status: "PARTIAL", notes: "Ship once the balance clears." },
  ];
  const sale: Record<string, { id: string; code: string; def: SaleDef }> = {};
  for (const s of saleDefs) {
    const code = await nextCode(codePrefix.salesOrder, YEAR, prisma, { pad: 4 });
    const row = await prisma.salesOrder.create({
      data: {
        code, invoiceNumber: `INV-${YEAR}-${code.split("-").pop()}`, customerId: cust[s.c].id, gemstoneId: gem[s.g].id, quotationId: quotes[s.q].id,
        reservationId: s.res ? reservations[s.res] : null, agreedPrice: s.price, currency: s.cur, fxRateLkr: s.fx, taxAmount: s.tax ?? 0, totalAmount: s.price + (s.tax ?? 0),
        saleDate: d(s.date), salespersonId: sales.id, notes: s.notes, status: s.status,
      },
    });
    sale[s.key] = { id: row.id, code, def: s };
  }
  const pay = async (sk: string, amt: number, when: string, method: string, ref: string, notes: string, cur?: string) => {
    const s = sale[sk];
    const c = cur ?? s.def.cur;
    await prisma.payment.create({
      data: {
        code: await nextCode(codePrefix.payment, YEAR, prisma, { pad: 4 }), salesOrderId: s.id, customerId: cust[s.def.c].id, amount: amt, currency: c,
        fxRateLkr: c === "LKR" ? null : s.def.fx, orderCurrencyAmount: amt, method, reference: ref, receivedAt: d(when), notes, recordedBy: finance.name,
      },
    });
  };
  await pay("s1", 1050, "2026-03-13", "BANK_TRANSFER", "SWIFT AUREL-0021", "50% deposit.");
  await pay("s1", 1050, "2026-03-28", "BANK_TRANSFER", "SWIFT AUREL-0034", "Balance before shipping.");
  await pay("s2", 1230, "2026-05-08", "CARD", "STRIPE ch_3PxAmple", "30% deposit by card.");
  await pay("s2", 2870, "2026-05-20", "BANK_TRANSFER", "SEPA MARCH-7718", "Balance.");
  await pay("s3", 1000, "2026-06-02", "BANK_TRANSFER", "SWIFT HKGW-5521", "Deposit.");
  await pay("s3", -1000, "2026-06-22", "BANK_TRANSFER", "REFUND HKGW-5521", "Full refund — order cancelled.");
  await pay("s4", 1200000, "2026-07-02", "BANK_TRANSFER", "RTGS 0702-4471", "50% deposit.");
  await pay("s4", 800000, "2026-07-20", "CHEQUE", "CHQ 004417 Sampath", "Cheque cleared 24 July.");
  await pay("s7", 3900, "2026-10-06", "BANK_TRANSFER", "SWIFT TJA-1006", "Paid in full.");
  await pay("s8", 1650, "2026-08-15", "CARD", "STRIPE ch_3QyAmple", "Paid by card.");
  await pay("s9", 720000, "2026-06-24", "CARD", "POS 5521-0624", "Paid by card at the showroom.");
  await pay("s5", 4300, "2026-09-12", "BANK_TRANSFER", "SWIFT ALNOOR-9981", "Paid in full.");
  await pay("s6", 2500, "2026-09-18", "BANK_TRANSFER", "FPS CARTER-0918", "Deposit.");

  const ship = async (sk: string, o: { courier: string; track: string; dest: string; country: string; ship: number; ins: number; value: number; prepared: string; packed?: string; shipped?: string; delivered?: string; status: string; notes: string }) => {
    const s = sale[sk];
    await prisma.shipment.create({
      data: {
        code: await nextCode(codePrefix.shipment, YEAR, prisma, { pad: 4 }), salesOrderId: s.id, courier: o.courier, trackingNumber: o.track, destination: o.dest, destCountry: o.country,
        shippingCost: o.ship, insuranceCost: o.ins, declaredValue: o.value, currency: s.def.cur, preparedAt: d(o.prepared), packedAt: o.packed ? d(o.packed) : null,
        shippedAt: o.shipped ? d(o.shipped) : null, deliveredAt: o.delivered ? d(o.delivered) : null, status: o.status, notes: o.notes,
      },
    });
  };
  await ship("s1", { courier: "MALCA", track: "MA-2026-AUR-0021", dest: "Paris", country: "France", ship: 220, ins: 65, value: 2100, prepared: "2026-03-29", packed: "2026-03-30", shipped: "2026-03-31", delivered: "2026-04-04", status: "DELIVERED", notes: "Sealed vault-to-vault export. Customs cleared at CDG." });
  await ship("s2", { courier: "FEDEX", track: "7794 5521 8830", dest: "Milan", country: "Italy", ship: 180, ins: 52, value: 3400, prepared: "2026-05-21", packed: "2026-05-21", shipped: "2026-05-22", delivered: "2026-05-26", status: "DELIVERED", notes: "Signature required." });
  await ship("s7", { courier: "DHL", track: "JD0146 0000 7711", dest: "Tokyo", country: "Japan", ship: 190, ins: 58, value: 3900, prepared: "2026-10-06", packed: "2026-10-07", shipped: "2026-10-07", status: "IN_TRANSIT", notes: "Customs invoice in English and Japanese." });
  await ship("s8", { courier: "FEDEX", track: "7794 5521 9012", dest: "Milan", country: "Italy", ship: 160, ins: 40, value: 1650, prepared: "2026-08-15", packed: "2026-08-15", shipped: "2026-08-16", delivered: "2026-08-20", status: "DELIVERED", notes: "Signature required." });
  await ship("s5", { courier: "BRINKS", track: "BR-DXB-889120", dest: "Dubai", country: "United Arab Emirates", ship: 140, ins: 48, value: 4300, prepared: "2026-09-13", packed: "2026-09-14", shipped: "2026-09-15", status: "IN_TRANSIT", notes: "Estimated delivery 17 Oct." });
  await ship("s6", { courier: "DHL", track: "JD0146 0000 9987", dest: "London", country: "United Kingdom", ship: 160, ins: 60, value: 2950, prepared: "2026-10-05", status: "PREPARING", notes: "Packing list drafted; waiting for the balance payment." });

  // ───────────────────────────── Collections & share links ─────────────────────────────
  console.log("Collections & share links…");
  const mkCol = async (name: string, intro: string, c: string | null, items: [string, number | null, string | null][], o: { exp?: string; password?: string; archived?: boolean; views?: number } = {}) => {
    const col = await prisma.collection.create({
      data: {
        code: await nextCode(codePrefix.collection, YEAR, prisma, { pad: 4 }), shareCode: generateShareCode(), name, intro, customerId: c ? cust[c].id : null,
        createdById: sales.id, createdByName: sales.name, expiresAt: o.exp ? d(o.exp) : null, passwordHash: o.password ? await bcrypt.hash(o.password, 10) : null,
        isArchived: o.archived ?? false, viewCount: o.views ?? 0, lastViewedAt: o.views ? d("2026-10-06") : null,
      },
    });
    let order = 0;
    for (const [gk, override, note] of items) {
      await prisma.collectionItem.create({ data: { collectionId: col.id, gemstoneId: gem[gk].id, displayOrder: order++, priceOverride: override, currency: override ? "USD" : null, note } });
    }
    return col;
  };
  const colBlue = await mkCol("Ceylon Blues — Autumn Selection", "Six hand-picked Ceylon blue sapphires, from entry cornflower to collector-grade royal blue.", "chen", [["G6", 32500, "Our finest — SSEF origin report included."], ["G4", null, "Heated, beautifully clean."], ["G3", null, null], ["G5", null, null]], { exp: "2026-12-31", views: 14 });
  await mkCol("Spinel & Padparadscha Capsule", "A short list of rare coloured stones for the Paris bespoke line.", "aurel", [["G9", 7800, "Neon Mahenge — certificate pending."], ["G11", 48000, "SSEF padparadscha."], ["G13", null, null]], { exp: "2026-11-30", password: "gems2026", views: 5 });
  await mkCol("Showroom Highlights", "A rotating public selection of current stock.", null, [["G14", null, null], ["G15", null, null], ["G16", null, null], ["G17", null, null], ["G18", null, "Cat's eye with a sharp, milky eye."]], { views: 41 });
  await mkCol("Spring Catalogue (archived)", "Last season's selection.", null, [["G2", null, null], ["G7", null, null]], { archived: true, views: 88 });

  const mkLink = async (o: { scope: string; payload?: object; days: number; msg?: string; broker?: boolean; hideCgi?: boolean; revoked?: boolean; views?: number; created?: string }) => {
    const created = o.created ? d(o.created) : d("2026-10-01");
    const expiresAt = new Date(created.getTime() + o.days * 86400000);
    return prisma.shareLink.create({
      data: {
        code: generateShareCode(10), scope: o.scope, payload: o.payload ? JSON.stringify(o.payload) : null, expiresAt, message: o.msg ?? null,
        createdById: sales.id, createdByName: sales.name, createdByPhone: "+94 77 123 4567", createdByEmail: sales.email, createdByPhotoUrl: null,
        hideCgi: o.hideCgi ?? false, brokerMode: o.broker ?? false, brokerName: o.broker ? "Hassan Al Mansoori" : null, brokerCompany: o.broker ? "Al Noor Gems Trading LLC" : null,
        brokerPhone: o.broker ? "+971 50 123 4567" : null, brokerEmail: o.broker ? "hassan@alnoorgems.example" : null,
        viewCount: o.views ?? 0, firstViewedAt: o.views ? created : null, lastViewedAt: o.views ? d("2026-10-07") : null, revokedAt: o.revoked ? d("2026-10-03") : null, createdAt: created,
      },
    });
  };
  await mkLink({ scope: "CATALOGUE", days: 14, msg: "Our current stock — happy to arrange video calls for any stone.", views: 23 });
  await mkLink({ scope: "GEMSTONE", payload: { gemstoneCode: gem.G6.code }, days: 7, msg: "The 11.48 ct royal blue we discussed.", views: 6, created: "2026-10-03" });
  await mkLink({ scope: "GEMSTONES", payload: { gemstoneCodes: [gem.G9.code, gem.G10.code, gem.G13.code] }, days: 10, msg: "Spinel and ruby shortlist.", hideCgi: true, views: 2, created: "2026-10-05" });
  await mkLink({ scope: "COLLECTION", payload: { collectionShareCode: colBlue.shareCode }, days: 30, msg: "Your Autumn selection, James.", views: 9, created: "2026-09-25" });
  await mkLink({ scope: "GEMSTONE", payload: { gemstoneCode: gem.G11.code }, days: 21, msg: "Broker share for a Dubai client.", broker: true, views: 4, created: "2026-09-20" });
  await mkLink({ scope: "CATALOGUE", days: 7, msg: "Expired example link.", views: 12, created: "2026-08-01" });
  await mkLink({ scope: "GEMSTONE", payload: { gemstoneCode: gem.G14.code }, days: 14, msg: "Revoked example link.", revoked: true, views: 1, created: "2026-09-29" });

  // ───────────────────────────── Operating expenses ─────────────────────────────
  console.log("Operating expenses…");
  const opex: { cat: string; amt: number; desc: string; date: string; vendor?: string; status?: string; cur?: string; fx?: number; notes?: string; acct?: string; by?: string }[] = [];
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  const monthName = ["January", "February", "March", "April", "May", "June", "July", "August", "September"];
  months.forEach((m, i) => {
    opex.push({ cat: "RENT", amt: 450000, desc: `Colombo office & vault rent — ${monthName[i]}`, date: `${m}-05`, vendor: "Cinnamon Gardens Properties" });
    opex.push({ cat: "SALARIES", amt: 1100000, desc: `Payroll — ${monthName[i]} (11 staff)`, date: `${m}-28`, vendor: undefined });
    opex.push({ cat: "UTILITIES", amt: 96000 + (i % 3) * 8000, desc: `Electricity, water and internet — ${monthName[i]}`, date: `${m}-15`, vendor: i % 2 ? "CEB / Dialog" : "LECO / SLT" });
  });
  opex.push(
    { cat: "SOFTWARE", amt: 59700, desc: "Cloud storage annual — CGI files and photos", date: "2026-01-22", vendor: "Cloudflare" },
    { cat: "PROFESSIONAL_FEES", amt: 375000, desc: "Q4 2025 accountancy review & audit prep", date: "2026-01-28", vendor: "Wickramaratne & Co." },
    { cat: "INSURANCE", amt: 246000, desc: "Vault + goods-in-transit insurance — annual premium", date: "2026-02-01", vendor: "Sri Lanka Insurance" },
    { cat: "MARKETING", amt: 450000, desc: "Instagram + LinkedIn ad boost — spring campaign", date: "2026-02-10", vendor: "Meta Ads" },
    { cat: "TRAVEL", amt: 294000, desc: "Buyer's trip — Ratnapura gem show", date: "2026-01-24", vendor: "SriLankan Airlines & hotels" },
    { cat: "EQUIPMENT", amt: 1020000, desc: "Additional loupes + polariscope + refractometer", date: "2026-02-07", vendor: "Wilhelmus Optics" },
    { cat: "BANK_FEES", amt: 54000, desc: "SWIFT wire fees — Q1", date: "2026-03-31", vendor: "Sampath Bank" },
    { cat: "TAX", amt: 540000, desc: "Quarterly VAT prepayment — Q1", date: "2026-04-15", vendor: "Inland Revenue Department" },
    { cat: "MARKETING", amt: 1680000, desc: "Hong Kong Jewellery & Gem Fair — booth and travel", date: "2026-03-14", vendor: "HKTDC / Cathay Pacific", acct: "EXP_EXHIBITION", notes: "Generated 3 enquiries; one converted (Tokyo Jewel Atelier)." },
    { cat: "OFFICE", amt: 84500, desc: "Stationery, packaging tissue and gift boxes", date: "2026-04-06", vendor: "Pettah Packaging" },
    { cat: "SUPPLIES", amt: 128000, desc: "Polishing compounds and diamond laps — cutting dept", date: "2026-05-02", vendor: "Gem Tools Lanka" },
    { cat: "PROFESSIONAL_FEES", amt: 95000, desc: "Legal review of partner-deal agreements", date: "2026-06-09", vendor: "Fernando & Associates" },
    { cat: "TRAVEL", amt: 215000, desc: "Mahenge sourcing trip — flights and guide", date: "2026-04-22", vendor: "Precision Air / local guide" },
    { cat: "BANK_FEES", amt: 61000, desc: "SWIFT wire fees — Q2", date: "2026-06-30", vendor: "Sampath Bank" },
    { cat: "TAX", amt: 585000, desc: "Quarterly VAT prepayment — Q2", date: "2026-07-15", vendor: "Inland Revenue Department" },
    { cat: "MARKETING", amt: 320000, desc: "Photographer + model — autumn lookbook", date: "2026-08-12", vendor: "Studio Malin" },
    { cat: "SHIPPING", amt: 36000, desc: "Courier — samples to Tokyo", date: "2026-08-25", vendor: "DHL Express", status: "REIMBURSED", by: sales.name, notes: "Paid on the salesperson's card; reimbursed 5 Sept." },
    { cat: "SUPPLIES", amt: 18500, desc: "Unapproved: coffee machine for showroom", date: "2026-09-02", vendor: "Abans", status: "REJECTED", by: sales.name, notes: "Rejected — not a company expense." },
    { cat: "SOFTWARE", amt: 480, desc: "Design software subscription", date: "2026-09-04", vendor: "Adobe", cur: "USD", fx: USD, status: "RECORDED", by: media.name },
    { cat: "TRAVEL", amt: 1850, desc: "Bangkok — meeting heat-treatment partner", date: "2026-09-11", vendor: "Thai Airways / hotel", cur: "USD", fx: USD, status: "RECORDED", by: buyer.name },
    { cat: "OTHER", amt: 42000, desc: "Vault alarm service call-out", date: "2026-09-19", vendor: "Secure Lanka", status: "RECORDED" },
  );
  const monthlyBuckets: Record<string, Record<string, number>> = {};
  for (const e of opex) {
    await mkExpense({ cat: e.cat, amount: e.amt, desc: e.desc, date: e.date, vendor: e.vendor, status: e.status, currency: e.cur, fx: e.fx, notes: e.notes, recordedBy: e.by });
    if (e.status === "REJECTED" || e.status === "RECORDED") continue;
    const m = e.date.slice(0, 7);
    const acct = e.acct ?? ({ RENT: "EXP_RENT", SALARIES: "EXP_SALARIES", UTILITIES: "EXP_UTILITIES", MARKETING: "EXP_MARKETING", TRAVEL: "EXP_TRANSPORT", SHIPPING: "EXP_TRANSPORT", BANK_FEES: "EXP_BANK_CHARGES", TAX: "TAXES_PAYABLE" } as Record<string, string>)[e.cat] ?? "EXP_PROFESSIONAL";
    const lkr = e.amt * (e.fx ?? 1);
    (monthlyBuckets[m] ??= {})[acct] = (monthlyBuckets[m][acct] ?? 0) + lkr;
  }

  // ───────────────────────────── Directors, shareholders, capital, accounting ─────────────────────────────
  console.log("Directors, shareholders, share register, capital…");
  await seedDefaultChartOfAccounts();
  const mkDir = async (o: { name: string; role: string; email: string; phone: string; nic: string; addr: string; joined: string; left?: string; notes: string }) =>
    prisma.director.create({ data: { code: await nextGlobalCode(codePrefix.director), name: o.name, role: o.role, email: o.email, phone: o.phone, nationalId: o.nic, address: o.addr, active: !o.left, joinedAt: d(o.joined), leftAt: o.left ? d(o.left) : null, notes: o.notes } });
  const dirNuwan = await mkDir({ name: "Nuwan Abeysekera", role: "Chairman", email: "nuwan@serendibgems.example", phone: "+94 77 100 2001", nic: "197845612345", addr: "15 Park Road, Colombo 05", joined: "2018-04-01", notes: "Founder. Chairs quarterly board meetings." });
  const dirDilani = await mkDir({ name: "Dilani Ratnayake", role: "Managing Director", email: "dilani@serendibgems.example", phone: "+94 77 100 2002", nic: "198256789012", addr: "88 Bullers Lane, Colombo 07", joined: "2018-04-01", notes: "Runs day-to-day operations and sales." });
  const dirHiran = await mkDir({ name: "Prof. Hiran Jayasuriya", role: "Non-Executive Director", email: "hiran@uni.example.lk", phone: "+94 71 555 3003", nic: "196534567890", addr: "3 University Avenue, Peradeniya", joined: "2021-09-15", notes: "Geology professor; advises on provenance." });
  await mkDir({ name: "Mahesh Gunasekara", role: "Executive Director", email: "mahesh@example.lk", phone: "+94 76 222 4004", nic: "198867890123", addr: "21 Temple Road, Kandy", joined: "2019-02-01", left: "2025-06-30", notes: "Resigned June 2025 — relocated overseas. Shares transferred." });

  const mkSH = async (o: { kind: string; name: string; email: string; phone: string; nic: string; addr: string; notes: string; dir?: string }) =>
    prisma.shareholder.create({ data: { code: await nextGlobalCode(codePrefix.shareholder), kind: o.kind, name: o.name, email: o.email, phone: o.phone, nationalId: o.nic, address: o.addr, notes: o.notes, directorId: o.dir ?? null } });
  const shNuwan = await mkSH({ kind: "INDIVIDUAL", name: "Nuwan Abeysekera", email: "nuwan@serendibgems.example", phone: "+94 77 100 2001", nic: "197845612345", addr: "15 Park Road, Colombo 05", notes: "Founder shareholder.", dir: dirNuwan.id });
  const shDilani = await mkSH({ kind: "INDIVIDUAL", name: "Dilani Ratnayake", email: "dilani@serendibgems.example", phone: "+94 77 100 2002", nic: "198256789012", addr: "88 Bullers Lane, Colombo 07", notes: "Co-founder.", dir: dirDilani.id });
  const shHiran = await mkSH({ kind: "INDIVIDUAL", name: "Prof. Hiran Jayasuriya", email: "hiran@uni.example.lk", phone: "+94 71 555 3003", nic: "196534567890", addr: "3 University Avenue, Peradeniya", notes: "Strategic investor, 2021.", dir: dirHiran.id });
  const shLGV = await mkSH({ kind: "ENTITY", name: "Lanka Gem Ventures (Pvt) Ltd", email: "invest@lgv.example", phone: "+94 11 244 7788", nic: "PV 00198223", addr: "Level 12, World Trade Center, Colombo 01", notes: "Venture investor — holds ordinary and preference shares." });
  const ord = await prisma.shareClass.create({ data: { code: "ORD", name: "Ordinary shares", faceValue: 10, currency: "LKR", notes: "One vote per share." } });
  const pref = await prisma.shareClass.create({ data: { code: "PREF", name: "Preference shares (non-voting)", faceValue: 100, currency: "LKR", notes: "6% cumulative preferential dividend." } });

  type Cap = { type: string; party: "dir" | "sh"; who: any; amt: number; date: string; method?: string; ref: string; notes: string; status?: string; post?: boolean };
  const capCounter = { n: 0 };
  async function mkCap(c: Cap, shareTx?: { class: string; shares: number; price: number; to: string }) {
    const code = await nextCode(codePrefix.capitalTxn, YEAR, prisma, { pad: 4 });
    const status = c.status ?? "POSTED";
    let journalId: string | null = null;
    if (status === "POSTED") {
      const lines: any[] = [];
      switch (c.type) {
        case "SHARE_CAPITAL": {
          const face = shareTx ? shareTx.shares * (shareTx.class === "ORD" ? 10 : 100) : c.amt;
          lines.push({ subtype: "BANK", debit: c.amt }, { subtype: "SHARE_CAPITAL", credit: face });
          if (c.amt - face > 0) lines.push({ subtype: "SHARE_PREMIUM", credit: c.amt - face });
          break;
        }
        case "DIRECTOR_LOAN": case "ADVANCE": lines.push({ subtype: "BANK", debit: c.amt }, { subtype: "DIRECTOR_LOAN", credit: c.amt }); break;
        case "LOAN_REPAY": case "ADVANCE_REPAY": case "WITHDRAWAL": lines.push({ subtype: "DIRECTOR_LOAN", debit: c.amt }, { subtype: "BANK", credit: c.amt }); break;
        case "EXPENSE_PAID_ON_BEHALF": lines.push({ subtype: "EXP_PROFESSIONAL", debit: c.amt }, { subtype: "DIRECTOR_LOAN", credit: c.amt }); break;
        case "DIVIDEND": lines.push({ subtype: "RETAINED_EARNINGS", debit: c.amt }, { subtype: "BANK", credit: c.amt }); break;
      }
      const j = await postJournal({ transactionDate: d(c.date), description: `${c.type.replace(/_/g, " ").toLowerCase()} — ${c.notes}`, reference: c.ref, sourceModule: "CAPITAL", sourceCode: code, postedBy: finance.name, lines });
      journalId = j.id;
    }
    const row = await prisma.capitalTransaction.create({
      data: {
        code, type: c.type, directorId: c.party === "dir" ? c.who.id : null, shareholderId: c.party === "sh" ? c.who.id : null, amount: c.amt, currency: "LKR",
        method: c.method ?? "BANK_TRANSFER", reference: c.ref, transactionDate: d(c.date), notes: c.notes, recordedBy: finance.name, status,
        postedAt: status === "POSTED" ? d(c.date) : null, postedBy: status === "POSTED" ? finance.name : null, journalId,
      },
    });
    if (journalId) await prisma.journal.update({ where: { id: journalId }, data: { sourceId: row.id } });
    if (shareTx) {
      const st = await prisma.shareTransaction.create({
        data: {
          code: await nextCode(codePrefix.shareTxn, YEAR, prisma, { pad: 4 }), type: "SHARE_ISSUE", shareClassId: shareTx.class === "ORD" ? ord.id : pref.id,
          numberOfShares: shareTx.shares, pricePerShare: shareTx.price, totalAmount: shareTx.shares * shareTx.price, currency: "LKR", transfereeId: shareTx.to,
          transactionDate: d(c.date), reference: c.ref, notes: c.notes, recordedBy: finance.name, capitalTransactionId: row.id,
        },
      });
      void st;
    }
    capCounter.n++;
    return row;
  }
  // Opening share capital (all in Jan 2026 so the bank has funds for the January buying)
  await mkCap({ type: "SHARE_CAPITAL", party: "sh", who: shNuwan, amt: 15000000, date: "2026-01-02", ref: "BR-2026-001", notes: "Founder subscription — 1,500,000 ordinary shares at Rs 10" }, { class: "ORD", shares: 1500000, price: 10, to: shNuwan.id });
  await mkCap({ type: "SHARE_CAPITAL", party: "sh", who: shDilani, amt: 10000000, date: "2026-01-02", ref: "BR-2026-001", notes: "Co-founder subscription — 1,000,000 ordinary shares at Rs 10" }, { class: "ORD", shares: 1000000, price: 10, to: shDilani.id });
  await mkCap({ type: "SHARE_CAPITAL", party: "sh", who: shHiran, amt: 2500000, date: "2026-01-05", ref: "BR-2026-002", notes: "Strategic investor — 250,000 ordinary shares at Rs 10" }, { class: "ORD", shares: 250000, price: 10, to: shHiran.id });
  await mkCap({ type: "SHARE_CAPITAL", party: "sh", who: shLGV, amt: 20000000, date: "2026-02-12", ref: "BR-2026-004", notes: "Series A — 500,000 ordinary shares at Rs 40 (premium Rs 30)" }, { class: "ORD", shares: 500000, price: 40, to: shLGV.id });
  await mkCap({ type: "SHARE_CAPITAL", party: "sh", who: shLGV, amt: 2000000, date: "2026-06-15", ref: "BR-2026-009", notes: "20,000 preference shares at Rs 100" }, { class: "PREF", shares: 20000, price: 100, to: shLGV.id });
  // Transfer Nuwan → Hiran
  await prisma.shareTransaction.create({
    data: { code: await nextCode(codePrefix.shareTxn, YEAR, prisma, { pad: 4 }), type: "SHARE_TRANSFER", shareClassId: ord.id, numberOfShares: 50000, pricePerShare: 25, totalAmount: 1250000, currency: "LKR", transferorId: shNuwan.id, transfereeId: shHiran.id, transactionDate: d("2026-07-10"), reference: "Form 15 / Board res. 2026-07", notes: "Private transfer between founder and strategic investor.", recordedBy: finance.name },
  });
  // Lots (current holdings)
  const lot = (sh: string, cls: string, shares: number, paid: number) => prisma.shareLot.create({ data: { shareholderId: sh, shareClassId: cls, numberOfShares: shares, paidUpAmount: paid } });
  await lot(shNuwan.id, ord.id, 1450000, 14500000);
  await lot(shDilani.id, ord.id, 1000000, 10000000);
  await lot(shHiran.id, ord.id, 300000, 3000000);
  await lot(shLGV.id, ord.id, 500000, 20000000);
  await lot(shLGV.id, pref.id, 20000, 2000000);
  // Director loan ledger
  await mkCap({ type: "DIRECTOR_LOAN", party: "dir", who: dirDilani, amt: 3000000, date: "2026-03-04", ref: "LOAN-AGR-01", notes: "Working-capital loan to fund the Elahera purchase (12-month, interest-free)" });
  await mkCap({ type: "LOAN_REPAY", party: "dir", who: dirDilani, amt: 500000, date: "2026-08-06", ref: "BR-2026-014", notes: "Part repayment of the March loan" });
  await mkCap({ type: "ADVANCE", party: "dir", who: dirNuwan, amt: 800000, date: "2026-05-12", ref: "ADV-2026-01", notes: "Short-term advance ahead of the Hong Kong fair settlement" });
  await mkCap({ type: "ADVANCE_REPAY", party: "dir", who: dirNuwan, amt: 300000, date: "2026-09-09", ref: "BR-2026-018", notes: "Part repayment of the May advance" });
  await mkCap({ type: "EXPENSE_PAID_ON_BEHALF", party: "dir", who: dirHiran, amt: 85000, date: "2026-06-20", ref: "RCPT-HJ-0620", method: "CASH", notes: "Paid for the SSEF courier from personal funds" });
  await mkCap({ type: "WITHDRAWAL", party: "dir", who: dirNuwan, amt: 250000, date: "2026-09-25", ref: "WD-2026-03", notes: "Director drawing against the September advance" });
  await mkCap({ type: "DIVIDEND", party: "sh", who: shLGV, amt: 120000, date: "2026-09-30", ref: "DIV-2026-PREF-H1", notes: "6% preference dividend, first half", status: "DRAFT" });

  // General-ledger entries from the business activity
  console.log("Journals & accounting periods…");
  const post = (date: string, description: string, lines: any[], extra: { ref?: string; module?: any; code?: string } = {}) =>
    postJournal({ transactionDate: d(date), description, reference: extra.ref ?? null, sourceModule: extra.module ?? "MANUAL", sourceCode: extra.code ?? null, postedBy: finance.name, lines });
  // rough purchases
  const pBank = new Set(["P1", "P3", "P4", "P6", "P7"]);
  for (const [pk, p] of Object.entries(parcelDefs)) {
    const total = roughDefs.filter((r) => r.parcel === pk).reduce((s, r) => s + r.price, 0);
    if (pBank.has(pk)) await post(p.date, `Rough purchase — ${p.origin}`, [{ subtype: "INVENTORY_ROUGH", debit: total }, { subtype: "BANK", credit: total }], { module: "PURCHASE" });
    else {
      await post(p.date, `Rough purchase — ${p.origin} (on credit)`, [{ subtype: "INVENTORY_ROUGH", debit: total }, { subtype: "AP", credit: total }], { module: "PURCHASE" });
      await post(new Date(new Date(p.date).getTime() + 35 * 86400000).toISOString().slice(0, 10), `Supplier payment — ${p.origin}`, [{ subtype: "AP", debit: total }, { subtype: "BANK", credit: total }], { module: "PAYMENT" });
    }
  }
  // purchased finished stones
  for (const g of gemDefs.filter((x) => !x.from)) await post(g.buyDate!, `Finished stone purchase — ${g.variety}`, [{ subtype: "INVENTORY_GEMSTONE", debit: g.buyCost! }, { subtype: "BANK", credit: g.buyCost! }], { module: "PURCHASE" });
  // monthly operating expenses
  for (const [m, buckets] of Object.entries(monthlyBuckets).sort()) {
    const lines: any[] = Object.entries(buckets).map(([subtype, amt]) => ({ subtype, debit: amt }));
    const total = Object.values(buckets).reduce((s, v) => s + v, 0);
    lines.push({ subtype: "BANK", credit: total });
    await post(`${m}-28`, `Operating expenses — ${monthName[months.indexOf(m)] ?? m}`, lines, { module: "EXPENSE" });
  }
  // sales: revenue + cost of sales
  for (const s of Object.values(sale)) {
    if (s.def.status === "CANCELLED") continue;
    const rate = s.def.fx ?? 1;
    const revenue = s.def.price * rate;
    const paidAgg = await prisma.payment.aggregate({ where: { salesOrderId: s.id }, _sum: { amount: true } });
    const paid = Number(paidAgg._sum.amount ?? 0) * rate;
    const lines: any[] = [];
    if (paid > 0) lines.push({ subtype: "BANK", debit: paid });
    if (revenue - paid > 0) lines.push({ subtype: "AR", debit: revenue - paid });
    lines.push({ subtype: "REVENUE_SALES", credit: revenue });
    await post(s.def.date, `Sale ${s.code} — ${cust[s.def.c].name}`, lines, { module: "SALE", code: s.code, ref: `INV-${YEAR}-${s.code.split("-").pop()}` });
    const cost = Number((await prisma.gemstone.findUniqueOrThrow({ where: { id: gem[s.def.g].id } })).totalCost);
    await post(s.def.date, `Cost of sales — ${gem[s.def.g].code}`, [{ subtype: "COS_GEMSTONE", debit: cost }, { subtype: "INVENTORY_GEMSTONE", credit: cost }], { module: "SALE", code: s.code });
  }
  // a manual year-end style adjustment
  await post("2026-06-30", "Reclassify prepaid insurance (H1)", [{ subtype: "PREPAYMENTS", debit: 123000 }, { subtype: "EXP_PROFESSIONAL", credit: 123000 }], { ref: "ADJ-H1-01" });
  // Close the books through June
  for (let m = 1; m <= 9; m++) {
    const status = m <= 3 ? "LOCKED" : m <= 6 ? "CLOSED" : "OPEN";
    await prisma.accountingPeriod.upsert({
      where: { year_month: { year: YEAR, month: m } }, update: { status, closedAt: status === "OPEN" ? null : d(`2026-${String(m + 1).padStart(2, "0")}-05`), closedBy: status === "OPEN" ? null : finance.name, notes: status === "LOCKED" ? "Audited — locked." : status === "CLOSED" ? "Closed after management review." : null },
      create: { year: YEAR, month: m, status },
    });
  }

  // ───────────────────────────── Partners & deals ─────────────────────────────
  console.log("Partner deals…");
  const { presetVisibility, serializeVisibility } = await import("@/lib/partner-visibility");
  const { validateDealForActivationIn, previewReconcile, commitReconcile, recordPayout, createAdjustment, allocateInvestment } = await import("@/lib/partner-ledger");
  const { createAccess } = await import("@/lib/partner-access");
  const actor = { id: owner.id, name: owner.name };

  const mkPartner = async (o: { name: string; kind: string; company: string; contact: string; email: string; phone: string; country: string; notes: string }) =>
    prisma.partner.create({ data: { code: await nextGlobalCode(codePrefix.partner), name: o.name, kind: o.kind, company: o.company, contactName: o.contact, email: o.email, phone: o.phone, country: o.country, notes: o.notes, createdById: owner.id } });
  const pHassan = await mkPartner({ name: "Hassan Al Mansoori", kind: "BROKER", company: "Al Noor Gems Trading LLC", contact: "Hassan Al Mansoori", email: "hassan@alnoorgems.example", phone: "+971 50 123 4567", country: "United Arab Emirates", notes: "Introduced the Dubai dealers. Reliable; prefers WhatsApp updates." });
  const pLakshmi = await mkPartner({ name: "Lakshmi Wijesinghe", kind: "INVESTOR", company: "Island Capital (Pvt) Ltd", contact: "Lakshmi Wijesinghe", email: "lakshmi@islandcapital.example", phone: "+94 77 888 1212", country: "Sri Lanka", notes: "Funds rough purchases for a share of profits. Capital-protected." });
  const pMarcus = await mkPartner({ name: "Marcus Weber", kind: "AGENT", company: "Weber Edelsteine AG", contact: "Marcus Weber", email: "marcus@weber-edelsteine.example", phone: "+41 44 555 01 01", country: "Switzerland", notes: "Swiss agent re-sharing our catalogue to private clients; 8% commission." });
  const pAnil = await mkPartner({ name: "Anil Perera", kind: "BROKER", company: "Beruwala Gem Market", contact: "Anil Perera", email: "anil@beruwala.example", phone: "+94 34 227 1188", country: "Sri Lanka", notes: "Local broker — fixed fee per stone sold." });
  await mkPartner({ name: "Old Partner (inactive)", kind: "BROKER", company: "Ceylon Stone Brokers", contact: "—", email: "info@csb.example", phone: "+94 11 000 0000", country: "Sri Lanka", notes: "Relationship ended 2025." }).then((p) => prisma.partner.update({ where: { id: p.id }, data: { active: false } }));

  type DealOpts = { partner: string; title: string; partnerTitle: string; method: string; scope?: string; earnOn: string; ratePct?: number; fixedFee?: number; invested?: number; capitalProtected?: boolean; preset: "FULL" | "STANDARD" | "MINIMAL"; partnerNote: string; internal: string; status: string; activated?: string; resale?: boolean; rates?: Record<string, string> };
  const mkDeal = async (o: DealOpts, stones: { r?: string; g?: string; at: string; from?: string }[]) => {
    const vis = presetVisibility(o.preset);
    const deal = await prisma.partnerDeal.create({
      data: {
        code: await nextCode(codePrefix.partnerDeal, YEAR, prisma, { pad: 4 }), partnerId: o.partner, title: o.title, partnerTitle: o.partnerTitle, status: "DRAFT",
        method: o.method, scope: o.scope ?? "PER_STONE", earnOn: o.earnOn, currency: "LKR", ratePct: o.ratePct ?? null, fixedFee: o.fixedFee ?? null, invested: o.invested ?? null,
        capitalProtected: o.capitalProtected ?? false, rateOverrides: JSON.stringify(o.rates ?? { USD: "300.000000", EUR: "330.000000", GBP: "385.000000" }),
        visibility: serializeVisibility(vis), visibilityPreset: o.preset, partnerNote: o.partnerNote, internalNotes: o.internal,
        resaleEnabled: o.resale ?? false, resaleShowPrice: o.resale ?? false, createdById: owner.id, createdByName: owner.name, createdAt: d(stones[0]?.at ?? "2026-07-01"),
      },
    });
    for (const s of stones) {
      const w = s.r ? roughDefs.find((x) => x.k === s.r)!.wt : gem[s.g!].def.wt;
      await prisma.partnerDealStone.create({
        data: { dealId: deal.id, roughStoneId: s.r ? rough[s.r].id : null, gemstoneId: s.g ? gem[s.g].id : null, weightMilli: Math.round(w * 1000), addedAt: d(s.at), addedById: owner.id, addedByName: owner.name, countSalesFrom: s.from ? d(s.from) : null },
      });
    }
    return deal;
  };
  const activate = async (dealId: string, at: string) => {
    const v = await validateDealForActivationIn(prisma, dealId);
    if (!v.ok) log(`⚠ activation check for ${dealId}: ${v.errors.join("; ")}`);
    await prisma.partnerDeal.update({ where: { id: dealId }, data: { status: "ACTIVE", activatedAt: d(at) } });
  };

  const deal1 = await mkDeal({ partner: pHassan.id, title: "Hassan — pink sapphire pear (R7)", partnerTitle: "Pink sapphire — Dubai placement", method: "PROFIT_SHARE", earnOn: "PAYMENT", ratePct: 25, preset: "STANDARD", partnerNote: "Thank you Hassan — payment received from the buyer on 12 Sept.", internal: "25% of profit after cost; excluded overhead (rent, salaries, tax).", status: "ACTIVE" }, [{ r: "R7", at: "2026-07-20" }]);
  const deal2 = await mkDeal({ partner: pLakshmi.id, title: "Island Capital — padparadscha lot (R13)", partnerTitle: "Padparadscha investment", method: "INVESTMENT", earnOn: "PAYMENT", ratePct: 30, invested: 2500000, capitalProtected: true, preset: "FULL", partnerNote: "Capital is protected: you are repaid first on any sale.", internal: "Investor funded 2.5M towards the rough purchase. 30% profit share, investor-first on loss.", status: "ACTIVE" }, [{ r: "R13", at: "2026-06-10" }]);
  const deal3 = await mkDeal({ partner: pMarcus.id, title: "Weber — alexandrite resale (G19)", partnerTitle: "Alexandrite — Swiss placement", method: "SALE_COMMISSION", earnOn: "SALE", ratePct: 8, preset: "MINIMAL", partnerNote: "Commission is earned when the sale is confirmed.", internal: "Agent; re-share enabled, price visible to his clients.", status: "ACTIVE", resale: true }, [{ g: "G19", at: "2026-08-25" }]);
  const deal4 = await mkDeal({ partner: pAnil.id, title: "Beruwala — accent stones (fixed fee)", partnerTitle: "Accent stones placement", method: "FIXED_FEE", earnOn: "PAYMENT", fixedFee: 50000, preset: "STANDARD", partnerNote: "Fee is paid per stone sold.", internal: "Draft: awaiting signed agreement.", status: "DRAFT" }, [{ g: "G3", at: "2026-10-01" }, { g: "G5", at: "2026-10-01" }]);
  const deal5 = await mkDeal({ partner: pHassan.id, title: "Hassan — Ceylon blue & Mahenge spinel", partnerTitle: "Premium blue & spinel", method: "PROFIT_SHARE", earnOn: "PAYMENT", ratePct: 20, preset: "STANDARD", partnerNote: "Active — no sales yet.", internal: "Two premium stones on consignment-style share.", status: "ACTIVE" }, [{ g: "G6", at: "2026-09-01" }, { g: "G9", at: "2026-09-01" }]);

  await activate(deal1.id, "2026-07-22");
  await allocateInvestment(deal2.id, owner.id).then((r) => { if (!r.ok) log(`⚠ investment allocation: ${r.error}`); });
  await activate(deal2.id, "2026-06-12");
  await activate(deal3.id, "2026-08-26");
  await activate(deal5.id, "2026-09-02");

  const settle = async (dealId: string, label: string, note: string, partnerNote: string) => {
    try {
      const pv = await previewReconcile(dealId);
      if (pv.blocking.length) { log(`⚠ ${label}: blocked (${pv.blocking.join(", ")})`); return; }
      const res = await commitReconcile({ dealId, inputsHash: pv.inputsHash, rates: pv.rates, ackedFlags: pv.needsAck, reasons: {}, settlementNote: note, settlementPartnerNote: partnerNote, actor });
      log(res.ok ? `✓ ${label}: settlement ${res.settlementCode}` : `⚠ ${label}: ${res.error} ${(res as any).detail ?? ""}`);
    } catch (e: any) { log(`⚠ ${label}: ${e.message}`); }
  };
  await settle(deal1.id, "Deal 1", "First settlement after the Dubai buyer paid in full.", "Settlement for the pink sapphire sale.");
  await settle(deal2.id, "Deal 2", "Investor settlement on the G12 sale.", "Capital and profit share on the first padparadscha sale.");
  await settle(deal3.id, "Deal 3", "Commission recorded on confirmation of sale.", "Commission on the alexandrite sale.");

  // payouts + a goodwill adjustment
  const payout = async (dealId: string, label: string, amountLkr: number, when: string, ref: string, note: string) => {
    try {
      const r = await recordPayout({ dealId, direction: "PAID", amountMinor: Math.round(amountLkr * 100), paidAt: d(when), method: "BANK_TRANSFER", reference: ref, partnerNote: note, ackPayingAhead: true, actor });
      log(r.ok ? `✓ ${label}: payout ${r.code}` : `⚠ ${label}: ${r.error}`);
    } catch (e: any) { log(`⚠ ${label}: ${e.message}`); }
  };
  const led = async (dealId: string) => (await prisma.partnerSettlement.findMany({ where: { dealId } })).reduce((s, x) => s + Number(x.amount), 0);
  const l1 = await led(deal1.id); if (l1 > 0) await payout(deal1.id, "Deal 1", Math.floor(l1 / 2), "2026-09-20", "SWIFT-ALMNSR-0920", "Part payment — balance to follow.");
  const l2 = await led(deal2.id); if (l2 > 0) await payout(deal2.id, "Deal 2", Math.floor(l2), "2026-09-05", "BANK-IC-0905", "Settled in full.");
  try {
    const r = await createAdjustment({ dealId: deal1.id, bucketKey: null, amountMinor: 5000 * 100, reasonCode: "GOODWILL", reason: "Goodwill for the fast introduction to the Dubai buyer.", partnerNote: "A small thank-you for the quick turnaround.", actor });
    log(r.ok ? `✓ Deal 1: adjustment ${r.code}` : `⚠ adjustment: ${r.error}`);
  } catch (e: any) { log(`⚠ adjustment: ${e.message}`); }

  // partner portal links
  const links: string[] = [];
  for (const [deal, label, pw] of [[deal1, "Hassan phone", "partner123"], [deal2, "Lakshmi — office", "partner123"], [deal3, "Marcus — Zurich", undefined], [deal5, "Hassan — blue/spinel", undefined]] as const) {
    try {
      const a = await createAccess({ dealId: deal.id, label, password: pw, expiresAt: new Date(Date.now() + 90 * 86400000) }, actor);
      links.push(`${label}: /p/${a.token}${pw ? `   (password: ${pw})` : "   (no password)"}`);
      await prisma.partnerAccessLog.createMany({ data: [{ accessId: a.id, dealId: deal.id, outcome: "OK", path: "/p/[code]", uaClass: "mobile/safari", country: "AE", detail: "stones=1,mode=NEUTRAL", at: d("2026-10-02") }, { accessId: a.id, dealId: deal.id, outcome: "OK", path: "/p/[code]", uaClass: "desktop/chrome", country: "LK", at: d("2026-10-06") }] });
      await prisma.partnerAccess.update({ where: { id: a.id }, data: { viewCount: 2, firstViewedAt: d("2026-10-02"), lastViewedAt: d("2026-10-06") } });
    } catch (e: any) { log(`⚠ access link for ${label}: ${e.message}`); }
  }
  void deal4;

  // ───────────────────────────── Comments, notifications, audit ─────────────────────────────
  console.log("Comments, notifications, audit log…");
  const comment = (entity: string, id: string, code: string, text: string, by: { id: string; name: string }, when: string) =>
    prisma.comment.create({ data: { entity, entityId: id, entityCode: code, text, authorId: by.id, authorName: by.name, createdAt: d(when) } });
  await comment("Gemstone", gem.G1.id, gem.G1.code, "Colour is outstanding under daylight — this is our best Ceylon blue this year.", gemo, "2026-02-08");
  await comment("Gemstone", gem.G1.id, gem.G1.code, "James asked for another 14 days on the reservation; extending to 31 Oct.", sales, "2026-09-26");
  await comment("Gemstone", gem.G11.id, gem.G11.code, "SSEF confirmed padparadscha — the lab note on 'delicate pink-orange' is great for the listing.", gemo, "2026-07-31");
  await comment("Gemstone", gem.G6.id, gem.G6.code, "Photographing in the lightbox on Friday; keep it out of the vault until 4pm.", media, "2026-10-07");
  await comment("RoughStone", rough.R5.id, rough.R5.code, "Hue sits on the pink/orange boundary — recommend Plan B and a lab opinion before cutting.", gemo, "2026-09-18");
  await comment("RoughStone", rough.R12.id, rough.R12.code, "Fracture runs through the centre; skip cutting. Keep as a collector specimen.", cutter2, "2026-07-21");
  await comment("CuttingJob", jobIds.R4, "R4", "Cleavage along one plane; going slowly on the crown.", cutter, "2026-10-02");
  await comment("Customer", cust.chen.id, "CUST", "James is in Singapore until 20 Oct; WhatsApp is the fastest way to reach him.", sales, "2026-10-03");
  await comment("Customer", cust.alnoor.id, "CUST", "Hassan wants to see the next pink parcel before it goes to the catalogue.", mgmt, "2026-09-14");
  await comment("SalesOrder", sale.s4.id, sale.s4.code, "Balance of LKR 250,000 due by 30 Oct; I'll remind him on the 25th.", finance, "2026-10-01");
  await comment("SalesOrder", sale.s6.id, sale.s6.code, "Hold shipment until the balance clears; insurance quote already received.", sales, "2026-10-05");
  await comment("Enquiry", enqs.e3, "ENQ", "Asked for lab reports for all three stones — need to check which of our small blues have GIC reports.", sales, "2026-10-06");

  const notif = (type: string, title: string, body: string, entity: string, id: string | null, code: string, url: string, hoursAgo: number, read: boolean) =>
    [owner, admin, mgmt, sales].map((u) => ({ userId: u.id, type, title, body, entity, entityId: id, entityCode: code, url, createdAt: new Date(Date.now() - hoursAgo * 3600000), readAt: read ? new Date(Date.now() - (hoursAgo - 1) * 3600000) : null }));
  await prisma.notification.createMany({
    data: [
      ...notif("RESERVATION_EXPIRING", `Reservation for ${gem.G18.code} expires in 5 days`, "Dr. Anika Fernando · AUD 8,100 · deposit received", "Reservation", reservations.r2, "RES", `/reservations/${reservations.r2}`, 2, false),
      ...notif("QUOTATION_EXPIRING", "Quotation q9 expires next month", `${gem.G6.code} · James Chen · USD 32,500`, "Quotation", quotes.q9.id, "Q", `/quotations/${quotes.q9.id}`, 6, false),
      ...notif("ENQUIRY_NEW", "New enquiry from Tokyo Jewel Atelier", "3 round blue sapphires, ~1 ct, unheated", "Enquiry", enqs.e3, "ENQ", "/enquiries", 30, false),
      ...notif("PAYMENT_RECORDED", "Payment received: Al Noor Gems Trading", "USD 4,300 · SWIFT ALNOOR-9981", "SalesOrder", sale.s5.id, sale.s5.code, `/sales/${sale.s5.id}`, 700, true),
      ...notif("SHIPMENT_CREATED", "Shipment prepared for Emily Carter", `${sale.s6.code} → London (DHL)`, "SalesOrder", sale.s6.id, sale.s6.code, `/sales/${sale.s6.id}`, 96, false),
      ...notif("CERTIFICATE_ISSUED", `SSEF certificate issued for ${gem.G6.code}`, "Report SSEF-123456 · origin Sri Lanka (Ceylon)", "Gemstone", gem.G6.id, gem.G6.code, `/gemstones/${gem.G6.id}`, 1200, true),
      ...notif("CUTTING_COMPLETED", `Cutting complete for ${rough.R14.code}`, "Alexandrite 1.95 ct · yield 26.7%", "CuttingJob", jobIds.R14, "CJ", `/cutting/${jobIds.R14}`, 1900, true),
      ...notif("CGI_MASTER_SET", `Master CGI approved for ${gem.G6.code}`, "V2 marked as master · Studio Malin", "Gemstone", gem.G6.id, gem.G6.code, `/gemstones/${gem.G6.id}`, 1100, true),
      ...notif("PARTNER_ACTIVITY", "Partner opened the statement", "Hassan Al Mansoori viewed deal DEAL-2026-0001", "PartnerDeal", deal1.id, "DEAL", `/partners/deals/${deal1.id}`, 60, false),
      ...notif("ALERT", "Period 2026-06 closed", "Accounting period closed by Chamari Dissanayake", "AccountingPeriod", null, "2026-06", "/journals", 2300, true),
      ...notif("SALE_CREATED", `${gem.G19.code} sold to Emily Carter`, "GBP 2,950 · invoice INV-2026-0006", "SalesOrder", sale.s6.id, sale.s6.code, `/sales/${sale.s6.id}`, 500, true),
    ],
  });

  const au = (entity: string, id: string, code: string, action: string, by: { id: string; name: string }, when: string, extra: object = {}) =>
    prisma.auditLog.create({ data: { userId: by.id, userName: by.name, entity, entityId: id, entityCode: code, action, at: d(when), ipAddress: "203.94.10.21", ...extra } });
  for (const [rk, r] of Object.entries(rough)) await au("RoughStone", r.id, r.code, "CREATE", buyer, roughDefs.find((x) => x.k === rk)!.date, { newValue: "Rough purchased" });
  for (const g of Object.values(gem)) await au("Gemstone", g.id, g.code, "CREATE", gemo, "2026-06-01", { newValue: "Finished stone registered" });
  await au("RoughStone", rough.R4.id, rough.R4.code, "STATUS_CHANGE", cutter, "2026-09-22", { field: "status", oldValue: "AVAILABLE", newValue: "IN_CUTTING" });
  await au("RoughStone", rough.R10.id, rough.R10.code, "STATUS_CHANGE", whouse, "2026-09-25", { field: "status", oldValue: "INSPECTED", newValue: "RECEIVED", metadata: JSON.stringify({ note: "Out for heat treatment" }) });
  await au("Gemstone", gem.G1.id, gem.G1.code, "PRICE_CHANGE", sales, "2026-02-12", { field: "askingPrice", oldValue: "5100000", newValue: "5400000" });
  await au("Gemstone", gem.G4.id, gem.G4.code, "PRICE_CHANGE", sales, "2026-05-02", { field: "askingPrice", oldValue: "2300000", newValue: "2100000" });
  await au("Gemstone", gem.G1.id, gem.G1.code, "STATUS_CHANGE", sales, "2026-02-16", { field: "status", oldValue: "AVAILABLE", newValue: "RESERVED" });
  for (const s of Object.values(sale)) await au("SalesOrder", s.id, s.code, "CREATE", sales, s.def.date, { newValue: `Sale to ${cust[s.def.c].name}` });
  await au("SalesOrder", sale.s3.id, sale.s3.code, "STATUS_CHANGE", sales, "2026-06-20", { field: "status", oldValue: "CONFIRMED", newValue: "CANCELLED", metadata: JSON.stringify({ reason: "Buyer withdrew" }) });
  for (const [k, id] of Object.entries(jobIds)) await au("CuttingJob", id, k, "CREATE", cutter, "2026-03-01", { newValue: `Cutting job for ${rough[k].code}` });
  await au("User", sales.id, sales.email, "PERMISSION_CHANGE", owner, "2026-04-01", { field: "capabilityGrants", oldValue: "[]", newValue: '["report:read"]' });
  await au("CompanySettings", "singleton", "SETTINGS", "UPDATE", owner, "2026-01-02", { field: "defaultPaymentTerms", oldValue: "100% in advance", newValue: "50% on order, 50% before shipping" });

  // ───────────────────────────── Done ─────────────────────────────
  const counts = {
    users: await prisma.user.count(), suppliers: await prisma.supplier.count(), rough: await prisma.roughStone.count(), gemstones: await prisma.gemstone.count(),
    customers: await prisma.customer.count(), sales: await prisma.salesOrder.count(), journals: await prisma.journal.count(), partnerDeals: await prisma.partnerDeal.count(),
    settlements: await prisma.partnerSettlement.count(), expenses: await prisma.expense.count(), assets: await prisma.digitalAsset.count(),
  };
  console.log("\nDemo data ready:", counts);
  console.log("\nLog in at http://localhost:3000/login — every account uses password123:");
  for (const u of [owner, admin, mgmt, buyer, gemo, cutter, sales, media, finance, whouse]) console.log(`  ${u.email.padEnd(28)} ${u.role}`);
  console.log("\nPartner portal links (open in a browser while the app runs):");
  for (const l of links) console.log(`  http://localhost:3000${l.slice(l.indexOf("/p/"))}  [${l.split(":")[0]}]`);
  console.log(`\nPublic pages: /catalogue · /verify/<stone code> e.g. /verify/${gem.G1.code} · /share/${colBlue.shareCode}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
