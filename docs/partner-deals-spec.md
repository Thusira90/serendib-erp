# PARTNER DEALS - FINAL IMPLEMENTATION SPEC (v4, red-team revised)

Basis: Spec 1 (financial correctness / auditability) and Spec 2 (partner trust, UX, leak-proof security), merged, then revised against two red-team reviews. All worked numbers were recomputed after the revision (W1-W35). Conventions: money in the engine is INTEGER MINOR UNITS ("Minor", 2 dp). Percentages are stored as percentage points with at most 2 dp and converted to basis points ("bp", 10.25% = 1025 bp). "Owner A/B/C/D" is defined in section 12. Evidence comes from the scout reports (scouts disagreed in no material fact). Items marked (v4) are new or changed in this revision.

---------------------------------------------------------------------------------------------------
## 1. Decisions recap and changes to the orchestrator defaults

### 1.1 Owner decisions (adopted unchanged)
1. Four payout methods, each its OWN pure function (M1 PROFIT_SHARE, M2 SALE_COMMISSION, M3 FIXED_FEE, M4 INVESTMENT). M2 and M3 input types physically contain no cost field.
2. Live ESTIMATE floats with costs; each SETTLEMENT is a frozen snapshot (inputs, formula version, rate map, result); later changes become signed ADJUSTMENTS. Nothing paid or reported is rewritten.
3. One or many stones per deal; PER_STONE or POOLED scope.
4. Co-partners on the same stone (validated, section 4.5).
5. Admin chooses per deal exactly what the partner sees; sale price, purchase cost, cost breakdown, supplier identity, receipts and certificate files are SEPARATE switches (with the derived-figure locks of 6.1; owner confirmation requested in open question 4).
6. Link-only access, no login role, built as carefully as an authenticated portal.
7. Agents re-share through ShareLink; neutral (broker mode) is preselected.

### 1.2 Orchestrator defaults: verdicts (every change is justified)
| Default | Verdict |
|---|---|
| D1 rough follows derived gems | Adopted. Depth is exactly 1 (inputs are RoughStone only; `completeCuttingJob` is the only creator of transformations). Engine tolerates N transformations and flags MULTIPLE_CUTS. A deal stone that is a rough is ONE bucket/lot (its sold gems are netted, then floored); a cut rough is never itself a unit, so its own purchase price and bills are never counted twice. |
| D2 earnOn SALE or PAYMENT (default PAYMENT) | Adopted, refined: cost is recognised at the SAME fraction as revenue (`profit = f x (price - cost)`); otherwise an early partial payment shows a loss, floored to 0, then jumps. Fraction = payments received / `totalAmount` (payments also cover tax), capped at 1, computed ONLY from `Payment` rows (`SalesOrder.status` regresses after SHIPPED/DELIVERED). Revenue = `agreedPrice` ex tax. Live-order whitelist `CONFIRMED, INVOICED, PARTIAL, PAID, SHIPPED, DELIVERED` (never "not CANCELLED": that counts DRAFT). `asOf` is always server "now" for settlements. (v4) A stone that was already sold when it joined a deal is governed by `PartnerDealStone.countSalesFrom` (3.5). |
| D3 loss floor | Adopted unchanged (owner decision). PER_STONE floors per deal stone (a rough lot nets its sold gems first). POOLED nets all sold units then floors; unsold costs are excluded until they sell. A LOST stone is never charged to the partner (company bears it). (v4) Consequence made explicit: with PER_STONE the sum of partner shares can exceed the company's real net profit (W34); this is stated in the partner method note and admin form, and the aggregate-obligation check (4.5) guards the total. A separate "netAcrossStones" option is NOT added: POOLED already is netting. |
| D4 M2 | Adopted. Revenue x rate, no cost anywhere; type-level (no cost field) plus a property test. |
| D5 M3 | Adopted. (v4) Realised fraction is WEIGHT-based over DEAL-STONE weights frozen at attach (`PartnerDealStone.weightMilli`), computed as an exact rational with ONE final rounding, so cutting a rough or editing a gem weight cannot move the fee. |
| D6 M4 | Adopted. (v4) Investor principal is split to deal stones ONCE for BOTH scopes (largest remainder by cost basis, or explicit) and FROZEN in `PartnerDealStone.investedAlloc`; principal released on realisation uses these frozen per-stone amounts. Default pari-passu; `capitalProtected` = investor-first. Capital returned is capped by recognised cost and revenue (4.4). Legal-review notice shown. |
| D7 allocation | Adopted. One mechanism: an allocator action writes frozen per-stone `acquisitionOverride` values from `POOL_LUMP`, `PARCEL_TOTAL` or `MANUAL`. Cut allocation (output-weight shares, verified) is reused, not re-implemented. |
| D8 estimate/settlement | Adopted. Ledger is per BUCKET (`PartnerSettlementLine`); a settlement only ever credits positive NEW REALISATION; restatements and reversals are signed adjustments; both are written in one atomic "reconcile" (section 5). Append-only enforced by DB triggers (UPDATE, DELETE, TRUNCATE). `balance = settled + adjustments - netPaid`. (v4) Currency rates are frozen on the deal at the first settlement so settled amounts cannot churn on FX; sub-materiality restatements are not proposed. |
| D9 currency | Adopted. Rate map = LKR per 1 unit, 6-dp strings with per-currency source `MANUAL/LIVE/FALLBACK`, stored on every snapshot. Missing rate => item null, excluded, flagged (never `toBase`). Estimates may use FALLBACK (partner sees a neutral notice); a SETTLEMENT is refused while a used currency has only FALLBACK and no manual rate. (v4) All currency arithmetic is BigInt (no float products). |
| D10 feed | Adopted: closed `PartnerEventType` union from structured tables; never AuditLog, Comment, or `CostAllocation.description`. |
| D11 | Adopted. Buyer, other partners and other deals never queried by the public path. |
| D12 visibility | Adopted with 19 flags, 3 presets, dependency and FORCED rules (v4 expanded in 6.1: M2 forces `salePrice`; M1/M4 force `profitFigures`; with price visible they also force cost; PAYMENT forces payment progress when it is derivable). Live preview uses the same DTO builder. |
| D13 bearer token | Adopted. Changes: token stored only as SHA-256 (RLS is OFF on all 45 existing tables and `anon` has SELECT); full URL shown once, with Rotate; DB-atomic rate limiting; anomaly detection; (v4) atomic password-attempt reservation, no DB work for malformed tokens, bots get a data-free page. |
| D14 resale | Adopted. Changes: existing `/s` fail-open helpers and broker-mode "Serendib" leaks are HARD PREREQUISITES; partner-tagged links render through a whitelist-`select` path; neutral links use opaque stone refs; rough `observations/initialValuation/mineSource` structurally absent; (v4) resale fields are the INTERSECTION of the resale whitelist and the deal's effective visibility flags; neutral URLs come from `NEUTRAL_BASE_URL`; links record the minting access. |
| D15 money layer | Verified in code and live DB (section 3.2); remaining traps listed with countermeasures. |
| D16 | Adopted. Payouts are manual rows; NEVER Expenses (circular: a stone-bill payout lowers the profit it is computed from); no GL in v1. |

### 1.3 Additional changes (not in the orchestrator list)
- Integer minor units + BigInt + half-away-from-zero (`round2` is asymmetric for negatives: `round2(-1.005) = -1`; float `100.1+200.2 >= 300.3` is false). Bias note (v4): ties round away from zero, i.e. toward the partner on a positive amount, by at most 0.005 per rounded amount (one tie in ~100 cases for a 2-dp value); stated in the method notes, bounded by one minor unit per bucket row.
- Third capability `partner:settle` (segregation of duties). If the owner wants two, fold into `partner:write` and give FINANCE `partner:read` only (open question 1).
- Fresh capability re-read (`User.active`, grants, denies) on money and access-creation actions (JWT is a sign-in snapshot).
- Documents (receipts, certificate files) served through a token-checked proxy, never raw R2 URLs.
- Terms lock and membership lock (5.1), enforced additionally by a DB trigger (v4). Default `excludedCostTypes = ["RENT","SALARIES","TAX"]` plus any commission/brokerage category that exists (v4).
- Fail-closed `/s` helpers and `generateMetadata` for broker links.
- (v4) Per-asset exclusion `DigitalAsset.partnerHidden` ships in v1; stone `weightMilli` frozen at attach; `countSalesFrom`; `writtenOffAt`; `currency` on adjustments/payouts; `ShareLink.partnerAccessId`; `PartnerDeal.allowContactOverride` and `ratesFrozenAt`.

---------------------------------------------------------------------------------------------------
## 2. Data model

Conventions: ids `cuid()`; enums are `String` columns with const arrays in `src/lib/enums.ts`; JSON stored as `String`; ledger and configuration money `@db.Decimal(20, 2)` (new tables only; exact cents, no hidden sub-cent digits); `ratePct` `@db.Decimal(5, 2)`. Every new table gets RLS enabled and `anon`/`authenticated` revoked. After editing run `npx prisma generate`.

### 2.1 schema.prisma additions
```prisma
model Partner {
  id          String   @id @default(cuid())
  code        String   @unique                  // PTR-0001
  name        String                            // shown to partner and used as watermark
  kind        String   @default("BROKER")       // BROKER | INVESTOR | AGENT (label only)
  company     String?
  contactName String?
  email       String?
  phone       String?
  country     String?
  notes       String?                           // INTERNAL, never in any DTO
  active      Boolean  @default(true)
  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deals       PartnerDeal[]

  @@index([name])
  @@index([active])
}

model PartnerDeal {
  id                   String   @id @default(cuid())
  code                 String   @unique          // DEAL-2026-0001
  partnerId            String
  partner              Partner  @relation(fields: [partnerId], references: [id], onDelete: Restrict)
  title                String                    // internal
  partnerTitle         String?                   // partner sees this, else "Your deal"
  status               String   @default("DRAFT") // DRAFT | ACTIVE | CLOSED | CANCELLED
  method               String                    // PROFIT_SHARE | SALE_COMMISSION | FIXED_FEE | INVESTMENT
  scope                String   @default("PER_STONE") // PER_STONE | POOLED
  earnOn               String   @default("PAYMENT")   // SALE | PAYMENT
  currency             String   @default("LKR")  // ledger currency, in PARTNER_CURRENCIES (2 minor digits)
  ratePct              Decimal? @db.Decimal(5, 2) // M1, M2, M4; 0 < x <= 100
  fixedFee             Decimal? @db.Decimal(20, 2) // M3: per deal stone (PER_STONE) or once (POOLED)
  invested             Decimal? @db.Decimal(20, 2) // M4 deal total
  capitalProtected     Boolean  @default(false)  // M4 investor-first on loss
  poolAcquisitionCost  Decimal? @db.Decimal(20, 2) // allocator input (record only; engine reads per-stone overrides)
  poolCurrency         String?
  allocationBasis      String   @default("WEIGHT") // WEIGHT | EQUAL | MANUAL (allocator input record)
  excludedCostTypes    String   @default("[\"RENT\",\"SALARIES\",\"TAX\"]") // JSON string[] of CostAllocation.type not charged to the partner
  rateOverrides        String?                   // JSON {"USD":"330.500000"} LKR per 1 unit (MANUAL source); filled with the used rates at the first settlement (frozen)
  ratesFrozenAt        DateTime?                 // (v4) set at the first settlement commit
  formulaVersion       String   @default("pd-1.0.0")
  termsVersion         Int      @default(1)
  termsAmendedAt       DateTime?
  termsAmendReason     String?                   // INTERNAL
  visibility           String                    // JSON PartnerVisibility (section 6)
  visibilityPreset     String   @default("STANDARD") // FULL | STANDARD | MINIMAL | CUSTOM
  partnerNote          String?                   // partner-visible, max 500 chars
  internalNotes        String?                   // INTERNAL
  resaleEnabled        Boolean  @default(false)  // set true at creation for AGENT
  allowBrandedResale   Boolean  @default(true)
  resaleShowPrice      Boolean  @default(false)  // show asking price on resale pages (also needs the askingPrice flag)
  allowContactOverride Boolean  @default(false)  // (v4) partner may type their own contact on neutral links
  maxShareTtlMinutes   Int      @default(10080)  // 7 days; hard cap 43200
  maxActiveResaleLinks Int      @default(10)
  activatedAt          DateTime?
  closedAt             DateTime?
  createdById          String?
  createdByName        String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  stones      PartnerDealStone[]
  settlements PartnerSettlement[]
  adjustments PartnerAdjustment[]
  payouts     PartnerPayout[]
  accesses    PartnerAccess[]
  shareLinks  ShareLink[]

  @@index([partnerId])
  @@index([status])
}

model PartnerDealStone {
  id                  String      @id @default(cuid())
  dealId              String
  deal                PartnerDeal @relation(fields: [dealId], references: [id], onDelete: Restrict)
  roughStoneId        String?     // exactly one of rough/gem (SQL CHECK)
  roughStone          RoughStone? @relation(fields: [roughStoneId], references: [id], onDelete: Restrict)
  gemstoneId          String?
  gemstone            Gemstone?   @relation(fields: [gemstoneId], references: [id], onDelete: Restrict)
  weightMilli         Int         @default(0) // (v4) stone weight in milli-carats FROZEN at attach (rough or gem); 0 = unknown, equal weights used
  acquisitionOverride Decimal?    @db.Decimal(20, 2) // replaces ROUGH_PURCHASE-type cost; 0 = explicitly free
  acquisitionCurrency String?
  acquisitionSource   String?     // MANUAL | POOL_LUMP | PARCEL_TOTAL
  investedAlloc       Decimal?    @db.Decimal(20, 2) // M4 per-stone principal in deal currency, frozen (both scopes)
  countSalesFrom      DateTime?   // (v4) sales dated before this are ignored (stone already sold when attached)
  writtenOffAt        DateTime?   // (v4) M4: capital on this stone written off
  writtenOffNote      String?     // INTERNAL
  addedAt             DateTime    @default(now())
  addedById           String?
  addedByName         String?
  removedAt           DateTime?   // soft remove; re-adding clears it
  removedReason       String?

  @@unique([dealId, roughStoneId])
  @@unique([dealId, gemstoneId])
  @@index([roughStoneId])
  @@index([gemstoneId])
}
// RoughStone and Gemstone: add back-relation  partnerDealStones PartnerDealStone[]  (no DB column)

model PartnerSettlement {
  id             String      @id @default(cuid())
  code           String      @unique             // STL-2026-0001
  dealId         String
  deal           PartnerDeal @relation(fields: [dealId], references: [id], onDelete: Restrict)
  seq            Int
  formulaVersion String
  termsVersion   Int
  currency       String
  asOf           DateTime
  terms          String                          // JSON terms snapshot
  inputs         String                          // JSON: EngineInput + gather evidence (INTERNAL, never in a DTO)
  inputsHash     String                          // sha256 of canonical (sorted-key) inputs JSON
  result         String                          // JSON EngineResult
  rates          String                          // JSON RateMap
  flags          String   @default("[]")         // JSON [{code, severity, ackedByName}]
  earnedTotal    Decimal  @db.Decimal(20, 2)     // engine total at asOf (informational)
  positionBefore Decimal  @db.Decimal(20, 2)     // settled+adjustments just before this row (after same-commit adjustments)
  amount         Decimal  @db.Decimal(20, 2)     // sum(lines) > 0
  note           String?                         // INTERNAL
  partnerNote    String?                         // partner-visible (max 280)
  createdById    String?
  createdByName  String?
  createdAt      DateTime @default(now())        // no updatedAt: append-only

  lines   PartnerSettlementLine[]
  payouts PartnerPayout[]

  @@unique([dealId, seq])
  @@index([dealId, createdAt])
}

model PartnerSettlementLine {
  id             String   @id @default(cuid())
  settlementId   String
  settlement     PartnerSettlement @relation(fields: [settlementId], references: [id], onDelete: Restrict)
  dealId         String
  bucketKey      String                          // PartnerDealStone.id (PER_STONE) or "POOL"
  cumulative     Decimal  @db.Decimal(20, 2)     // engine bucket amount at asOf
  creditedBefore Decimal  @db.Decimal(20, 2)     // settled lines + adjustments for this bucket before this row
  amount         Decimal  @db.Decimal(20, 2)     // cumulative - creditedBefore (> 0)
  reasons        String                          // JSON array of FIRST | NEW_REALIZATION | COST_CHANGED | PRICE_CHANGED
  realizationKey String                          // sha256 of sorted "unitKey:orderId:num/den" list
  createdAt      DateTime @default(now())

  @@index([settlementId])
  @@index([dealId, bucketKey, createdAt])
}

model PartnerAdjustment {
  id             String      @id @default(cuid())
  code           String      @unique             // ADJ-2026-0001
  dealId         String
  deal           PartnerDeal @relation(fields: [dealId], references: [id], onDelete: Restrict)
  settlementId   String?                         // settlement being restated, if any
  bucketKey      String?                         // null = deal-level manual
  currency       String                          // (v4) must equal the deal currency (DB trigger)
  amount         Decimal  @db.Decimal(20, 2)     // signed, never 0
  reasonCode     String                          // COST_CHANGE | PRICE_CHANGE | FX_CORRECTION | SALE_CANCELLED | NETTING | STONE_REMOVED | STONE_WRITTEN_OFF | FORFEITED_DEPOSIT | CORRECTION | GOODWILL | MANUAL
  reason         String                          // INTERNAL, required
  partnerNote    String?                         // partner-visible (max 280)
  evidence       String   @default("{}")         // JSON {engineNow, creditedBefore, delta, inputsHash, changedLines, orderIds}
  realizationKey String?                         // set by reconcile; null for manual rows
  formulaVersion String
  rates          String   @default("{}")
  createdById    String?
  createdByName  String?
  createdAt      DateTime @default(now())

  @@index([dealId, createdAt])
  @@index([dealId, bucketKey])
}

model PartnerPayout {
  id               String   @id @default(cuid())
  code             String   @unique              // PAYOUT-2026-0001
  dealId           String
  deal             PartnerDeal @relation(fields: [dealId], references: [id], onDelete: Restrict)
  settlementId     String?                       // latest settlement for traceability; not an allocation
  settlement       PartnerSettlement? @relation(fields: [settlementId], references: [id], onDelete: Restrict)
  direction        String   @default("PAID")     // PAID (to partner) | RECEIVED (clawback receipt or reversal)
  currency         String                        // (v4) must equal the deal currency (DB trigger)
  amount           Decimal  @db.Decimal(20, 2)   // always > 0, deal currency
  paidAt           DateTime
  method           String?                       // BANK_TRANSFER | CASH | CHEQUE | OTHER (INTERNAL)
  reference        String?                       // INTERNAL
  originalAmount   Decimal? @db.Decimal(20, 2)   // informational, if physically paid in another currency
  originalCurrency String?
  reversalOfId     String?  @unique              // RECEIVED row reversing a PAID row
  partnerNote      String?
  createdById      String?
  createdByName    String?
  createdAt        DateTime @default(now())

  @@index([dealId, paidAt])
}

model PartnerAccess {
  id                String   @id @default(cuid())
  dealId            String
  deal              PartnerDeal @relation(fields: [dealId], references: [id], onDelete: Restrict)
  label             String?                       // internal, e.g. "Hassan phone"
  tokenHash         String   @unique              // sha256 hex of the token; token never stored; first 8 hex are the display id (no tokenHint column)
  passwordHash      String?                       // bcryptjs cost 12
  passwordSetAt     DateTime?
  unlockVersion     Int      @default(0)          // bump on password change or "sign out all devices"
  failedAttempts    Int      @default(0)
  lastFailedAt      DateTime?
  lockedUntil       DateTime?
  expiresAt         DateTime?                     // default now+90d; null only by explicit confirm
  revokedAt         DateTime?
  revokedReason     String?
  revokedByName     String?
  viewCount         Int      @default(0)
  firstViewedAt     DateTime?
  lastViewedAt      DateTime?
  anomalyNotifiedAt DateTime?
  createdById       String?
  createdByName     String?
  createdAt         DateTime @default(now())
  logs              PartnerAccessLog[]
  shareLinks        ShareLink[]

  @@index([dealId])
}

model PartnerAccessLog {
  id       String   @id @default(cuid())
  accessId String?                               // null for an unknown token
  access   PartnerAccess? @relation(fields: [accessId], references: [id], onDelete: SetNull)
  dealId   String?
  at       DateTime @default(now())
  outcome  String   // OK | NOT_FOUND | EXPIRED | REVOKED | INACTIVE | LOCKED | PASSWORD_REQUIRED | BAD_PASSWORD | UNLOCKED | RATE_LIMITED | DOC_OK | DOC_DENIED | RESALE_CREATED | RESALE_DENIED | RESALE_REVOKED | RESALE_VIEW
  path     String   // route pattern only: "/p/[code]", "/p/[code]/doc", "action:resale", "/s/[code]" (never the token or link code)
  tokenFp  String?  // first 8 hex of sha256(token), groups repeated probes
  ipHash   String?  // 16 hex of HMAC(ip /64 for IPv6 + ":" + YYYY-MM)
  country  String?  // x-vercel-ip-country
  uaClass  String?  // "mobile/safari", "desktop/chrome", "bot"
  detail   String?  // short machine codes only, e.g. "stones=3,mode=NEUTRAL"

  @@index([accessId, at(sort: Desc)])
  @@index([ipHash, at(sort: Desc)])
  @@index([at])
}

model PartnerRateLimit {
  key         String
  windowStart DateTime
  count       Int      @default(0)

  @@id([key, windowStart])
}

// ShareLink (existing): add
//   partnerDealId   String?
//   partnerDeal     PartnerDeal?   @relation(fields: [partnerDealId], references: [id], onDelete: Restrict)   // (v4) RESTRICT: a tagged link can never lose its deal
//   partnerAccessId String?                                                                                   // (v4) the access that minted it
//   partnerAccess   PartnerAccess? @relation(fields: [partnerAccessId], references: [id], onDelete: Restrict)
//   @@index([partnerDealId]) @@index([partnerAccessId])
// DigitalAsset (existing): add  partnerHidden Boolean?   // (v4) true = never shown to any partner or resale buyer
```
`ShareLink.createdById` is a plain string with no FK, so `partner:<partnerId>` is storable (verified).

### 2.2 Idempotent migration: `scripts/add-partner-deals.ts` (untracked, never committed)
Run `npx tsx scripts/add-partner-deals.ts` (pooled `DATABASE_URL`). One statement per `$executeRawUnsafe` (repo precedent). Run it twice to prove idempotence. Do NOT run `npm run db:push` (it already drops the two raw guard indexes). Additive only: new tables and nullable columns; it does NOT touch grants or RLS on any existing table (see 13.5 launch gate).
```ts
const stmts: string[] = [
 `CREATE TABLE IF NOT EXISTS "Partner" ("id" TEXT PRIMARY KEY, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'BROKER',
   "company" TEXT, "contactName" TEXT, "email" TEXT, "phone" TEXT, "country" TEXT, "notes" TEXT, "active" BOOLEAN NOT NULL DEFAULT true,
   "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
 `CREATE UNIQUE INDEX IF NOT EXISTS "Partner_code_key" ON "Partner"("code")`,
 // ... one CREATE TABLE IF NOT EXISTS per model, in dependency order:
 //   Partner, PartnerDeal, PartnerDealStone, PartnerSettlement, PartnerSettlementLine, PartnerAdjustment,
 //   PartnerPayout, PartnerAccess, PartnerAccessLog, PartnerRateLimit
 // Column mapping: id/text TEXT; booleans BOOLEAN NOT NULL DEFAULT ..; ints INTEGER NOT NULL DEFAULT 0;
 //   money NUMERIC(20,2); ratePct NUMERIC(5,2); times TIMESTAMP(3); createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
 //   updatedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; PartnerRateLimit PRIMARY KEY ("key","windowStart")
 `ALTER TABLE "ShareLink" ADD COLUMN IF NOT EXISTS "partnerDealId" TEXT`,
 `ALTER TABLE "ShareLink" ADD COLUMN IF NOT EXISTS "partnerAccessId" TEXT`,
 `CREATE INDEX IF NOT EXISTS "ShareLink_partnerDealId_idx" ON "ShareLink"("partnerDealId")`,
 `CREATE INDEX IF NOT EXISTS "ShareLink_partnerAccessId_idx" ON "ShareLink"("partnerAccessId")`,
 `ALTER TABLE "DigitalAsset" ADD COLUMN IF NOT EXISTS "partnerHidden" BOOLEAN`,
];
```
Then, each in its own statement:
1. **Indexes** `CREATE [UNIQUE] INDEX IF NOT EXISTS "<Table>_<cols>_idx"` for every `@@index/@@unique/@unique` above (including `PartnerAccess_tokenHash_key`, `PartnerPayout_reversalOfId_key`, the two `PartnerDealStone` uniques, `PartnerSettlement_dealId_seq_key`).
2. **FKs**, each `DO $$ BEGIN ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ...; EXCEPTION WHEN duplicate_object THEN NULL; END $$`: all `ON DELETE RESTRICT` (including `ShareLink.partnerDealId` and `ShareLink.partnerAccessId`) except `PartnerAccessLog.accessId` (`ON DELETE SET NULL`).
3. **CHECKs** (same DO/duplicate_object guard):
   - `PartnerDeal`: `method IN (4)`, `scope IN (2)`, `earnOn IN (2)`, `status IN (4)`, `ratePct IS NULL OR (ratePct > 0 AND ratePct <= 100)`, `maxShareTtlMinutes BETWEEN 10 AND 43200`; `status = 'DRAFT' OR method <> 'FIXED_FEE' OR fixedFee > 0`; `status = 'DRAFT' OR method NOT IN ('PROFIT_SHARE','SALE_COMMISSION','INVESTMENT') OR ratePct IS NOT NULL`; `status = 'DRAFT' OR method <> 'INVESTMENT' OR invested > 0`.
   - `PartnerDealStone`: `("roughStoneId" IS NULL) <> ("gemstoneId" IS NULL)`; `acquisitionOverride IS NULL OR acquisitionCurrency IS NOT NULL`; `weightMilli >= 0`.
   - `PartnerSettlement.amount > 0`; `PartnerSettlementLine.amount > 0`; `PartnerAdjustment.amount <> 0`; `PartnerPayout`: `amount > 0`, `direction IN ('PAID','RECEIVED')` (reversal rows are validated in code).
   - `ShareLink`: `"createdById" NOT LIKE 'partner:%' OR "partnerDealId" IS NOT NULL` (a partner-minted link can never be untagged).
4. **Append-only triggers** on `PartnerSettlement`, `PartnerSettlementLine`, `PartnerAdjustment`, `PartnerPayout` (row-level for UPDATE/DELETE, statement-level for TRUNCATE):
```sql
CREATE OR REPLACE FUNCTION partner_append_only() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql
DROP TRIGGER IF EXISTS "PartnerSettlement_append_only" ON "PartnerSettlement"
CREATE TRIGGER "PartnerSettlement_append_only" BEFORE UPDATE OR DELETE ON "PartnerSettlement" FOR EACH ROW EXECUTE FUNCTION partner_append_only()
DROP TRIGGER IF EXISTS "PartnerSettlement_no_truncate" ON "PartnerSettlement"
CREATE TRIGGER "PartnerSettlement_no_truncate" BEFORE TRUNCATE ON "PartnerSettlement" FOR EACH STATEMENT EXECUTE FUNCTION partner_append_only()
-- repeat the four DROP/CREATE statements for the other three tables
```
   Also `REVOKE TRUNCATE ON <four tables> FROM PUBLIC` where the role model allows.
5. **Deal terms lock and currency integrity triggers** (v4):
```sql
CREATE OR REPLACE FUNCTION partner_deal_terms_lock() RETURNS trigger AS $$ BEGIN
  IF (NEW."method", NEW."scope", NEW."earnOn", NEW."currency", NEW."ratePct", NEW."fixedFee", NEW."invested")
     IS DISTINCT FROM (OLD."method", OLD."scope", OLD."earnOn", OLD."currency", OLD."ratePct", OLD."fixedFee", OLD."invested")
     AND (EXISTS (SELECT 1 FROM "PartnerSettlement" WHERE "dealId" = OLD."id")
       OR EXISTS (SELECT 1 FROM "PartnerAdjustment" WHERE "dealId" = OLD."id")
       OR EXISTS (SELECT 1 FROM "PartnerPayout" WHERE "dealId" = OLD."id"))
  THEN RAISE EXCEPTION 'deal terms are frozen once a ledger row exists'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql
CREATE TRIGGER "PartnerDeal_terms_lock" BEFORE UPDATE ON "PartnerDeal" FOR EACH ROW EXECUTE FUNCTION partner_deal_terms_lock()   -- guarded with DROP TRIGGER IF EXISTS first
CREATE OR REPLACE FUNCTION partner_ledger_currency() RETURNS trigger AS $$ BEGIN
  IF NEW."currency" <> (SELECT "currency" FROM "PartnerDeal" WHERE "id" = NEW."dealId") THEN RAISE EXCEPTION 'currency must equal the deal currency'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql
-- BEFORE INSERT triggers on PartnerSettlement, PartnerAdjustment, PartnerPayout
```
   `rateOverrides`, `visibility`, `status`, notes and resale settings are NOT locked (frozen rates are written at the first settlement; see 5.4).
6. **RLS** for EVERY new table (the app role `postgres` has BYPASSRLS, so nothing breaks):
```sql
ALTER TABLE "<T>" ENABLE ROW LEVEL SECURITY
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON TABLE "<T>" FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON TABLE "<T>" FROM authenticated'; END IF;
END $$
```
7. **Verification block** in the same script: `relrowsecurity` true for all 10 tables; `has_table_privilege('anon','"PartnerDeal"','SELECT')` false; inside rolled-back transactions an `UPDATE`, a `DELETE` and a `TRUNCATE` on the ledger tables must each raise; a currency-mismatch insert must raise; a terms change after a ledger row must raise. Afterwards `npx prisma generate` and `npm run typecheck`.

---------------------------------------------------------------------------------------------------
## 3. Cost and revenue gathering (`src/lib/partner-gather.ts`, `import "server-only"` first line)

### 3.1 What the gatherer reads and never reads
- READ: `CostAllocation` (joined to `expense.status`), `SalesOrder` + `Payment` (WITHOUT relations), `GemstoneTransformation/TransformationInput/TransformationOutput`, `RoughStone`, `Gemstone`, `Reservation` (flag only), and the deal-stone overrides, frozen weights and `countSalesFrom`.
- NEVER read for numbers: `Gemstone.totalCost/costPerCt/currency` (only for the drift flag), `Expense` rows directly, GL, `Gemstone.status/RoughStone.status` (realisation follows non-cancelled `SalesOrder` rows only), `AuditLog`, `profitabilityOverview/pnl/salesOverview`, `toBase`.
- `CostAllocation.description` (contains supplier names and the FULL rough price via `fxNote`) is selected ONLY to feed one function `looksLikePartnerPayout(text, partnerNames): boolean` (flag POSSIBLE_PARTNER_PAYOUT_BILL); the text is never stored, never put in `detail`, evidence or any DTO (v4).
- Payouts and settlements are never Expenses (an `addStoneBill` payout would lower the profit it is computed from).

### 3.2 D15 verification
| Claim | Result |
|---|---|
| (a) reversals net to zero | Verified (journals POSTED+REVERSED; capital excludes DRAFT only). The GL holds only CAPITAL and MANUAL journals, so the engine does not read it. Stale comment `accounting.ts:123-125` is wrong; ignore. |
| (b) cutting allocates purchase + bills | Verified (`cutting/actions.ts:219-261`): share = OUTPUT weight / total output weight; per gem a `ROUGH_PURCHASE` line, one line per rough bill (type = ExpenseCategory), one merged `CUTTING` line; each `round2`, all in job currency, no `expenseId`, no pointer to the source line. Never run on real data (live DB: 0 transformations, `test-money.ts` does not cover it). |
| (c) stone bills capitalised, cancelled/rejected ignored | Verified with holes (rejecting a bill leaves its `CostAllocation`; cut copies of rejected bills are undetectable). |
| (d) money.ts / FX | Verified. No stored historical rates; fallback table 8-13% low and cached 1 h after one failed fetch; two different `toBase` functions. |
| (e) revenue ex tax, owed = totalAmount | Verified. |
| (f) one active reservation and one live sale per gem | Verified live (both partial unique indexes present). Hand-editing a gem status can still give SOLD with no order or AVAILABLE with a live order. |

### 3.3 Traps found and the engine's countermeasure
| Trap | Countermeasure |
|---|---|
| `changeAskingPrice` relabels `Gemstone.currency` without converting `totalCost` (about 330x for USD) | Cost recomputed from lines in their own currencies; stored total used only for flag COST_DRIFT (tolerance max(1.00, 1%)). |
| Double counting rough cost (rough lines + gem lines; two cuts of one rough) | A cut rough is never a unit; its price and pre-cut bills are never added; `>1` transformation per rough => MULTIPLE_CUTS (ACK). |
| Late rough bill (created after the cut) never reaches the gems | Allocated over the rough's gems by output weight (`allocateMinor`), flag LATE_ROUGH_BILL_ALLOCATED; uses `createdAt` (not backdatable `incurredAt`). No gems found (CONVERTED_NO_OUTPUT) => the bill cannot be placed: flag LATE_BILL_UNALLOCATED (ACK) (v4). If `CostAllocation.sourceAllocationId` is ever added, skip rough lines that have a gem line pointing at them. |
| Rejected bill keeps its `CostAllocation` | Own-bill lines with `expense.status = REJECTED` excluded; rough bills rejected AFTER the cut (copies carry no `expenseId`) => REJECTED_BILL_IN_CUT (ACK). |
| Rough price/weight/currency edited after cut | Gem lines are frozen numbers and used as is; PURCHASE_DRIFT when sum of gem `ROUGH_PURCHASE` lines differs from converted `purchasePrice` by more than 1.00. |
| Cut split is by OUTPUT weight, not value | Stated in the partner method note; admin may use `acquisitionOverride`. Hint: settle only when the lot is sold if gems differ widely in value. |
| Hand-edited statuses | Realisation from `SalesOrder` only; STATUS_MISMATCH; rough SOLD with no gems and no order => ROUGH_SOLD_NO_PROCEEDS. |
| Reservation deposits never become Payments | DEPOSIT_NOT_RECORDED when a deposit exists and the live order has zero payments. |
| Raw cross-currency payment sums, float `>=`, future `receivedAt`, no refund path, overpayment | Each payment converted to the ORDER currency individually, integer fractions, payments with `(receivedAt ?? saleDate) > asOf` ignored, `num` capped at `den` (OVERPAID info), negative payment rows summed and clamped to [0, den]. Rates are frozen on the deal at the first settlement (3.4), so a foreign-currency payment cannot drift the settled fraction (v4). |
| `toBase` silent fallback; fallback FX; no history | Own BigInt `convertMinor` returns null on a missing rate; per-currency source recorded; settlement refuses FALLBACK; first settlement freezes the used rates. |
| `round2` negative asymmetry, +/-0.01 per cut line | Integer minor, `divRound` half-away, `allocateMinor` largest remainder. |
| Parcel header vs stone prices; price 0 means "unknown" | Parcel header drift raises PARCEL_DRIFT (ACK) when every rough of the parcel is in the deal (v4); zero price with no override => COST_MISSING; allocator offers PARCEL_TOTAL. |
| Overhead categories on stone bills; `CA.type` mixes two enums | `excludedCostTypes` per deal (default RENT, SALARIES, TAX plus any commission/brokerage category in `ExpenseCategory`), OVERHEAD_EXCLUDED info, UNKNOWN_COST_TYPE ack. |
| A partner's own commission/payout filed as a stone bill (circular, double-reduces profit) | Excluded by default category; internal heuristic POSSIBLE_PARTNER_PAYOUT_BILL (ACK) when a line text contains a partner name or "commission"/"brokerage"; the add-bill dialog shows a warning when the stone is in a non-closed deal (v4). |
| Negative cost lines (`addCostAllocation` has no sign check) or negative price | Negative cost line => NEGATIVE_COST_LINE (ACK, included as a credit once acknowledged); negative price/fraction => NEGATIVE_AMOUNT (BLOCK), unit excluded (v4). The engine never throws for data problems. |
| Supplier names, staff names, full rough price in free text | `CostAllocation.description` (except the boolean heuristic), audit text, `buildLifecycleFor*`, `getGemstoneProvenance`, `genealogy` (operator, sibling gems, cuids, internal hrefs) are NEVER used for partner output. |
| Cancelled sale has no flow; re-sale gives 2 orders on one gem | Only the live order counts; cancelled orders' payments ignored, CANCELLED_WITH_PAYMENTS (INFO; closing the deal needs a typed confirmation; FORFEITED_DEPOSIT adjustment reason exists for retained money). |
| Stone already sold, cut or paid when attached | STONE_ALREADY_SOLD (BLOCK for M4, ACK otherwise) unless `countSalesFrom` is set; earlier sales are then ignored with PRE_DEAL_SALE_IGNORED (INFO) (v4). |
| Weight edits or cutting change deal-stone weights | Weights used by M3 and M4 are frozen at attach; WEIGHT_CHANGED (ACK) when a current weight differs from the frozen one (v4). |

### 3.4 Contracts
```ts
export type Db = PrismaClient | Prisma.TransactionClient;
export type RateSource = "LIVE" | "FALLBACK" | "MANUAL";
export interface RateMap { base: "LKR"; fetchedAt: string; perUnit: Record<string, { rate: string; source: RateSource }> } // LKR per 1 unit, 6-dp string; LKR implicit "1.000000"
export type Severity = "BLOCK" | "ACK" | "INFO";
export interface GatherFlag { code: string; severity: Severity; unitKey?: string; bucketKey?: string; detail: string } // detail is INTERNAL
export interface GatherResult { input: EngineInput; flags: GatherFlag[]; rates: RateMap; asOf: string; evidence: Evidence }
export async function collectCurrencies(db: Db, dealId: string): Promise<string[]>;                  // one SELECT DISTINCT pass
export async function buildRateMap(deal: { currency: string; rateOverrides: string | null }, needed: Iterable<string>): Promise<RateMap>;
export async function gatherDeal(db: Db, dealId: string, opts: { asOf: Date; rates: RateMap }): Promise<GatherResult>;
```
`buildRateMap` order per currency: `deal.rateOverrides[ccy]` (MANUAL; this includes rates frozen at the first settlement, shown to the admin with a "Frozen" badge) > `getExchangeRates()` when its `source` is live (LIVE) > fallback table (FALLBACK). Call `getExchangeRates()` directly (NOT `/api/exchange-rates`, which is auth-gated). Only needed currencies are stored. Rate strings: `(Math.round(x * 1e6) / 1e6).toFixed(6)`. `micro(c) = Math.round(Number(rate) * 1e6)` (LKR = 1_000_000).

(v4) **Overflow-safe conversion.** `convertMinor` is BigInt end to end and never multiplies JS numbers:
```ts
export function convertMinor(amt: Minor, from: string, to: string, micro: RateMicro): Minor | null {
  if (from === to) return amt;
  const a = micro[from], b = micro[to];
  if (a === undefined || b === undefined) return null;
  const r = Number(divRound(BigInt(amt) * BigInt(a), BigInt(b)));
  if (!Number.isSafeInteger(r)) throw new EngineInvariantError("convertMinor result not a safe integer");
  return r;
}
```
(100,000,000.00 LKR is 1e10 minor; times 1e6 micro is 1e16, above 2^53; see W35.) Assumption: every `PARTNER_CURRENCIES` entry has 2 minor digits (test asserts it).

### 3.5 Algorithm (queries and pseudocode)
```ts
const LIVE_SO = ["CONFIRMED","INVOICED","PARTIAL","PAID","SHIPPED","DELIVERED"];

// 1. deal and live deal stones
const deal = await db.partnerDeal.findUniqueOrThrow({ where: { id: dealId }, select: { id, method, scope, earnOn, currency, ratePct, fixedFee, invested, capitalProtected, excludedCostTypes } });
const ds = await db.partnerDealStone.findMany({ where: { dealId, removedAt: null }, orderBy: { addedAt: "asc" },
  select: { id, roughStoneId, gemstoneId, weightMilli, acquisitionOverride, acquisitionCurrency, investedAlloc, countSalesFrom, writtenOffAt,
    roughStone: { select: { id, code, status, weightCt, purchasePrice, currency,
      costAllocations: { select: { id, type, amount, currency, description, createdAt, expense: { select: { status: true } } } },
      transformationsAsInput: { select: { transformation: { select: { id, createdAt } } } } } },
    gemstone: { select: { id, code, status, weightCt, currency, totalCost } } } });      // totalCost ONLY for COST_DRIFT; description ONLY for looksLikePartnerPayout

// 2. derived gems of the deal roughs (depth is exactly 1)
const cutRoughIds = ds.filter(d => d.roughStone?.transformationsAsInput.length).map(d => d.roughStoneId!);
const derived = await db.gemstone.findMany({
  where: { transformationsAsOutput: { some: { transformation: { inputs: { some: { roughStoneId: { in: cutRoughIds } } } } } } },
  select: { id, code, weightCt, status, currency, totalCost,
    transformationsAsOutput: { select: { transformation: { select: { id, createdAt, inputs: { select: { roughStoneId: true } } } } } } } });
// unit rules: gem deal stone -> [that gem]; uncut rough -> [the rough] (ROUGH_UNCUT info);
// cut rough -> its derived gems (none found while status CONVERTED -> CONVERTED_NO_OUTPUT info).
// a unit seen under two deal stones keeps the first by addedAt and raises DUPLICATE_UNIT (BLOCK);
// a gem that is both a deal stone and a derived gem of a deal rough raises OVERLAP_ROUGH_GEM (BLOCK).

// 3. lines, orders (never customer), cancelled orders, deposits
const lines  = await db.costAllocation.findMany({ where: { gemstoneId: { in: gemUnitIds } }, select: { id, gemstoneId, type, amount, currency, description, createdAt, expense: { select: { status: true } } } });
const orders = await db.salesOrder.findMany({ where: { gemstoneId: { in: gemUnitIds }, status: { in: LIVE_SO } },
  select: { id, gemstoneId, status, saleDate, agreedPrice, totalAmount, currency, payments: { select: { id, amount, currency, receivedAt } } } });
const cancelled = await db.salesOrder.findMany({ where: { gemstoneId: { in: gemUnitIds }, status: "CANCELLED" }, select: { gemstoneId, payments: { select: { amount, currency } } } });
const deposits = await db.reservation.findMany({ where: { gemstoneId: { in: gemUnitIds }, status: { in: ["ACTIVE","CONVERTED"] }, deposit: { gt: 0 } }, select: { gemstoneId, deposit, currency } });

// 4. per-unit cost, in deal-currency minor, every line converted ONCE then rounded, then summed
function lineMinor(l): Minor | null | "REJECTED" | "EXCLUDED" {
  if (l.expense?.status === "REJECTED") return "REJECTED";
  if (excluded.has(l.type)) return "EXCLUDED";                     // INFO OVERHEAD_EXCLUDED
  return convertMinor(decimalToMinor(l.amount), l.currency, deal.currency, micro);   // null => needs rate
}
// basis (acquisition component) = sum of lines with type === "ROUGH_PURCHASE"; other = all other eligible lines.
// uncut rough unit: basis = convert(purchasePrice) (price 0/null without override => COST_MISSING), other = its own bills.
// cut rough: late = rough lines with createdAt > min(transformation.createdAt), not rejected, not excluded;
//   lateShares = allocateMinor(sum(late), gem output weights in milli-carats) when the rough has >= 1 derived gem, else LATE_BILL_UNALLOCATED;
//   unit.other += share. Rough price and pre-cut bills are NEVER added.
// acquisitionOverride (frozen by the allocator): replaces the unit's basis; distributed over the deal stone's units by weight with allocateMinor.
// any null line => unit.costMinor = null and basisMinor = null; flag NEEDS_RATE_COST (ACK for M1/M4, INFO for M2/M3).
// a negative line => NEGATIVE_COST_LINE (ACK); a negative unit cost total => unit unusable (NEGATIVE_AMOUNT, BLOCK).
// unit.costMinor = basis + other.

// 5. revenue and realisation fraction per unit (asOf = now)
const live = orders.filter(o => o.gemstoneId === unit.id && o.saleDate <= asOf && (!dsRow.countSalesFrom || o.saleDate >= dsRow.countSalesFrom));
if (live.length > 1) flag(MULTIPLE_LIVE_SALES, BLOCK);
if (live.length === 1) {
  const o = live[0];
  const price = convertMinor(minor(o.agreedPrice), o.currency, deal.currency, micro);   // ex tax; null => NEEDS_RATE_SALE (ACK); < 0 => NEGATIVE_AMOUNT (BLOCK)
  let num = 1, den = 1;
  if (deal.earnOn === "PAYMENT") {
    den = minor(o.totalAmount) > 0 ? minor(o.totalAmount) : minor(o.agreedPrice);       // order currency; <= 0 => ZERO_PRICE_SALE (ACK), sale = null
    let paid = 0, bad = false;
    for (const p of o.payments) {
      if ((p.receivedAt ?? o.saleDate) > asOf) continue;
      const v = convertMinor(minor(p.amount), p.currency, o.currency, micro);           // order currency
      if (v == null) { bad = true; continue; }                                          // NEEDS_RATE_PAYMENT (ACK)
      paid += v;
    }
    num = bad ? null : Math.max(0, Math.min(paid, den));                                // overpaid => OVERPAID (INFO)
  }
  unit.sale = { orderId: o.id, priceMinor: price, fracNum: num, fracDen: den };         // orderId feeds realizationKey only
}
// weights: weightMilli = Math.round(Number(weightCt) * 1000)  (current unit weights; the deal-stone weight is the FROZEN ds.weightMilli)
// M4: group.investedMinor = decimalToMinor(ds.investedAlloc) for BOTH scopes (must exist; else INVESTED_MISMATCH BLOCK)
// checks: COST_DRIFT, PURCHASE_DRIFT, PARCEL_DRIFT, STATUS_MISMATCH, DEPOSIT_NOT_RECORDED, MULTIPLE_CUTS, REJECTED_BILL_IN_CUT,
//   WEIGHT_CHANGED, STONE_ALREADY_SOLD, FEE_EXCEEDS_REVENUE, POSSIBLE_PARTNER_PAYOUT_BILL, COST_BASIS_DIVERGES_ACROSS_DEALS
```
Eligible-cost policy: all lines except `excludedCostTypes` and rejected ones. The admin Deal page shows a table "Cost types in this deal" (type, amount, included checkbox) that writes `excludedCostTypes`.

### 3.6 Explicit allocation rules (D7)
Helper (pure, A): `allocateMinor(total, weights)` computes with BigInt `base_i = floor(|T| * w_i / W)`, remainders `r_i = (|T| * w_i) mod W`, hands the leftover minor units one each to the largest remainders (ties to the lower index), re-applies the sign; `W = 0` falls back to equal weights; an EMPTY weights array throws (callers raise LATE_BILL_UNALLOCATED / ALLOCATION_INCOMPLETE instead) (v4). Parts always sum to the total exactly. Weights are integers (milli-carats or Minor).
- (a) **Rough -> several gems:** existing cut shares (output weight) already sit on the gem lines; late bills use the same weights.
- (b) **Several roughs from one Parcel:** default each stone's own `purchasePrice`; the attach UI shows `drift = convert(parcel.totalCost) - sum(stone prices)`; allocator `PARCEL_TOTAL` (enabled only when ALL roughs of the parcel are in the deal) spreads `parcel.totalCost` by milli-carats into `acquisitionOverride` (`acquisitionSource = PARCEL_TOTAL`). "Add all roughs of parcel" expands to explicit rows at that moment (membership is dynamic). Activation requires the admin to choose stone prices or PARCEL_TOTAL when PARCEL_DRIFT exists (v4).
- (c) **POOLED stones with no individual cost:** allocator `POOL_LUMP` takes a lump (amount, currency) and basis `WEIGHT` (default) or `EQUAL`; stones that already have an override keep it; `remainder = lump - sum(overrides)`; `remainder < 0` returns an error (no write). Remainder is allocated over the other stones and written as frozen overrides (so later weight changes do not move it). `MANUAL` takes explicit per-stone values (every non-overridden stone required).
- Parcel-level extras (transport/customs cannot be filed on a parcel) go inside the lump or as per-rough bills.
- Override replaces only the `ROUGH_PURCHASE`-type component; `0` means explicitly free; a rough with price 0 and no override is "unknown" (COST_MISSING).
- **Overlap rule (hard):** within one deal a rough and a gem derived from it cannot both be deal stones; no stone twice in a deal; the same partner cannot have two non-closed deals covering the same stone footprint. Across deals (co-partners) overlap is fine, but different effective costs for the same unit raise COST_BASIS_DIVERGES_ACROSS_DEALS (ACK) (v4).
- **Frozen weight (v4):** `attachStonesToDeal` writes `PartnerDealStone.weightMilli` from the stone's weight at attach time.

### 3.7 Flag catalogue (`GatherFlag.severity`)
- **BLOCK** (settlement refused): DUPLICATE_UNIT, OVERLAP_ROUGH_GEM, MULTIPLE_LIVE_SALES, APPROX_RATES_USED (settlement only), CO_PARTNER_CAP_EXCEEDED, CO_PARTNER_TOTAL_EXCEEDS_REVENUE, INVESTED_MISMATCH, INVESTED_EXCEEDS_BASIS (invested principal of a stone exceeds that stone's total eligible cost; v4: BLOCK, was ACK), ALLOCATION_INCOMPLETE, NEGATIVE_AMOUNT, STONE_ALREADY_SOLD (M4 only).
- **ACK** (settlement needs an explicit acknowledgement stored in `PartnerSettlement.flags`; excluded units earn 0 now and flow into a later settlement once fixed): NEEDS_RATE_COST (M1/M4 only), NEEDS_RATE_SALE, NEEDS_RATE_PAYMENT, COST_MISSING, ZERO_PRICE_SALE, ROUGH_SOLD_NO_PROCEEDS, MULTIPLE_CUTS, REJECTED_BILL_IN_CUT, COST_DRIFT, PURCHASE_DRIFT, PARCEL_DRIFT, STATUS_MISMATCH, DEPOSIT_NOT_RECORDED, UNKNOWN_COST_TYPE, STONE_ALREADY_SOLD (non-M4), WEIGHT_CHANGED, LATE_BILL_UNALLOCATED, NEGATIVE_COST_LINE, POSSIBLE_PARTNER_PAYOUT_BILL, FEE_EXCEEDS_REVENUE, COST_BASIS_DIVERGES_ACROSS_DEALS.
- **INFO**: CANCELLED_WITH_PAYMENTS, OVERPAID, FUTURE_SALE, PRE_DEAL_SALE_IGNORED, OVERHEAD_EXCLUDED, ROUGH_UNCUT, CONVERTED_NO_OUTPUT, LATE_ROUGH_BILL_ALLOCATED, ACQUISITION_OVERRIDDEN, APPROX_RATES (estimate), OBLIGATIONS_EXCEED_PROFIT (admin Checks panel), TOTAL_WEIGHT_ZERO, NEEDS_RATE_COST (M2/M3).
The partner never sees flag text; only the fixed notices `INCOMPLETE_DATA` (any excluded unit or BLOCK flag) and `APPROX_RATES`.

### 3.8 Optional prerequisite fixes (none required; each makes a flag disappear)
(1) `changeAskingPrice` must call `recomputeGemCost`/stop writing `Gemstone.currency`; (2) rejecting a bill should neutralise its `CostAllocation`; (3) nullable `CostAllocation.sourceAllocationId`; (4) guard a second transformation per rough; (5) AddBillButton default categories and a partner-deal warning; (6) cancel-sale flow; (7) store the order-currency amount on `Payment`; (8) sign check on `addCostAllocation`.

---------------------------------------------------------------------------------------------------
## 4. Payout engine

Files `src/lib/partner-money.ts` and `src/lib/partner-engine.ts`: PURE (no prisma, no `server-only`), runnable with plain `npx tsx`.

### 4.1 Money primitives (`partner-money.ts`)
```ts
export type Minor = number;                      // safe integer, 2 dp
export interface Rat { n: bigint; d: bigint }    // normalised by gcd, d > 0
export function divRound(n: bigint, d: bigint): bigint;       // half AWAY from zero: sign * ((2|n| + |d|) / (2|d|))
export const mulBp   = (m: Minor, bp: number): Minor => Number(divRound(BigInt(m) * BigInt(bp), 10000n));
export const mulFrac = (m: Minor, num: number, den: number): Minor => Number(divRound(BigInt(m) * BigInt(num), BigInt(den))); // den > 0
export function ratFrom(n: number, d: number): Rat;  export function ratAdd(a: Rat, b: Rat): Rat;  export function ratMulInt(a: Rat, k: number): Rat;
export function mulRat(m: Minor, r: Rat): Minor;          // divRound(m*n, d)
export function bpFromPct(pct: string | number): number; // exact; throws if > 2 dp or outside (0,100]
export function decimalToMinor(v: { toString(): string } | string | number): Minor; // parses the decimal STRING exactly, half away at 2 dp, asserts safe integer (never Number()*100)
export const minorToMajor = (m: Minor): number => m / 100;                          // display only, never fed back
export const minorToDecimalString = (m: Minor): string;                              // "-123.45" for Decimal(20,2) writes
export function allocateMinor(total: Minor, weights: number[]): Minor[];            // section 3.6; empty array throws
export type RateMicro = Record<string, number>;                                      // { LKR: 1_000_000, USD: 330_500_000 }
export function convertMinor(amount: Minor, from: string, to: string, micro: RateMicro): Minor | null;   // BigInt only, see 3.4
export function microFromRates(r: RateMap): RateMicro;
```
**Rounding rules:** every derived quantity is rounded exactly once, half away from zero. Per-unit recognised revenue and cost are rounded rows; bucket totals are sums of rows. Weight fractions and principal release use exact rationals (`Rat`) with one final rounding. Adjustments are DIFFERENCES of two integers (never `round(a - b)` of floats), so negative rounding never occurs. Integer minor units are mandatory (no floats, no `Decimal` inside the engine); Decimals appear only at the DB edge. Half-away rounding favours the partner on positive ties by at most 0.005 per rounded amount; documented, not "drift-free".

### 4.2 Interfaces
```ts
export const FORMULA_VERSION = "pd-1.0.0";
export type Method = "PROFIT_SHARE" | "SALE_COMMISSION" | "FIXED_FEE" | "INVESTMENT";
export type Scope = "PER_STONE" | "POOLED";
export interface SaleInput { orderId: string; priceMinor: Minor | null; fracNum: number | null; fracDen: number }  // null price = needs rate; null fracNum = payments need rate
export interface BaseUnit { unitKey: string; weightMilli: number; sale: SaleInput | null }          // sale null = not sold; weightMilli = CURRENT unit weight
export interface CostUnit extends BaseUnit { costMinor: Minor | null; basisMinor: Minor | null }    // null = needs rate / missing
export interface Group<U> { groupKey: string; weightMilli: number;            // weightMilli = deal-stone weight FROZEN at attach (0 = unknown)
  investedMinor?: Minor | null; writtenOff?: boolean; units: U[] }
export type Terms =
  | { method: "PROFIT_SHARE";    scope: Scope; rateBp: number }
  | { method: "SALE_COMMISSION"; scope: Scope; rateBp: number }
  | { method: "FIXED_FEE";       scope: Scope; feeMinor: Minor }
  | { method: "INVESTMENT";      scope: Scope; rateBp: number; investedMinor: Minor; capitalProtected: boolean };
export interface EngineHeader { formulaVersion: string; currency: string; earnOn: "SALE" | "PAYMENT" }
export type ProfitInput     = EngineHeader & { terms: Extract<Terms, { method: "PROFIT_SHARE" }>;    groups: Group<CostUnit>[] };
export type RevenueInput    = EngineHeader & { terms: Extract<Terms, { method: "SALE_COMMISSION" }>; groups: Group<BaseUnit>[] };   // no cost field exists
export type WeightInput     = EngineHeader & { terms: Extract<Terms, { method: "FIXED_FEE" }>;       groups: Group<BaseUnit>[] };   // no cost field exists
export type InvestmentInput = EngineHeader & { terms: Extract<Terms, { method: "INVESTMENT" }>;      groups: Group<CostUnit>[] };
export type EngineInput = ProfitInput | RevenueInput | WeightInput | InvestmentInput;

export type Need = "salePrice" | "paymentsReceived" | "purchaseCost" | "costBreakdown" | "profit";
export interface ExplainLine { key: string; label: string; amountMinor: Minor | null; needs: Need[] }   // shown only if every need's flag is on
export interface UnitResult { unitKey: string; usable: boolean; excludedReason: "NEEDS_RATE" | "COST_MISSING" | "NO_SALE" | "INVALID" | null;
  recognizedRevenueMinor: Minor; recognizedCostMinor: Minor }
export interface BucketResult { bucketKey: string; groupKeys: string[]; soldUnitKeys: string[];
  revenueMinor: Minor; costMinor: Minor; profitMinor: Minor;               // recognised (fraction applied), usable sold units only
  realizedFraction: { n: string; d: string };                               // exact deal-stone-weighted fraction as decimal strings
  principalReleasedMinor: Minor; capitalReturnedMinor: Minor;               // M4, else 0
  profitShareMinor: Minor; commissionMinor: Minor; feeMinor: Minor;
  amountMinor: Minor; realizationKey: string; units: UnitResult[]; lines: ExplainLine[] }
export interface EngineResult { formulaVersion: string; currency: string; method: Method; scope: Scope; earnOn: string;
  totalMinor: Minor; capitalOutstandingMinor: Minor | null; capitalWrittenOffMinor: Minor | null; buckets: BucketResult[] }

export function computeProfitShare(i: ProfitInput): EngineResult;          // M1
export function computeSaleCommission(i: RevenueInput): EngineResult;      // M2
export function computeFixedFee(i: WeightInput): EngineResult;             // M3
export function computeInvestment(i: InvestmentInput): EngineResult;       // M4
export function runEngine(i: EngineInput): EngineResult;                   // dispatch on terms.method
export const ENGINES: Record<string, (i: EngineInput) => EngineResult>;   // { "pd-1.0.0": runEngine }; old versions stay forever
export function validateTerms(t: TermsDraft): string[];                    // human errors
export class EngineInvariantError extends Error {}
```
Invariants (throw `EngineInvariantError`, reserved for PROGRAMMING errors; data problems are screened out by the gatherer as unit flags): `fracDen > 0`; `0 <= fracNum <= fracDen`; all integers safe; `rateBp` in (0, 10000]; no duplicate `unitKey`; M4 `sum(group.investedMinor) === terms.investedMinor` for both scopes.

### 4.3 Steps shared by every method
Per bucket (PER_STONE: one bucket per group, `bucketKey = groupKey`; POOLED: one bucket `"POOL"` holding all groups), over its units `U`:
1. **Usable** unit: M1/M4 need `sale != null`, `priceMinor != null && >= 0`, `fracNum != null`, `costMinor != null && >= 0`; M2 needs price (`>= 0`) and fraction (no cost); M3 needs only `sale != null` and `fracNum != null`. Unusable units contribute 0 and carry `excludedReason` (INVALID for negative amounts).
2. For usable units: `rev_u = mulFrac(price, num, den)`; M1/M4 also `cost_u = mulFrac(costMinor, num, den)`.
3. `R = sum rev_u`; `C = sum cost_u`; `P = R - C`.
4. **Realised fraction** (v4, deal-stone level). Within a group `g`: `w_u = weightMilli` of the unit (if ANY unit of the group has weight <= 0, all `w_u = 1`); `g_g = (sum w_u * f_u) / (sum w_u)` with `f_u = num/den` for a usable sold unit, else 0 (a rough lot's gems are weighted by current gem weights). Across groups: `W_g = group.weightMilli` (frozen; if ANY `W_g <= 0` in the bucket, all `W_g = 1`); `F = (sum W_g * g_g) / (sum W_g)` as an exact `Rat`. For PER_STONE one group gives `F = g_g`. Cutting a rough or editing a weight therefore cannot change a pooled M3 fee or release.
5. `earnOn` enters ONLY through `num/den` (SALE: 1/1 for a recognised live order; PAYMENT: min(paid, total)/total).
6. `realizationKey = sha256(sorted "unitKey:orderId:num/den" for sold units, joined by "|")` (v4: includes the live order id, so a cancelled-and-re-sold stone always changes key; price is deliberately NOT in the key, so a price correction is a PRICE_CHANGE adjustment).
7. `totalMinor = sum bucket amounts`; every bucket amount is rounded once, so rows always add up.

### 4.4 Formulas (one function per method; scope changes only bucket membership)
**M1 PROFIT_SHARE** (cost-dependent)
- PER_STONE: for each deal stone bucket `amount_b = mulBp(max(0, R_b - C_b), rateBp)`; `total = sum amount_b`. A rough lot nets its sold gems first.
- POOLED: `amount = mulBp(max(0, R - C), rateBp)` over all sold usable units of the deal; unsold stones' costs are excluded until they sell.
- Lines: Revenue (`salePrice`), Eligible costs (`purchaseCost`+`costBreakdown`), Profit (`profit`), Your share.

**M2 SALE_COMMISSION** (revenue only; never reads cost)
- PER_STONE: `amount_b = mulBp(R_b, rateBp)`; POOLED: `amount = mulBp(R, rateBp)` computed on pooled revenue (can differ from the PER_STONE total by at most 1 minor unit per stone through rounding; shown as such). Earned at a loss as well.
- Lines: Sale proceeds (`salePrice`), Your commission.

**M3 FIXED_FEE** (no price, no cost)
- PER_STONE: `amount_b = mulRat(feeMinor, F_b)` (one fee per deal stone, scaled by that stone's realised weight fraction). POOLED: `amount = mulRat(feeMinor, F_pool)` (once for the lot). `sum W = 0` is impossible (weights fall back to 1).
- Lines: Agreed fee, Realised share of the stones (`paymentsReceived` only if PAYMENT), Your fee. FEE_EXCEEDS_REVENUE (ACK) is raised by the gatherer when `amount_b` exceeds the bucket's recognised revenue.

**M4 INVESTMENT** (principal back + percentage of profit)
- Principal attribution (v4, both scopes): each group carries its frozen `investedMinor` (`PartnerDealStone.investedAlloc`); `I_b = sum of the bucket's group investedMinor`. For each group the released fraction is `r_g = (sum s_u * f_u) / (sum s_u)` over its units with `s_u = basisMinor_u` (if any `basisMinor` in the group is null or `sum s_u = 0`, `s_u = weightMilli_u`, then 1). `principalReleased = divRound(sum_g (investedMinor_g * r_g))` as ONE exact `Rat` sum and one rounding.
- Capital returned: let `cap = min(principalReleased, C)` where `C` is the bucket's recognised cost (v4: capital can never exceed what the stones cost). If `R >= C`: `capital = cap`; else if `capitalProtected`: `capital = min(principalReleased, R)` (investor-first); else (pari-passu, default): `capital = C > 0 ? divRound(principalReleased * R, C) : principalReleased`, then `capital = min(capital, R)`.
- `profitShare = mulBp(max(0, R - C), rateBp)`; `amount = capital + profitShare`. Invariant (asserted): `capital + profitShare <= R` and `capital <= principalReleased`.
- `capitalOutstandingMinor = terms.investedMinor - sum principalReleased - sum(written-off group principal)`; `capitalWrittenOffMinor = sum investedMinor of groups with writtenOff` (informational: capital at work vs capital written off; not owed).
- The investor's percentage is the agreed percentage of profit; it is NOT scaled by how much of the cost they funded. INVESTED_EXCEEDS_BASIS (BLOCK for settlement) when a group's `investedMinor` exceeds the total eligible cost of that deal stone; the estimate still renders using the cap above.
- Lines: Capital returned, Profit (`profit`), Your share of profit, Total.

Zero revenue or nothing sold: every method returns 0 for that bucket (M4 capital stays outstanding).

### 4.5 Co-partner and term validation (`validateTerms`, `validateCoPartnerCaps`, A)
- Hard errors: `ratePct` required for M1/M2/M4 with 0 < x <= 100 and at most 2 dp; `fixedFee > 0` for M3; `invested > 0` for M4; M1/M2/M3 must not carry `invested`/`capitalProtected`; M4 requires `sum(investedAlloc) == invested` (both scopes) before activation; `poolAcquisitionCost` only for POOLED; `currency` in `PARTNER_CURRENCIES`; `scope/earnOn/method` in enums.
- **Co-partner caps**, evaluated on each stone's FOOTPRINT (the rough id plus its derived gem ids, or the gem id; so a deal on a rough conflicts with a deal on one of its gems) across deals in DRAFT or ACTIVE: `sum(ratePct of M1 and M4) <= 100` per footprint unit (ERROR CO_PARTNER_CAP_EXCEEDED, blocks attach and activation; warn above 50, and warn above a configurable 90 as a company floor); `sum(ratePct of M2) <= 100` (ERROR; warn above 25). Each % applies to the SAME company-level profit/revenue; other partners' payouts are never costs. Same partner twice on one footprint in two non-closed deals: error.
- **Aggregate obligation check** (v4, `checkObligations(db, dealId)`, admin-only, run on activation, attach, every reconcile preview and shown on the stone's Partners tab): take the set S of non-closed deals sharing any footprint unit with this deal; run the engine for each; let `Obl = sum totalMinor(S)` (M4 capital returned counts, it is paid out of revenue) and `Rev = sum recognised revenue of the union of sold footprint units (each unit once)`. `Obl > Rev` => BLOCK CO_PARTNER_TOTAL_EXCEEDS_REVENUE (reconcile refused until fixed; W33). Separately `Obl - capital returned > company realised profit` => INFO OBLIGATIONS_EXCEED_PROFIT (expected with PER_STONE floors, W34).
- Re-checked on attach, edit, activation; shown on the stone's Partners tab.

### 4.6 Versioning
`formulaVersion` is written on every settlement and pinned on the deal. Any change to a formula, rounding step, flag semantics or fraction definition = a new version string with a new function in `ENGINES`; old keys are never edited. `replaySettlement(id)` runs `ENGINES[version](JSON.parse(inputs).input)` and compares the canonical JSON with `result` (admin "Verify" button; also in tests for every created settlement). Upgrading a deal to a new version is an explicit admin action that produces an adjustment.

### 4.7 Worked examples (LKR; all must be golden tests; "f" = realised fraction; Minor = amount x 100)
| # | Setup | Intermediate values | Result |
|---|---|---|---|
| W1 | M1 PER_STONE SALE, 10%. P 1,000,000; K 600,000 | R 1,000,000; C 600,000; P 400,000; 400,000 x 1000bp/10000 | **40,000.00** |
| W2 | M1 loss. P 500,000; K 600,000 | profit -100,000, floored 0 | **0.00** |
| W3 | M1 10%. A (P 1,000,000, K 600,000), B (P 300,000, K 400,000), C unsold K 500,000 | PER_STONE: A 40,000 + B 0. POOLED over sold: R 1,300,000; C 1,000,000; profit 300,000 (C excluded) | PER_STONE **40,000.00**; POOLED **30,000.00** |
| W4 | M1 PAYMENT, 10%. P 1,000,000, tax 100,000, total 1,100,000; paid 440,000; K 600,000 | f = 440,000/1,100,000 = 2/5; rev 400,000; cost 240,000; profit 160,000. Later fully paid: rev 1,000,000; cost 600,000; profit 400,000 | **16,000.00**, then 40,000.00; second settlement line **24,000.00** (with SALE it would be 40,000 at once) |
| W5 | Half-cent tie. M1 10%, profit 10.05 | 1,005 x 1000 / 10,000 = 100.5 exactly -> half away from zero; float evaluation of the same tie is order-dependent | **1.01** |
| W6 | Foreign sale WITH rate. M1 10%, K 600,000 LKR; sale USD 3,000.00 (300,000 minor) full; manual rate 330.50 (micro 330,500,000) | price = 300,000 x 330,500,000 / 1,000,000 = 99,150,000 minor = 991,500.00; profit 391,500 | **39,150.00** |
| W7 | Same sale WITHOUT any rate (no override, no live) | convertMinor null; `priceMinor` null; unit unusable; flag NEEDS_RATE_SALE (ACK) | estimate **0.00** with "figures being finalised"; settle only after ack; when a rate is added the realisation changes and a later settlement picks it up |
| W8 | Payment in a different currency. M1 10%, PAYMENT; order 1,000,000.00 LKR (tax 0); payment USD 1,500.00 at 330.50; K 600,000 | payment = 150,000 x 330,500,000 / 1,000,000 = 49,575,000 minor = 495,750.00 (order ccy); f = 49,575,000/100,000,000; rev 495,750.00; cost 600,000 x f = 297,450.00; profit 198,300.00 | **19,830.00** |
| W9 | Cost line in EUR without a rate. Sale 1,000,000 LKR; acquisition 400,000 LKR + EUR 1,000 bill (no EUR rate) | M1: cost null, unit unusable (NEEDS_RATE_COST ACK) => 0. M2 5%: cost not read => 1,000,000 x 5%. M3: unaffected | M1 **0.00**; M2 **50,000.00** |
| W10 | M2 PER_STONE 5%. P 1,000,000, K 100,000 or K 900,000 | cost ignored. Loss case P 500,000, K 600,000 | **50,000.00** both; loss case **25,000.00** |
| W11 | M2 5.5% (550 bp). Two stones, each P 100.10 | each 10,010 x 550/10,000 = 550.55 -> 551 = 5.51; PER_STONE 11.02. POOLED 20,020 x 550/10,000 = 1,101.1 -> 1,101 | PER_STONE **11.02**; POOLED **11.01** (documented 1 minor-unit difference) |
| W12 | M2 PAYMENT 5%. P 1,000,000, total 1,080,000, paid 540,000 | f = 1/2; rev 500,000 | **25,000.00** |
| W13 | M3 fee 20,000. s1 5.000 ct f=1; s2 3.000 ct paid 50% (f=1/2); s3 2.000 ct unsold (frozen weights 5000/3000/2000) | PER_STONE: s1 20,000; s2 20,000 x 1/2 = 10,000; s3 0. POOLED: F = (5000 + 1500 + 0)/10000 = 13/20; 20,000 x 13/20 | PER_STONE **30,000.00**; POOLED **13,000.00** |
| W14 | M3 POOLED fee 60,000; four 1.000 ct gems, 3 fully sold | F = 3000/4000 = 3/4 | **45,000.00** |
| W15 | M4 PER_STONE SALE 30%. I 600,000; K 600,000 (all basis); P 1,000,000 | principalReleased 600,000 x 1 = 600,000; cap = min(600,000, C 600,000); R >= C so capital 600,000; profit 400,000 -> 120,000 | **720,000.00** (capital 600,000 + share 120,000) |
| W16 | M4 loss. K 600,000 (basis 600,000); I 300,000; P 450,000; f=1; 30% | released 300,000; profit 0. Pari-passu: 300,000 x 450,000/600,000. Protected: min(300,000, 450,000) | pari-passu **225,000.00**; capitalProtected **300,000.00** |
| W17 | M4 partial payment. I 600,000; K 600,000; P 1,000,000, tax 0, paid 50%; 30% | f 1/2; R 500,000; C 300,000; released 600,000 x 1/2 = 300,000; cap = min(300,000, 300,000); R >= C so capital 300,000; profit 200,000 -> 60,000 | **360,000.00**; capital outstanding 300,000 |
| W18 | M4 I 1,000,000, 40%. A (K 400,000 sold 700,000), B (K 600,000 sold 450,000), both f=1; frozen alloc A 400,000 / B 600,000 | POOLED: R 1,150,000; C 1,000,000; profit 150,000 -> 60,000; released 400,000 + 600,000 = 1,000,000; capital 1,000,000. PER_STONE: A 400,000 + 40% x 300,000 = 520,000; B pari-passu 600,000 x 450,000/600,000 = 450,000, profit 0 | POOLED **1,060,000.00**; PER_STONE **970,000.00** |
| W19 | M4 POOLED partial sale, 20%. 3 gems each K=basis 1,000,000; I 3,000,000 (frozen alloc 1,000,000 each); only gem 1 sold at 1,500,000 fully paid | R 1,500,000; C 1,000,000; profit 500,000 -> 100,000; released = 1,000,000 (gem 1) + 0 + 0; R >= C | **1,100,000.00**; outstanding 2,000,000 |
| W20 | Co-partners on one stone (P 1,000,000, K 600,000, profit 400,000). Hassan M1 10%, Maria M1 5% | each computed on the same 400,000: 40,000 and 20,000; cap 15 <= 100. A third M1 at 90% => 105 > 100 refused | **40,000.00** and **20,000.00** |
| W21 | Cost added AFTER settlement. M1 10% PER_STONE. Stone A: P 1,000,000, K 600,000 | S1 line A 40,000 (creditedBefore 0); payout 40,000; balance 0. A 50,000 shipping bill: K 650,000; engine A = 35,000; delta -5,000 (>= materiality 40.00), realisation unchanged => adjustment -5,000 COST_CHANGE (S1 untouched); position 35,000; **balance = -5,000** (carried forward). Stone B sells, profit 200,000 => engine B 20,000, no prior key => settlement line B 20,000 | position 55,000; paid 40,000; **balance +15,000.00** (20,000 net of the 5,000 carried forward) |
| W22 | Rough split into 3 gems, only some sold, late bill. Deal stone = ROUGH, M1 10% PER_STONE, SALE. Rough purchase 900,000, pre-cut bill 90,000, cutting 60,000; gems 6.000/3.000/1.000 ct (shares 60/30/10%). Gem lines: purchase 540,000/270,000/90,000; bill 54,000/27,000/9,000; cutting 36,000/18,000/6,000 | costs 630,000 / 315,000 / 105,000 (sum 1,050,000 = 900,000+90,000+60,000; rough's own 900,000 and 90,000 NOT added again). g1 sold 1,000,000: profit 370,000 -> **37,000.00** (settlement line). g2 sold 250,000: R 1,250,000; C 945,000 (g3 unsold excluded); profit 305,000 -> **30,500.00**; delta -6,500, realisation changed => adjustment -6,500 NETTING. Late 10,000 rough bill (createdAt after cut) allocated 6,000/3,000/1,000: C 954,000; profit 296,000 -> **29,600.00**; delta -900 (>= materiality 30.50), realisation unchanged => adjustment -900 COST_CHANGE | **37,000.00 -> 30,500.00 -> 29,600.00**; position 29,600 |
| W23 | Parcel and lump allocation. Parcel header 1,000,000; roughs 5.000/3.000/2.000 ct priced 400,000/300,000/200,000 (sum 900,000, drift 100,000) | default cost = stone prices, PARCEL_DRIFT shown. PARCEL_TOTAL by milli-carats: 1,000,000 x 5000/10000 etc. Lump 100,000.00 EQUAL over 3: 10,000,000 minor / 3 = 3,333,333 rem 1 | **500,000.00 / 300,000.00 / 200,000.00**; lump **33,333.34 / 33,333.33 / 33,333.33** |
| W24 | POOLED M1 10% with a lump. POOL_LUMP 1,000,000; gem 3 has MANUAL override 250,000; G1 5.000 ct, G2 3.000 ct | remainder 750,000 -> allocateMinor by 5000:3000 = 468,750 / 281,250. G1 sold 700,000, G2 sold 400,000, G3 unsold (its 250,000 excluded). Profit 1,100,000 - 750,000 = 350,000 | **35,000.00** |
| W25 | Cancelled sale then re-sale. M2 5%, PAYMENT. SO1 P 1,000,000 fully paid; settled 50,000 | SO1 becomes CANCELLED (payments 1,000,000 remain: INFO refundPending, no refund flow exists). Engine 0, realisation key changed (order id), delta -50,000 => adjustment -50,000 SALE_CANCELLED; position 0. SO2 P 900,000 fully paid: engine 45,000; last key (stored on the adjustment) differs => settlement line 45,000 | **-50,000.00** then **+45,000.00**; position 45,000 |
| W26 | Zero revenue and overpayment. Sold under PAYMENT, nothing paid (M1 10%, M2 5%, M3 fee 30,000). Separate: paid 1,200,000 vs total 1,100,000 | f = 0 => every method 0 (estimate shows "Awaiting payment"). Overpaid: num capped at den, f = 1, INFO OVERPAID 100,000 | **0.00** for all; overpaid f=1 |
| W27 | Negative symmetry. mulBp(-5 minor, 5000bp) vs mulBp(5, 5000) | -2.5 and 2.5 round away from zero | **-3** minor (-0.03) and **+3** (0.03) |
| W28 | Payout guard and reversal. Balance 15,000 (W21) | PAID 20,000 refused ("exceeds balance 15,000.00"); PAID 15,000 accepted, balance 0; reversing it writes a RECEIVED row 15,000 with `reversalOfId` (reversal path, not the clawback guard; see 5.5), balance back to 15,000 | **0.00** then **15,000.00** |
| W28b | Reversal rules (v4). After W28's reversal | a second reversal of the same PAID row is refused (`reversalOfId` unique); a plain RECEIVED clawback of 1 is refused while balance is positive ("exceeds amount owed by partner"); reversal that would make netPaid negative is refused | refused, refused, refused |
| W29 | M4 invested above cost (v4). M4 30%, I 1,000,000 on one stone; K 600,000 (all basis); P 1,000,000; f=1; PER_STONE | released 1,000,000 x 1; cap = min(1,000,000, C 600,000) = 600,000; R >= C so capital 600,000; profit 400,000 -> 120,000; capital + share 720,000 <= R 1,000,000. Flag INVESTED_EXCEEDS_BASIS (BLOCK) refuses a settlement until the split is fixed | estimate **720,000.00** (never 1,120,000.00) |
| W30 | FX frozen at the first settlement (v4). W6 settled at 330.50 (39,150.00). Live USD rate later 340.00 | first commit writes `rateOverrides {"USD":"330.500000"}` and `ratesFrozenAt`; later gathers use 330.50; engine 39,150.00, drift 0 | **39,150.00**, no adjustment. An explicit "Revalue rates" to 340.00 gives price 1,020,000.00, profit 420,000 -> 42,000.00, delta +2,850.00 proposed as FX_CORRECTION |
| W31 | Materiality (v4). W21 stone A credited 40,000.00; a 5.00 bill lowers the engine by 0.50 | threshold = max(1.00, 0.1% x 40,000.00 = 40.00) = 40.00; 0.50 < 40.00 | no adjustment proposed; shown as "below materiality 0.50" (W21's -5,000.00 and W22's -900.00 exceed their thresholds) |
| W32 | Frozen weights (v4). M3 POOLED fee 20,000. Rough A (frozen 5.000 ct, unsold) + gem B (frozen 5.000 ct, fully sold) | F = (5000 x 0 + 5000 x 1)/10000 = 1/2 -> 10,000. A is then cut into gems totalling 3.000 ct, no new sale: g_A = 0, W_A still 5000, F still 1/2 | **10,000.00** before and after; no drift (an unfrozen current-weight F would give 5000/8000 and 12,500.00) |
| W33 | Aggregate obligations (v4). One stone P 1,000,000, K 600,000. M4 50% (I 600,000), M1 50%, M2 10%, M3 fee 50,000 | M4: capital 600,000 + 50% x 400,000 = 800,000; M1 200,000; M2 100,000; M3 50,000. Obl = 1,150,000 > Rev 1,000,000; per-family caps pass (M1+M4 = 100 <= 100; M2 = 10) | CO_PARTNER_TOTAL_EXCEEDS_REVENUE (BLOCK): reconcile refused |
| W34 | PER_STONE floor vs company profit (v4). M1 10%. Gem 1 profit +100,000, gem 2 profit -100,000 | company net profit 0. PER_STONE: 10,000 + 0. POOLED: max(0, 0) = 0 | PER_STONE **10,000.00**; POOLED **0.00**; INFO OBLIGATIONS_EXCEED_PROFIT |
| W35 | Overflow-safe conversion (v4). 100,000,000.00 LKR to USD at 330.50; and USD 1,000,000.00 to LKR | 1e10 x 1,000,000 = 1e16 (> 2^53) / 330,500,000 = 30,257,186.08 -> 30,257,186 minor. 100,000,000 x 330,500,000 / 1,000,000 = 33,050,000,000 minor | **302,571.86 USD**; **330,500,000.00 LKR** |

---------------------------------------------------------------------------------------------------
## 5. Settlement, payout and adjustment lifecycle (`src/lib/partner-ledger.ts`, server-only)

### 5.1 Deal states and locks
`DRAFT` (terms editable; access links do not work) -> `ACTIVE` (validated, stones allocated; links work; estimate live) -> `CLOSED` (read-only history; resale links revoked) or `CANCELLED` (only from DRAFT, or ACTIVE with no settlement, adjustment or payout). Closing needs: a typed confirmation and note when the balance is non-zero; for M4 `capitalOutstanding = 0` or a resolution note naming the written-off stones (v4); a typed confirmation while CANCELLED_WITH_PAYMENTS is present (v4).
- **Terms lock:** DRAFT editable freely. ACTIVE: "Amend terms" (reason mandatory, audit, bumps `termsVersion`, partner sees "Terms last amended on <date>") only while no ledger row exists. After the first settlement, adjustment or payout terms are frozen (close the deal and create a new one); the DB trigger of 2.2 enforces this beyond app code (v4).
- **Membership lock:** after the first settlement attaching or removing stones is blocked for POOLED M3/M4 and PER_STONE M4 (they change the fraction or invested split); allowed otherwise (new bucket). Removing a stone with credited <> 0 or a live sale is always blocked. Attach writes the frozen `weightMilli`.
- Visibility edits are always allowed (audited). Rate edits go through "Revalue rates" (5.4).
- **Write-off (M4):** `writeOffStone(dealId, dealStoneId, note)` (`partner:settle`) sets `writtenOffAt` for a LOST or permanently unsellable stone; pari-passu: capital simply is not returned (shown as "capital written off"); capitalProtected: the company bears it, recorded by a manual STONE_WRITTEN_OFF adjustment. Audited and shown to the partner (v4).

### 5.2 Ledger definitions (all in deal currency, Minor)
- `settled = sum(PartnerSettlement.amount)`; `adjustments = sum(PartnerAdjustment.amount)` (signed); `position = settled + adjustments`.
- `netPaid = sum(PAID) - sum(RECEIVED)`; `balance = position - netPaid` (positive: we owe the partner; negative: the partner owes us, carried forward and netted against future settlements).
- Per bucket: `credited_b = sum(lines for b) + sum(adjustments with bucketKey = b)`; `drift_b = engine_b - credited_b`. Deal-level manual adjustments (`bucketKey` null) count in `position` but not in per-bucket drift.
- `estimate = runEngine(gather(now)).totalMinor`; `notYetSettled = estimate - position` (may be negative).
- `lastKey(b)` = `realizationKey` of the latest line or adjustment for b that has one.
```ts
export interface Ledger { currency: string; settled: Minor; adjustments: Minor; position: Minor; netPaid: Minor; balance: Minor;
  perBucket: { bucketKey: string; credited: Minor; lastKey: string | null }[] }
```

### 5.3 Estimate (live)
`computeEstimate(dealId)` = `collectCurrencies` + `buildRateMap` + `gatherDeal(asOf = now)` + `runEngine`. Not persisted; costs float; labelled ESTIMATE everywhere. After the first settlement the frozen rates apply, so the estimate does not move with the hourly FX rate.

### 5.4 Reconcile: the only way to create settlements and bucket adjustments (two steps, so what the admin reviews is what is stored)
1. `previewReconcile(dealId)` (`partner:settle`, fresh check): `buildRateMap` + gather + engine. For each bucket `b` with `drift_b != 0`: `realChanged = realizationKey_now != lastKey(b)` (no previous key counts as changed).
   - `realChanged && drift_b > 0` -> SETTLEMENT line (reasons FIRST / NEW_REALIZATION / COST_CHANGED / PRICE_CHANGED by comparing with the previous snapshot of the bucket).
   - `realChanged && drift_b < 0` -> ADJUSTMENT: reason `SALE_CANCELLED` when a previously counted order id is no longer live (read from the stored evidence `orderIds`), else `NETTING` (loss netted against an earlier gain on the same lot/pool).
   - `!realChanged` -> ADJUSTMENT (signed), proposed only when `|drift_b| >= max(1.00, 0.1% of |credited_b|)` (materiality, v4; smaller drifts are listed as "below materiality" and may be forced by the admin): `COST_CHANGE` by default (`FX_CORRECTION` when the rate map differs from the previous snapshot's), admin may switch to `PRICE_CHANGE`, `FX_CORRECTION`, `CORRECTION`; evidence lists the changed lines.
   Returns `{ inputsHash, result, flags, rates, ledger, proposal, blocking, needsAck }`; `rates` is the exact RateMap used.
2. `commitReconcile(...)` takes the previewed `rates` and `inputsHash`, and in ONE `prisma.$transaction(fn, { timeout: 30_000 })`: first statement `SELECT pg_advisory_xact_lock(hashtext('partner-deal:' || dealId))` (serialises every ledger write of the deal; stateless-safe, works on the pooled connection inside a transaction); re-read deal (status ACTIVE or CLOSED); verify the supplied rate map is fresh (`fetchedAt` < 15 min) and that no used currency is FALLBACK-only (else `BLOCKED` APPROX_RATES_USED); gather with the SUPPLIED rate map (so rate movement between preview and commit cannot cause DATA_CHANGED; v4) and run the engine; if the new `inputsHash` differs from the previewed one return `DATA_CHANGED` (the hash covers data and converted values, not the live feed); any BLOCK flag returns `BLOCKED`; every ACK flag must be in `ackedFlags`, else `ACK_REQUIRED`. Insert the adjustment rows first, then the settlement (`amount = sum(lines) > 0`) and its lines. On the first settlement also write every non-LKR used rate into `deal.rateOverrides` and set `ratesFrozenAt` (v4). Nothing to do returns `NOTHING_TO_DO`. Then `writeAudit`, `notify`, `revalidatePath`.
3. Snapshot contents (immutable): `inputs` = full `EngineInput` + evidence per unit (internal code; every `CostAllocation` line as `{ id, type, amountOriginalMinor, currency, convertedMinor, createdAt, excluded? }` WITHOUT descriptions; every live order `{ id, status, saleDate, priceOriginalMinor, currency, totalMinor }` and every counted payment `{ id, receivedAt, amountOriginalMinor, currency, convertedMinor }`; ignored items: cancelled orders, rejected bills, excluded types), the terms and `termsVersion`; `result`; `rates`; `flags` acknowledged with user name; `inputsHash = sha256(canonical sorted-key JSON of inputs)`; `formulaVersion`; `asOf`; `earnedTotal`; `positionBefore`; `amount`; creator. Never updated or deleted (DB trigger, no code path). A wrong settlement is corrected by an adjustment.
4. "Revalue rates" (`revalueRates(dealId, rates, reason)`, `partner:settle`, fresh; v4): the only way to change frozen rates; audited; the next reconcile proposes the effect as FX_CORRECTION.
5. Invariant (asserted in tests): after a commit with no deal-level manual adjustments, `sum(credited_b) == engine total`.

### 5.5 Manual adjustment, payouts, reversals
- `createAdjustment({ dealId, bucketKey|null, amount != 0, reasonCode, reason, partnerNote?, settlementId? })` (`partner:settle`, fresh): evidence JSON stores the current engine value, creditedBefore, delta, `inputsHash`, rates; `currency` = deal currency. Same advisory lock. Erroneous adjustments are cancelled by an offsetting adjustment.
- `recordPayout` (`partner:settle`, fresh): `PAID` amount in DEAL currency, `0 < amount <= balance` (no advances in v1; refused otherwise), `paidAt` not in the future, optional `originalAmount/originalCurrency` (informational), `settlementId` defaulted to the latest. For `earnOn = SALE` the dialog shows the buyer-paid fraction of each credited bucket and a payout above the collected share needs the ACK "paying ahead of collection" (v4). `RECEIVED` (clawback when the partner repays a negative balance): `amount <= -balance` and `<= netPaid`.
- `reversePayout` (v4, distinct path with its own guards; it does NOT use the clawback guard): the original must be a PAID row with no existing reversal (`reversalOfId` unique), and `netPaid` after the reversal must be `>= 0`. It writes a RECEIVED row equal to the original with `reversalOfId`, never edits. Contract kinds: `CLAWBACK | REVERSAL`.
- **Costs change after a payout:** nothing is rewritten; the next reconcile proposes an adjustment. A negative balance is "carried forward" (it nets against future settlements automatically); to recover cash earlier record a RECEIVED payout. No automatic recovery in v1.
- **Reversals:** cancelled sale -> engine drops it -> negative drift -> adjustment (W25); re-sale -> new live order -> new settlement line; payment refund (no flow exists) uses the same mechanism if a payment row is ever removed in the database; closing a deal changes no money.

### 5.6 Who can do what
| Action | Capability |
|---|---|
| View partners, deals, ledgers, snapshots, flags, access logs, preview | `partner:read` |
| Partner/deal CRUD, attach/detach stones, allocator, terms (until locked), visibility, asset hide toggles, status, access links (create, rotate, revoke, password), revoke resale links | `partner:write` |
| Preview/commit reconcile, manual adjustment, payout, reversal, write-off, revalue rates | `partner:settle` |
| Attach a rough / a gem | also `rough:read` / `gemstone:read` via `can(session.user, cap)` |
`requirePartnerCapability(cap, { fresh: true })` re-reads `User` (`active`, role, grants, denies) for settle and access-creation actions. Note (v4): `partner:read` shows deal cost, supplier and receipt data through the admin pages; it is granted by default only to ADMIN, MANAGEMENT and FINANCE, and the permission editor describes the exposure. A maker-checker threshold for manual positive adjustments is open question 5.

---------------------------------------------------------------------------------------------------
## 6. Visibility model and partner DTO

### 6.1 Flags (`src/lib/partner-visibility.ts`, pure). JSON in `PartnerDeal.visibility`; parse is fail-closed (anything not strictly `true` is false; unknown keys dropped; wrong `version` => all false except forced)
```ts
export interface PartnerVisibility {
  version: 1;
  stoneIdentity: boolean;      // internal stone codes; off => "Stone A", "Stone B"
  stoneSpecs: boolean;         // type, variety, weight, dimensions, color, clarity, treatment, origin
  provenance: boolean;         // rough -> cutting -> gem chain and acquisition date (plain labels, no ids)
  timeline: boolean;           // activity feed (approved event types only)
  media: boolean;              // approved photo/video kinds
  processMedia: boolean;       // media attached to the cutting jobs of the deal's roughs
  mediaCaptions: boolean;      // free-text captions (risk)
  cgi: boolean;                // CGI score and band
  certificates: boolean;       // lab name, certificate number, status, issue date (no files)
  certificateFiles: boolean;   // SUPPORTING DOCUMENTS: certificate files via the guarded proxy
  askingPrice: boolean;        // list price of unsold stones
  salePrice: boolean;          // agreed sale price (ex tax)
  paymentsReceived: boolean;   // buyer payment progress (paid %, stage) and dates; amounts also need salePrice
  purchaseCost: boolean;       // acquisition cost
  costBreakdown: boolean;      // other eligible costs by whitelisted category label
  receipts: boolean;           // SUPPORTING DOCUMENTS: bill receipts via the guarded proxy
  supplierIdentity: boolean;   // supplier name
  profitFigures: boolean;      // revenue/cost/profit per bucket
  calculationDetail: boolean;  // step-by-step "how your amount was calculated"
}
export const VISIBILITY_KEYS: readonly (keyof Omit<PartnerVisibility, "version">)[];   // 19 keys
export const VISIBILITY_PRESETS: Record<"FULL" | "STANDARD" | "MINIMAL", PartnerVisibility>;
export function parseVisibility(raw: string | null | undefined): PartnerVisibility;
export function normalizeVisibility(v: PartnerVisibility, method: Method, earnOn: "SALE" | "PAYMENT"): { effective: PartnerVisibility; forced: { key: keyof PartnerVisibility; reason: string }[] };
export function presetOf(v: PartnerVisibility): "FULL" | "STANDARD" | "MINIMAL" | "CUSTOM";
export function disclosureWarnings(v: PartnerVisibility, m: Method, earnOn: "SALE" | "PAYMENT"): string[];     // admin only
export function explainable(m: Method, v: PartnerVisibility, earnOn: "SALE" | "PAYMENT"): boolean;
export const NEED_FLAGS: Record<Need, (keyof PartnerVisibility)[]>;                  // salePrice->[salePrice], paymentsReceived->[paymentsReceived], purchaseCost->[purchaseCost], costBreakdown->[costBreakdown], profit->[profitFigures]
```
**Presets**
| Flag | FULL | STANDARD (default) | MINIMAL |
|---|---|---|---|
| stoneSpecs, timeline, media, cgi, certificates | T | T | T |
| stoneIdentity, provenance, processMedia | T | T | F |
| askingPrice, salePrice, paymentsReceived, purchaseCost, costBreakdown, profitFigures, calculationDetail | T | T | F |
| mediaCaptions, certificateFiles, receipts, supplierIdentity | T | F | F |
Suggested default by kind: BROKER and AGENT = STANDARD; INVESTOR = FULL without supplierIdentity, receipts, certificateFiles (shown as CUSTOM). Applying FULL, or turning on supplierIdentity, receipts (also needs a typed confirmation while supplierIdentity is off), certificateFiles or mediaCaptions, shows a confirm listing what becomes visible.

**Forced and dependency rules (`normalizeVisibility`, v4 expanded; every lock shows its reason in the UI):**
1. M2 forces `salePrice` ON (commission / rate = price); M1 and M4 force `profitFigures` ON (share / rate = profit); M3 forces nothing here.
2. Derived-cost rule: for M1 and M4, when `salePrice` is ON (effective), `purchaseCost` AND `costBreakdown` are forced ON too (profit is visible, so cost = price - profit would otherwise leak). To hide cost the admin turns `salePrice` off instead.
3. Derived-progress rule: when `earnOn = PAYMENT` and (method is M3, or effective `salePrice` is ON), `paymentsReceived` is forced ON (the amount divided by rate x price, or by the fee, reveals the paid fraction anyway).
4. `receipts` requires `costBreakdown`; `certificateFiles` requires `certificates`; `mediaCaptions` requires `media` or `processMedia`; otherwise forced OFF. Payment AMOUNTS in the DTO need both `paymentsReceived` and `salePrice`; with `salePrice` off only dates and paid % are shown.
5. Without `paymentsReceived` the DTO stage collapses to SOLD (6.2).
**Always visible (not switchable):** the partner's own account block (estimate, settled, adjustments, paid, balance, notYetSettled, with their partner-visible notes) and their own terms (rate, fee, invested, scope, earn-on in words, "terms last amended"). Ledger rows labelled by cause use generic text when the cause would leak: COST_CHANGE shows "Cost update" only if `costBreakdown` is on, else "Recalculation"; PRICE_CHANGE and FX_CORRECTION show their label only if `salePrice` is on, else "Recalculation".
**Explainability:** each `ExplainLine` has `needs`; a line renders only if all its flags are on (cost lines need BOTH `purchaseCost` and `costBreakdown`, else subtracting would reveal the hidden part). If `calculationDetail` is off or any needed line is hidden the partner sees "Calculated per the agreed terms" plus the result. `explainable(m, v, earnOn)`: M1/M4 need salePrice + purchaseCost + costBreakdown (+ paymentsReceived under PAYMENT); M2 needs salePrice (+ paymentsReceived under PAYMENT); M3 needs nothing (+ paymentsReceived under PAYMENT). The admin form states "The partner can reproduce their amount" or why not.
**`disclosureWarnings` (warnings, not blocks):** `receipts` on with `supplierIdentity` off ("receipts normally name the vendor"); `purchaseCost` on with `supplierIdentity` off (price plus origin may identify the supplier); `certificateFiles` on ("certificate documents are already public via the verify page"); `provenance` on (reveals acquisition date); `mediaCaptions` on (free text); `stoneIdentity` on ("stone codes let the holder open the public /verify and /catalogue pages, which show the acquisition date and certificate, so provenance and certificateFiles are not hard controls while codes are visible"); `paymentsReceived` off with earnOn PAYMENT under M1/M4 ("the settled amounts still move with payments"); any forced flag ("hidden figures derivable from X").
The forced rules intentionally narrow decision 5 where hiding is cosmetic; open question 4 asks the owner to confirm or to allow a typed override.

### 6.2 Partner-facing DTO (`src/lib/partner-dto.ts`; primitives only; no Date, Decimal, bigint, ids or internal hrefs)
```ts
export type Money = { amount: number; currency: string };                // amount = minor / 100
export interface PartnerPortalDto {
  schemaVersion: 1; generatedAt: string;                                  // ISO
  watermarkName: string;                                                  // Partner.name
  partner: { name: string; kindLabel: string };
  deal: { reference: string; title: string; statusLabel: string; methodLabel: string; methodNote: string; scopeLabel: string; earnOnLabel: string;
          currency: string; startedOn: string | null; closedOn: string | null; termsAmendedOn: string | null; partnerNote: string | null;
          terms: { ratePct: number | null; fixedFee: Money | null; invested: Money | null; capitalProtected: boolean } };
  statement: {
    estimate: { amount: Money; asOf: string; incomplete: boolean; approxRates: boolean; soldStones: number; totalStones: number;
                parts: { capitalReturned: Money | null; profitShare: Money | null; commission: Money | null; fixedFee: Money | null } };
    settled: { amount: Money; count: number; lastOn: string | null };
    adjustments: { amount: Money; items: { on: string; ref: string; label: string; amount: Money; note: string | null }[] };
    paid: { amount: Money; lastOn: string | null; items: { on: string; ref: string; amount: Money; direction: "PAID" | "RECEIVED"; note: string | null }[] };
    balance: Money;                                                       // settled + adjustments - netPaid
    notYetSettled: Money;                                                 // estimate - position
    capitalOutstanding: Money | null;                                     // M4
    capitalWrittenOff: Money | null;                                      // M4
    settlements: { ref: string; on: string; amount: Money; note: string | null }[];
    calculation: { bucketLabel: string; lines: CalcLineDto[] }[] | null;  // null when calculationDetail off
  };
  stones: StoneDto[];
  timeline: TimelineItemDto[] | null;
  documents: { key: string; label: string; kind: "RECEIPT" | "CERTIFICATE"; stoneKey: string | null }[] | null;   // label = fixed template "Receipt - Cutting & polishing - 12 Mar 2026", never vendor/description text
  resale: { enabled: boolean; allowBranded: boolean; neutralHostWarning: boolean; maxTtlMinutes: number; eligible: { key: string; label: string; kind: "ROUGH" | "GEM" }[];
            links: { reference: string; createdOn: string; expiresOn: string; active: boolean; stoneCount: number; modeLabel: string }[] } | null;
  notices: ("INCOMPLETE_DATA" | "APPROX_RATES" | "TERMS_AMENDED" | "NO_STONES" | "NO_ACTIVITY" | "DEAL_CLOSED")[];
}
export interface CalcLineDto { label: string; value: Money | null; pct: number | null; emphasis?: boolean }
export interface StoneDto {
  key: string; parentKey: string | null;     // key = base64url(HMAC(stonekeyKey, dealId + ":" + internalId)).slice(0, 16); opaque, not a cuid
  displayName: string;                       // code if stoneIdentity else "Stone A"
  kind: "ROUGH" | "GEM";
  title: string | null;
  specs: { gemType: string | null; variety: string | null; weightCt: number | null; dimensionsMm: string | null; shape: string | null; cut: string | null; colorDescription: string | null; clarity: string | null; treatment: string | null; origin: string | null } | null;
  stage: "PURCHASED" | "IN_CUTTING" | "CUT" | "IN_STOCK" | "RESERVED" | "SOLD" | "SOLD_AWAITING_PAYMENT" | "SOLD_PART_PAID" | "SOLD_PAID" | "PARTLY_SOLD" | "UNAVAILABLE"; // derived from live order + payment fraction, never the raw status; the three SOLD_* payment stages appear only with paymentsReceived, else SOLD
  cgi: { score: number | null; band: string | null } | null;
  certificate: { laboratory: string; number: string | null; issuedOn: string | null } | null;
  media: { key: string; url: string; kind: "PHOTO" | "VIDEO"; stage: string | null; caption: string | null; on: string | null; primary: boolean }[] | null;
  askingPrice: Money | null;
  sale: { soldOn: string; price: Money | null; priceOriginal: Money | null; fxNote: string | null; paidPct: number | null } | null;   // priceOriginal + fxNote ("1 USD = 330.50 LKR") when the order currency differs; the rate is the frozen deal rate
  payments: { on: string; amount: Money | null; pct: number | null }[] | null;
  cost: { purchase: Money | null; lines: { label: string; amount: Money }[] | null; total: Money | null } | null;
  supplier: { name: string } | null;
  profit: Money | null;
  contribution: Money | null;                // this bucket's part of the estimate (PER_STONE only)
}
export interface TimelineItemDto { on: string; type: PartnerEventType; text: string; stoneKey: string | null; amount: Money | null }
```
`PartnerEventType` is a closed union: `ACQUIRED, CUTTING_STARTED, CUTTING_COMPLETED, GEM_REGISTERED, CERTIFICATE_SUBMITTED, CERTIFICATE_ISSUED, MEDIA_ADDED, COST_RECORDED, SOLD, PAYMENT_RECEIVED, SETTLEMENT_RECORDED, ADJUSTMENT_RECORDED, PAYOUT_MADE, TERMS_AMENDED, DEAL_STARTED, DEAL_CLOSED`. `text` comes from fixed templates plus `displayName`, never free text ("Cutting completed - yield 33.5%"). Yield and waste appear only when the ROUGH itself is a deal stone; for a gem-only deal the item says "Cut from a rough" with the gem's own weight (sibling gems of other deals stay unknowable) (v4). Gating: ACQUIRED, CUTTING_*, GEM_REGISTERED need `timeline`+`provenance`; CERTIFICATE_* need `certificates`; MEDIA_ADDED needs `media`; COST_RECORDED needs `costBreakdown`; SOLD is always listed with its date (amount only with `salePrice`); PAYMENT_RECEIVED needs `paymentsReceived`; ledger events, TERMS_AMENDED and DEAL_* are always shown. Dates are date-only ISO.

### 6.3 Builder (`src/lib/partner-view.ts`, server-only)
```ts
export async function buildPartnerPortalDto(a: { dealId: string; viewer: ResolvedAccess | AdminPreview; visibility?: PartnerVisibility; asOf?: Date }): Promise<PartnerPortalDto>; // override only for admin preview
export function toPartnerView(src: PartnerViewSource, flags: PartnerVisibility): PartnerPortalDto;    // pure; takes plain primitives, never Prisma rows
export function assertPublicDto(x: unknown): void;     // throws on Date, bigint, Decimal-like, function, DENY-list key, cuid-shaped string (/\bc[a-z0-9]{24}\b/)
export const stoneKey: (dealId: string, id: string) => string; export const docKey: (dealId: string, id: string) => string;
```
- Key derivation (v4): HMAC-SHA256 with keys derived from `AUTH_SECRET` as `HMAC(AUTH_SECRET, "partner-stonekey-v1")`, `"partner-dockey-v1"`, `"partner-stoneref-v1"`; slice at least 16 chars; if `AUTH_SECRET` is missing the builder throws (fail closed).
- Built ONLY from explicit `select` objects declared as consts (`satisfies Prisma.<Model>Select`); no `include`; no object spread of any Prisma row (a test greps `partner-view*.ts` for `/\.\.\.[A-Za-z_]/`); every output field assigned individually.
- Money comes from `gatherDeal` + `runEngine` (estimate) and stored ledger rows. Settlement `calculation` lines are rebuilt from the stored `result` under the CURRENT visibility (redaction always at render time).
- A throw from `assertPublicDto` renders the "unavailable" page and logs `detail=DTO_GUARD`. Admin preview (`AdminPreview`) never writes log rows or counters.
- Do NOT call `buildLifecycleFor*`, `getGemstoneProvenance` or `buildGenealogy` (cuids, internal hrefs, operator names, sibling gems outside the deal). Provenance is built directly from the deal's transformation rows.

### 6.4 Source fields per DTO field
| DTO field | Source (explicit select) | Gate |
|---|---|---|
| displayName, title, specs | `code, gemType, variety, species, weightCt, lengthMm, widthMm, depthMm/heightMm, shape, cut, colorDescription, clarity, treatment, origin` | `stoneIdentity` / `stoneSpecs` |
| stage | live SalesOrder + payment fraction + status whitelist mapping | always (payment stages need `paymentsReceived`) |
| cgi | `Gemstone.cgiScore, cgiBand` | `cgi` |
| certificate | first ISSUED/SUBMITTED `Certificate.certificateNumber, issueDate, laboratory.name` | `certificates` |
| media | `DigitalAsset.url, kind, stage, isPrimary, capturedAt ?? createdAt`; kind in `ROUGH_PHOTO, FINISHED_PHOTO, MACRO_PHOTO, INSPECTION_PHOTO, VIDEO, CATALOGUE_IMAGE` (positive whitelist; unknown kinds hidden), `stage != CERTIFICATION`, `partnerHidden IS NOT TRUE`; assets in stage `ROUGH_INTAKE` are hidden unless `supplierIdentity` is on (v4); URL parsed with `new URL()`: origin must equal the `R2_PUBLIC_URL` origin or start with `/uploads/` (external URLs dropped); max 24 per stone | `media` (`processMedia` for cutting-job assets, `mediaCaptions` for `caption`) |
| askingPrice | `Gemstone.askingPrice, currency` | `askingPrice` |
| sale, payments | live `SalesOrder.saleDate, agreedPrice`; `Payment.receivedAt, amount` (converted) | `salePrice` / `paymentsReceived` |
| cost | engine basis and lines grouped by `PARTNER_COST_TYPE_LABELS` (ROUGH_PURCHASE -> "Acquisition", CUTTING -> "Cutting & polishing", SHIPPING/TRANSPORT -> "Transport & shipping", INSURANCE -> "Insurance", CERTIFICATION/LAB -> "Certification", MARKETING -> "Marketing", else "Other costs") | `purchaseCost` / `costBreakdown` |
| supplier | `RoughStone.supplier.name` (derived gems: parent rough's supplier); direct-acquisition gems have no supplier FK => null (never parsed from descriptions) | `supplierIdentity` |
| documents | `Expense.receiptUrl` / `Certificate.documentUrl|imageUrl`, only as opaque `docKey` via the proxy | `receipts` / `certificateFiles` |
| timeline | structured tables: `RoughStone.purchaseDate`, `CuttingJob` dates, `GemstoneTransformation.performedAt/yieldPct/wasteWeightCt`, `Certificate` dates, `DigitalAsset` dates, `SalesOrder.saleDate`, `Payment.receivedAt`, ledger rows | per event |
| account, entries | `PartnerSettlement/Adjustment/Payout` `code, createdAt/paidAt, amount, partnerNote` | always |
| deal terms | THIS deal's own fields | always |

**NEVER copied into any DTO:** Customer/Enquiry data; `SalesOrder.id/invoiceNumber/salespersonId/notes/customerId`; `Payment.reference/notes/recordedBy/method`; `Shipment.destination/destCountry/tracking/courier`; `Reservation.customer/notes/deposit/price`; `CostAllocation.description`; `Expense.vendor/notes/recordedBy/approvedBy/code` and raw `receiptUrl`; `AuditLog`; `Comment`; `Gemstone.totalCost/costPerCt/minimumPrice/pricePerCt/cgiQualityNotes` (and `askingPrice` unless gated); `RoughStone.supplierId/valuation*/initialValuation/observations/mineSource/pricePerCt`; `purchasePrice` (cost only via engine lines); `CuttingJob.cutterId/cutter/notes/laborCost/machineCost`; `GemstoneTransformation.operator/cost`; `DigitalAsset.originalName/createdBy/id`; `Certificate.comments/laboratoryFees`; `Laboratory.notes`; `Location`, `InventoryMovement`, `PriceHistory`; any other `Partner`/deal terms, `Partner.notes`, `PartnerDeal.internalNotes/termsAmendReason`, `PartnerAccess*`, `PartnerSettlement.inputs/rates/note`, `PartnerAdjustment.reason/evidence`, `PartnerPayout.reference/method`; all cuids and internal hrefs; user names; `tokenHash/passwordHash`.

---------------------------------------------------------------------------------------------------
## 7. Access and security (bearer token)

Route `src/app/p/[code]/page.tsx` lives OUTSIDE `(app)` (public routes are exactly those outside `(app)`), never calls `auth()`, Node runtime, `export const dynamic = "force-dynamic"`.

### 7.1 Token and storage
`generateAccessToken()`: `randomBytes(24).toString("base64url")` = 32 chars, 192 bits. Never `slug()` (48 bits) nor `generateShareCode` (`Math.random`). Stored: `tokenHash = sha256(token).hex` (unique); the admin list shows the first 8 hex of the hash as the access id (no `tokenHint` of the token itself is stored; v4). The full URL `https://<host>/p/<token>` is shown ONCE (Copy, WhatsApp, QR via `renderQrSvg`). Rotate = new access row + revoke the old one in one transaction. Reason for hash-only: RLS is off and `anon` has SELECT (Data API state unverified; see 13.5). Token is never logged or put in audit metadata (logs use `tokenFp`, route pattern only). Default expiry 90 days (presets 7/30/90/180/365; "No expiry" needs an extra confirm). Note (v4): Vercel platform request logs contain request paths and therefore the token; restrict who can read them and say so in the admin warning.

### 7.2 Request flow (`resolvePartnerAccess` in `partner-access.ts`)
1. Token shape `/^[A-Za-z0-9_-]{32}$/`; malformed: `notFound()` immediately with NO database work (v4).
2. `ctx = requestContext(headers())`: `ipHash = HMAC(HMAC(AUTH_SECRET,"partner-ip-v1"), ipKey + ":" + YYYY-MM).hex.slice(0,16)` where `ipKey` = the first `x-forwarded-for` entry (falls back to `x-real-ip`), IPv6 truncated to its /64; when no IP is available NO shared "unknown" bucket exists: only the token-level limits apply (v4). `country = x-vercel-ip-country`; `uaClass` = device + browser family or `bot`; no raw UA or IP stored.
3. Bot user agents (link-preview fetchers, crawlers) receive a minimal data-free page ("Open this link in your browser", generic title, noindex) with no DTO built, no counters and no OK log row (v4).
4. Atomic DB rate limits: `ip:any` 120 per 10 min; `ip:fail` 10 per 10 min (incremented on NOT_FOUND and BAD_PASSWORD). Over limit: generic "temporarily unavailable" (HTTP 200, no-store) and NO further log rows (bounded writes).
```sql
INSERT INTO "PartnerRateLimit" ("key","windowStart","count") VALUES ($1,$2,1)
ON CONFLICT ("key","windowStart") DO UPDATE SET "count" = "PartnerRateLimit"."count" + 1 RETURNING "count"
```
   `windowStart = floor(now/windowMs)*windowMs`. Other keys: `mint:<accessId>` 5 per hour, `mintdeal:<dealId>` 10 per hour, `doc:<accessId>` 60 per 10 min, `pw:<ipHash>` shares `ip:fail` and is incremented BEFORE the password comparison.
5. Lookup by `sha256`. No row: NOT_FOUND is logged at most once per (`ipHash`, 10 min) and under a global cap of 120 rows per minute (v4), then `notFound()`. Expired, revoked, deal DRAFT/CANCELLED, partner inactive: log the real outcome, then the SAME generic `notFound()` as unknown (indistinguishable to a guesser; the admin sees the real outcome). Deal ACTIVE or CLOSED only.
6. `lockedUntil > now` -> LOCKED page (checked BEFORE bcrypt). Password set and no valid unlock cookie -> PASSWORD page (no data in markup).
7. OK: build the DTO; counters (`viewCount` increment, `firstViewedAt ??= now`, `lastViewedAt`) and the OK log row (at most one per 2 minutes per access) are AWAITED, or run in `after()` from `next/server` inside try/catch with an awaited fallback. Never the un-awaited `.catch(()=>{})` pattern.
8. Anomaly: on an OK write, if distinct `ipHash` over 7 days >= 5 or distinct countries >= 3 and `anomalyNotifiedAt` is null: set it and `notify` PARTNER_ACTIVITY; the access panel also shows a banner.
9. Retention (v4, deterministic, DB-guarded, no sampling and no `globalThis` timer): the request that wins `INSERT INTO "PartnerRateLimit" ("key","windowStart","count") VALUES ('retention', <hour start>, 1) ON CONFLICT DO NOTHING RETURNING 1` runs, inside `after()`, `DELETE FROM "PartnerRateLimit" WHERE "windowStart" < now() - interval '1 day'` and deletes `PartnerAccessLog` older than 90 days. Hence at most once per hour.

### 7.3 Password, lockout, cookie
- Optional password 10-72 chars (bcrypt truncates at 72 bytes), `bcryptjs` default import, cost 12.
- **Atomic attempt reservation (v4)** before any bcrypt work, so parallel guesses cannot all pass the check:
```sql
UPDATE "PartnerAccess" SET
  "failedAttempts" = CASE WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" <= now() THEN 1 ELSE "failedAttempts" + 1 END,
  "lastFailedAt" = now(),
  "lockedUntil" = CASE WHEN (CASE WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" <= now() THEN 1 ELSE "failedAttempts" + 1 END) >= 5
                       THEN now() + interval '15 minutes' ELSE NULL END
WHERE "id" = $1 AND ("lockedUntil" IS NULL OR "lockedUntil" <= now())
RETURNING "failedAttempts"
```
  No row returned => LOCKED (no bcrypt). Otherwise run bcrypt; success resets `failedAttempts = 0, lockedUntil = NULL`; a failed compare keeps the reserved increment. At most 5 comparisons can ever run per lock window regardless of concurrency. Changing or clearing the password sets `passwordSetAt` and bumps `unlockVersion`. The locked page gives no exact time. Accepted trade-off: a thief holding the token can lock the real partner out; the admin recovers with Rotate (a per-IP lock was rejected because rotating IPs would bypass it).
- `unlockPartnerAccess` (server action, returns `{ok}` results, never throws) sets the cookie (cookies cannot be set during a server-component render): name `pa_<first 12 hex of sha256(accessId)>`; value `v1.<accessId>.<expEpoch>.<unlockVersion>.<hmac>`; `hmac = HMAC-SHA256(HMAC(AUTH_SECRET,"partner-cookie-v1"), "v1|accessId|exp|unlockVersion")`, compared with `timingSafeEqual`; flags `HttpOnly; Secure; SameSite=Lax; Path=/p; Max-Age = min(12h, time to expiresAt)`. Every request re-reads the access row (revoked, expired, `unlockVersion`), so revocation and password change are immediate. If `AUTH_SECRET` is unset, password-protected links fail closed.

### 7.4 Access log (admin-visible, last 200 per deal, filter by access/outcome)
Time, outcome, route pattern, `tokenFp`, `ipHash` (short), country, `uaClass`, detail. Never the token or raw IP. Resale-link views by buyers appear as RESALE_VIEW rows (7.4a).
(7.4a, v4) A view of a partner-tagged `/s` link writes at most one `RESALE_VIEW` row per (link, ipHash) per 10 minutes (`detail = "link=<first 6 chars of the link's own code hash>"`), shown in the Resale links tab.

### 7.5 Headers, caching, metadata (`next.config.mjs` `async headers()`, keep `experimental` and `images`)
```js
{ source: "/p/:path*", headers: [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "Referrer-Policy", value: "no-referrer" },            // token is in the path: never leak via Referer to R2 / Google Fonts
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data: https:; media-src 'self' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" },
]},
{ source: "/s/:path*", headers: [ X-Robots-Tag "noindex, nofollow, noarchive", Referrer-Policy "no-referrer" ] }
```
Verify hydration in a real browser; if the CSP breaks it relax only `script-src`, and as a last resort keep only `frame-ancestors 'none'`. Page `metadata.robots = { index:false, follow:false, nocache:true, noarchive:true, nosnippet:true, noimageindex:true }`, explicit `title: "Deal statement"`, neutral description and icons so the root "Serendib Gemstones ERP" strings are not inherited. No `robots.txt` Disallow for `/p/` (it advertises the path and hides the noindex header).

### 7.6 Middleware change (exact)
`middleware.ts` (repo root), in `isPublic` after the `pathname.startsWith("/s/") ||` line add:
```ts
    pathname.startsWith("/p/") ||
```
The file is INERT today (Next 15 looks in `src/`; the manifest shows `"middleware": {}`; live `/gemstones` returns 307 without `callbackUrl`). Real guarantees: `/p` lives outside `(app)` and never calls `auth()`; admin routes live inside `(app)` and call `requireCapability`. Do NOT move the file into `src/` (it would redirect `/serendib-logo.jpg`, `/icon.svg`, `/uploads/*`, `/api/exchange-rates` to /login). Verify with an unauthenticated `curl -I`.

### 7.7 Document proxy `src/app/p/[code]/doc/[key]/route.ts` (and the admin twin `src/app/(app)/partners/deals/[id]/preview/doc/[key]/route.ts`, v4)
Same token, expiry, cookie and rate checks (the admin twin uses `requireCapability("partner:read")` and logs nothing); `key = docKey(dealId, docId)` must match a document currently in the partner's DTO (flags enforced at download time); the stored URL is parsed with `new URL()`: protocol `https:`, host exactly the R2 public host (or a local `/uploads/` path), normalised path with no `..` or encoded separators; stream via `GetObject` or local read; headers: `Cache-Control: private, no-store`, `Content-Disposition: inline; filename="document-<n>.<ext>"` (never the original name), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`, content type from an allow list (pdf, jpeg, png, webp) else attachment, size cap; log DOC_OK / DOC_DENIED. Admin UI states the limitation: underlying R2 objects stay world-fetchable by anyone who already knows the URL (random 96-bit names, no signing). Photos and videos are served directly from R2 (catalogue-grade, already public elsewhere); revoking access cannot recall URLs already seen.

### 7.8 Enumeration and IDOR analysis
- Only the 192-bit token crosses the wire. `dealId`, `accessId`, `partnerId` derive from the token row; never from client input.
- Stone keys and doc keys are deal-scoped HMACs (keys in 6.3) resolved by recomputing over the deal's current footprint (small set), never by DB id lookup; unknown keys are rejected and logged RESALE_DENIED / DOC_DENIED.
- Every export of a `"use server"` file is a public POST endpoint; partner actions self-authenticate per call and trust nothing from the client except the token, opaque keys and fixed enums.
- Existing `/s/**` is fail-open (verified): see 8.6, a prerequisite.

### 7.9 Behaviour by state
| State | Response |
|---|---|
| unknown / malformed / expired / revoked / deal inactive | identical generic `notFound()` page (404, noindex): "This link is not available. It may have expired or been replaced. Please contact the person who sent it." |
| bot / link preview fetcher | data-free stub page |
| rate limited | "Temporarily unavailable. Please try again in a few minutes." (200, no-store, no log row) |
| password required | password form only |
| bad password | inline "Incorrect password" (no attempt count) |
| locked | "Too many attempts. Please try again later." |
| deal CLOSED | read-only statement, banner DEAL_CLOSED, resale off |
| ACTIVE, no stones | statement with empty state "No stones have been added to this deal yet." |

### 7.10 Admin warning copy when creating a link (acknowledgement checkbox required)
"Anyone who has this link can open this page. It shows {visible categories, e.g. sale prices, purchase cost, cost breakdown} for {N} stones to whoever holds it, even if it is forwarded or screenshotted. Send it only to {partner name} over a channel you trust. This link {has no password | is protected by a password}. It expires on {date | never}. Every visit is logged (time, country, device type) and you can revoke it at any time; revoking stops the page opening but cannot recall photos or files already saved, and image addresses already seen stay reachable. The link also appears in hosting request logs. The full link is shown only once; use Rotate if it is lost." Extra red line when there is no password and any of `salePrice, purchaseCost, costBreakdown, supplierIdentity, receipts` is on: "This link has no password and shows financial details."

### 7.11 Watermark
Strong variant of `Watermark` (about 10% opacity, larger, rotated; text "{partner name} - confidential - do not share") moved to `src/components/public/watermark.tsx` and re-exported from `shared.tsx`; fixed layer repeats on every printed page. `CopyrightNotice`, `BrandHeader`, `ExpiryChip` are NOT reused (they print the link code and claim time-limited access). The page never shows the token.

---------------------------------------------------------------------------------------------------
## 8. Agent re-share (resale links)

### 8.1 Server actions (`src/app/p/[code]/actions.ts`, `"use server"`; each self-authenticates; return unions, never throw)
```ts
export async function unlockPartnerAccess(input: { token: string; password: string }): Promise<{ ok: true } | { ok: false; error: string }>;
export async function createPartnerResaleLink(input: {
  token: string; stoneKeys: string[];            // opaque keys from dto.resale.eligible
  mode: "NEUTRAL" | "BRANDED";                    // client default NEUTRAL
  ttlMinutes: number; message?: string;           // message: NEUTRAL only
  contact?: { name?: string; company?: string; phone?: string; email?: string };   // NEUTRAL only and only when deal.allowContactOverride
}): Promise<{ ok: true; url: string; code: string; expiresOn: string } | { ok: false; error: string }>;
export async function revokeOwnResaleLink(input: { token: string; reference: string }): Promise<{ ok: boolean; error?: string }>;
```
`createPartnerResaleLink` steps (each failing closed, logging RESALE_DENIED with a fixed detail code). The whole input is parsed with zod first (v4): `token` string, `stoneKeys` `z.array(z.string().max(32)).min(1).max(50)`, `mode` enum, `ttlMinutes` `z.number().int().finite()`, `message` `z.string().max(280)`, contact fields as in step 9; the whole action is wrapped in try/catch returning `{ ok: false }`.
1. `resolvePartnerAccess` + valid unlock cookie; deal ACTIVE; `deal.resaleEnabled`; rate limits `mint:<accessId>` and `mintdeal:<dealId>`; the minting access must be neither revoked nor expired.
2. `mode === "BRANDED"` requires `deal.allowBrandedResale`.
3. `stoneKeys` 1 to 50; every key resolved against the deal's CURRENT footprint (deal stones plus derived gems via `TransformationInput.roughStoneId -> TransformationOutput.gemstoneId`); an unknown key rejects the whole request.
4. All keys the same kind (no mixing gems and roughs; "create separate links").
5. Eligibility: gems `status = "AVAILABLE"` AND no live SalesOrder AND no ACTIVE reservation; roughs `status IN (PURCHASED, RECEIVED, INSPECTED, AVAILABLE)` and no transformation (not CONVERTED, IN_CUTTING, CUT, RESERVED, SOLD, LOST). (Rough statuses `AVAILABLE` only arise by hand-edit, so requiring AVAILABLE alone would block roughs entirely.)
6. Scope chosen server-side: 1 gem -> `GEMSTONE {"gemstoneCode":..}`; n gems -> `GEMSTONES {"gemstoneCodes":[..]}`; 1 rough -> `ROUGH`; n roughs -> `ROUGHS`. Never CATALOGUE or COLLECTION. Payload built with `JSON.stringify` from DB-validated codes, never from client text.
7. `ttl = clamp(requested, 10, min(deal.maxShareTtlMinutes, 43200))`, default 1440.
8. Inside ONE transaction holding `pg_advisory_xact_lock(hashtext('partner-deal:' || dealId))` (v4): count active partner-tagged links of the deal (not revoked, not expired) `< deal.maxActiveResaleLinks`, then insert the row.
9. `message` trimmed, max 280, plain text, control characters and URLs stripped, NEUTRAL mode only (BRANDED uses no free text; v4). Contact (zod, only honoured when `deal.allowContactOverride`; otherwise the stored partner details are used): name 2-80, company max 80, phone `^[+0-9 ()-]{7,20}$`, email `z.string().email()` rejecting `[?&,;\s]`; anti-impersonation (v4): the value is normalised (NFKC, lowercase, zero-width and non-alphanumerics stripped, common leetspeak mapped) before matching `/serendib|sgs/`; `wa.me` links use digits only.
10. `createShareLinkRow` then audit + access log + notification; return an absolute URL built from `NEUTRAL_BASE_URL` for NEUTRAL (see 8.4) or from `host` / `x-forwarded-proto` for BRANDED.

### 8.2 Row fields
| Field | NEUTRAL (default) | BRANDED |
|---|---|---|
| `brokerMode` | true | false |
| `brokerName/Company/Phone/Email` | `contact.*` (if override allowed) ?? stored partner name/company/phone/email (name required) | all null |
| `createdByName` | partner name | partner name |
| `createdByPhone/Email/PhotoUrl` | null | partner's STORED phone and email only (no free text, so a partner cannot spoof Serendib staff); photo null |
| `createdById` | `partner:<partnerId>` | same |
| `partnerDealId` | deal id | same |
| `partnerAccessId` | minting access id (v4) | same |
| `code` | `randomBytes(16).toString("base64url")` (22 chars, 128 bits), up to 5 retries, last candidate re-checked | same |
BRANDED shows Serendib branding (company settings) with the partner's own contact under "Contact your agent"; every partner-tagged page also shows the fixed line "Shared by an independent partner" (v4; open question 2).

### 8.3 Constraint to approved catalogue fields (partner-tagged links render through `src/lib/resale-view.ts`, NOT the full-row path)
Explicit whitelist `select` only. Gem: `gemType, variety, species, weightCt, lengthMm, widthMm, depthMm, shape, cut, facetingStyle, colorDescription, colorHue, colorTone, colorSaturation, clarity, transparency, luster, fluorescence, symmetry, polish, inclusions, treatment, treatmentStatus, origin, cgiScore, cgiBand, cgiBreakdown (keys origin/treatment/quality/certification/provenance only)`, primary approved image, ISSUED certificate laboratory name and number, and `askingPrice+currency` ONLY if `deal.resaleShowPrice`. Rough: `gemType, variety, species, weightCt, dimensions, shape, color, transparency, clarity, treatment, origin`, up to 5 approved images (`partnerHidden IS NOT TRUE`). STRUCTURALLY ABSENT: `observations, mineSource, initialValuation, surface/fractures` free text, all costs, `minimumPrice`, supplier, parcel, locations, reservations, sales, enquiries, `createdBy*` in neutral mode, deal terms, payouts, internal notes, `code` in neutral mode. `shared.tsx` presentational components take structural `Pick<...>` prop types so both existing rows and resale data satisfy them. Existing non-partner links keep today's field set (no regression) apart from the fixes in 8.6.

**Intersection with visibility (v4):** the resale field set = whitelist INTERSECT the deal's effective flags, so an agent can never view through a resale link what the admin hid from them: price needs `askingPrice` AND `resaleShowPrice`; specs and dimensions need `stoneSpecs`; CGI needs `cgi`; certificate lab and number need `certificates`; images need `media`. The admin form notes that a deal with specs/media off yields near-empty buyer pages. Enabling resale requires a checkbox "images have been checked for logos or branding" (audited) because neutral pages show raw catalogue photos.

### 8.4 Neutral-mode requirements (broker mode must stay free of "Serendib")
- **Neutral host (v4):** neutral resale URLs are built from env `NEUTRAL_BASE_URL` (a seller-neutral custom domain aliased to the same Vercel project). When it is set, partner-tagged neutral links answer ONLY on that host (the page returns `notFound()` on the Serendib host). When it is unset, NEUTRAL stays available (owner decision 7) but the admin form and the partner panel show a clear warning that the link address still contains the Serendib hostname (`dto.resale.neutralHostWarning`). The leak test asserts the minted neutral URL host does not match `/serendib/i` when the env is set (open question 3).
- `generateMetadata` on all three `/s` pages (React `cache()` over the link lookup): broker mode returns `title = brokerCompany ?? brokerName ?? "Available inventory"`, description "Private inventory", neutral icon, noindex; branded keeps the Serendib title.
- `CgiBreakdownCard` (cgi-badge.tsx:107) and `CgiMethodologyCard` (:138, :168) and the `CgiBadge` tooltip get `neutral?: boolean`: neutral copy is "Gem score", never "Ceylon Gem Identity" or Serendib; `SingleStone` passes `link.brokerMode`.
- Favicon: `public/neutral-icon.svg` via `metadata.icons`; verify in rendered HTML whether `src/app/icon.svg` still wins; if so move the Serendib icon to explicit root `metadata.icons` and delete `src/app/icon.svg`.
- Partner-tagged neutral links use opaque refs: `stoneRef(linkCode, stoneId) = base64url(HMAC(stonerefKey, linkCode + ":" + stoneId)).slice(0,16)` in hrefs, generic `alt` ("Gemstone", "Rough stone"); the deep routes accept the ref (resolved by scanning the link's allowed stones) and keep accepting codes for other links. Footer "viewed N times" and the link code are dropped for partner-tagged links.
- Staff-created broker links keep `SGS-` codes in URLs (existing behaviour; open question 6). The leak test asserts `/serendib/i` absent on ALL broker links and `/SGS-/` absent on partner neutral links.

### 8.5 Admin visibility and revoke
Deal page "Resale links" tab lists `ShareLink where partnerDealId = deal.id` (code prefix `abcd...`, scope, stones, mode, creator "partner", minting access label, expires, status, views, last viewed, RESALE_VIEW counts) with Revoke (`revokePartnerResaleLink(linkId)`: `partner:write`, sets `revokedAt`, audit `RESALE_LINK_REVOKED`, `revalidatePath`) and "Revoke all". The existing `revokeShareLink` (creator or admin role only, no UI caller; no Share links admin page exists) is not used. Revoking a partner ACCESS shows how many resale links that access minted; with reason "compromised" it revokes them by default (checkbox for other reasons) (v4); the Access tab lists the resale links per access. Closing or cancelling a deal revokes all its resale links in the same transaction. The partner revokes only its own deal's links (`revokeOwnResaleLink`). Creation raises a `PARTNER_ACTIVITY` notification.

### 8.6 Prerequisite fixes in the existing public layer (owner C; must land before the resale action is enabled)
1. `gemsWhereForLink` / `roughsWhereForLink` fail closed: for any restricted scope with a null, empty or invalid payload return the never-matching `{ id: "__none__" }`; the opposite kind returns never-matching; unknown scopes match nothing; CATALOGUE/COLLECTION never return roughs; ROUGH/ROUGHS never return gems. CATALOGUE keeps "all AVAILABLE gems" (the 5 live CATALOGUE and 2 GEMSTONE links keep working). Partner-tagged links additionally intersect with the deal footprint (gem AVAILABLE; rough in the allowed statuses).
2. `safePayloadParse` returns `{}` unless the parsed value is a plain object and type-checks arrays of strings (today the payload `"null"` makes the page 500).
3. Deep routes are scope-aware: `/s/<code>/<gem>` only for non-rough scopes; `/s/<code>/r/<rough>` only for rough scopes.
4. One `loadActiveShareLink(code)` replaces the three duplicated expiry checks; for partner-tagged links it also requires the deal ACTIVE and the minting access not revoked. (v4) Render dispatch is `partnerDealId IS NOT NULL OR createdById LIKE 'partner:%'` (never the column alone), so a link can never fall back to the full-row path; the DB CHECK of 2.2 backs this.
5. Broker-mode neutrality per 8.4.
6. View counters on `/s` are awaited; partner-tagged views also write RESALE_VIEW rows (7.4a).

### 8.7 Refactor
`src/lib/share-links.ts` (server-only, NOT a "use server" file): `createShareLinkRow(db, data)` containing slug generation (parameterised byte length, collision retry) and `prisma.shareLink.create`. `createShareLink` (src/app/(app)/share-links/actions.ts) calls it with unchanged behaviour (still `collection:write` + `gemstone:read`/`rough:read`, 30-day cap, 6-byte slug).

---------------------------------------------------------------------------------------------------
## 9. Admin UI (`src/app/(app)/partners/**`; every page `requireCapability("partner:read")`; every action its own capability and `can(session.user, cap)`)

### 9.1 Routes
| Route | Purpose |
|---|---|
| `/partners` | Tabs: Partners (code, name, kind badge, open deals, balance owed), Deals (code, partner, method, scope, status, estimate, balance, flag count), Resale links (all partner-tagged links, revoke). Stat strip (open deals, balances owed per currency, deals with drift or BLOCK flags). EmptyState "New partner". |
| `/partners/[id]` | Partner profile, its deals, edit dialog (`partner:write`), internal notes. |
| `/partners/deals/new` | Full-page `DealForm`; prefill `?partnerId=` and `?stone=<rough|gem>:<id>`. |
| `/partners/deals/[id]` | Tabs: Overview, Stones, Visibility, Money, Access, Resale links. |
| `/partners/deals/[id]/preview` | "View as partner": the SAME `PartnerPortalView` with `buildPartnerPortalDto(..., { viewer: preview })`, banner "Preview - exactly what the partner sees; not logged", phone/desktop width toggle. Document links go to the admin twin route `/partners/deals/[id]/preview/doc/[key]` (7.7); the Resale panel's submit is disabled with "Disabled in preview" (v4). |
| `/partners/deals/[id]/settlements/[sid]` | Immutable snapshot viewer (terms, per-bucket lines, acknowledged flags, rate map with sources, `inputsHash`), "Verify (replay)" button, print. |
Sidebar: `{ href: "/partners", label: "Partners", icon: Handshake, needs: "partner:read", group: "Partners" }` after `/suppliers`; `Sidebar` receives `grants`/`denies` so per-user overlays apply (`can({ role, grants, denies }, needs)`).

### 9.2 Forms and fields
- **Partner dialog** (supplier-dialog pattern, `{ok,error}` handling): name*, kind*, company, contact name, phone, email, country, internal notes. Code `nextGlobalCode(codePrefix.partner, tx, { pad: 4 })`. `quickCreatePartner(name)` in `lookups/actions.ts` for `EntityPicker`.
- **DealForm:** partner (EntityPicker with quick-create), internal title, partner-visible title, method* (radio cards with a one-line plain-words formula each), scope* ("a rough is treated as one lot"; PER_STONE note: "each stone's profit is floored at 0 separately, so partner shares can exceed the company's net profit across stones; POOLED nets them"), earnOn* (PAYMENT default; explained), currency (`CurrencySelect`, `PARTNER_CURRENCIES`), method fields (`ratePct` for M1/M2/M4; `fixedFee` for M3; `invested` + `capitalProtected` "Return capital first on a loss" for M4), excluded cost types (default RENT, SALARIES, TAX), manual exchange rates grid ("1 USD = N LKR"; shows "Frozen" once settled), visibility preset + switches, partner note (max 500), resale settings (enabled, branded allowed, show asking price, allow partner contact override, max TTL, max active links, neutral-host warning, images-checked checkbox), internal notes. Method change clears the other methods' fields; terms inputs lock per 5.1. Help text: lost stones are not charged to the partner; unsold stones' costs are excluded until they sell; cut costs are shared by weight.
- **Legal notice** (amber, always on the form and Overview, prominent for INVESTMENT and PROFIT_SHARE): "Investment and profit-sharing arrangements may be regulated and can have legal, tax and accounting consequences. Have the terms reviewed by a Sri Lankan lawyer and accountant before real use. This application records the terms you enter and calculates amounts from them; it does not give legal, tax or accounting advice."

### 9.3 Stone picker (no async stone search exists; build it)
`searchDealStones({ dealId?, q, kinds })` (`partner:write` + `rough:read`/`gemstone:read` per kind returned): `contains` with `mode: "insensitive"` on `code, gemType, variety, origin`; `take: 20` per kind; minimal `select` (id, code, gemType, variety, weightCt, status, currency, parcel code, derived-gem count for rough, parent rough code and `hasLiveOrder` for gem, existing deals count with partner names, admin only). Client `StonePicker`: input debounced 250 ms via `useTransition`, chips for selection, stones already in the deal disabled, overlap and co-partner warnings, "Add all roughs of parcel X" (explicit rows, shows parcel drift). `attachStonesToDeal` validates overlap (3.6), caps and obligations (4.5), membership lock (5.1), status, STONE_ALREADY_SOLD (asks for "count sales from" date or "include earlier sale"; M4 requires the date), writes the frozen `weightMilli`, and writes one audit row per stone (`ADD_STONE`). Allocator panel: POOL_LUMP / PARCEL_TOTAL / MANUAL with a preview and drift display; M4 "Allocate investment" (largest remainder by cost basis, editable, must sum to `invested`, both scopes).

### 9.4 Deal tabs
- **Overview:** status, terms table, legal notice, Activate/Close/Cancel (confirm; close rules of 5.1), "Amend terms", flag panel (BLOCK/ACK/INFO from the latest gather with fix hints) plus a Checks panel (aggregate obligations, OBLIGATIONS_EXCEED_PROFIT, drift per bucket), figure cards Estimate / Settled / Adjustments / Paid / Balance / Not yet settled.
- **Stones:** table (kind, code, weight, frozen weight, status, units, override badge, invested alloc, remove, write-off for M4), derived gems nested, per-stone realisation and flags; "Media shown to partner" list with a per-asset hide toggle (`setAssetPartnerHidden(assetId, hidden)`, `partner:write`, audited; intake-stage assets default hidden) (v4).
- **Visibility:** preset buttons (like `permissions-button.tsx`), grouped switches, locks with reasons, `disclosureWarnings`, `explainable` line, and a LIVE preview pane: `previewVisibility(dealId, json)` (`partner:read`, read-only) builds a DTO with the unsaved flags rendered by `PartnerPortalView`.
- **Money:** Reconcile button -> two-step dialog (proposal rows per bucket with type and editable reason/partner note, below-materiality rows, flags with ACK checkboxes, rates with source badges, confirm); lists of settlements (link to snapshot), adjustments, payouts (Reverse); "Add adjustment", "Record payout" (amount in deal currency, date, method, reference, partner note, optional original amount/currency, SALE collection ACK; guards from 5.5) and "Revalue rates" dialogs; negative balance shown in red "carried forward; record a RECEIVED payout if recovered".
- **Access:** list (label, display id = first 8 hex of the hash, created, expires, password yes/no, status, views, last viewed, distinct IP hashes, countries, anomaly banner, resale links minted) with Revoke (with the compromised/resale-count prompt) / Rotate / Set password / Clear password / Extend; "Create link" dialog (label, expiry, optional password, 7.10 warning with acknowledgement); show-once URL modal; access log table (50 per page).
- **Resale links:** 8.5.
Empty states: no partners, deals, stones, access links, activity ("Nothing earned yet. Estimates appear once a stone is sold."); missing rates banner "Exchange rate needed for USD. Add a manual rate."

### 9.5 Stone-detail "Partner deals" card (owner D)
`src/components/partner-deals-card.tsx` (server component, self-fetching via `listDealsForStone`, one cheap query) rendered as a new tab "Partners" on `rough/[id]` (after Bills) and `gemstones/[id]` (after Commerce), ONLY when `can(session.user, "partner:read")` (tab content is evaluated on every load, so the whole tab is gated). Shows deals covering the stone directly or through its parent rough (gems) or derived gems (roughs): deal code (link), partner name, method + rate, status, stone-level estimate, balance, and the aggregate-obligation status. Header "Add to partner deal" (when `partner:write`) is a link to `/partners/deals/new?stone=<kind>:<id>`. Never in Overview (visible to SALES/WAREHOUSE).

### 9.6 Other admin changes
Dashboard "Recent Activity" and `/audit-log` exclude entities starting with `Partner` unless `can(user, "partner:read")`. Revalidate `/rough/<id>` and `/gemstones/<id>` after attach/detach. The existing add-stone-bill dialog shows a warning when the stone belongs to a non-closed partner deal: "do not file partner commissions or payouts as stone bills" (v4).

---------------------------------------------------------------------------------------------------
## 10. Public portal UI (`/p/[code]`)

Server component page; reads the unlock cookie, calls `resolvePartnerAccess`, `buildPartnerPortalDto`, renders `PartnerPortalView` (DTO-only, no `server-only` imports, so the static-markup leak test can render it) plus small client islands (`PasswordGate`, `ResalePanel`, `PrintButton`). Mobile first: 16 px gutters, `max-w-5xl`, one column, tables become stacked cards under `md`, 44 px tap targets for primary actions (`Button size="lg"`).

### 10.1 Sections (each gated by its flag; a `null` DTO section is not rendered at all)
1. **Header:** Serendib logo (this page IS Serendib-branded), "Deal statement", `deal.reference`, partner title, "As of {time}", "Private to {partner name}. Access is logged." Never the link or token.
2. **Account card (always):** headline BALANCE ("Balance due to you" / "Balance carried forward against you" when negative), then chips: "Estimated earnings (live)" (badge ESTIMATE), "Settled to date", "Adjustments", "Paid to you", "Not yet settled". Always-visible legend: Estimated = recalculated from current sales and costs, may change until settled; Settled = confirmed statements, fixed; Adjustments = recorded corrections (positive or negative); Paid = amounts paid to you; Balance = settled + adjustments - paid (shown as arithmetic). Estimate parts (capital returned, share of profit, commission, fixed fee) underneath; M4 "Capital still at work" and "Capital written off". Zero estimate with sold stones shows "Awaiting payment" (never a final-looking 0). History list of settlements, adjustments, payouts (date, label, amount, partner note, STL/ADJ/PAYOUT reference).
3. **Your terms:** method in plain words, rate/fee/invested, scope (with the PER_STONE floor sentence), earn-on rule ("paid in proportion to payments we receive from the buyer"), rounding note (half away from zero), `partnerNote`, "Terms last amended on".
4. **How your amount was calculated** (`calculationDetail`): per bucket the filtered `ExplainLine`s; final lines always shown.
5. **Stones:** card per stone (name, stage badge, specs, CGI badge, certificate, media strip, provenance chips without links, supplier, purchase cost and breakdown, sale price (with original currency and rate) and paid %, payments, profit, contribution); derived gems nested under their rough.
6. **Timeline** (`timeline`), **Documents** (`receipts`/`certificateFiles`, links `/p/<token>/doc/<key>`).
7. **Resale** (`resale.enabled`): stone checkboxes (eligible only), mode radios (Neutral preselected: "No Serendib branding; your name and details are shown"; if `neutralHostWarning`, "the link address still contains the Serendib name"; Serendib branded), expiry presets capped by `maxTtlMinutes`, optional message (neutral only), contact fields (neutral and only when the deal allows overrides), result URL with Copy/WhatsApp, own links list with Revoke.
8. **Footer:** `PrintButton`, "Confidential - for {partner name}", notices (approximate rates, data being finalised), no link code, no view count.
Strong watermark with the partner's name behind content (prints on every page); image protection styles from `/s`.

### 10.2 States
Password-locked, locked-out, unavailable (generic not-found, `src/app/p/[code]/not-found.tsx`), rate limited, bot stub, closed-deal banner, empty deal, no activity, incomplete data. No `loading.tsx` exposure.

### 10.3 Component reuse
Reuse unchanged: `CgiBadge` (with the neutral prop), `Badge`, `Card`, `Button`, `PrintButton`, `formatCurrency`, `formatDate`, `renderQrSvg`, `ContactFooter` (resale only). Reuse after extraction: `Watermark` (strong variant). Built new, read-only (no server-action imports, no internal hrefs, DTO props only): `PartnerPortalView`, `StatementCards`, `CalcSteps`, `StoneCard`, `PublicMediaStrip` (extracted from `MediaGallery`'s AssetCard and stage chips; no `originalName`; `loading="lazy" decoding="async" preload="none" playsInline`, `rel="noopener noreferrer"`), `PublicTimeline`, `PublicProvenance`, `PasswordGate`, `ResalePanel`. Do NOT reuse: `MediaGallery` (bundles upload/delete actions), `LifecycleTimeline` and `ProvenanceChain` (internal hrefs and cuids, unscoped sibling gems), `StoneBillsSection`, `BrandHeader`/`CopyrightNotice`.

---------------------------------------------------------------------------------------------------
## 11. RBAC, audit, revalidation, ID prefixes, notifications, enums

- **Capabilities** (identical edits in `src/lib/rbac.ts` AND `src/lib/rbac.client.ts`): union `| "partner:read" | "partner:write" | "partner:settle"`; `ADMIN_BASE` gets all three; matrix MANAGEMENT `+partner:read`, FINANCE `+partner:read, partner:settle`; `PERMISSION_GROUPS` new `{ label: "Partners", caps: [...] }` after "Finance & Accounting" in BOTH files (otherwise the per-user editor cannot grant them; the group description warns that `partner:read` exposes deal costs, suppliers and receipts); preset "Read only (all)" `+partner:read`. While there fix the existing drift (client FINANCE lacks `expense:read/write`). GEM_BUYER, SALES, WAREHOUSE get nothing by default.
- `src/lib/partner-auth.ts`: `requirePartnerCapability(cap: Capability, opts?: { fresh?: boolean }): Promise<Session>`; `fresh` re-reads `User` and re-evaluates `can`.
- **Audit** (`writeAudit`; entity = model name: `Partner, PartnerDeal, PartnerDealStone, PartnerSettlement, PartnerAdjustment, PartnerPayout, PartnerAccess`; actions `CREATE, UPDATE, STATUS_CHANGE, ADD_STONE, REMOVE_STONE, ALLOCATION_SET, VISIBILITY_UPDATED, TERMS_AMENDED, ACCESS_CREATED, ACCESS_ROTATED, ACCESS_REVOKED, ACCESS_PASSWORD_SET, SETTLEMENT_CREATED, ADJUSTMENT_ADDED, PAYOUT_RECORDED, PAYOUT_REVERSED, STONE_WRITTEN_OFF, RATES_REVALUED, ASSET_HIDDEN, RESALE_LINK_CREATED, RESALE_LINK_REVOKED`). `newValue` is a neutral sentence ("Deal DEAL-2026-0001 created"); amounts, percentages and ids go only in `metadata`. NEVER `auditDiff` on term/price fields (it writes visible old->new rows); NEVER log partner events under entity `RoughStone`/`Gemstone` (stone History tabs, dashboard feed and `/audit-log` are visible to many roles). Partner-actor events: `userId: null`, `userName: "Partner <name>"`, metadata `{ partnerId, accessId, via: "access-link" }`. Ledger tables have no UPDATE/DELETE actions.
- **Revalidation:** `revalidatePath("/partners")`, `/partners/${partnerId}`, `/partners/deals/${dealId}`; attach/detach also `/rough/${id}` or `/gemstones/${id}`. `/p/*` is dynamic and never revalidated. Partner events do not touch dashboard KPIs.
- **ID prefixes** (`codePrefix` in `src/lib/ids.ts`, always pass `tx`): `partner: "PTR"` (`nextGlobalCode(..., { pad: 4 })` -> PTR-0001), `partnerDeal: "DEAL"` (`nextCode(.., year, tx, { pad: 4 })` -> DEAL-2026-0001), `partnerSettlement: "STL"`, `partnerAdjustment: "ADJ"`, `partnerPayout: "PAYOUT"` (not "PAY": customer payments). Access links and logs have no human code.
- **Notifications:** add `PARTNER_ACTIVITY` to `NOTIFICATION_TYPES` (`enums.ts`), `audienceByType` (ADMINISTRATOR, FINANCE) in `notifications.ts` (exhaustive Record) and `typeLabel` in `inbox/page.tsx` (all three in the same owner so it compiles); every call passes `extraRoles: ["SUPER_ADMIN"]` (verified: `notify()` never reaches SUPER_ADMIN). Events: resale link minted, access lockout, access anomaly, reconcile blocked by BLOCK flags.
- **Enums** (`src/lib/enums.ts`, const arrays plus union types): `PARTNER_KINDS, PAYOUT_METHODS` (the four), `PARTNER_SCOPES, EARN_ON, DEAL_STATUSES, ALLOCATION_BASES, ADJUSTMENT_REASONS` (incl. STONE_WRITTEN_OFF, FORFEITED_DEPOSIT), `PAYOUT_DIRECTIONS, PAYOUT_PAYMENT_METHODS` (BANK_TRANSFER, CASH, CHEQUE, OTHER), `ACCESS_OUTCOMES` (incl. RESALE_VIEW), `PARTNER_EVENT_TYPES, FLAG_CODES, PARTNER_CURRENCIES` (subset of `CURRENCIES` with 2 minor digits), `PARTNER_COST_TYPE_LABELS` (type -> partner-safe label). Optional: `"partner"` in `field-vocab.ts` `ModelName`.
- Cross-cutting rules for all owners: TypeScript strict, no `any`; no comments except one short WHY; `import "server-only"` first line of every lib touching prisma or secrets, never in pure modules; admin actions call `requireCapability`/`requirePartnerCapability`, then `writeAudit`, then `revalidatePath`; public actions re-validate the token; expected failures return `{ ok: false, error }`; Decimals converted with `decimalToMinor`/`Number()`; Postgres `contains` always `mode: "insensitive"`; public pages `dynamic = "force-dynamic"`; `redirect()` outside try/catch; long transactions pass `{ timeout: 30_000 }`.

---------------------------------------------------------------------------------------------------
## 12. File plan, owners, dependency order, shared contracts

### 12.1 Files (ONE owner each)
**A - foundation / data / lib**
- `prisma/schema.prisma`; `scripts/add-partner-deals.ts`; `scripts/test-partner-engine.ts`, `test-partner-gather.ts`, `test-partner-ledger.ts`, `test-partner-access.ts`, `test-partner-visibility.ts` (untracked)
- `src/lib/enums.ts`, `src/lib/ids.ts`, `src/lib/rbac.ts`, `src/lib/rbac.client.ts`, `src/lib/notifications.ts`, `src/app/(app)/inbox/page.tsx` (typeLabel only)
- Pure: `src/lib/partner-money.ts`, `partner-engine.ts`, `partner-visibility.ts`, `partner-dto.ts`
- Server-only: `src/lib/partner-gather.ts`, `partner-ledger.ts`, `partner-queries.ts`, `partner-access.ts`, `partner-auth.ts`, `partner-view.ts`, `src/lib/share-links.ts`
- `src/app/(app)/share-links/actions.ts` (call `createShareLinkRow`), `next.config.mjs`, `middleware.ts`
**B - admin UI + admin actions**
- `src/app/(app)/partners/page.tsx`, `partners-tabs.tsx`, `new-partner-button.tsx`, `actions.ts`, `[id]/page.tsx`, `[id]/edit-partner-button.tsx`
- `partners/deals/new/page.tsx`, `deals/new/deal-form.tsx`, `deals/[id]/page.tsx`, `deals/[id]/overview-tab.tsx`, `stones-tab.tsx`, `stone-picker.tsx`, `visibility-editor.tsx`, `money-tab.tsx`, `reconcile-dialog.tsx`, `adjustment-dialog.tsx`, `payout-dialog.tsx`, `revalue-dialog.tsx`, `access-tab.tsx`, `access-log-table.tsx`, `resale-tab.tsx`, `deals/[id]/preview/page.tsx`, `deals/[id]/preview/doc/[key]/route.ts`, `deals/[id]/settlements/[sid]/page.tsx`
- `partners/deals/actions.ts` (deal, status, amend, attach/detach, allocator, visibility, `previewVisibility`, `searchDealStones`, `setAssetPartnerHidden`), `ledger-actions.ts` (preview/commit reconcile, adjustment, payout, reversal, write-off, revalue rates), `access-actions.ts` (create, rotate, revoke, password, `revokePartnerResaleLink`)
- `src/app/(app)/lookups/actions.ts` (`quickCreatePartner`), `src/components/shell/sidebar.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx` and `src/app/(app)/audit-log/page.tsx` (Partner* entity filter only), the add-stone-bill dialog (partner-deal warning only)
**C - public portal + agent share**
- `src/app/p/[code]/page.tsx`, `not-found.tsx`, `actions.ts`, `doc/[key]/route.ts`; `src/lib/partner-resale.ts`, `src/lib/resale-view.ts`
- `src/components/partner-portal/*` (portal-view, statement-cards, calc-steps, stone-card, media-strip, timeline, provenance, password-gate, resale-panel), `src/components/public/watermark.tsx`, `src/components/public/contact-footer.tsx`, `public/neutral-icon.svg`
- `src/app/s/[code]/page.tsx`, `[gemCode]/page.tsx`, `r/[roughCode]/page.tsx`, `shared.tsx`, `expired.tsx`, `src/components/cgi-badge.tsx` (neutral variants, `generateMetadata`, fail-closed where-builders, `loadActiveShareLink`, resale render path, RESALE_VIEW logging)
- `scripts/test-partner-leak.ts`, `scripts/test-resale-scope.ts`, `scripts/test-resale-mint.ts`
**D - stone-page integration**
- `src/components/partner-deals-card.tsx`, `src/app/(app)/rough/[id]/page.tsx`, `src/app/(app)/gemstones/[id]/page.tsx` (Partners tab only)

### 12.2 Dependency order
A first (schema, migration, enums, rbac, ids, pure libs, then server libs) -> run migration and `prisma generate` -> B, C, D in parallel. B's preview needs C's `PartnerPortalView` (B codes against the contract and may stub until C lands); D needs only A's `listDealsForStone`; C's resale action needs A's `createShareLinkRow` and `resolveDealUnits` and must not be enabled until C's 8.6 fixes are merged. Final integration: typecheck, lint, all test scripts, manual checklist, launch gate 13.5.

### 12.3 Shared contracts (exact exports; action files export only async functions)
```ts
// partner-money.ts (A)  see 4.1
export type Minor = number; export function divRound(n: bigint, d: bigint): bigint; export function mulBp(m: Minor, bp: number): Minor;
export function mulFrac(m: Minor, num: number, den: number): Minor; export function mulRat(m: Minor, r: Rat): Minor;
export function bpFromPct(pct: string | number): number; export function decimalToMinor(v: { toString(): string } | string | number): Minor;
export function minorToMajor(m: Minor): number; export function minorToDecimalString(m: Minor): string;
export function allocateMinor(total: Minor, weights: number[]): Minor[]; export function convertMinor(a: Minor, from: string, to: string, micro: RateMicro): Minor | null;
// partner-engine.ts (A)  see 4.2
export const FORMULA_VERSION: string; export const ENGINES: Record<string, (i: EngineInput) => EngineResult>; export function runEngine(i: EngineInput): EngineResult;
export function computeProfitShare(i: ProfitInput): EngineResult; export function computeSaleCommission(i: RevenueInput): EngineResult;
export function computeFixedFee(i: WeightInput): EngineResult; export function computeInvestment(i: InvestmentInput): EngineResult; export function validateTerms(t: TermsDraft): string[];
// partner-visibility.ts (A)  see 6.1
// partner-gather.ts (A, server-only)  see 3.4
export async function collectCurrencies(db: Db, dealId: string): Promise<string[]>;
export async function buildRateMap(deal: { currency: string; rateOverrides: string | null }, needed: Iterable<string>): Promise<RateMap>;
export async function gatherDeal(db: Db, dealId: string, opts: { asOf: Date; rates: RateMap }): Promise<GatherResult>;
// partner-ledger.ts (A, server-only)
export type Actor = { id: string; name: string | null };
export async function getLedger(db: Db, dealId: string): Promise<Ledger>;
export async function computeEstimate(db: Db, dealId: string): Promise<{ result: EngineResult; flags: GatherFlag[]; rates: RateMap; ledger: Ledger; notYetSettled: Minor }>;
export interface ProposalRow { bucketKey: string; label: string; engineMinor: Minor; creditedMinor: Minor; deltaMinor: Minor; kind: "SETTLEMENT" | "ADJUSTMENT"; reasonCode: string; belowMateriality: boolean }
export interface ReconcilePreview { dealId: string; inputsHash: string; asOf: string; rates: RateMap; result: EngineResult; flags: GatherFlag[]; ledger: Ledger; proposal: ProposalRow[]; blocking: string[]; needsAck: string[] }
export async function previewReconcile(dealId: string): Promise<ReconcilePreview>;
export async function commitReconcile(a: { dealId: string; inputsHash: string; rates: RateMap; ackedFlags: string[]; forceBelowMateriality?: string[]; reasons: Record<string, { code: string; text: string; partnerNote?: string }>; settlementNote?: string; settlementPartnerNote?: string; actor: Actor }):
  Promise<{ ok: true; settlementCode: string | null; adjustmentCodes: string[] } | { ok: false; error: "DATA_CHANGED" | "BLOCKED" | "ACK_REQUIRED" | "NOTHING_TO_DO" | "RATES_STALE" | "FORBIDDEN" | "INVALID"; detail?: string[] }>;
export async function createAdjustment(a: { dealId: string; bucketKey: string | null; amountMinor: Minor; reasonCode: string; reason: string; partnerNote?: string; settlementId?: string; actor: Actor }): Promise<{ ok: true; code: string } | { ok: false; error: string }>;
export async function recordPayout(a: { dealId: string; direction: "PAID" | "RECEIVED"; amountMinor: Minor; paidAt: Date; method?: string; reference?: string; originalAmountMinor?: Minor; originalCurrency?: string; partnerNote?: string; ackPayingAhead?: boolean; actor: Actor }): Promise<{ ok: true; code: string } | { ok: false; error: string }>;
export async function reversePayout(a: { payoutId: string; reason: string; actor: Actor }): Promise<{ ok: true; code: string } | { ok: false; error: string }>;
export async function writeOffStone(a: { dealId: string; dealStoneId: string; note: string; actor: Actor }): Promise<{ ok: true } | { ok: false; error: string }>;
export async function revalueRates(a: { dealId: string; rates: Record<string, string>; reason: string; actor: Actor }): Promise<{ ok: true } | { ok: false; error: string }>;
export async function replaySettlement(settlementId: string): Promise<{ match: boolean; diff?: string }>;
export async function validateDealForActivation(dealId: string): Promise<{ ok: boolean; errors: string[]; warnings: string[] }>;
export async function checkObligations(db: Db, dealId: string): Promise<{ obligationsMinor: Minor; revenueMinor: Minor; blocked: boolean; exceedsProfit: boolean }>;
export async function allocateAcquisition(dealId: string, spec: { source: "POOL_LUMP" | "PARCEL_TOTAL" | "MANUAL"; basis?: "WEIGHT" | "EQUAL"; amountMinor?: Minor; currency?: string; manual?: { dealStoneId: string; amountMinor: Minor }[] }, actorId: string): Promise<{ ok: true } | { ok: false; error: string }>;
export async function allocateInvestment(dealId: string, actorId: string, manual?: { dealStoneId: string; amountMinor: Minor }[]): Promise<{ ok: true } | { ok: false; error: string }>;
// partner-queries.ts (A)
export async function getDealFootprint(db: Db, dealId: string): Promise<{ roughIds: string[]; gemIds: string[]; derivedGemIds: string[] }>;
export async function resolveDealUnits(db: Db, dealId: string): Promise<{ key: string; kind: "ROUGH" | "GEM"; id: string; code: string; status: string }[]>;
export async function listDealsForStone(db: Db, stone: { kind: "ROUGH" | "GEM"; id: string }): Promise<{ dealId: string; dealCode: string; partnerName: string; method: string; ratePct: number | null; status: string; viaRough: boolean; estimateMinor: Minor | null; balanceMinor: Minor | null }[]>;
export async function validateCoPartnerCaps(db: Db, a: { dealId: string; method: string; ratePct: number | null; stones: { kind: "ROUGH" | "GEM"; id: string }[] }): Promise<{ errors: string[]; warnings: string[] }>;
// partner-access.ts (A, server-only)
export type ResolvedAccess = { readonly __brand: "ResolvedAccess"; accessId: string; dealId: string; partnerId: string; needsPassword: boolean };
export function generateAccessToken(): { token: string; hash: string }; export const hashToken: (t: string) => string;
export function requestContext(h: Headers): RequestCtx; export async function rateHit(key: string, windowMs: number): Promise<number>;
export async function resolvePartnerAccess(token: string, ctx: RequestCtx): Promise<{ ok: true; access: ResolvedAccess } | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "REVOKED" | "INACTIVE" | "LOCKED" | "RATE_LIMITED" | "BOT" }>;
export async function verifyPasswordAndUnlock(token: string, password: string): Promise<{ ok: true } | { ok: false; error: string }>;   // atomic reservation (7.3), sets the cookie
export async function checkUnlock(access: ResolvedAccess): Promise<boolean>;
export async function writeAccessLog(e: { accessId: string | null; dealId: string | null; outcome: string; path: string; tokenFp?: string; ctx: RequestCtx; detail?: string }): Promise<void>;
export async function createAccess(i: { dealId: string; label?: string; expiresAt?: Date | null; password?: string }, actor: Actor): Promise<{ id: string; token: string }>;
export async function revokeAccess(accessId: string, actor: Actor, opts?: { reason?: string; alsoRevokeResale?: boolean }): Promise<{ revokedResaleLinks: number }>;
// partner-view.ts (A)  see 6.3
export async function buildPartnerPortalDto(a: { dealId: string; viewer: ResolvedAccess | AdminPreview; visibility?: PartnerVisibility; asOf?: Date }): Promise<PartnerPortalDto>;
export function toPartnerView(src: PartnerViewSource, flags: PartnerVisibility): PartnerPortalDto; export function assertPublicDto(x: unknown): void;
export const stoneKey: (dealId: string, id: string) => string; export const docKey: (dealId: string, id: string) => string;
// share-links.ts (A)
export async function createShareLinkRow(db: Db, i: { scope: string; payload: string | null; ttlMinutes: number; message: string | null; createdById: string; createdByName: string; createdByPhone?: string | null; createdByEmail?: string | null; brokerMode: boolean; broker?: { name?: string | null; company?: string | null; phone?: string | null; email?: string | null }; partnerDealId?: string | null; partnerAccessId?: string | null; codeBytes?: number }): Promise<{ id: string; code: string; expiresAt: Date }>;
// partner-resale.ts (C): createPartnerResale(access: ResolvedAccess, input: ResaleInput): Promise<ResaleResult>; revokeOwnResale(access: ResolvedAccess, reference: string): Promise<{ ok: boolean; error?: string }>
// C component contract used by B's preview page
export function PartnerPortalView(p: { dto: PartnerPortalDto; mode: "public" | "preview"; token?: string }): JSX.Element;
```

---------------------------------------------------------------------------------------------------
## 13. Threat model and verification plan

### 13.1 Threat table (leak vector -> mitigation)
| Leak vector or attack | Mitigation |
|---|---|
| Prisma row or Decimal reaches a client or public DTO | whitelist builder with explicit `select`; no object spread (test greps the file); `assertPublicDto`; DTO types are primitives; engine ints -> `minorToMajor` |
| Supplier, buyer, staff names in free text (`CostAllocation.description`, audit, captions, operator, lifecycle) | never read (description only by the boolean heuristic); cost labels from a type whitelist; timeline from structured tables with fixed templates; captions behind `mediaCaptions`; document labels are fixed templates |
| Derived-number leak (commission / rate, share / rate, price - profit, amount / fee) | forced flags (6.1 rules 1-3), generic ledger labels, explainability rules, admin disclosure warnings; visibility test asserts no hidden figure is derivable from the visible set |
| Token guessing | 192-bit random, hashed at rest, atomic DB rate limits, indistinguishable 404, no token in logs, no DB work for malformed tokens |
| Token leaked via DB or Supabase anon API | hash only; RLS enabled and `anon`/`authenticated` revoked on all new tables; launch gate for the 45 old tables (13.5) |
| Token forwarded (transferable) | explicit admin warning, optional password and lockout, expiry, revoke, Rotate, access log, anomaly banner and notification, strong partner-name watermark, noindex/no-store |
| Token leaked through Referer, link previews, platform logs | `Referrer-Policy: no-referrer`; no third-party scripts; token never printed on the page; bot UAs get a data-free stub; hosting-log exposure stated in the admin warning |
| Password brute force (incl. parallel guesses) | atomic attempt reservation before bcrypt (at most 5 compares per lock window), lockout checked first, per-IP fail bucket incremented first, cost 12, min length 10 |
| Cookie forgery or replay | HMAC with a domain-separated key, `timingSafeEqual`, bound to `unlockVersion`, row re-read per request |
| Log flooding or DoS | atomic `PartnerRateLimit`, no log row when limited, NOT_FOUND rows capped per IP and globally, 90-day retention run hourly, once-per-2-min OK rows |
| Cross-deal or cross-partner access (IDOR) | ids derived from the token; deal-scoped HMAC keys with derived secrets; other deals, partners and buyers never queried by the public path |
| Resale link covers a stone outside the deal, a sold stone or an enumerating scope | footprint check, AVAILABLE + no live order + no reservation, CATALOGUE/COLLECTION impossible, payload built server-side, TTL cap, active-link cap under advisory lock, mint rate limits |
| Agent sees through resale what the admin hid from them | resale fields = whitelist INTERSECT effective flags; leak test compares resale HTML fields with the DTO-visible fields |
| Resale buyer walks the catalogue (existing fail-open helpers) | 8.6 fail-closed where-builders, deal-footprint intersection, scope-aware deep routes |
| Resale page leaks costs, valuation, notes, terms; render path falls back to the full-row path | whitelist select path; dispatch on `partnerDealId OR createdById LIKE 'partner:%'`; DB CHECK and RESTRICT FK; `observations`, `mineSource`, `initialValuation` structurally absent; leak test in both modes including a nulled `partnerDealId` |
| Neutral mode reveals Serendib (HTML, metadata, CGI copy, icon, hostname) | `generateMetadata`, neutral CGI copy and tooltip, neutral icon, opaque stone refs, generic alt, `NEUTRAL_BASE_URL` host with host-only answering, warning when unset, `/serendib/i` regex tests |
| Impersonation in contact fields or messages | normalised anti-impersonation match, stored partner details by default (override only by deal flag), no free text in BRANDED, fixed "Shared by an independent partner" line, strict email/phone formats |
| Leaked token used to mint resale links that outlive revocation | `partnerAccessId` on every minted link, compromised-revoke default, per-access listing, mint refused for revoked/expired access |
| Search-engine, cache, framing | noindex headers and metadata, `no-store`, `X-Frame-Options`/CSP `frame-ancestors` |
| Receipts, certificates, intake photos reveal the vendor or stay public | default off; proxy enforces flags at download; `partnerHidden` per asset; intake-stage assets hidden unless supplierIdentity; warnings; limitation documented for R2 URLs |
| Wrong number shown (FX, double count, stale status, hand-edited status, overflow) | section 3.3 countermeasures, flags, BigInt integer engine, golden (W1-W35) and differential tests, snapshots with replay |
| Over-payment to partners (M4 capital above cost, stacked co-partners, fees above revenue) | capital capped by cost and revenue, INVESTED_EXCEEDS_BASIS block, aggregate obligation BLOCK, FEE_EXCEEDS_REVENUE ack |
| Silent rewrite of a paid amount | append-only triggers (UPDATE/DELETE/TRUNCATE), snapshot hash, DB terms lock, terms and membership locks, adjustments only |
| FX or denominator churn on settled figures | rates frozen at first settlement, frozen deal-stone weights, materiality threshold |
| Concurrent settle, payout or resale mint | per-deal advisory lock inside the transaction |
| Stale JWT after a deny or deactivation | fresh capability re-read on money and access actions |
| Thrown server-action errors redacted in production | public and expected failures return `{ ok:false, error }`; zod-parsed input, try/catch |
| Admin preview writes logs or counters | `AdminPreview` viewer is refused by the log and counter code |
| Audit rows reveal partner terms to many roles | amounts only in metadata, neutral `newValue`, Partner* entities hidden from dashboard and `/audit-log` without `partner:read` |

### 13.2 Script tests (no browser; the repo has no test runner; follow `scripts/test-money.ts`: a `check(name, got, want)` helper and DB writes inside a rolled-back `$transaction` via a sentinel throw)
Run server-only modules with `NODE_OPTIONS=--conditions=react-server npx tsx scripts/<file>.ts` (PowerShell: `$env:NODE_OPTIONS="--conditions=react-server"; npx tsx ...`). Pure engine tests run with plain `npx tsx`.
1. **`test-partner-engine.ts` (pure):**
   - Golden fixtures W1-W35 (including W28b), asserting every intermediate (R, C, profit, f, principalReleased, capital, share) and the totals.
   - **Differential test:** an independent reference model using `Prisma.Decimal` (decimal.js, 40 dp, `ROUND_HALF_UP`) with a different evaluation order (single final rounding per bucket, plain division); 5,000 seeded random deals (4 methods x 2 scopes x earnOn x partial payments x losses x 1-8 stones x 1-4 units x frozen weights); difference per bucket `<= 2 x (units + 1)` minor units and EXACT equality when every `f = 1` and each bucket has one unit; engine total equals the sum of bucket amounts exactly.
   - **Properties:** M2 invariant under any cost perturbation (also type-level); M3 invariant under price and cost perturbation and under current-weight changes; M1/M4 profit parts >= 0; M4 `principalReleased <= invested`, `capital <= min(principalReleased, C)` and `capital + profitShare <= R` for every random deal including `invested > cost`; PER_STONE total equals the sum of rows; POOLED with one stone equals PER_STONE; `f = 1` equals SALE; scaling all money by k scales results within rounding; determinism (same input -> identical JSON); `replaySettlement` equality; `ENGINES` keeps old versions; the engine never throws for negative amounts (units become INVALID).
   - Money: `divRound` half-away for +/-; `allocateMinor` sums exactly, ties to the lower index, equal-weight fallback, empty array throws; `convertMinor` cross via LKR, null on a missing rate, correct (BigInt) results above 2^53 (W35) and a thrown invariant if a result is not a safe integer; `decimalToMinor` on `numeric(65,30)` strings; `PARTNER_CURRENCIES` all 2 minor digits.
2. **`test-partner-gather.ts` (DB, rolled back):** seed a rough with parcel, bill and a CUT in the exact shape of `completeCuttingJob` (3 gems with ROUGH_PURCHASE, bill and CUTTING lines per weight share; this closes "cut allocation never run live"), a late rough bill (and one with no derived gems), a rejected bill, a direct-acquisition gem with a supplier-named description, a USD sale with and without a rate, a cancelled-then-re-sold gem, a pooled lot, a parcel with header drift, a stone already sold when attached, a commission-like bill. Assert W22/W23/W24/W6/W7/W25 values, no double counting (deal on the rough == sum of gem lines + late bills, never + rough purchase), flags (NEEDS_RATE_*, LATE_ROUGH_BILL_ALLOCATED, LATE_BILL_UNALLOCATED, MULTIPLE_CUTS when forced, REJECTED_BILL_IN_CUT, CANCELLED_WITH_PAYMENTS, STATUS_MISMATCH, COST_DRIFT after a `changeAskingPrice`-style currency relabel, PARCEL_DRIFT, STONE_ALREADY_SOLD, WEIGHT_CHANGED, NEGATIVE_COST_LINE, POSSIBLE_PARTNER_PAYOUT_BILL with no text leaking into evidence), `Gemstone.totalCost` never used, payments after `asOf` ignored, `countSalesFrom` honoured, overlap rejection.
3. **`test-partner-ledger.ts` (DB, rolled back):** reconcile flows W21, W22, W25, W28, W28b, W30, W31, W32; settlement refused when nothing new; `DATA_CHANGED` on a changed hash but NOT on a moved live rate (supplied rate map used); `RATES_STALE` after 15 min; BLOCK and ACK handling; FALLBACK-rate refusal; frozen rates written at the first commit; payout above balance refused; reversal rules; W33 aggregate block; UPDATE/DELETE/TRUNCATE on the four append-only tables must throw; deal terms change after a ledger row must throw; currency mismatch insert must throw; two concurrent `commitReconcile` calls serialise (second sees updated credited); `inputsHash` stable; invariant `sum(credited_b) == engine total`; terms and membership locks; M4 invested allocation sums (both scopes); write-off and close rules.
4. **`test-partner-leak.ts` (C):**
   - **DTO leak test:** plant sentinels (`SENTINEL_SUPPLIER, SENTINEL_BUYER, SENTINEL_NOTE, SENTINEL_STAFF, SENTINEL_OTHERPARTNER, SENTINEL_VENDOR, SENTINEL_AUDIT, SENTINEL_VALUATION, SENTINEL_OBS, SENTINEL_ORIGNAME` plus numeric sentinels cost 777777.77, purchase 555555.55, price 999999.99, valuation 7777777) in supplier name, `CostAllocation.description`, `Expense.vendor/notes`, customer name and contacts, `AuditLog.newValue`, comments, `observations/mineSource/initialValuation/valuationNotes`, `DigitalAsset.caption/originalName/createdBy`, transformation `operator`, cutter name, `Partner.notes`, `internalNotes`, adjustment `reason`, payout `reference`, and a second partner's deal with its own name and terms. Build the DTO for the three presets, each single flag toggled alone, 300 random flag combinations and every method and both earnOn values. `JSON.stringify(dto)` must contain no sentinel string, no sentinel number (as `777777.77`, `777,777.77`, `77777777`) when its flag is off, no cuid (`/\bc[a-z0-9]{24}\b/`), no `/rough/` or `/gemstones/` internal href, none of the NEVER-copied key names, no Date/Decimal/bigint objects; fields with a flag off are exactly `null`; forced flags hold; and (v4) for every combination, no hidden figure (purchase cost, payment progress, sale price) is derivable from the visible ones (e.g. for M1/M4 `price - profit` never equals a hidden cost). Plus the object-spread grep over `partner-view*.ts`.
   - **Public `/s` output leak test** (static-markup harness per the share scout recipe: tsconfig with `"jsx":"react-jsx"` and the `@/*` alias, `globalThis.React = React` before a dynamic import, `tsx --tsconfig`; presentational components free of `server-only`): render partner-tagged resale pages (index, gem, rough) in NEUTRAL and BRANDED mode for a gem and a rough carrying sentinels in cost, supplier, `observations`, `initialValuation`, `mineSource`, `totalCost`, `minimumPrice`, staff `createdBy*`, deal terms, payouts, internal notes: none may appear. NEUTRAL: `!/serendib/i` over HTML including `<title>`, description, icon href, alt, hrefs and CGI copy (assert `generateMetadata` output too) and `!/SGS-/`. Staff broker links: `!/serendib/i`. For every flag combination the fields shown in the resale HTML are a subset of the DTO-visible fields (intersection rule). This test FAILS today (CGI cards, metadata), proving the 8.6 fixes.
   - **Scope tests** (DB, rolled back, `test-resale-scope.ts`): a link for stone A must 404 on `/s/<code>/<B>` and `/s/<code>/r/<B>` for B not in the link, including non-AVAILABLE gems, a rough served under a gem link and a gem under a rough link, other deals' stones, removed deal stones, closed deals and revoked links; empty/`null`/unknown-scope payloads match nothing; a partner-tagged link whose `partnerDealId` is forced to NULL in the test still renders through the whitelist path (or 404s) and never the full-row path; the 7 live ShareLink shapes (5 CATALOGUE null payload, 2 GEMSTONE) still resolve.
5. **`test-partner-access.ts` (A):** token entropy and length, hash lookup, wrong shape (no DB access: spy on prisma); expired, revoked, inactive deal and unknown all return the same outcome shape; 50 parallel wrong passwords run bcrypt at most 5 times and lock the access; lockout checked BEFORE bcrypt (spy); cookie tamper, replay after password change, after revoke; rate-limit atomicity (50 concurrent `rateHit` calls equal exactly 50); NOT_FOUND log caps; log rows contain no raw token or IP; counters awaited; `after()` fallback; bot UA gets the stub and no counters; admin preview writes nothing; rotation revokes the old access; retention runs at most once per hour.
6. **`test-resale-mint.ts` (C):** key not in footprint, mixed kinds, sold gem, reserved gem, rough with derived gems, rough in a disallowed status, TTL NaN/Infinity/above cap, active-link cap with concurrent mints (cap never exceeded), sixth mint in an hour, CATALOGUE/COLLECTION attempts, contact containing "Serendib" and obfuscations ("S3rendib", "Ser endib", zero-width), contact override refused when the deal flag is off, message in BRANDED refused, payload rebuilt server-side, row shape and tag (`createdById = partner:<id>`, `partnerDealId`, `partnerAccessId`), 22-char code, neutral URL host from `NEUTRAL_BASE_URL`, deal closed => links revoked, minting access revoked => mint refused, compromised revoke kills the minted links.
7. **`test-partner-visibility.ts` (A):** fail-closed parse (missing and `"true"` strings are false), presets, forced and dependency rules per method and earnOn, `explainable`, warnings, derived-figure checks.
8. **Headers** (against `next build && next start`): `curl -I /p/<anything>` shows noindex, `no-store`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` and 404 (not a redirect to login); `/s/<code>` gets noindex.
9. `npm run typecheck`, `ESLINT_USE_FLAT_CONFIG=false npx eslint src --ext .ts,.tsx --no-cache` (baseline 0 errors, 1 warning), `npm run build` (no page may query the DB at build; keep new pages dynamic, no `generateStaticParams`).

### 13.3 Live-data sanity checks (read-only)
- After migration: all 10 tables exist, `relrowsecurity` true, `has_table_privilege('anon','"PartnerDeal"','SELECT')` false, triggers present (including TRUNCATE and terms lock), second run a no-op.
- Dry-run `gatherDeal` + engine inside a rolled-back transaction for a hypothetical M1 10% deal on gem `SGS-G-2026-000001` (15,000,000 LKR direct acquisition, asking 25,000,000): cost 15,000,000 via its single `ROUGH_PURCHASE` line, no COST_DRIFT, no sale -> estimate 0; and rough `SGS-R-2026-000001` (1,000,000 LKR, uncut) -> cost 1,000,000 with ROUGH_UNCUT info; no live SalesOrder or Payment rows exist, so no revenue is expected.
- Recompute every existing gem's cost from lines and compare with `Gemstone.totalCost`.
- Unauthenticated `curl -I https://serendib-erp.vercel.app/p/doesnotexist` -> 404 with the required headers; `/partners` -> 307 /login; existing `/s/<code>` links still render after the fail-closed change.

### 13.4 Manual UI checks
Create partner -> deal (each method) -> attach a rough, cut it, sell a gem -> estimate changes live; reconcile, payout; add a late bill -> drift appears -> adjustment (W21); run a real manual cut on a scratch rough and verify unit costs; create an access link (warning shown, URL once), open in a private window at 375 px and desktop (no horizontal scroll, stacked tables), password gate, wrong passwords lock, revoke -> 404, rotate; flip every visibility switch and confirm the live preview equals the public page for the same flags and that locks show their reasons; check the access log after a wrong-password burst; resale dialog neutral preselected; neutral buyer page free of Serendib text, title, favicon and (with `NEUTRAL_BASE_URL`) hostname (view source); admin sees and revokes the resale link; print the partner page and check the watermark; confirm the page works with the CSP enabled; stone Partners tab hidden for SALES; paste the link into WhatsApp and confirm no data preview.

### 13.5 Launch gates (before the FIRST partner link is created)
1. **Supabase Data API check (v4):** with the project's anon key run one request against `/rest/v1/Gemstone`. If it returns rows (Data API enabled, RLS off, `anon` SELECT granted on all 45 existing tables), either disable the Data API in Supabase or run a separate, owner-approved `scripts/lock-down-rls.ts` (ENABLE RLS + REVOKE anon/authenticated on the existing tables; the app role is BYPASSRLS, so the app is unaffected). It is deliberately NOT part of the additive migration, because it changes existing-table privileges. All partner switches are moot while the Data API is open.
2. `NEUTRAL_BASE_URL` decision recorded (open question 3).
3. 8.6 prerequisite fixes merged and the resale/leak tests green.

---------------------------------------------------------------------------------------------------
## 14. Explicit non-goals, follow-ups and owner questions

**Non-goals (v1):** GL posting; partner login or cross-deal hub; e-signatures or in-app acceptance of terms; automatic cash clawback; advances (payouts above balance); arbitrary historical "as of" replays (no historical FX exists; settlement snapshots are the only point-in-time record); partner-entered data other than resale links; multi-currency payouts (payouts are in the deal currency, original amount informational); tax and withholding; changing terms after the first ledger row (close and recreate); deal-level extra cost rows; a deal-level "net across stones" switch (use POOLED); legal or accounting advice (notice only); PDF generation (print only); partner notifications by email or WhatsApp; throttling of the existing `/s` routes beyond the resale fixes.

**Follow-ups:**
1. **GL posting** (only after sales, inventory and COGS reach the GL, otherwise partial posting is inconsistent): post only LKR deals (as `autoPostCapitalJournal` skips non-LKR). Settlement: Dr `COS_DIRECT_SELLING` (5500) / Cr `ACCRUED_EXPENSES` (2400). Payout: Dr `ACCRUED_EXPENSES` / Cr `BANK`; RECEIVED reverses. Investor principal received: Dr `BANK` / Cr a new "Investor funds" liability (or `OTHER_LOANS` 2300); principal returned reverses it. Never `CapitalTransaction` (directors/shareholders only). Add `"PARTNER"` to `JOURNAL_SOURCE_MODULES`; reversals go through the partner record because `reverseJournalEntry` refuses non-MANUAL sources.
2. Partner hub page (one link for all of a partner's deals).
3. RLS and revoke on the 45 existing tables (launch gate 13.5 decides whether this must come first).
4. Money-layer prerequisite fixes (3.8): `changeAskingPrice` currency relabel, rejected-bill neutralisation, `CostAllocation.sourceAllocationId`, second-cut guard, cancel-sale flow, payment refund flow, `Payment.orderCurrencyAmount`, stored FX history, hand-editable status guard, sign check on cost lines, document the two raw guard indexes (they exist only as raw SQL).
5. Legal and accounting review of the Sri Lankan treatment of broker/agent commissions and investor arrangements before real use (including whether accepting investor funds is regulated).
6. Private bucket plus signed URLs for receipts; thumbnails and EXIF stripping for media.
7. Admin Share links page (list and revoke all links), per-view log for ordinary share links, enforcement of `Collection.passwordHash`, throttling of `/s`.
8. Move `middleware.ts` into `src/` only together with an allow-list for `/serendib-logo.jpg`, `/icon.svg`, `/uploads/*`, `/api/exchange-rates`.
9. Public `/verify/[code]` and `/catalogue/[code]` expose acquisition dates and certificate files for sequential codes: unguessable verify tokens and removal of the acquisition date.
10. Items to verify while building: Next `after()` behaviour on Vercel Hobby; whether `src/app/icon.svg` beats `metadata.icons`; CSP compatibility with Next hydration; Vercel `x-forwarded-for` overwrite; bcryptjs cost 12 latency; the `Payment` timestamp column (fallback used: `receivedAt ?? saleDate`); production redaction of thrown server-action messages; whether `ExpenseCategory` contains a commission/brokerage value.

**Owner open questions (these need the owner's answer; none blocks the build):**
1. Two or three capabilities: keep `partner:settle` separate (recommended) or fold into `partner:write` and give FINANCE `partner:read` only.
2. BRANDED resale mode: confirm it shows Serendib branding with the partner's own stored contact under "Contact your agent" (no partner free text).
3. Neutral domain: will the owner provide a seller-neutral custom domain for `NEUTRAL_BASE_URL`? Until then neutral links still show the Serendib hostname (warned) because decision 7 keeps neutral as the default.
4. Forced visibility rules: confirm that M2 forces `salePrice`, M1/M4 force `profitFigures` (and cost when price is visible) and PAYMENT forces payment progress when derivable, or ask for a typed "partner can calculate X" override stored on the deal.
5. Maker-checker: should a second `partner:settle` user approve manual positive adjustments above a threshold?
6. Staff-created broker links keep `SGS-` codes in URLs; accept, or add opaque codes for all broker links?
7. M4 capital cap: confirm that investor capital is capped by recognised total cost (investors may fund cutting and bill costs), not only by the acquisition price.
8. Approve a separate `scripts/lock-down-rls.ts` for the existing tables if the Data API check shows it is open.
9. Rounding: confirm half-away-from-zero (documented bias of at most 0.005 per rounded amount in the partner's favour) is acceptable.
