-- M56: Fix critical SQL bugs found in migrations M47–M55
--
-- FIX-A: UNIQUE on evo.evolution_reconcile_jobs.request_id without NOT VALID (PG<15 incompatible)
-- FIX-B: Backup + UNIQUE on evo.evolution_instance_credentials.instance_name (no WHEN OTHERS swallow)
-- FIX-C: fn_monitor_sync_cron_health — drop BIGINT signature, create TEXT signature with dynamic lookup
-- FIX-D: fn_wconn_status_auto_resolve — restore api_type guard removed by M50
-- FIX-E: hmac_selftest_audit — add missing REVOKE/GRANT table-level privileges
-- FIX-F: v_evolution_automation_logs — fix ec.jid → ec.remote_jid; add evo grants; automation_executions realtime
-- FIX-G: M54 corrections — right table (webhook_health_alerts), cron disable, executed_by column, INSERT policy, SELECT grant

-- ============================================================
-- FIX-A: UNIQUE constraint on evo.evolution_reconcile_jobs.request_id
-- M47 FIX-4b used UNIQUE ... NOT VALID which is only valid on PG ≥ 15 for CHECK constraints,
-- never valid for UNIQUE. The constraint was never created.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs' AND c.relkind IN ('r','p')
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint co
      JOIN pg_catalog.pg_class t ON t.oid = co.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'evo' AND t.relname = 'evolution_reconcile_jobs'
        AND co.conname = 'uq_evo_reconcile_jobs_request_id'
    ) THEN
      ALTER TABLE evo.evolution_reconcile_jobs
        ADD CONSTRAINT uq_evo_reconcile_jobs_request_id UNIQUE (request_id);
      RAISE NOTICE 'M56 FIX-A: UNIQUE constraint uq_evo_reconcile_jobs_request_id added';
    ELSE
      RAISE NOTICE 'M56 FIX-A: constraint already present — no action needed';
    END IF;
  ELSE
    RAISE NOTICE 'M56 FIX-A: evo.evolution_reconcile_jobs not found — skipping';
  END IF;
END $$;

-- ============================================================
-- FIX-B: Backup + UNIQUE on evo.evolution_instance_credentials.instance_name
-- M55 deleted rows without backup and wrapped constraint creation in WHEN OTHERS (silent swallow).
-- This fix: (1) creates backup if it does not exist, (2) re-runs dedup with deterministic tiebreaker,
-- (3) adds UNIQUE without any exception catch so failures surface.
-- ============================================================
DO $$
DECLARE
  v_tbl_exists BOOLEAN;
  v_deleted    INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_instance_credentials'
      AND c.relkind IN ('r','p')
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M56 FIX-B: evo.evolution_instance_credentials not found — skipping';
    RETURN;
  END IF;

  -- Create backup before any destructive operation (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = '_backup_instance_creds_dedup_m56'
  ) THEN
    EXECUTE '
      CREATE TABLE evo._backup_instance_creds_dedup_m56 AS
      SELECT * FROM evo.evolution_instance_credentials
    ';
    RAISE NOTICE 'M56 FIX-B: backup table evo._backup_instance_creds_dedup_m56 created';
  ELSE
    RAISE NOTICE 'M56 FIX-B: backup table already exists — skipping backup step';
  END IF;

  -- Re-dedup with deterministic id tiebreaker (idempotent — deletes 0 rows if already clean)
  DELETE FROM evo.evolution_instance_credentials
   WHERE id IN (
     SELECT id FROM (
       SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY instance_name
                ORDER BY
                  CASE WHEN is_active THEN 0 ELSE 1 END,
                  CASE WHEN api_key IS NOT NULL AND api_key != '' THEN 0 ELSE 1 END,
                  CASE health_status
                    WHEN 'healthy'  THEN 0
                    WHEN 'degraded' THEN 1
                    ELSE 2
                  END,
                  updated_at DESC NULLS LAST,
                  id
              ) AS rn
         FROM evo.evolution_instance_credentials
        WHERE instance_name IS NOT NULL
     ) ranked
      WHERE rn > 1
   );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'M56 FIX-B: % duplicate row(s) removed', v_deleted;
END $$;

-- Add UNIQUE constraint WITHOUT exception catch so failures surface
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint co
    JOIN pg_catalog.pg_class t ON t.oid = co.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'evo' AND t.relname = 'evolution_instance_credentials'
      AND co.conname = 'uq_evo_instance_creds_instance_name'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'evo' AND c.relname = 'evolution_instance_credentials'
        AND c.relkind IN ('r','p')
    ) THEN
      ALTER TABLE evo.evolution_instance_credentials
        ADD CONSTRAINT uq_evo_instance_creds_instance_name UNIQUE (instance_name);
      RAISE NOTICE 'M56 FIX-B: UNIQUE constraint uq_evo_instance_creds_instance_name added';
    END IF;
  ELSE
    RAISE NOTICE 'M56 FIX-B: UNIQUE constraint already present — no action needed';
  END IF;
END $$;

-- ============================================================
-- FIX-C: fn_monitor_sync_cron_health — replace hardcoded BIGINT jobid with TEXT jobname
-- M48 STEP 2 used `p_jobid BIGINT DEFAULT 96` which breaks on staging or after reschedule.
-- Fix: drop old (BIGINT,INTEGER,INTEGER) overload; create (TEXT,INTEGER,INTEGER) that resolves
-- jobid dynamically from cron.job; update any existing cron.job commands to use the new signature.
-- ============================================================

-- Drop old BIGINT-based overload if it exists
DROP FUNCTION IF EXISTS zapp.fn_monitor_sync_cron_health(BIGINT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION zapp.fn_monitor_sync_cron_health(
  p_jobname      TEXT    DEFAULT 'sync-cron-health-check',
  p_gap_minutes  INTEGER DEFAULT 15,
  p_lookback_hrs INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'zapp', 'cron'
AS $fn$
DECLARE
  v_jobid        BIGINT;
  v_last_run     TIMESTAMPTZ;
  v_run_count    INTEGER := 0;
  v_max_gap_sec  NUMERIC := 0;
  v_alerts_raised INTEGER := 0;
  v_rec          RECORD;
  v_prev_time    TIMESTAMPTZ;
  v_gap_sec      NUMERIC;
  v_alert_type   zapp.warroom_alert_type;
  v_existing     INTEGER;
BEGIN
  -- Resolve jobid from jobname (no hardcoded constant)
  SELECT jobid INTO v_jobid
    FROM cron.job
   WHERE jobname = p_jobname
   LIMIT 1;

  IF v_jobid IS NULL THEN
    RAISE NOTICE 'fn_monitor_sync_cron_health: no cron job found with jobname=% — skipping', p_jobname;
    RETURN jsonb_build_object(
      'jobname', p_jobname,
      'jobid', NULL,
      'runs_scanned', 0,
      'max_gap_min', 0,
      'alerts_raised', 0,
      'checked_at', pg_catalog.now(),
      'warning', 'cron job not found'
    );
  END IF;

  v_prev_time := NULL;

  FOR v_rec IN
    SELECT start_time
      FROM cron.job_run_details
     WHERE jobid = v_jobid
       AND start_time > pg_catalog.now() - (p_lookback_hrs * INTERVAL '1 hour')
       AND status = 'succeeded'
     ORDER BY start_time ASC
  LOOP
    v_run_count := v_run_count + 1;

    IF v_prev_time IS NOT NULL THEN
      v_gap_sec := EXTRACT(EPOCH FROM (v_rec.start_time - v_prev_time));

      IF v_gap_sec > v_max_gap_sec THEN
        v_max_gap_sec := v_gap_sec;
      END IF;

      IF v_gap_sec > (p_gap_minutes * 60) THEN
        -- Anti-flood: skip if a gap alert for this job was raised in the last 30 minutes
        SELECT COUNT(*) INTO v_existing
          FROM zapp.warroom_alerts wa
         WHERE wa.source = 'cron_monitor'
           AND wa.entity = p_jobname
           AND wa.created_at > pg_catalog.now() - INTERVAL '30 minutes';

        IF v_existing = 0 THEN
          v_alert_type := 'performance_degradation';
          INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, entity)
          VALUES (
            v_alert_type,
            'Cron gap detected: ' || p_jobname,
            format('Job %s had a gap of %s minutes (threshold: %s min) between %s and %s',
              p_jobname,
              round(v_gap_sec / 60),
              p_gap_minutes,
              v_prev_time::TEXT,
              v_rec.start_time::TEXT
            ),
            'cron_monitor',
            p_jobname
          );
          v_alerts_raised := v_alerts_raised + 1;
        END IF;
      END IF;
    END IF;

    v_prev_time := v_rec.start_time;
  END LOOP;

  RETURN jsonb_build_object(
    'jobname', p_jobname,
    'jobid', v_jobid,
    'runs_scanned', v_run_count,
    'max_gap_min', round(v_max_gap_sec / 60),
    'alerts_raised', v_alerts_raised,
    'checked_at', pg_catalog.now()
  );
END;
$fn$;

REVOKE ALL ON FUNCTION zapp.fn_monitor_sync_cron_health(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_monitor_sync_cron_health(TEXT, INTEGER, INTEGER) TO service_role;

-- Update any existing cron.job commands that called the old BIGINT overload
-- Pattern: fn_monitor_sync_cron_health(<number> to fn_monitor_sync_cron_health('<jobname>'
DO $$
DECLARE
  v_row RECORD;
  v_new_cmd TEXT;
BEGIN
  FOR v_row IN
    SELECT jobid, command
      FROM cron.job
     WHERE command LIKE '%fn_monitor_sync_cron_health(%'
       AND command ~ 'fn_monitor_sync_cron_health\s*\(\s*[0-9]'
  LOOP
    -- Replace numeric first arg with quoted jobname (uses jobname column for self-reference)
    SELECT command INTO v_new_cmd
      FROM cron.job WHERE jobid = v_row.jobid;

    v_new_cmd := regexp_replace(
      v_new_cmd,
      'fn_monitor_sync_cron_health\s*\(\s*[0-9]+(\s*,)?',
      'fn_monitor_sync_cron_health(''' || (SELECT jobname FROM cron.job WHERE jobid = v_row.jobid) || '''\1',
      'g'
    );

    UPDATE cron.job SET command = v_new_cmd WHERE jobid = v_row.jobid;
    RAISE NOTICE 'M56 FIX-C: updated cron job % command to use TEXT jobname signature', v_row.jobid;
  END LOOP;
END $$;

-- ============================================================
-- FIX-D: fn_wconn_status_auto_resolve — restore api_type guard removed by M50
-- M48 STEP 3 added the guard; M50 overwrote the function without it, allowing official Cloud
-- API connections to incorrectly clear Evolution alerts. Restore exact M48 STEP 3 body.
-- ============================================================
CREATE OR REPLACE FUNCTION zapp.fn_wconn_status_auto_resolve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'zapp'
AS $fn$
DECLARE
  v_registry_id UUID;
BEGIN
  IF NEW.status = 'connected' AND (OLD.status IS DISTINCT FROM 'connected') THEN
    -- Only handle Evolution API connections — official Cloud API connections must not clear evo alerts
    IF NEW.api_type IS DISTINCT FROM 'evolution' THEN
      RETURN NEW;
    END IF;

    IF NEW.instance_name IS NULL THEN
      RAISE NOTICE 'fn_wconn_status_auto_resolve: connection id=% has NULL instance_name — skipping alert resolution', NEW.id;
      RETURN NEW;
    END IF;

    SELECT ir.id INTO v_registry_id
      FROM zapp.instance_registry ir
     WHERE ir.instance_name = NEW.instance_name
     LIMIT 1;

    IF v_registry_id IS NULL THEN
      RAISE NOTICE 'fn_wconn_status_auto_resolve: no instance_registry row for instance_name=% (connection id=%) — skipping alert resolution', NEW.instance_name, NEW.id;
      RETURN NEW;
    END IF;

    UPDATE zapp.evolution_alerts
       SET resolved_at = pg_catalog.now(),
           updated_at  = pg_catalog.now()
     WHERE instance_id = v_registry_id
       AND resolved_at IS NULL
       AND alert_type IN ('disconnection', 'auth_failure', 'health_degraded');

    RAISE NOTICE 'fn_wconn_status_auto_resolve: resolved open alerts for instance_name=% (registry_id=%)', NEW.instance_name, v_registry_id;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION zapp.fn_wconn_status_auto_resolve() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_wconn_status_auto_resolve() TO service_role;

-- ============================================================
-- FIX-E: hmac_selftest_audit — add missing table-level REVOKE/GRANT
-- M52 created the table and RLS policies but never revoked public access or granted to roles.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'hmac_selftest_audit' AND c.relkind = 'r'
  ) THEN
    REVOKE ALL ON TABLE zapp.hmac_selftest_audit FROM PUBLIC, anon;
    GRANT SELECT, INSERT ON TABLE zapp.hmac_selftest_audit TO authenticated;
    GRANT ALL ON TABLE zapp.hmac_selftest_audit TO service_role;
    RAISE NOTICE 'M56 FIX-E: REVOKE/GRANT applied to zapp.hmac_selftest_audit';
  ELSE
    RAISE NOTICE 'M56 FIX-E: zapp.hmac_selftest_audit not found — skipping';
  END IF;
END $$;

-- ============================================================
-- FIX-F: v_evolution_automation_logs — fix ec.jid → ec.remote_jid;
--         add GRANT SELECT on evo base tables for security_invoker to work;
--         add automation_executions to supabase_realtime publication
-- ============================================================
DROP VIEW IF EXISTS zapp.v_evolution_automation_logs;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_automation_logs'
  ) THEN
    -- security_invoker view: queries run as the calling user, so evo base tables need explicit grants
    EXECUTE $view$
      CREATE OR REPLACE VIEW zapp.v_evolution_automation_logs
      WITH (security_invoker = on)
      AS
      SELECT
        eal.id,
        eal.instance_id,
        eal.automation_id,
        eal.contact_id,
        eal.trigger_type,
        eal.action_type,
        eal.status,
        eal.error_message,
        eal.metadata,
        eal.executed_at,
        eal.created_at,
        COALESCE(ec.remote_jid, eal.contact_id::TEXT) AS remote_jid,
        ec.push_name AS contact_name
      FROM evo.evolution_automation_logs eal
      LEFT JOIN evo.evolution_contacts ec ON ec.id = eal.contact_id
    $view$;

    RAISE NOTICE 'M56 FIX-F: v_evolution_automation_logs recreated with remote_jid';
  ELSE
    RAISE NOTICE 'M56 FIX-F: evo.evolution_automation_logs not found — view not created';
  END IF;
END $$;

-- Revoke/grant on view
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'v_evolution_automation_logs' AND c.relkind = 'v'
  ) THEN
    REVOKE ALL ON zapp.v_evolution_automation_logs FROM PUBLIC, anon;
    GRANT SELECT ON zapp.v_evolution_automation_logs TO authenticated, service_role;
    RAISE NOTICE 'M56 FIX-F: REVOKE/GRANT applied to view v_evolution_automation_logs';
  END IF;
END $$;

-- Grant SELECT on evo base tables so authenticated users can read via the security_invoker view
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_automation_logs'
  ) THEN
    GRANT SELECT ON evo.evolution_automation_logs TO authenticated;
    RAISE NOTICE 'M56 FIX-F: GRANT SELECT on evo.evolution_automation_logs TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_contacts'
  ) THEN
    GRANT SELECT ON evo.evolution_contacts TO authenticated;
    RAISE NOTICE 'M56 FIX-F: GRANT SELECT on evo.evolution_contacts TO authenticated';
  END IF;
END $$;

-- Add automation_executions to supabase_realtime publication (M53 checked but never added it)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'automation_executions' AND c.relkind = 'r'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_publication_rel pr
      JOIN pg_catalog.pg_publication p ON p.oid = pr.prpubid
      JOIN pg_catalog.pg_class c ON c.oid = pr.prrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE p.pubname = 'supabase_realtime'
        AND n.nspname = 'zapp'
        AND c.relname = 'automation_executions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE zapp.automation_executions;
      RAISE NOTICE 'M56 FIX-F: zapp.automation_executions added to supabase_realtime';
    ELSE
      RAISE NOTICE 'M56 FIX-F: automation_executions already in publication — no action needed';
    END IF;
  ELSE
    RAISE NOTICE 'M56 FIX-F: zapp.automation_executions not found — skipping publication add';
  END IF;
END $$;

-- ============================================================
-- FIX-G(a): Resolve burnin backlog in the CORRECT table (webhook_health_alerts, not warroom_alerts)
-- M54 FIX-G targeted zapp.warroom_alerts; burnin alerts live in zapp.webhook_health_alerts.
-- ============================================================
DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'webhook_health_alerts' AND c.relkind = 'r'
  ) THEN
    UPDATE zapp.webhook_health_alerts
       SET resolved_at  = pg_catalog.now(),
           acknowledged = TRUE
     WHERE alert_type IN ('burnin_critical_alert', 'burnin_disconnection')
       AND resolved_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'M56 FIX-G(a): % burnin alert(s) resolved in webhook_health_alerts', v_updated;
  ELSE
    RAISE NOTICE 'M56 FIX-G(a): zapp.webhook_health_alerts not found — skipping';
  END IF;
END $$;

-- ============================================================
-- FIX-G(b): Disable the burnin-monitor cron (M54 only rescheduled, never set active=false)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'cron') THEN
    UPDATE cron.job
       SET active = FALSE
     WHERE jobid = 145 OR jobname = 'burnin-monitor';

    RAISE NOTICE 'M56 FIX-G(b): burnin-monitor cron job disabled';
  ELSE
    RAISE NOTICE 'M56 FIX-G(b): cron schema not found — skipping';
  END IF;
END $$;

-- ============================================================
-- FIX-G(c): Add executed_by column to zapp.hmac_selftest_audit
-- M52 never defined this column; M54's INSERT policy WITH CHECK (executed_by = auth.uid())
-- caused CREATE POLICY to fail, rolling back M54's grants entirely.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'hmac_selftest_audit' AND c.relkind = 'r'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'zapp' AND c.relname = 'hmac_selftest_audit'
        AND a.attname = 'executed_by' AND NOT a.attisdropped
    ) THEN
      ALTER TABLE zapp.hmac_selftest_audit
        ADD COLUMN executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
      RAISE NOTICE 'M56 FIX-G(c): executed_by column added to zapp.hmac_selftest_audit';
    ELSE
      RAISE NOTICE 'M56 FIX-G(c): executed_by column already exists — no action needed';
    END IF;
  ELSE
    RAISE NOTICE 'M56 FIX-G(c): zapp.hmac_selftest_audit not found — skipping';
  END IF;
END $$;

-- ============================================================
-- FIX-G(d): Drop broken INSERT policy from M54, create correct one
-- M54's policy creation failed (because executed_by column didn't exist yet), so no policy was
-- left; also drop the M52 SELECT-only policy if present and recreate all three cleanly.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'hmac_selftest_audit' AND c.relkind = 'r'
  ) THEN
    -- Drop any existing policies so we can recreate cleanly
    DROP POLICY IF EXISTS hmac_selftest_audit_insert ON zapp.hmac_selftest_audit;
    DROP POLICY IF EXISTS hmac_selftest_audit_select ON zapp.hmac_selftest_audit;
    DROP POLICY IF EXISTS hmac_selftest_audit_service ON zapp.hmac_selftest_audit;

    -- SELECT: admins and supervisors may read all rows
    CREATE POLICY hmac_selftest_audit_select
      ON zapp.hmac_selftest_audit
      FOR SELECT
      TO authenticated
      USING (zapp.is_admin_or_supervisor());

    -- INSERT: authenticated users may insert their own rows
    CREATE POLICY hmac_selftest_audit_insert
      ON zapp.hmac_selftest_audit
      FOR INSERT
      TO authenticated
      WITH CHECK (executed_by = auth.uid());

    -- Service role: unrestricted
    CREATE POLICY hmac_selftest_audit_service
      ON zapp.hmac_selftest_audit
      FOR ALL
      TO service_role
      USING (TRUE)
      WITH CHECK (TRUE);

    RAISE NOTICE 'M56 FIX-G(d): RLS policies recreated on zapp.hmac_selftest_audit';
  ELSE
    RAISE NOTICE 'M56 FIX-G(d): zapp.hmac_selftest_audit not found — skipping';
  END IF;
END $$;

-- ============================================================
-- FIX-G(e): GRANT SELECT on hmac_selftest_audit to authenticated
-- M54 only granted INSERT; SELECT was missing (already covered by FIX-E above but explicit here).
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'hmac_selftest_audit' AND c.relkind = 'r'
  ) THEN
    GRANT SELECT ON TABLE zapp.hmac_selftest_audit TO authenticated;
    RAISE NOTICE 'M56 FIX-G(e): GRANT SELECT on zapp.hmac_selftest_audit TO authenticated confirmed';
  END IF;
END $$;
