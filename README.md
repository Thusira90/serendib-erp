# Serendib Gemstones ERP

Production-grade ERP and gemstone-lifecycle platform for **Serendib Gemstones (Pvt) Ltd** — Sri Lankan gemstone sourcing, cutting, trading and jewelry.

> **Milestone 1 — Foundation**
>
> Schema · authentication · role-based access · rough stones · finished gemstones · gemstone genealogy · inventory locations · audit log · dashboard.
>
> **Milestone 2 — Certification, CGI & true costing** ✓
>
> Laboratories & certificates (with status workflow, PDF uploads, per-stone tab and global register) · CGI projects with versioned renders and single-master invariant · digital-asset uploads (photos / video / catalogue) · cost-allocation UI feeding the true-cost rollup · asking-price changes preserved in `PriceHistory` and audited · cutting-plan builder on rough detail.
>
> **Milestone 3 — CRM, quotations, reservations, sales, payments** ✓
>
> Customer master records with preferences · enquiries · quotations (printable) · reservations with expiry · sales orders with auto-numbered invoices · payments with automatic PARTIAL/PAID rollup · Reserve / Sell / Release actions on the gemstone master · the core "can't sell twice" invariant enforced inside a single DB transaction that atomically updates gemstone status, reservation state, and audit log.
>
> **Milestone 4 — Public verification, QR codes, shipping** ✓
>
> Public unauthenticated `/verify/<SGS-G-…>` page that surfaces identity, certificate, and approved media only (never cost or supplier). Server-rendered QR codes on every gemstone and rough record, plus a printable label sheet. Shipping module (`Shipment` per sales order) with a Preparing → Packed → Shipped → In Transit → Delivered flow that atomically nudges the sales order between `SHIPPED` and `DELIVERED`.
>
> **Milestone 5 — Reporting, analytics, alerts** ✓
>
> `/reports` hub with **Inventory / Sales / Profitability / Cutting** dashboards — each pulls live data through a single `src/lib/reports.ts` layer, renders inline SVG charts (no external chart library), and offers CSV export via `/reports/export?kind=…`. Executive dashboard upgraded with **Revenue this month / YTD / Gross profit / Outstanding** KPIs, a rolling 6-month revenue chart, and a "This Week" alerts widget covering **reservations expiring, quotations expiring, follow-ups due, and sold-but-unshipped stones**.
>
> **Milestone 6 — Public catalogue + notification inbox** ✓
>
> Unauthenticated `/catalogue` storefront with filter form (type / origin / treatment / weight / price bands) and per-stone `/catalogue/<code>` detail page — cost, supplier, margin never leak. Persisted `Notification` model with 14 event types and per-role audience routing; every mutating action in sales / reservations / payments / shipments / certification / CGI now fans out notifications inside its own transaction. New topbar bell shows unread count; `/inbox` supports mark-read, mark-all-read, and dismiss.
>
> **Milestone 7 — Smart matching + natural-language search** ✓
>
> Rule-based scoring engine ranks customers against a gemstone (and gems against a customer) across 8 facets (gem type, variety, origin, colour, shape, treatment, weight window, budget window) with per-facet reasons and misses; **Matches** tab on both the gemstone and customer master records. Natural-language query parser accepts phrases like `"untreated Ceylon sapphires above 3ct under $20k"` and translates them into type / variety / origin / colour / treatment / shape / weight / price filters, then chips-back the interpretation for transparency. Both work without an LLM API key.
>
> **Milestone 8 — Expenses + P&L** ✓
>
> First-class `Expense` model with 15 categories, receipt uploads, optional link to any business entity (gemstone, rough, cutting job, customer, shipment), and a status flow (Recorded → Approved → Reimbursed / Rejected). Global `/expenses` register with YTD-by-category chart and per-month KPIs. New `/reports/pnl` — a full rolling-12-month profit-and-loss statement combining sales revenue, allocated COGS from the gemstone true-cost rollup, and operating expenses from the register — with gross/net margin, month-by-month rows, and by-category and by-country breakdowns.
>
> **Milestone 9 — Operations completeness** ✓
>
> **Start Cutting** dialog on rough detail creates a `CuttingJob` and flips the rough to `IN_CUTTING` inside a single transaction. New `/cutting/[id]` detail page with the status flow and a **Complete job** dialog that accepts multiple output stones — the completion action mints one `Gemstone` per output, creates the `GemstoneTransformation` (input/output/yield/waste), auto-allocates rough + cutting cost proportionally by output weight to each new stone's `CostAllocation`, sets the rough to `CONVERTED`, and notifies stakeholders. **Move-to-location** dialog on both rough and gemstone detail pages writes an `InventoryMovement` row and updates the item location, audited. New `/suppliers/[id]` detail page with per-supplier KPIs (total spend, weight sourced, avg per ct) plus full parcel and rough registers.
>
> **Milestone 10 — Parcel intake wizard + Location creation** ✓
>
> New `/parcels/new` page that takes a parcel header (supplier, date, origin, total cost, storage location) plus a variable-row table of rough stones, and in a single transaction creates the parcel with its auto-numbered code plus one rough record per row. Any row that omits a per-stone price is auto-priced by pro-rata weight against the leftover parcel budget, so every stone still lands with a real cost that will flow into COGS later. **New location** dialog on `/locations` supports parented storage entries (vault → cabinet → tray) with a uniqueness check on the location code.
>
> **Milestone 11 — User management + Company settings** ✓
>
> Administrators can now onboard team members from `/users` — **Add user** dialog, inline role change per row (blocked on your own account), **Reset password**, and **Disable/Re-enable**. All actions audited. New `CompanySettings` singleton + `/settings` page for legal name, address, contact, registration/tax numbers, and defaults for currency + payment/delivery/shipping terms. Those values now flow live into the quotation PDF "From" block, the quotation terms fallback, the public `/verify` footer, and the `/catalogue` footer.
>
> **Milestone 12 — Branded invoice + rough quick-edit + logo polish** ✓
>
> Sales-order detail page now renders as a proper invoice with the real logo header, a **From** block sourced from `CompanySettings`, and a **Bill to** block. New **Edit** button on rough detail opens a compact dialog for the frequently-edited fields (type/variety/weight/color/clarity/observations/status/price/location); `updateRoughStone` was extended to persist observations and recompute `pricePerCt` on weight/price change. Real Serendib Gemstones logo now used everywhere via `SgsMark`, including a solid white chip on the login gradient so the full-colour mark reads cleanly.
>
> **Milestone 13 — Gemstone edit + reservation sweeper + cadence** ✓
>
> **Edit** button on the finished-gemstone detail opens a compact 3-column dialog covering type/variety/species/origin/treatment/dimensions/shape/cut/colour/clarity/luster/fluorescence/symmetry/polish/inclusions/status/location; the action recomputes `costPerCt` and `pricePerCt` when weight changes, and every field diff is written to the audit log. New [`sweepExpiredReservations`](src/lib/sweeper.ts) helper called on the dashboard and `/reservations` load — any `ACTIVE` reservation past its `expiresAt` is auto-flipped to `EXPIRED`, the gemstone is restored to `AVAILABLE`, an audit row is written, and stakeholders are notified. Dashboard gains three cadence tiles — **Since last sale**, **Since last enquiry**, and **Available stock** — with fresh / cooling / stale badges to make dry spells obvious at a glance.
>
> **Milestone 14 — Universal comments + quick-quote** ✓
>
> New cross-entity `Comment` model + reusable [`CommentsThread`](src/components/comments-thread.tsx) server component. Added a **Notes** tab on the finished-gemstone, rough-stone, and customer detail pages, plus an inline notes section under the sales-order invoice — team members can drop context that isn't a status change (e.g. "customer prefers direct courier, no DHL"). Notes carry author + timestamp; author or admin can delete. New per-row **Quote** action on `/enquiries` opens a compact dialog pre-filled with the enquiry's customer, its gemstone (if any), and the gem's asking price — one click to draft a threaded quotation (auto-links `enquiryId` and flips the enquiry to `QUOTED`).
>
> **Milestone 15 — Direct-acquisition finished gemstones** ✓
>
> New `/gemstones/new` intake form + **Register gemstone** button on the finished-gemstone gallery. Use it for already-cut stones acquired from a dealer, auction, or private sale. In one transaction the `createFinishedGemstone` action mints a new `SGS-G-YYYY-######`, saves every specification field, records the purchase as a `CostAllocation` of type `ROUGH_PURCHASE` (so it flows through the true-cost rollup + P&L), optionally attaches a primary photo, audits with the vendor + reference, and pings management. In-house cut stones still go through Rough → Start cutting → Complete job so lineage is preserved automatically — the intake page's own copy points people there.

## Design principles

- **Every stone has a permanent identity.** Rough stones get `SGS-R-YYYY-######`, finished gemstones get `SGS-G-YYYY-######`. IDs are minted inside a serialized transaction so they never collide.
- **Rough → finished traceability is first-class.** The `GemstoneTransformation` table records inputs, outputs, yield, waste and cost. One rough can produce many finished stones. One finished stone can come from many rough inputs.
- **Nothing important is silently overwritten.** Price changes go into `PriceHistory`. Every mutating action goes into `AuditLog`.
- **RBAC everywhere.** Nine roles, capability-scoped. Server actions call `requireCapability(...)` before touching data.

## Stack

- Next.js 15 (App Router, Server Actions) + TypeScript
- PostgreSQL 16 via Docker Compose
- Prisma ORM
- Tailwind CSS + shadcn-style primitives (Radix under the hood)
- NextAuth v5 credentials, JWT sessions
- Zod for input validation
- bcryptjs for password hashing

## Brand

Palette is derived from the SGS logo:

| Token | Hex | Role |
|---|---|---|
| SGS Teal | `#2C5F6C` | Primary — chrome, key surfaces |
| SGS Purple | `#501464` | Accent — badges, gemstone hero cards |
| Bone | `#F7F5F1` | App ground |
| Ink | `#0F1414` | Body text |

The interlocked-diamonds mark is drawn as inline SVG in [`src/components/brand/logo.tsx`](src/components/brand/logo.tsx) so it works before you drop in a real asset. Drop your official logo file at `public/logo.svg` if you want to reference it directly elsewhere.

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Start Postgres

```bash
docker compose up -d
```

If Docker Desktop isn't installed on this machine, install it from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) or run any local Postgres on port 5432 with database `serendib_erp` and user `serendib` / password `serendib`.

### 3. Copy env

```bash
cp .env.example .env
```

(A workable `.env` is already committed for local dev.)

### 4. Create schema + seed demo data

```bash
npm run db:push
npm run db:seed
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo accounts

All passwords are `password123`.

| Email | Role |
|---|---|
| `admin@serendib.lk` | Administrator (sees everything) |
| `management@serendib.lk` | Management |
| `buyer@serendib.lk` | Gem Buyer |
| `gem@serendib.lk` | Gemologist |
| `cutter@serendib.lk` | Cutter |
| `sales@serendib.lk` | Sales |

Sign in as the buyer and register a new rough stone; sign in as the cutter and inspect the sample cutting job; sign in as sales and look at the finished-gemstone gallery. Each role only sees the modules their capabilities cover.

## What the seed data shows

- Three suppliers (Sri Lanka x2, Myanmar x1)
- Two parcels
- Five rough stones (mixed sapphire, spinel, padparadscha)
- A cutting plan with three alternatives and one selected
- A completed cutting job that transformed one 25.4 ct rough into three finished sapphires (8.72 ct + 2.14 ct + 1.06 ct)
- A `GemstoneTransformation` linking them, with computed yield (46.9%) and waste (13.48 ct)
- Cost allocations flowing rough purchase + cutting cost into each finished stone's true cost
- Three price-history entries on the flagship stone
- Three audit-log samples

Open **Genealogy** in the sidebar to see the tree, or the flagship stone's **Costing** and **Pricing** tabs.

## Repo tour

```
prisma/
  schema.prisma     — the data model (Milestone 1 scope)
  seed.ts           — realistic demo data

src/
  app/
    (auth)/login    — sign-in page + server action
    (app)/          — protected app shell (sidebar + topbar)
      page.tsx      — dashboard
      rough/        — rough-stone list / detail / new / actions
      gemstones/    — finished-gemstone gallery / master detail
      genealogy/    — cross-cutting lineage view
      locations/    — hierarchical location tree
      audit-log/    — read-only audit
      cutting/      — cutting-job register
      suppliers/    — supplier list
      parcels/      — parcel list
      users/        — user list (admin only)
      search/       — global search across gem/rough IDs
    api/auth/…      — NextAuth handlers
  components/
    brand/          — SGS logo mark
    shell/          — sidebar + topbar
    ui/             — shadcn-style primitives
    genealogy-tree.tsx
    status-badge.tsx
  lib/
    db.ts           — Prisma singleton
    auth.ts         — NextAuth v5 config
    rbac.ts         — server-side capability check
    rbac.client.ts  — client-safe mirror
    ids.ts          — SGS-R / SGS-G / TX / CJ code minting
    audit.ts        — writeAudit + auditDiff
    genealogy.ts    — recursive tree builder
    utils.ts        — cn(), formatCarat, formatCurrency…
  middleware.ts     — auth gate
```

## Roadmap

**Milestone 7** — natural-language search, AI layer (customer↔stone matching, auto-description drafting), expenses as a first-class module, object storage swap-in for media.

## Deferred infrastructure

* Object storage — media currently persists under `public/uploads/`. In production swap `src/lib/uploads.ts` for S3 / Cloudflare R2.
* Public gemstone verification page (`/verify/SGS-G-…`) — schema already supports it, needs a public route + certificate signature.
* Notification / task inbox.
