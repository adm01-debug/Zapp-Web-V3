-- Migration: move hmac_selftest_audit from public to zapp schema
--
-- Context:
--   The table was created in public schema (migration 20260425154422) and was never moved.
--   The Supabase client is configured with db: { schema: 'zapp' }, so:
--     • safeClient.from('hmac_selftest_audit', ...) in useHmacAuditHistory.ts:31,53
--       → PGRST205 "relation not found in schema cache"
--     • safeClient.from('hmac_selftest_audit', ...) in HmacSelfTestButton.tsx:50
--       → PGRST205
--     • safeClient.from('hmac_selftest_audit', ...) in useAdminManagement.ts:1026
--       → PGRST205
--     • Realtime subscription { event: 'INSERT', schema: 'zapp', table: 'hmac_selftest_audit' }
--       in useHmacAuditHistory.ts:73 → silent no-op (no physical table in zapp)
--     • Migration 20260724000039 skips it because no physical table in zapp.
--
--   This migration:
--     1. Moves public.hmac_selftest_audit → zapp.hmac_selftest_audit
--     2. Enables RLS on the moved table
--     3. Drops stale policies (carried over from public schema after SET SCHEMA)
--     4. Recreates RLS policies using zapp.is_admin_or_supervisor()
--     5. GRANT SELECT, INSERT to authenticated; GRANT ALL to service_role
--     6. Adds zapp.hmac_selftest_audit to supabase_realtime publication

-- ---------------------------------------------------------------------------
-- Step 1: Move physical table from public → zapp (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'hmac_selftest_audit'
      AND c.relkind IN ('r', 'p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'hmac_selftest_audit'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'ALTER TABLE public.hmac_selftest_audit SET SCHEMA zapp';
    RAISE NOTICE 'MOVED hmac_selftest_audit to zapp schema';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'hmac_selftest_audit'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'hmac_selftest_audit already in zapp schema — skipping move';
  ELSE
    RAISE NOTICE 'hmac_selftest_audit not found in public or zapp — nothing to move';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Step 2: Ensure RLS is enabled on the (now-zapp) table
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'hmac_selftest_audit') THEN
    EXECUTE 'ALTER TABLE zapp.hmac_selftest_audit ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- Step 3: Drop stale policies (carried over from public schema after SET SCHEMA)
-- ---------------------------------------------------------------------------
DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'hmac_selftest_audit'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.hmac_selftest_audit', pol);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Step 4: Recreate RLS policies using zapp.is_admin_or_supervisor()
-- ---------------------------------------------------------------------------

-- Admins and supervisors can read all audit records
CREATE POLICY "hmac_selftest_audit_select_admin_supervisor"
  ON zapp.hmac_selftest_audit
  FOR SELECT
  TO authenticated
  USING (zapp.is_admin_or_supervisor());

-- Any authenticated user can insert their own execution record
CREATE POLICY "hmac_selftest_audit_insert_own"
  ON zapp.hmac_selftest_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (executed_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Step 5: Grants and index
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'hmac_selftest_audit') THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE zapp.hmac_selftest_audit TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.hmac_selftest_audit TO service_role';
    -- Index for RLS policy that filters by executed_by = auth.uid()
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_hmac_selftest_audit_executed_by ON zapp.hmac_selftest_audit (executed_by)';
  END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- Step 6: Add to supabase_realtime publication (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'hmac_selftest_audit'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'SKIP zapp.hmac_selftest_audit — not a physical table in this environment';
  ELSIF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename  = 'hmac_selftest_audit'
  ) THEN
    RAISE NOTICE 'SKIP zapp.hmac_selftest_audit — already in supabase_realtime';
  ELSE
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE zapp.hmac_selftest_audit';
    RAISE NOTICE 'ADDED zapp.hmac_selftest_audit to supabase_realtime';
  END IF;
END;
$$;
