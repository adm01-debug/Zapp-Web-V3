-- =============================================================================
-- EVO Schema: RLS on partition tables + cron frequency fix
-- 2026-07-03 | QA Audit Round — Evolution API hardening
-- =============================================================================
-- Context:
--   1. The evo schema holds partitioned tables (evolution_messages_v2_YYYY_MM,
--      evolution_webhook_events_v2_YYYY_MM). In PostgreSQL, partition children
--      do NOT inherit RLS policies from the parent — each child partition needs
--      its own ENABLE ROW LEVEL SECURITY and matching policies.
--
--   2. The prior migration (20260703140000) already revoked all anon grants on
--      the evo schema, closing the biggest exposure. This migration enables RLS
--      on child partitions so that:
--        - service_role has full access (for the RabbitMQ consumer and edge functions)
--        - authenticated users have SELECT access (consistent with parent policies,
--          required for PostgREST queries with schema=evo and Realtime subscriptions)
--        - anon has no access (enforced at both the GRANT and RLS layers)
--
--   3. Cron job "ensure-evolution-backcompat-views" runs at `* * * * *` (every
--      minute), calling evo.fn_ensure_evolution_backcompat_views(). This function
--      creates/refreshes compatibility views and should NOT run every minute in
--      production — it creates unnecessary DB load. Changed to hourly.
--
-- Idempotent: ENABLE RLS is idempotent; CREATE POLICY IF NOT EXISTS guards policies;
-- cron.alter_job is called on job name guard (EXISTS check).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 1: RLS on partition tables in evo schema
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  full_table text;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'evo'
      AND (
        tablename ~ '^evolution_messages_v2(_\d{4}_\d{2}|_default)$'
        OR tablename ~ '^evolution_webhook_events_v2(_\d{4}_\d{2}|_default)$'
        OR tablename = 'migration_watermark'
      )
      AND NOT rowsecurity
  LOOP
    full_table := format('evo.%I', t);

    -- Enable RLS
    EXECUTE format('ALTER TABLE evo.%I ENABLE ROW LEVEL SECURITY', t);

    -- service_role bypass: full access for the Python consumer and edge functions
    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS "service_role_bypass" ON evo.%I
         FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t
    );

    -- authenticated: SELECT only — consistent with parent table policies
    -- (single-tenant setup; anon access is blocked by zero GRANT + RLS)
    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS "authenticated_select" ON evo.%I
         FOR SELECT TO authenticated USING (true)',
      t
    );

    RAISE NOTICE 'RLS enabled + policies set on %', full_table;
  END LOOP;

  -- Apply to any already-RLS-enabled partitions that are missing the policies
  -- (covers tables that were manually enabled but have no policies yet)
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'evo'
      AND (
        tablename ~ '^evolution_messages_v2(_\d{4}_\d{2}|_default)$'
        OR tablename ~ '^evolution_webhook_events_v2(_\d{4}_\d{2}|_default)$'
        OR tablename = 'migration_watermark'
      )
      AND rowsecurity
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'evo' AND tablename = t AND policyname = 'service_role_bypass'
      )
  LOOP
    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS "service_role_bypass" ON evo.%I
         FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS "authenticated_select" ON evo.%I
         FOR SELECT TO authenticated USING (true)',
      t
    );
    RAISE NOTICE 'Policies backfilled on already-RLS-enabled %', t;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Part 2: Fix cron schedule for ensure-evolution-backcompat-views
-- Running every minute (*/1 * * * *) is excessive — it hammers the DB with
-- DDL to refresh views. Hourly is sufficient since views are structural.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'ensure-evolution-backcompat-views'
  ) THEN
    -- Downgrade from every-minute to hourly
    PERFORM cron.alter_job(
      job_id   => (SELECT jobid FROM cron.job WHERE jobname = 'ensure-evolution-backcompat-views'),
      schedule => '0 * * * *'
    );
    RAISE NOTICE 'Cron job "ensure-evolution-backcompat-views" rescheduled: every minute → hourly';
  ELSE
    RAISE NOTICE 'Cron job "ensure-evolution-backcompat-views" not found — skipping schedule fix';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Part 3: Enable RLS on evo.evolution_messages_v2 parent if not already set
-- (the parent should already have RLS, but guard for completeness)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'evo' AND tablename = 'evolution_messages_v2' AND NOT rowsecurity
  ) THEN
    ALTER TABLE evo.evolution_messages_v2 ENABLE ROW LEVEL SECURITY;
    CREATE POLICY IF NOT EXISTS "service_role_bypass" ON evo.evolution_messages_v2
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY IF NOT EXISTS "authenticated_select" ON evo.evolution_messages_v2
      FOR SELECT TO authenticated USING (true);
    RAISE NOTICE 'RLS enabled on evo.evolution_messages_v2 parent table';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'evo' AND tablename = 'evolution_webhook_events_v2' AND NOT rowsecurity
  ) THEN
    ALTER TABLE evo.evolution_webhook_events_v2 ENABLE ROW LEVEL SECURITY;
    CREATE POLICY IF NOT EXISTS "service_role_bypass" ON evo.evolution_webhook_events_v2
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY IF NOT EXISTS "authenticated_select" ON evo.evolution_webhook_events_v2
      FOR SELECT TO authenticated USING (true);
    RAISE NOTICE 'RLS enabled on evo.evolution_webhook_events_v2 parent table';
  END IF;
END $$;
