-- M54: Fix Cubic review findings for M51 and M52
--
-- M51 fixes:
--   1. Cron update used hardcoded jobid=145 (production-specific); re-apply by name.
--   2. Backlog cleanup was unbounded; add created_at cutoff to avoid resolving real incidents.
--
-- M52 fixes:
--   1. `instance` column must be nullable (UI can send null instance).
--   2. Add `executed_by uuid` column for auth.users FK.
--   3. Add INSERT policy for authenticated users (own rows only).
--   4. Tighten SELECT policy to admin/supervisor only.

-- ── M51 fix: re-apply cron change by job name instead of hardcoded jobid ─────
DO $$
BEGIN
  -- Only update if the current schedule is the too-frequent one (safety guard)
  UPDATE cron.job
  SET schedule = '*/15 * * * *'
  WHERE jobname = 'burnin-monitor'
    AND schedule != '*/15 * * * *';

  IF FOUND THEN
    RAISE NOTICE 'M54 M51-fix: burnin-monitor cron updated to */15 * * * *';
  ELSE
    RAISE NOTICE 'M54 M51-fix: burnin-monitor cron already at correct schedule or not found';
  END IF;
END $$;

-- ── M51 fix: time-bounded backlog cleanup (only resolve incidents from the backlog period) ─
DO $$
BEGIN
  UPDATE zapp.warroom_alerts
  SET
    status        = 'resolved',
    resolved_at   = COALESCE(resolved_at, now()),
    updated_at    = now()
  WHERE status     = 'active'
    AND source    LIKE 'burnin-%'
    AND alert_type IN ('burnin_stale', 'burnin_loop', 'burnin_no_recent')
    AND created_at < '2026-08-04T00:00:00Z';  -- restrict to known backlog period

  IF FOUND THEN
    RAISE NOTICE 'M54 M51-fix: time-bounded burnin backlog resolved';
  ELSE
    RAISE NOTICE 'M54 M51-fix: no burnin backlog rows to resolve (already clean or none existed)';
  END IF;
END $$;

-- ── M52 fix 1: make instance nullable ────────────────────────────────────────
ALTER TABLE zapp.hmac_selftest_audit
  ALTER COLUMN instance DROP NOT NULL;

-- ── M52 fix 2: add executed_by column ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp'
      AND table_name   = 'hmac_selftest_audit'
      AND column_name  = 'executed_by'
  ) THEN
    ALTER TABLE zapp.hmac_selftest_audit
      ADD COLUMN executed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    RAISE NOTICE 'M54 M52-fix: executed_by column added';
  ELSE
    RAISE NOTICE 'M54 M52-fix: executed_by column already exists';
  END IF;
END $$;

-- ── M52 fix 3: add authenticated INSERT policy ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp'
      AND tablename  = 'hmac_selftest_audit'
      AND policyname = 'authenticated_insert_hmac_selftest_audit'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "authenticated_insert_hmac_selftest_audit"
        ON zapp.hmac_selftest_audit
        FOR INSERT
        TO authenticated
        WITH CHECK (executed_by = auth.uid())
    $p$;
    RAISE NOTICE 'M54 M52-fix: authenticated INSERT policy created';
  ELSE
    RAISE NOTICE 'M54 M52-fix: authenticated INSERT policy already exists';
  END IF;
END $$;

GRANT INSERT ON zapp.hmac_selftest_audit TO authenticated;

-- ── M52 fix 4: tighten SELECT policy to admin/supervisor only ────────────────
DO $$
BEGIN
  -- Drop the over-permissive policy from M52
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp'
      AND tablename  = 'hmac_selftest_audit'
      AND policyname = 'authenticated_select_hmac_selftest_audit'
  ) THEN
    DROP POLICY "authenticated_select_hmac_selftest_audit" ON zapp.hmac_selftest_audit;
    RAISE NOTICE 'M54 M52-fix: dropped over-permissive SELECT policy';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp'
      AND tablename  = 'hmac_selftest_audit'
      AND policyname = 'admin_select_hmac_selftest_audit'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "admin_select_hmac_selftest_audit"
        ON zapp.hmac_selftest_audit
        FOR SELECT
        TO authenticated
        USING (zapp.is_admin_or_supervisor())
    $p$;
    RAISE NOTICE 'M54 M52-fix: admin-only SELECT policy created';
  ELSE
    RAISE NOTICE 'M54 M52-fix: admin-only SELECT policy already exists';
  END IF;
END $$;

-- ── Verification ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_nullable      boolean;
  v_has_exec_by   boolean;
  v_insert_policy boolean;
  v_select_policy boolean;
BEGIN
  SELECT NOT is_nullable::boolean
  INTO v_nullable
  FROM information_schema.columns
  WHERE table_schema = 'zapp' AND table_name = 'hmac_selftest_audit'
    AND column_name = 'instance';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp' AND table_name = 'hmac_selftest_audit'
      AND column_name = 'executed_by'
  ) INTO v_has_exec_by;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'hmac_selftest_audit'
      AND policyname = 'authenticated_insert_hmac_selftest_audit'
  ) INTO v_insert_policy;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'hmac_selftest_audit'
      AND policyname = 'admin_select_hmac_selftest_audit'
  ) INTO v_select_policy;

  RAISE NOTICE 'M54: instance_still_not_null=%, has_executed_by=%, insert_policy=%, admin_select_policy=%',
    COALESCE(v_nullable, false), v_has_exec_by, v_insert_policy, v_select_policy;

  IF COALESCE(v_nullable, false) THEN
    RAISE EXCEPTION 'M54: instance column is still NOT NULL after fix';
  END IF;
  IF NOT v_has_exec_by THEN
    RAISE EXCEPTION 'M54: executed_by column missing';
  END IF;
  IF NOT v_insert_policy THEN
    RAISE EXCEPTION 'M54: authenticated INSERT policy missing';
  END IF;
  IF NOT v_select_policy THEN
    RAISE EXCEPTION 'M54: admin SELECT policy missing';
  END IF;
END $$;
