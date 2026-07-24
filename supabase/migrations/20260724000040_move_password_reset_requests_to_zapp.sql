-- Migration: move password_reset_requests from public to zapp schema
--
-- Context:
--   The table was created in public schema (migration 20251231131349) and was never moved.
--   The Supabase client is configured with db: { schema: 'zapp' }, so:
--     • supabase.from('password_reset_requests').insert(...) in useForgotPassword.ts:44
--       → PGRST205 "relation not found in schema cache"
--     • safeClient.from('password_reset_requests_safe', ...) in PasswordResetRequestsPanel.tsx:65
--       → PGRST205 (zapp.password_reset_requests_safe doesn't exist, only public version does)
--     • Realtime subscription { schema: 'zapp', table: 'password_reset_requests' }
--       → migration 20260724000039 skips it because no physical table in zapp.
--
--   This migration:
--     1. Moves public.password_reset_requests → zapp.password_reset_requests
--     2. Recreates RLS policies using zapp.is_admin_or_supervisor()
--     3. Creates zapp.password_reset_requests_safe view (for safeClient.from calls)
--     4. Recreates public.password_reset_requests_safe pointing to zapp table (compat)
--     5. Adds zapp.password_reset_requests to supabase_realtime publication

-- ---------------------------------------------------------------------------
-- Step 1: Move physical table from public → zapp
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'password_reset_requests'
      AND c.relkind IN ('r', 'p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'password_reset_requests'
      AND c.relkind IN ('r', 'p')
  ) THEN
    -- Drop the public safe view first (it references public.password_reset_requests)
    -- It will be recreated below pointing to the zapp table.
    EXECUTE 'DROP VIEW IF EXISTS public.password_reset_requests_safe';
    EXECUTE 'DROP VIEW IF EXISTS zapp.password_reset_requests_safe';
    -- Move the physical table
    EXECUTE 'ALTER TABLE public.password_reset_requests SET SCHEMA zapp';
    RAISE NOTICE 'MOVED password_reset_requests to zapp schema';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'password_reset_requests'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'password_reset_requests already in zapp schema — skipping move';
  ELSE
    RAISE NOTICE 'password_reset_requests not found in public or zapp — nothing to move';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Step 2: Ensure RLS is enabled on the (now-zapp) table
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'password_reset_requests') THEN
    EXECUTE 'ALTER TABLE zapp.password_reset_requests ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- Step 3: Drop stale policies (carried over from public schema after SET SCHEMA)
--         and recreate with zapp-context helpers
-- ---------------------------------------------------------------------------
DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'password_reset_requests'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.password_reset_requests', pol);
  END LOOP;
END;
$$;

-- Admins and supervisors can view all requests
CREATE POLICY "admins_view_password_reset_requests"
  ON zapp.password_reset_requests
  FOR SELECT
  TO authenticated
  USING (zapp.is_admin_or_supervisor());

-- Users can view their own requests
CREATE POLICY "users_view_own_password_reset_requests"
  ON zapp.password_reset_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Any authenticated user can submit a reset request for themselves
CREATE POLICY "users_insert_own_password_reset_requests"
  ON zapp.password_reset_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admins/supervisors can approve/reject (UPDATE)
CREATE POLICY "admins_update_password_reset_requests"
  ON zapp.password_reset_requests
  FOR UPDATE
  TO authenticated
  USING (zapp.is_admin_or_supervisor())
  WITH CHECK (zapp.is_admin_or_supervisor());

-- Admins/supervisors can delete requests
CREATE POLICY "admins_delete_password_reset_requests"
  ON zapp.password_reset_requests
  FOR DELETE
  TO authenticated
  USING (zapp.is_admin_or_supervisor());

-- ---------------------------------------------------------------------------
-- Step 4: Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.password_reset_requests TO authenticated;
GRANT ALL ON TABLE zapp.password_reset_requests TO service_role;

-- ---------------------------------------------------------------------------
-- Step 5: Create safe views
--   • zapp.password_reset_requests_safe — resolved by safeClient.from('password_reset_requests_safe')
--     (client sends Accept-Profile: zapp)
--   • public.password_reset_requests_safe — backward compat for any remaining public-schema references
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'password_reset_requests') THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW zapp.password_reset_requests_safe
        WITH (security_invoker = on) AS
      SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at,
             rejection_reason, token_expires_at, ip_address, user_agent,
             created_at, updated_at
      FROM   zapp.password_reset_requests
    $v$;

    EXECUTE 'GRANT SELECT ON zapp.password_reset_requests_safe TO authenticated';
    EXECUTE 'GRANT ALL    ON zapp.password_reset_requests_safe TO service_role';

    -- Recreate the public-schema safe view pointing to the zapp table
    EXECUTE $v$
      CREATE OR REPLACE VIEW public.password_reset_requests_safe
        WITH (security_invoker = on) AS
      SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at,
             rejection_reason, token_expires_at, ip_address, user_agent,
             created_at, updated_at
      FROM   zapp.password_reset_requests
    $v$;

    EXECUTE 'GRANT SELECT ON public.password_reset_requests_safe TO authenticated';
    EXECUTE 'GRANT ALL    ON public.password_reset_requests_safe TO service_role';

    RAISE NOTICE 'Created zapp.password_reset_requests_safe and public.password_reset_requests_safe';
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
    WHERE n.nspname = 'zapp' AND c.relname = 'password_reset_requests'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'SKIP zapp.password_reset_requests — not a physical table in this environment';
  ELSIF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename  = 'password_reset_requests'
  ) THEN
    RAISE NOTICE 'SKIP zapp.password_reset_requests — already in supabase_realtime';
  ELSE
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE zapp.password_reset_requests';
    RAISE NOTICE 'ADDED zapp.password_reset_requests to supabase_realtime';
  END IF;
END;
$$;
