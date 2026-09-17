/**
 * Serendib ERP demo seed.
 * Creates users, suppliers, locations, parcels, rough stones, cutting jobs
 * and the finished stones they produced — enough to exercise every screen.
 */
import { PrismaClient } from "@prisma/client";import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function nextCodeSeed(prefix: string, year: number, pad = 6) {
  const row = await prisma.idSequence.upsert({
    where: { prefix_year: { prefix, year } },
    update: { lastValue: { increment: 1 } },
    create: { prefix, year, lastValue: 1 },
  });
  return `${prefix}-${year}-${String(row.lastValue).padStart(pad, "0")}`;
}

async function main() {
  console.log("Wiping demo data…");
  // Order matters: leaves first.
  await prisma.$transaction([
    prisma.expense.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.shipment.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.salesOrder.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.quotation.deleteMany(),
    prisma.enquiry.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.priceHistory.deleteMany(),
    prisma.costAllocation.deleteMany(),
    prisma.cGIVersion.deleteMany(),
    prisma.cGIProject.deleteMany(),
    prisma.certificate.deleteMany(),
    prisma.laboratory.deleteMany(),
    prisma.digitalAsset.deleteMany(),
    prisma.transformationOutput.deleteMany(),
    prisma.transformationInput.deleteMany(),
    prisma.gemstoneTransformation.deleteMany(),
    prisma.cuttingJob.deleteMany(),
    prisma.cuttingPlan.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.gemstone.deleteMany(),
    prisma.roughStone.deleteMany(),
    prisma.parcel.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.inventoryLocation.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.user.deleteMany(),
    prisma.idSequence.deleteMany(),
  ]);

  console.log("Users…");
  const passwordHash = await bcrypt.hash("password123", 10);
  const [admin, mgmt, buyer, gemologist, cutter, sales] = await Promise.all([
    prisma.user.create({ data: { email: "admin@serendib.lk",       name: "Admin",             passwordHash, role: "ADMINISTRATOR" } }),
    prisma.user.create({ data: { email: "management@serendib.lk",  name: "Rohan Wickrama",    passwordHash, role: "MANAGEMENT" } }),
    prisma.user.create({ data: { email: "buyer@serendib.lk",       name: "Priyantha Silva",   passwordHash, role: "GEM_BUYER" } }),
    prisma.user.create({ data: { email: "gem@serendib.lk",         name: "Dr Kavindi Perera", passwordHash, role: "GEMOLOGIST" } }),
    prisma.user.create({ data: { email: "cutter@serendib.lk",      name: "Nimal Fernando",    passwordHash, role: "CUTTER" } }),
    prisma.user.create({ data: { email: "sales@serendib.lk",       name: "Ishara Jayawardena", passwordHash, role: "SALES" } }),
  ]);

  console.log("Locations…");
  const main1 = await prisma.inventoryLocation.create({ data: { code: "MAIN",        name: "Main Facility" } });
  const vault = await prisma.inventoryLocation.create({ data: { code: "VAULT",       name: "Vault", parentId: main1.id } });
  const cabA  = await prisma.inventoryLocation.create({ data: { code: "VAULT-A",     name: "Cabinet A", parentId: vault.id } });
  const tray1 = await prisma.inventoryLocation.create({ data: { code: "VAULT-A-T01", name: "Tray 01", parentId: cabA.id } });
  const tray2 = await prisma.inventoryLocation.create({ data: { code: "VAULT-A-T02", name: "Tray 02", parentId: cabA.id } });
  const cabB  = await prisma.inventoryLocation.create({ data: { code: "VAULT-B",     name: "Cabinet B", parentId: vault.id } });
  const cut   = await prisma.inventoryLocation.create({ data: { code: "CUTTING",     name: "Cutting Department", parentId: main1.id } });
  const qc    = await prisma.inventoryLocation.create({ data: { code: "QC",          name: "Quality Control", parentId: main1.id } });

  console.log("Suppliers…");
  const [ratna, gems, mogok] = await Promise.all([
    prisma.supplier.create({ data: { code: "SUP-0001", name: "Ratnapura Rough Traders", country: "Sri Lanka", city: "Ratnapura", contact: "Sarath Bandara", email: "sarath@ratnapurarough.lk" } }),
    prisma.supplier.create({ data: { code: "SUP-0002", name: "Beruwala Gem Market",     country: "Sri Lanka", city: "Beruwala", contact: "Anil Perera", email: "anil@beruwala.lk" } }),
    prisma.supplier.create({ data: { code: "SUP-0003", name: "Mogok Rough Imports",     country: "Myanmar",   city: "Mogok",    contact: "Zaw Min",    email: "zaw@mogokrough.com" } }),
  ]);

  console.log("Parcels…");
  const parcelACode = await nextCodeSeed("PARCEL", 2026, 4);
  const parcelA = await prisma.parcel.create({
    data: {
      code: parcelACode,
      supplierId: ratna.id,
      purchaseDate: new Date("2026-01-12"),
      origin: "Ratnapura, Sri Lanka",
      totalWeightCt: 127.5,
      totalCost: 22400,
      currency: "LKR",
      notes: "Mixed blue-sapphire rough parcel, 5 pieces.",
    },
  });
  const parcelBCode = await nextCodeSeed("PARCEL", 2026, 4);
  const parcelB = await prisma.parcel.create({
    data: {
      code: parcelBCode,
      supplierId: mogok.id,
      purchaseDate: new Date("2026-02-05"),
      origin: "Mogok, Myanmar",
      totalWeightCt: 62.4,
      totalCost: 41000,
      currency: "LKR",
      notes: "Padparadscha / spinel parcel.",
    },
  });

  console.log("Rough stones…");
  const roughA1Code = await nextCodeSeed("SGS-R", 2026);
  const roughA1 = await prisma.roughStone.create({
    data: {
      code: roughA1Code,
      supplierId: ratna.id,
      parcelId: parcelA.id,
      locationId: tray1.id,
      purchaseDate: new Date("2026-01-12"),
      gemType: "Sapphire",
      variety: "Blue Sapphire",
      species: "Corundum",
      origin: "Sri Lanka",
      mineSource: "Ratnapura",
      weightCt: 25.4,
      lengthMm: 22.1, widthMm: 15.6, heightMm: 12.3,
      shape: "Hexagonal",
      color: "Deep blue",
      transparency: "Semi-transparent",
      clarity: "Moderately included",
      inclusions: "Rutile silk, minor feathers",
      purchasePrice: 8900, currency: "LKR", pricePerCt: 350.39,
      initialValuation: 14000, valuationBy: "Priyantha Silva", valuationDate: new Date("2026-01-13"),
      status: "CONVERTED",
    },
  });
  const roughA2Code = await nextCodeSeed("SGS-R", 2026);
  const roughA2 = await prisma.roughStone.create({
    data: {
      code: roughA2Code,
      supplierId: ratna.id, parcelId: parcelA.id, locationId: tray1.id,
      purchaseDate: new Date("2026-01-12"),
      gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum",
      origin: "Sri Lanka", mineSource: "Ratnapura",
      weightCt: 18.7, shape: "Water-worn", color: "Cornflower",
      purchasePrice: 5100, currency: "LKR", pricePerCt: 272.73,
      status: "IN_CUTTING",
    },
  });
  const roughA3Code = await nextCodeSeed("SGS-R", 2026);
  const roughA3 = await prisma.roughStone.create({
    data: {
      code: roughA3Code,
      supplierId: ratna.id, parcelId: parcelA.id, locationId: tray2.id,
      purchaseDate: new Date("2026-01-12"),
      gemType: "Sapphire", variety: "Yellow Sapphire", species: "Corundum",
      origin: "Sri Lanka",
      weightCt: 12.2, color: "Golden yellow",
      purchasePrice: 2400, currency: "LKR", pricePerCt: 196.72,
      status: "AVAILABLE",
    },
  });
  const roughB1Code = await nextCodeSeed("SGS-R", 2026);
  const roughB1 = await prisma.roughStone.create({
    data: {
      code: roughB1Code,
      supplierId: mogok.id, parcelId: parcelB.id, locationId: cabB.id,
      purchaseDate: new Date("2026-02-05"),
      gemType: "Spinel", variety: "Red Spinel", species: "Spinel",
      origin: "Myanmar", mineSource: "Mogok",
      weightCt: 9.8, color: "Vivid red",
      purchasePrice: 12500, currency: "LKR", pricePerCt: 1275.51,
      initialValuation: 18000,
      status: "AVAILABLE",
    },
  });
  const roughB2Code = await nextCodeSeed("SGS-R", 2026);
  const roughB2 = await prisma.roughStone.create({
    data: {
      code: roughB2Code,
      supplierId: mogok.id, parcelId: parcelB.id, locationId: cabB.id,
      purchaseDate: new Date("2026-02-05"),
      gemType: "Sapphire", variety: "Padparadscha", species: "Corundum",
      origin: "Myanmar", mineSource: "Mogok",
      weightCt: 6.4, color: "Pink-orange",
      purchasePrice: 15400, currency: "LKR", pricePerCt: 2406.25,
      status: "INSPECTED",
    },
  });

  console.log("Cutting plans + job for the 25.4ct rough…");
  await prisma.cuttingPlan.createMany({
    data: [
      { roughStoneId: roughA1.id, name: "Plan A", proposedShape: "Oval",    expectedWeightCt: 8.5, expectedYieldPct: 33.5, expectedValue: 22000, selected: true,  cutterRecommendation: "Highest value; cleaner center." },
      { roughStoneId: roughA1.id, name: "Plan B", proposedShape: "Cushion", expectedWeightCt: 7.8, expectedYieldPct: 30.7, expectedValue: 19500, selected: false, cutterRecommendation: "More classic Ceylon shape." },
      { roughStoneId: roughA1.id, name: "Plan C", proposedShape: "Pear",    expectedWeightCt: 6.9, expectedYieldPct: 27.2, expectedValue: 17000, selected: false, cutterRecommendation: "Best colour saturation." },
    ],
  });

  const cjCode = await nextCodeSeed("CJ", 2026, 5);
  const cuttingJob = await prisma.cuttingJob.create({
    data: {
      code: cjCode,
      roughStoneId: roughA1.id,
      cutterId: cutter.id,
      startedAt: new Date("2026-01-18"),
      expectedCompletion: new Date("2026-01-28"),
      completedAt: new Date("2026-01-27"),
      plannedCut: "Oval",
      actualCut: "Oval + accents",
      targetWeightCt: 8.5,
      expectedYieldPct: 33.5,
      actualYieldPct: 46.9,
      cuttingCost: 900, laborCost: 500, machineCost: 250, currency: "LKR",
      notes: "Cutter salvaged additional accent stones from clean corner material.",
      status: "COMPLETED",
    },
  });

  console.log("Finished gemstones from that rough…");
  const gemAcode = await nextCodeSeed("SGS-G", 2026);
  const gemA = await prisma.gemstone.create({
    data: {
      code: gemAcode, locationId: tray1.id,
      gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum",
      origin: "Sri Lanka", treatment: "Unheated", treatmentStatus: "Verified",
      weightCt: 8.72, lengthMm: 13.4, widthMm: 10.1, depthMm: 6.8,
      shape: "Oval", cut: "Brilliant/Step (mixed)", facetingStyle: "Ceylon oval",
      colorHue: "vB", colorTone: "5", colorSaturation: "5",
      colorDescription: "Cornflower blue, medium tone", clarity: "Eye-clean",
      transparency: "Transparent", luster: "Vitreous", symmetry: "Very good", polish: "Excellent",
      totalCost: 0, costPerCt: 0, currency: "LKR",
      askingPrice: 18500, minimumPrice: 15500, pricePerCt: 2121.56,
      status: "AVAILABLE",
    },
  });
  const gemBcode = await nextCodeSeed("SGS-G", 2026);
  const gemB = await prisma.gemstone.create({
    data: {
      code: gemBcode, locationId: tray1.id,
      gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum",
      origin: "Sri Lanka", treatment: "Unheated",
      weightCt: 2.14, shape: "Oval", cut: "Brilliant",
      colorDescription: "Cornflower blue accent",
      totalCost: 0, costPerCt: 0, currency: "LKR",
      askingPrice: 2600, pricePerCt: 1214.95,
      status: "AVAILABLE",
    },
  });
  const gemCcode = await nextCodeSeed("SGS-G", 2026);
  const gemC = await prisma.gemstone.create({
    data: {
      code: gemCcode, locationId: tray1.id,
      gemType: "Sapphire", variety: "Blue Sapphire", species: "Corundum",
      origin: "Sri Lanka", treatment: "Unheated",
      weightCt: 1.06, shape: "Pear", cut: "Brilliant",
      colorDescription: "Cornflower blue accent",
      totalCost: 0, costPerCt: 0, currency: "LKR",
      askingPrice: 950, pricePerCt: 896.23,
      status: "AVAILABLE",
    },
  });

  console.log("Transformation (genealogy) record…");
  const txCode = await nextCodeSeed("TX", 2026, 5);
  const inputWeight = 25.4;
  const outputWeight = 8.72 + 2.14 + 1.06; // 11.92
  const waste = inputWeight - outputWeight;
  const yieldPct = (outputWeight / inputWeight) * 100;

  const rowsWithGem = [
    { gem: gemA, alloc: 0.6 },   // 60% of rough cost -> primary
    { gem: gemB, alloc: 0.25 },
    { gem: gemC, alloc: 0.15 },
  ];
  const rough1Cost = 8900;
  const jobCost = 900 + 500 + 250;
  const perGemBase = (gemAllocFraction: number) => (rough1Cost + jobCost) * gemAllocFraction;

  const transformation = await prisma.gemstoneTransformation.create({
    data: {
      code: txCode,
      type: "CUTTING",
      performedAt: new Date("2026-01-27"),
      operator: cutter.name,
      cost: jobCost,
      currency: "LKR",
      cuttingJobId: cuttingJob.id,
      notes: "Ceylon blue sapphire; primary + two accents.",
      totalInputWeightCt: inputWeight,
      totalOutputWeightCt: outputWeight,
      wasteWeightCt: waste,
      yieldPct,
      inputs: {
        create: [
          { roughStoneId: roughA1.id, inputWeightCt: inputWeight, inputCost: rough1Cost },
        ],
      },
      outputs: {
        create: rowsWithGem.map(({ gem, alloc }) => ({
          gemstoneId: gem.id,
          outputWeightCt: Number(gem.weightCt),
          allocatedCost: perGemBase(alloc),
        })),
      },
    },
  });

  console.log("Cost allocations + roll finished-gemstone cost fields…");
  for (const { gem, alloc } of rowsWithGem) {
    const rp = rough1Cost * alloc;
    const cutC = jobCost * alloc;
    await prisma.costAllocation.createMany({
      data: [
        { gemstoneId: gem.id, type: "ROUGH_PURCHASE", description: `Allocated share of ${roughA1.code}`, amount: rp },
        { gemstoneId: gem.id, type: "CUTTING",       description: `Allocated share of cutting job ${cuttingJob.code}`, amount: cutC },
      ],
    });
    const total = rp + cutC;
    const cpc = Number(gem.weightCt) > 0 ? total / Number(gem.weightCt) : 0;
    await prisma.gemstone.update({
      where: { id: gem.id },
      data: { totalCost: total, costPerCt: cpc },
    });
  }

  console.log("Price history example on the flagship stone…");
  await prisma.priceHistory.createMany({
    data: [
      { gemstoneId: gemA.id, oldPrice: null,  newPrice: 16000, currency: "LKR", reason: "Initial listing", changedBy: "Sales" },
      { gemstoneId: gemA.id, oldPrice: 16000, newPrice: 17500, currency: "LKR", reason: "Market uplift",   changedBy: "Sales" },
      { gemstoneId: gemA.id, oldPrice: 17500, newPrice: 18500, currency: "LKR", reason: "Certificate received", changedBy: "Sales" },
    ],
  });

  console.log("Laboratories, certification, CGI, media…");
  const [grs, gia, ssef] = await Promise.all([
    prisma.laboratory.create({ data: { code: "GRS",  name: "GRS Gemresearch Swisslab", country: "Switzerland", website: "https://gemresearch.ch" } }),
    prisma.laboratory.create({ data: { code: "GIA",  name: "Gemological Institute of America", country: "USA" } }),
    prisma.laboratory.create({ data: { code: "SSEF", name: "Swiss Gemmological Institute SSEF", country: "Switzerland" } }),
  ]);

  const certCodeA = await nextCodeSeed("CERT", 2026, 5);
  await prisma.certificate.create({
    data: {
      code: certCodeA,
      gemstoneId: gemA.id,
      laboratoryId: grs.id,
      certificateNumber: "GRS2026-041872",
      type: "ORIGIN",
      status: "ISSUED",
      submissionDate: new Date("2026-02-02"),
      returnDate: new Date("2026-02-07"),
      issueDate: new Date("2026-02-07"),
      originDetermination: "Sri Lanka (Ceylon)",
      treatmentDetermination: "No indications of thermal enhancement",
      weightCt: 8.72,
      dimensions: "13.40 × 10.10 × 6.80 mm",
      colorGrade: "vivid blue (\"royal blue\")",
      comments: "GRS type classification: 'royal blue'.",
      laboratoryFees: 380,
      currency: "LKR",
    },
  });

  const certCodeB = await nextCodeSeed("CERT", 2026, 5);
  await prisma.certificate.create({
    data: {
      code: certCodeB,
      gemstoneId: gemB.id,
      laboratoryId: gia.id,
      certificateNumber: null,
      type: "IDENTIFICATION",
      status: "SUBMITTED",
      submissionDate: new Date("2026-02-15"),
      laboratoryFees: 90, currency: "LKR",
      comments: "Awaiting return from GIA.",
    },
  });

  const cgiCode = await nextCodeSeed("CGI", 2026, 5);
  const cgiProject = await prisma.cGIProject.create({
    data: {
      code: cgiCode,
      gemstoneId: gemA.id,
      artist: "Studio Malin",
      software: "Blender",
      softwareVersion: "4.2 LTS",
      status: "APPROVED",
      notes: "Hero shot + 360° for the flagship royal blue Ceylon.",
    },
  });

  await prisma.cGIVersion.createMany({
    data: [
      { projectId: cgiProject.id, version: 1, code: `${cgiProject.code}-V1`, notes: "Initial pass; too warm."   },
      { projectId: cgiProject.id, version: 2, code: `${cgiProject.code}-V2`, notes: "Colour rebalanced."         },
      { projectId: cgiProject.id, version: 3, code: `${cgiProject.code}-V3`, notes: "Final; approved as master.", isMaster: true, approvedAt: new Date("2026-02-09"), approvedBy: "Rohan Wickrama" },
    ],
  });

  await prisma.digitalAsset.createMany({
    data: [
      { gemstoneId: gemA.id, kind: "FINISHED_PHOTO",  url: "/logo.svg", caption: "Reference top-down photograph", isPrimary: true, createdBy: "Studio Malin" },
      { gemstoneId: gemA.id, kind: "MACRO_PHOTO",     url: "/logo.svg", caption: "Macro crown detail" },
      { roughStoneId: roughA1.id, kind: "ROUGH_PHOTO", url: "/logo.svg", caption: "Rough as received", isPrimary: true, createdBy: "Priyantha Silva" },
    ],
  });

  // Cost allocations for cert + CGI so true cost reflects them.
  await prisma.costAllocation.createMany({
    data: [
      { gemstoneId: gemA.id, type: "CERTIFICATION", description: `Lab fees ${grs.name}`, amount: 380 },
      { gemstoneId: gemA.id, type: "CGI",           description: `CGI project ${cgiProject.code}`, amount: 1200 },
      { gemstoneId: gemA.id, type: "PHOTOGRAPHY",   description: "Studio photography — Studio Malin", amount: 350 },
    ],
  });
  const gemATotals = await prisma.costAllocation.aggregate({ where: { gemstoneId: gemA.id }, _sum: { amount: true } });
  const newTotalA = Number(gemATotals._sum.amount ?? 0);
  await prisma.gemstone.update({
    where: { id: gemA.id },
    data: {
      totalCost: newTotalA,
      costPerCt: Number(gemA.weightCt) > 0 ? newTotalA / Number(gemA.weightCt) : 0,
    },
  });

  console.log("Customers…");
  const custACode = await nextCodeSeed("CUST", 2026, 4);
  const custA = await prisma.customer.create({
    data: {
      code: custACode, kind: "INDIVIDUAL", type: "COLLECTOR",
      displayName: "James Chen", country: "Singapore", city: "Singapore",
      email: "james.chen@example.com", phone: "+65 8123 4567",
      notes: "High-end collector; prefers unheated Ceylon sapphires.",
      preferences: JSON.stringify({
        gemTypes: ["Sapphire"], varieties: ["Blue Sapphire", "Padparadscha"],
        origins: ["Sri Lanka"], colors: ["royal blue", "cornflower"],
        shapes: ["Oval", "Cushion"], treatments: ["Unheated"],
        minWeightCt: 3, maxWeightCt: 10, budgetMin: 10000, budgetMax: 40000, currency: "LKR",
      }),
    },
  });
  const custBCode = await nextCodeSeed("CUST", 2026, 4);
  const custB = await prisma.customer.create({
    data: {
      code: custBCode, kind: "COMPANY", type: "JEWELLERY_BRAND",
      displayName: "Maison Aurel", companyName: "Maison Aurel SA",
      country: "France", city: "Paris",
      email: "sourcing@maison-aurel.example", website: "https://maison-aurel.example",
      notes: "Boutique house sourcing for a signature bespoke line.",
      preferences: JSON.stringify({
        gemTypes: ["Sapphire", "Spinel"], varieties: [], origins: ["Sri Lanka", "Myanmar"],
        colors: [], shapes: [], treatments: ["Unheated"],
        minWeightCt: 2, maxWeightCt: null, budgetMin: null, budgetMax: null, currency: "EUR",
      }),
    },
  });

  console.log("Enquiry → quotation on the flagship gem…");
  const enqCode = await nextCodeSeed("ENQ", 2026, 4);
  const enquiry = await prisma.enquiry.create({
    data: {
      code: enqCode,
      customerId: custA.id,
      gemstoneId: gemA.id,
      requirement: "Looking for a 6ct+ unheated royal blue Ceylon sapphire, oval or cushion, budget up to $22k.",
      preferredOrigin: "Sri Lanka",
      preferredTreatment: "Unheated",
      preferredShape: "Oval",
      minWeightCt: 6, maxWeightCt: 12,
      budgetMin: 18000, budgetMax: 22000, currency: "LKR",
      quantity: 1,
      salespersonId: sales.id,
      followUpDate: new Date("2026-02-16"),
      status: "QUOTED",
    },
  });

  const qCode = await nextCodeSeed("Q", 2026, 4);
  const quotation = await prisma.quotation.create({
    data: {
      code: qCode,
      customerId: custA.id,
      gemstoneId: gemA.id,
      enquiryId: enquiry.id,
      price: 18500,
      currency: "LKR",
      validUntil: new Date("2026-03-14"),
      paymentTerms: "30% deposit on reservation, balance before shipping",
      deliveryTerms: "Insured courier, 5–7 business days",
      shippingTerms: "DAP Singapore address",
      notes: "Offer includes GRS origin certificate.",
      salespersonId: sales.id,
      sentAt: new Date("2026-02-14"),
      status: "ACCEPTED",
      respondedAt: new Date("2026-02-16"),
    },
  });

  console.log("Active reservation for the flagship stone (RESERVED)…");
  const resCode = await nextCodeSeed("RES", 2026, 4);
  await prisma.reservation.create({
    data: {
      code: resCode,
      customerId: custA.id,
      gemstoneId: gemA.id,
      quotationId: quotation.id,
      price: 18500, deposit: 5550, currency: "LKR",
      expiresAt: new Date("2026-03-01"),
      salespersonId: sales.id,
      notes: "Deposit received via bank transfer.",
      status: "ACTIVE",
    },
  });
  await prisma.gemstone.update({
    where: { id: gemA.id },
    data: { status: "RESERVED" },
  });

  console.log("Completed sale on the 2.14ct accent (Maison Aurel)…");
  const soCode = await nextCodeSeed("SO", 2026, 4);
  const soNum  = soCode.split("-").pop();
  const salesOrderB = await prisma.salesOrder.create({
    data: {
      code: soCode,
      invoiceNumber: `INV-2026-${soNum}`,
      customerId: custB.id,
      gemstoneId: gemB.id,
      agreedPrice: 2600,
      taxAmount: 0,
      totalAmount: 2600,
      currency: "LKR",
      saleDate: new Date("2026-02-20"),
      salespersonId: sales.id,
      notes: "Included in Paris shipment batch.",
      status: "PARTIAL",
    },
  });
  await prisma.gemstone.update({
    where: { id: gemB.id },
    data: { status: "SOLD" },
  });

  const payCode = await nextCodeSeed("PAY", 2026, 4);
  await prisma.payment.create({
    data: {
      code: payCode,
      salesOrderId: salesOrderB.id,
      customerId: custB.id,
      amount: 1300, currency: "LKR",
      method: "BANK_TRANSFER",
      reference: "SWIFT AUREL-0021",
      receivedAt: new Date("2026-02-21"),
      notes: "50% deposit.",
      recordedBy: sales.name,
    },
  });

  console.log("Shipment for the Aurel sale (in transit)…");
  const shpCode = await nextCodeSeed("SHP", 2026, 4);
  await prisma.shipment.create({
    data: {
      code: shpCode,
      salesOrderId: salesOrderB.id,
      courier: "Malca-Amit",
      trackingNumber: "MA-2026-AUR-0021",
      destination: "Paris",
      destCountry: "France",
      shippingCost: 220, insuranceCost: 65, declaredValue: 2600, currency: "LKR",
      preparedAt: new Date("2026-02-22"),
      packedAt: new Date("2026-02-23"),
      shippedAt: new Date("2026-02-24"),
      status: "IN_TRANSIT",
      notes: "Sealed vault-to-vault export.",
    },
  });
  await prisma.salesOrder.update({
    where: { id: salesOrderB.id },
    data: { status: "SHIPPED" },
  });

  console.log("Notifications for the demo…");
  const notifTargets = [admin.id, mgmt.id, sales.id];
  await prisma.notification.createMany({
    data: notifTargets.flatMap((uid) => [
      {
        userId: uid, type: "SALE_CREATED",
        title: `${gemB.code} sold to Maison Aurel`,
        body: "USD 2,600 · invoice INV-2026-0001", entity: "SalesOrder",
        entityId: salesOrderB.id, entityCode: salesOrderB.code,
        url: `/sales/${salesOrderB.id}`,
      },
      {
        userId: uid, type: "RESERVATION_CREATED",
        title: `Reserved ${gemA.code} for James Chen`,
        body: "Agreed price USD 18,500 · deposit USD 5,550",
        entity: "Reservation", entityCode: resCode,
        url: `/gemstones/${gemA.id}`,
      },
      {
        userId: uid, type: "CERTIFICATE_ISSUED",
        title: `GRS certificate issued for ${gemA.code}`,
        body: "Report GRS2026-041872 · origin Sri Lanka (Ceylon)",
        entity: "Gemstone", entityId: gemA.id, entityCode: gemA.code,
        url: `/gemstones/${gemA.id}`,
      },
      {
        userId: uid, type: "CGI_MASTER_SET",
        title: `Master CGI approved for ${gemA.code}`,
        body: "V3 marked as master · Studio Malin",
        entity: "Gemstone", entityId: gemA.id, entityCode: gemA.code,
        url: `/gemstones/${gemA.id}`,
      },
      {
        userId: uid, type: "SHIPMENT_CREATED",
        title: `Shipment ${shpCode} prepared`,
        body: `Sales order ${salesOrderB.code} → Paris`,
        entity: "Shipment", entityCode: shpCode,
        url: `/sales/${salesOrderB.id}`,
      },
    ]),
  });

  console.log("Operating expenses…");
  const y = 2026;
  async function exp(cat: string, amount: number, description: string, incurredAt: Date, vendor?: string, notes?: string) {
    const code = await nextCodeSeed("EXP", y, 4);
    await prisma.expense.create({
      data: {
        code, category: cat, amount, currency: "LKR",
        vendor: vendor ?? null,
        description, incurredAt,
        recordedBy: mgmt.name, status: "APPROVED",
        approvedBy: admin.name, approvedAt: incurredAt,
        notes: notes ?? null,
      },
    });
  }
  await exp("RENT",             2400, "Colombo office rent — January",     new Date("2026-01-05"), "Cinnamon Gardens Prop.");
  await exp("RENT",             2400, "Colombo office rent — February",    new Date("2026-02-05"), "Cinnamon Gardens Prop.");
  await exp("UTILITIES",         340, "Electricity + water",               new Date("2026-01-15"), "LECO");
  await exp("UTILITIES",         362, "Electricity + water",               new Date("2026-02-16"), "LECO");
  await exp("SOFTWARE",          199, "Cloud storage annual — CGI files",  new Date("2026-01-22"), "S3-compatible");
  await exp("PROFESSIONAL_FEES",1250, "Q4 accountancy review",             new Date("2026-01-28"), "Wickramaratne & Co.");
  await exp("INSURANCE",         820, "Vault + goods-in-transit insurance",new Date("2026-02-01"), "Sri Lanka Insurance");
  await exp("MARKETING",        1500, "Instagram + LinkedIn ad boost",     new Date("2026-02-10"), "Meta Ads");
  await exp("TRAVEL",            980, "Buyer's trip — Ratnapura gem show", new Date("2026-01-24"), "SriLankan Airlines");
  await exp("EQUIPMENT",        3400, "Additional loupe + polari-scope",   new Date("2026-02-07"), "Wilhelmus Optics");
  await exp("SALARIES",        11500, "Payroll — January (5 staff)",       new Date("2026-01-31"));
  await exp("SALARIES",        11500, "Payroll — February (5 staff)",      new Date("2026-02-28"));
  await exp("BANK_FEES",         180, "SWIFT wire fees",                    new Date("2026-02-24"), "Sampath Bank");
  await exp("TAX",              1800, "Quarterly VAT prepayment",           new Date("2026-02-15"), "Inland Revenue Dept.");

  console.log("Audit log samples…");
  await prisma.auditLog.createMany({
    data: [
      { userId: buyer.id, userName: buyer.name, entity: "RoughStone", entityId: roughA1.id, entityCode: roughA1.code, action: "CREATE", newValue: "Rough purchased" },
      { userId: cutter.id, userName: cutter.name, entity: "CuttingJob", entityId: cuttingJob.id, entityCode: cuttingJob.code, action: "STATUS_CHANGE", field: "status", oldValue: "PENDING", newValue: "COMPLETED" },
      { userId: sales.id, userName: sales.name, entity: "Gemstone", entityId: gemA.id, entityCode: gemA.code, action: "PRICE_CHANGE", field: "askingPrice", oldValue: "17500", newValue: "18500" },
    ],
  });

  console.log("\nDone. Sign in with:");
  console.log("  admin@serendib.lk / password123 (ADMINISTRATOR)");
  console.log("  management@serendib.lk / password123");
  console.log("  buyer@serendib.lk / password123");
  console.log("  gem@serendib.lk / password123");
  console.log("  cutter@serendib.lk / password123");
  console.log("  sales@serendib.lk / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
