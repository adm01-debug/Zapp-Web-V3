-- Move public.security_alerts to zapp schema.
--
-- Root cause: The table was originally created in public schema (migration 20251231115910).
-- The supabase client is configured with db.schema:'zapp', so all .from('security_alerts')
-- calls send Accept-Profile: zapp to PostgREST, which cannot find the table in zapp and
-- returns PGRST205 "relation not found in schema cache".
--
-- Affected code:
--   src/hooks/useSecurityAlerts.ts:6,19     — fetchUnresolvedSecurityAlerts, resolveSecurityAlert
--   src/hooks/useUserSecurityAlerts.ts:15   — fetchUserSecurityAlerts
--   supabase/functions/cleanup-rate-limit-logs/index.ts:35 — DELETE old alerts
--   supabase/functions/send-rate-limit-alert/index.ts:25   — INSERT new alerts
--   supabase/functions/detect-new-device/index.ts:141      — INSERT device alerts
--
-- Fix: ALTER TABLE public.security_alerts SET SCHEMA zapp.
-- RLS policies, indexes, sequences and constraints move with the table automatically.
-- The subscription in RateLimitRealtimeAlerts.tsx already uses schema:'zapp' (correct).
--
-- Idempotent: DO blocks detect current state before acting.

-- Step 1: Move the table to zapp schema (if still in public as a real TABLE)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname  = 'security_alerts'
      AND c.relkind  = 'r'
  ) THEN
    ALTER TABLE public.security_alerts SET SCHEMA zapp;
    RAISE NOTICE 'Moved public.security_alerts → zapp.security_alerts';
  ELSIF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relname  = 'security_alerts'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'zapp.security_alerts already exists as a TABLE, skipping move';
  ELSE
    RAISE WARNING 'security_alerts not found in either public or zapp as a real TABLE';
  END IF;
END $$;

-- Step 2: Remove public.security_alerts from publication if still listed there
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'security_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.security_alerts;
    RAISE NOTICE 'Dropped public.security_alerts from supabase_realtime';
  END IF;
END $$;

-- Step 3: Add zapp.security_alerts to supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename  = 'security_alerts'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'zapp'
        AND c.relname  = 'security_alerts'
        AND c.relkind IN ('r', 'p')
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE zapp.security_alerts;
      RAISE NOTICE 'Added zapp.security_alerts to supabase_realtime';
    ELSE
      RAISE WARNING 'zapp.security_alerts not found as a physical table — cannot add to publication';
    END IF;
  ELSE
    RAISE NOTICE 'zapp.security_alerts already in supabase_realtime, skipping';
  END IF;
END $$;

-- Step 4: Ensure RLS is enabled (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'security_alerts'
  ) THEN
    EXECUTE 'ALTER TABLE zapp.security_alerts ENABLE ROW LEVEL SECURITY';
    RAISE NOTICE 'RLS ensured on zapp.security_alerts';
  END IF;
END $$;

-- Step 5: Recreate/confirm policies in zapp context (DROP old public-referenced names, ensure zapp ones exist)
-- When SET SCHEMA moves the table, the RLS policies travel with it but still reference the old public.* helpers.
-- Re-create them pointing at zapp.has_role / zapp.is_admin_or_supervisor.
DO $$
DECLARE
  fn_exists BOOLEAN;
BEGIN
  -- Check if zapp.is_admin_or_supervisor exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'is_admin_or_supervisor'
  ) INTO fn_exists;

  IF NOT fn_exists THEN
    RAISE NOTICE 'zapp.is_admin_or_supervisor not found; skipping policy recreation (existing policies still valid)';
    RETURN;
  END IF;

  -- Only rebuild policies if table is now in zapp
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'security_alerts'
  ) THEN
    RETURN;
  END IF;

  -- Drop all existing policies to avoid conflicts after SET SCHEMA migration
  DROP POLICY IF EXISTS "Admins can manage security alerts" ON zapp.security_alerts;
  DROP POLICY IF EXISTS "System can insert security alerts" ON zapp.security_alerts;
  DROP POLICY IF EXISTS "Admins can insert security alerts" ON zapp.security_alerts;
  DROP POLICY IF EXISTS "Authenticated can insert security alerts" ON zapp.security_alerts;
  DROP POLICY IF EXISTS "Admins can manage alerts" ON zapp.security_alerts;
  DROP POLICY IF EXISTS "System can insert alerts" ON zapp.security_alerts;
  DROP POLICY IF EXISTS "Users can view their own alerts" ON zapp.security_alerts;

  -- SELECT: admins/supervisors see all; regular users see their own
  CREATE POLICY "Admins can view all security alerts"
    ON zapp.security_alerts FOR SELECT TO authenticated
    USING (zapp.is_admin_or_supervisor(auth.uid()));

  CREATE POLICY "Users can view own security alerts"
    ON zapp.security_alerts FOR SELECT TO authenticated
    USING (user_id = auth.uid());

  -- INSERT: service_role only (system writes alerts)
  CREATE POLICY "Service role can insert security alerts"
    ON zapp.security_alerts FOR INSERT TO service_role
    WITH CHECK (true);

  -- UPDATE/DELETE: admins/supervisors
  CREATE POLICY "Admins can update security alerts"
    ON zapp.security_alerts FOR UPDATE TO authenticated
    USING (zapp.is_admin_or_supervisor(auth.uid()));

  CREATE POLICY "Admins can delete security alerts"
    ON zapp.security_alerts FOR DELETE TO authenticated
    USING (zapp.is_admin_or_supervisor(auth.uid()));

  -- Grant privileges
  GRANT SELECT ON zapp.security_alerts TO authenticated;
  GRANT INSERT, UPDATE, DELETE ON zapp.security_alerts TO service_role;

  RAISE NOTICE 'Rebuilt RLS policies on zapp.security_alerts';
END $$;
