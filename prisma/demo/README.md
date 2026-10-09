# Demo data

`npm run db:seed:demo` fills a **local** database with a full, connected demo dataset (Jan–Oct 2026) across every module.

**It wipes every table first and refuses to run unless `DATABASE_URL` points at localhost.** It can never touch production.

## Setup

1. A local Postgres with a **UTF-8** database (`docker compose up -d` also works if Docker/WSL is installed).
2. A local `.env` (gitignored) whose `DATABASE_URL` / `DIRECT_URL` point at it, e.g.
   `postgresql://serendib:serendib@localhost:54329/serendib_demo`.
3. `npx prisma db push` (creates the schema), then `npm run db:seed:demo`, then `npm run dev`.

Re-run `npm run db:seed:demo` any time to reset to a fresh copy of the demo.
Every demo login uses the password `password123` (e.g. `super@serendib.lk`, `finance@serendib.lk`, `sales@serendib.lk`).
Gem and certificate pictures are generated into `public/uploads/demo/` (gitignored).
