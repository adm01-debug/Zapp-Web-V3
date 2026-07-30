-- Migration: 20260727300032_cron_canonical_register
-- Purpose: Create canonical register table for all cron jobs with naming standards.
--          Etapa 32 (canonical register) + Etapa 33 (naming/idempotency).
-- Risk: LOW — additive only
-- Staging required: NO

SET search_path = ops, public, pg_catalog;

-- ============================================================
-- Cron canonical register
-- ============================================================
CREATE TABLE IF NOT EXISTS ops.cron_canonical_register (
    id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    jobname         text        NOT NULL UNIQUE,
    cron_expression text        NOT NULL,
    command_sql     text        NOT NULL,
    purpose         text        NOT NULL,
    owner_schema    text        NOT NULL DEFAULT 'ops',
    category        text        NOT NULL DEFAULT 'maintenance'
                    CHECK (category IN (
                        'maintenance','backup','monitoring','analytics',
                        'cleanup','realtime','integration','security'
                    )),
    is_critical     boolean     NOT NULL DEFAULT false,
    expected_max_duration_secs integer DEFAULT 300,
    is_idempotent   boolean     NOT NULL DEFAULT true,
    active          boolean     NOT NULL DEFAULT true,
    registered_at   timestamptz NOT NULL DEFAULT now(),
    notes           text
);

COMMENT ON TABLE ops.cron_canonical_register IS
    'Canonical register of all pg_cron jobs. Source of truth for cron governance. '
    'Naming convention: <noun>-<verb>[-qualifier] (kebab-case, no schema prefix). '
    'Every cron must be idempotent (is_idempotent=true). '
    'Created: etapas 32+33 (2026-07-27). Audited from cron.job on 27/07/2026.';

ALTER TABLE ops.cron_canonical_register ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.cron_canonical_register FROM PUBLIC, anon;
GRANT SELECT ON ops.cron_canonical_register TO authenticated;
GRANT ALL    ON ops.cron_canonical_register TO service_role;

-- ============================================================
-- Seed: Core known cron jobs (from audit 2026-07-27)
-- ============================================================
INSERT INTO ops.cron_canonical_register
    (jobname, cron_expression, command_sql, purpose, owner_schema, category,
     is_critical, expected_max_duration_secs, is_idempotent)
VALUES
    -- Evolution API / Realtime
    ('ensure-evolution-backcompat-views',
     '0 */6 * * *',
     'SELECT evo.fn_ensure_evolution_backcompat_views()',
     'Recreates compat views public→evo destroyed by Evolution API ORM on restart',
     'evo', 'maintenance', true, 120, true),

    -- Index monitoring
    ('index-usage-daily-snapshot',
     '0 2 * * *',
     'SELECT ops.fn_snapshot_index_usage()',
     'Daily snapshot of pg_stat_user_indexes for 30-day quarantine tracking',
     'ops', 'monitoring', false, 60, true),

    -- Matview refresh
    ('matview-refresh-all',
     '*/30 * * * *',
     'SELECT ops.fn_refresh_all_matviews()',
     'Refresh all governed materialized views',
     'ops', 'maintenance', false, 180, true),

    -- BPM
    ('bpm-check-breached-slas',
     '*/5 * * * *',
     'SELECT bpm.fn_check_breached_slas()',
     'Check for BPM SLA breaches and create alerts',
     'bpm', 'monitoring', false, 30, true),

    -- WAL monitoring
    ('wal-slot-monitor',
     '*/15 * * * *',
     'SELECT ops.fn_wal_slot_monitor()',
     'Monitor WAL slot lag; alert if >500MB',
     'ops', 'monitoring', true, 10, true),

    -- Email cleanup
    ('email-tracking-cleanup-weekly',
     '0 3 * * 0',
     'SELECT email_app.fn_cleanup_old_tracking_data()',
     'Purge email tracking data older than 90 days',
     'email_app', 'cleanup', false, 300, true),

    -- Auto partition creation
    ('auto-create-monthly-partitions',
     '0 0 1 * *',
     'SELECT evo.fn_auto_create_next_partitions()',
     'Create next month partitions for evolution_webhook_events_v2',
     'evo', 'maintenance', true, 60, true)

ON CONFLICT (jobname) DO NOTHING;

-- ============================================================
-- View: Cron jobs not in canonical register (discovery)
-- ============================================================
CREATE OR REPLACE VIEW ops.v_cron_unregistered
WITH (security_invoker = on) AS
SELECT
    j.jobid,
    j.jobname,
    j.schedule,
    j.command,
    j.active,
    j.username
FROM cron.job j
WHERE NOT EXISTS (
    SELECT 1 FROM ops.cron_canonical_register r
    WHERE r.jobname = j.jobname
)
ORDER BY j.jobid;

COMMENT ON VIEW ops.v_cron_unregistered IS
    'Cron jobs in cron.job that are NOT in ops.cron_canonical_register. '
    'These are undocumented — add them to the register or investigate.';

-- ============================================================
-- CI function: Check cron naming convention
-- Convention: kebab-case, noun-verb[-qualifier], no schema prefix
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_ci_check_cron_naming()
RETURNS TABLE (status text, jobname text, issue text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    -- Check for jobs with underscore (should use hyphen)
    RETURN QUERY
    SELECT
        'WARNING'::text,
        j.jobname::text,
        'Job name uses underscore instead of hyphen (convention: kebab-case)'::text
    FROM cron.job j
    WHERE j.jobname LIKE '%_%'
      AND j.jobname NOT LIKE '%-%';

    -- Check for jobs with schema prefix in name
    RETURN QUERY
    SELECT
        'WARNING'::text,
        j.jobname::text,
        format('Job name starts with schema prefix (''%s''); use noun-verb format without schema', split_part(j.jobname, '-', 1))::text
    FROM cron.job j
    WHERE j.jobname LIKE 'zapp-%'
       OR j.jobname LIKE 'evo-%'
       OR j.jobname LIKE 'ops-%'
       OR j.jobname LIKE 'bpm-%';

    -- Check for unqualified function calls (no schema.function)
    RETURN QUERY
    SELECT
        'WARNING'::text,
        j.jobname::text,
        'Cron command may reference unqualified function (no schema prefix); risk of wrong schema resolution'::text
    FROM cron.job j
    WHERE j.command ~* 'SELECT\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\('
      AND j.command NOT ~* 'SELECT\s+[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_]';

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'OK'::text, 'all'::text, 'All cron jobs follow naming convention'::text;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_ci_check_cron_naming() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_ci_check_cron_naming() TO service_role;

SELECT 'Migration 20260727300032 complete. '
       'ops.cron_canonical_register seeded with 7 core cron jobs. '
       'ops.v_cron_unregistered view created (find undocumented crons). '
       'ops.fn_ci_check_cron_naming() CI function registered. '
       'Naming convention enforced: kebab-case, noun-verb[-qualifier], no schema prefix.' AS status;
