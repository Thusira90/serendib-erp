-- Post-"prisma db push" guard. Idempotent; safe to run any number of times.
-- 1. Prisma cannot express these two partial unique indexes, so "prisma db push" drops them.
--    They enforce: one ACTIVE reservation per gem, one non-cancelled sale per gem.
-- 2. Re-asserts row-level security (no policies) on every public table and revokes the
--    Supabase anon/authenticated roles, so new tables never leave the Data API open.
--    The app connects as the owner role (postgres), which bypasses RLS.
-- Run by "npm run db:push" through the postdb:push hook, or manually:
--   npx prisma db execute --file prisma/guard-indexes.sql --schema prisma/schema.prisma

CREATE UNIQUE INDEX IF NOT EXISTS "Reservation_one_active_per_gem"
  ON "Reservation" ("gemstoneId")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "SalesOrder_one_live_sale_per_gem"
  ON "SalesOrder" ("gemstoneId")
  WHERE "status" <> 'CANCELLED';

DO $$
DECLARE
  t record;
  r text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END
$$;
