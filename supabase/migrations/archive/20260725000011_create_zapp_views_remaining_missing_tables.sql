-- Migration: Create zapp VIEW proxies for 6 remaining tables missing from zapp (BUG-54 to BUG-59)
--
-- All these tables/views are queried via safeClient.from() which routes to
-- PostgREST with Accept-Profile: zapp. Without a zapp VIEW or physical table,
-- every SELECT/INSERT/UPDATE returns PGRST205.
--
-- Additionally fixes BUG-59b: zapp.gmail_health_summary VIEW (created by
-- 20260724000050) points to public.gmail_health_summary which was RENAMED
-- to public.email_health_summary in migration 20260506182656 — the old VIEW
-- references a non-existent table and must be replaced.
--
-- Affected frontend code:
--   system_connections     → Connections.tsx:152,255,287 · useConnections.ts:91,261 · diagnostics.ts
--   channel_queues         → useAdminManagement.ts:603
--   email_revalidation_jobs→ src/services/email/emailApi.ts (getAuditLogs, retryJob)
--   email_health_summary   → src/services/email/emailApi.ts:47
--   sts_troubleshooting_report → StsCommercialDashboard.tsx:33
--   sts_performance_metrics    → QueueMetricsDashboard.tsx:50
--
-- All DDL is idempotent.

-- ── 1. system_connections ─────────────────────────────────────────────────────
-- Source: public.system_connections (20260506211335, 20260709164600)
-- Used by: Connections.tsx (SELECT, INSERT, UPDATE, DELETE), useConnections.ts,
--          diagnostics.ts (SELECT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'system_connections' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.system_connections already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'system_connections' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.system_connections not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.system_connections
        WITH (security_invoker = on)
      AS SELECT * FROM public.system_connections
    $ddl$;
    RAISE NOTICE 'created zapp.system_connections → public.system_connections';
  END IF;
END;
$$;

REVOKE ALL ON zapp.system_connections FROM PUBLIC, anon;
GRANT ALL    ON zapp.system_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.system_connections TO authenticated;

-- ── 2. channel_queues ─────────────────────────────────────────────────────────
-- Source: public.channel_queues (20260426112858, 20260502_create_10_extra_tables)
-- Used by: useAdminManagement.ts:603 (SELECT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'channel_queues' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.channel_queues already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'channel_queues' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.channel_queues not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.channel_queues
        WITH (security_invoker = on)
      AS SELECT * FROM public.channel_queues
    $ddl$;
    RAISE NOTICE 'created zapp.channel_queues → public.channel_queues';
  END IF;
END;
$$;

REVOKE ALL ON zapp.channel_queues FROM PUBLIC, anon;
GRANT ALL    ON zapp.channel_queues TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.channel_queues TO authenticated;

-- ── 3. email_revalidation_jobs ────────────────────────────────────────────────
-- Source: public.email_revalidation_jobs (20260711_400000_febesync_missing_stubs)
-- Used by: emailApi.ts — getAuditLogs() (SELECT), retryJob() (UPDATE)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'email_revalidation_jobs' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.email_revalidation_jobs already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'email_revalidation_jobs' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.email_revalidation_jobs not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.email_revalidation_jobs
        WITH (security_invoker = on)
      AS SELECT * FROM public.email_revalidation_jobs
    $ddl$;
    RAISE NOTICE 'created zapp.email_revalidation_jobs → public.email_revalidation_jobs';
  END IF;
END;
$$;

REVOKE ALL ON zapp.email_revalidation_jobs FROM PUBLIC, anon;
GRANT ALL    ON zapp.email_revalidation_jobs TO service_role;
GRANT SELECT, UPDATE ON zapp.email_revalidation_jobs TO authenticated;

-- ── 4. email_health_summary ───────────────────────────────────────────────────
-- Source: public.email_health_summary (originally gmail_health_summary, renamed
--   in 20260506182656). Physical table is in public schema.
--
-- BUG-59b: Migration 20260724000050 created zapp.gmail_health_summary pointing
--   to public.gmail_health_summary — but that table was RENAMED to
--   email_health_summary in May 2026. The VIEW references a non-existent object
--   and causes PGRST205. Fix: drop broken VIEW, create correct one.
--
-- Used by: emailApi.ts:47 (SELECT)
DO $$
BEGIN
  -- Drop the stale zapp.gmail_health_summary VIEW (points to non-existent table)
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'gmail_health_summary' AND n.nspname = 'zapp' AND c.relkind = 'v'
  ) THEN
    DROP VIEW zapp.gmail_health_summary;
    RAISE NOTICE 'Dropped stale zapp.gmail_health_summary VIEW (was pointing to non-existent public.gmail_health_summary)';
  END IF;

  -- Create zapp.email_health_summary pointing to the correctly-named table
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'email_health_summary' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.email_health_summary already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'email_health_summary' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.email_health_summary not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.email_health_summary
        WITH (security_invoker = on)
      AS SELECT * FROM public.email_health_summary
    $ddl$;
    RAISE NOTICE 'created zapp.email_health_summary → public.email_health_summary';
  END IF;
END;
$$;

REVOKE ALL ON zapp.email_health_summary FROM PUBLIC, anon;
GRANT ALL    ON zapp.email_health_summary TO service_role;
GRANT SELECT ON zapp.email_health_summary TO authenticated;

-- ── 5. sts_troubleshooting_report ─────────────────────────────────────────────
-- Source: public.sts_troubleshooting_report (VIEW, created 20260506103502)
-- Used by: StsCommercialDashboard.tsx:33 (SELECT)
-- Note: Source is a VIEW in public; wrapping a VIEW in another VIEW is valid
--   with security_invoker=on — both layers check the caller's permissions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'sts_troubleshooting_report' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.sts_troubleshooting_report already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'sts_troubleshooting_report' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE 'source public.sts_troubleshooting_report not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.sts_troubleshooting_report
        WITH (security_invoker = on)
      AS SELECT * FROM public.sts_troubleshooting_report
    $ddl$;
    RAISE NOTICE 'created zapp.sts_troubleshooting_report → public.sts_troubleshooting_report';
  END IF;
END;
$$;

REVOKE ALL ON zapp.sts_troubleshooting_report FROM PUBLIC, anon;
GRANT ALL    ON zapp.sts_troubleshooting_report TO service_role;
GRANT SELECT ON zapp.sts_troubleshooting_report TO authenticated;

-- ── 6. sts_performance_metrics ────────────────────────────────────────────────
-- Source: public.sts_performance_metrics (VIEW, created 20260506103907)
-- Used by: QueueMetricsDashboard.tsx:50 (SELECT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'sts_performance_metrics' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.sts_performance_metrics already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'sts_performance_metrics' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE 'source public.sts_performance_metrics not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.sts_performance_metrics
        WITH (security_invoker = on)
      AS SELECT * FROM public.sts_performance_metrics
    $ddl$;
    RAISE NOTICE 'created zapp.sts_performance_metrics → public.sts_performance_metrics';
  END IF;
END;
$$;

REVOKE ALL ON zapp.sts_performance_metrics FROM PUBLIC, anon;
GRANT ALL    ON zapp.sts_performance_metrics TO service_role;
GRANT SELECT ON zapp.sts_performance_metrics TO authenticated;
