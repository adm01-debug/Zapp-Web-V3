-- Migration: Move public.user_sessions to zapp schema (BUG-39)
--
-- Problem: useUIInteractionManagement.ts calls supabase.from('user_sessions')
-- which routes through the zapp-schema client. public.user_sessions exists as
-- a physical table but there is no zapp.user_sessions view or table, causing
-- PGRST205 "Relation not found" on every session management operation.
--
-- Note: user_devices was already moved to zapp by migration 45. This migration
-- moves user_sessions to match, fixing the FK schema consistency as well.

DO $$
DECLARE
  v_schema text;
BEGIN
  -- Determine where user_sessions currently lives
  SELECT n.nspname INTO v_schema
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'user_sessions'
    AND c.relkind = 'r'
    AND n.nspname IN ('public', 'zapp')
  LIMIT 1;

  IF v_schema IS NULL THEN
    RAISE NOTICE 'user_sessions not found as physical table in public or zapp — skipping';
  ELSIF v_schema = 'zapp' THEN
    RAISE NOTICE 'user_sessions already in zapp schema — idempotent skip';
  ELSE
    -- Move from public → zapp
    EXECUTE 'ALTER TABLE public.user_sessions SET SCHEMA zapp';
    RAISE NOTICE 'user_sessions moved to zapp schema';
  END IF;
END;
$$;

-- Enable RLS (idempotent)
ALTER TABLE zapp.user_sessions ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist (idempotent cleanup)
DROP POLICY IF EXISTS "Users can view their own sessions" ON zapp.user_sessions;
DROP POLICY IF EXISTS "System can insert sessions"       ON zapp.user_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON zapp.user_sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON zapp.user_sessions;
DROP POLICY IF EXISTS "Service role has full access to user_sessions" ON zapp.user_sessions;

-- Recreate policies using zapp-canonical auth helpers
CREATE POLICY "Users can view their own sessions"
  ON zapp.user_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can insert sessions"
  ON zapp.user_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own sessions"
  ON zapp.user_sessions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own sessions"
  ON zapp.user_sessions FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Service role has full access to user_sessions"
  ON zapp.user_sessions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Grants
REVOKE ALL ON zapp.user_sessions FROM PUBLIC, anon;
GRANT ALL    ON zapp.user_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.user_sessions TO authenticated;

-- Ensure indexes exist (idempotent)
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON zapp.user_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_active
  ON zapp.user_sessions (is_active)
  WHERE is_active = true;

-- Add to realtime publication for session change events
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.user_sessions;
    RAISE NOTICE 'zapp.user_sessions added to supabase_realtime publication';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'zapp.user_sessions already in supabase_realtime publication — skip';
  END;
END;
$$;
