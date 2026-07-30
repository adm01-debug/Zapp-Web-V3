-- Migration: 20260727300030_matview_governance
-- Purpose: Governance table for the 6 materialized views in zapp schema.
--          Documents refresh schedules, staleness thresholds, and concurrency flags.
--          Actual REFRESH MATERIALIZED VIEW must run via cron.
-- Risk: LOW — additive only
-- Staging required: NO

SET search_path = ops, public, pg_catalog;

-- ============================================================
-- Matview governance table
-- ============================================================
CREATE TABLE IF NOT EXISTS ops.matview_governance (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schema_name         text        NOT NULL,
    matview_name        text        NOT NULL UNIQUE,
    refresh_cron        text,
    refresh_concurrently boolean     NOT NULL DEFAULT false,
    max_staleness_mins  integer     NOT NULL DEFAULT 60,
    has_unique_index    boolean     NOT NULL DEFAULT false,
    unique_index_name   text,
    last_refreshed_at   timestamptz,
    notes               text
);

COMMENT ON TABLE ops.matview_governance IS
    'Governance registry for all materialized views. '
    'Refresh concurrently requires a unique index — has_unique_index must be true. '
    'max_staleness_mins = alert threshold in ops.v_matview_staleness. '
    'Created: etapa 30 (2026-07-27). Audited 2026-07-27: 6 matviews in zapp.';

ALTER TABLE ops.matview_governance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.matview_governance FROM PUBLIC, anon;
GRANT SELECT ON ops.matview_governance TO authenticated;
GRANT ALL    ON ops.matview_governance TO service_role;

-- ============================================================
-- Seed: 6 known matviews in zapp (from catalog audit 2026-07-27)
-- ============================================================
INSERT INTO ops.matview_governance
    (schema_name, matview_name, refresh_cron, refresh_concurrently,
     max_staleness_mins, has_unique_index, notes)
VALUES
    ('zapp', 'mv_contact_stats',
     '0 */4 * * *', false, 240, false,
     'Contact aggregation stats. No unique index — cannot use CONCURRENT refresh. '
     'Add: CREATE UNIQUE INDEX ON zapp.mv_contact_stats (workspace_id, contact_id);'),

    ('zapp', 'mv_workspace_metrics',
     '*/30 * * * *', false, 35, false,
     'Real-time workspace metrics. High refresh frequency — add unique index to enable CONCURRENT. '
     'Add: CREATE UNIQUE INDEX ON zapp.mv_workspace_metrics (workspace_id);'),

    ('zapp', 'mv_agent_performance',
     '0 * * * *', false, 65, false,
     'Agent performance metrics (hourly). Queried by admin dashboard. '
     'Add: CREATE UNIQUE INDEX ON zapp.mv_agent_performance (agent_id, period_hour);'),

    ('zapp', 'mv_queue_summary',
     '*/15 * * * *', false, 20, false,
     'Queue summary for real-time monitoring. Very stale after 20 min = wrong SLA display. '
     'Add: CREATE UNIQUE INDEX ON zapp.mv_queue_summary (queue_id);'),

    ('zapp', 'mv_campaign_stats',
     '0 */6 * * *', false, 370, false,
     'Campaign aggregate stats. Low refresh rate acceptable (batch reporting). '
     'Add: CREATE UNIQUE INDEX ON zapp.mv_campaign_stats (campaign_id);'),

    ('zapp', 'mv_evolution_summary',
     '0 2 * * *', false, 1500, false,
     'Daily summary of evolution message counts per instance. Nightly refresh sufficient. '
     'Add: CREATE UNIQUE INDEX ON zapp.mv_evolution_summary (instance_name, date_trunc_day);')

ON CONFLICT (matview_name) DO NOTHING;

-- ============================================================
-- View: Detect stale matviews
-- ============================================================
CREATE OR REPLACE VIEW ops.v_matview_staleness
WITH (security_invoker = on) AS
SELECT
    m.schema_name,
    m.matview_name,
    m.refresh_cron,
    m.max_staleness_mins,
    m.has_unique_index,
    m.last_refreshed_at,
    EXTRACT(EPOCH FROM (now() - m.last_refreshed_at)) / 60 AS mins_since_refresh,
    CASE
        WHEN m.last_refreshed_at IS NULL THEN 'NEVER REFRESHED'
        WHEN EXTRACT(EPOCH FROM (now() - m.last_refreshed_at)) / 60 > m.max_staleness_mins THEN 'STALE'
        ELSE 'FRESH'
    END AS freshness_status,
    m.notes
FROM ops.matview_governance m
ORDER BY mins_since_refresh DESC NULLS FIRST;

COMMENT ON VIEW ops.v_matview_staleness IS
    'Staleness check for all governed matviews. '
    'freshness_status=STALE means last refresh exceeded max_staleness_mins threshold.';

-- ============================================================
-- Function: Refresh all matviews (called by cron)
-- Run each matview in sequence; log result to matview_governance
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_refresh_all_matviews()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, zapp, pg_catalog
AS $$
DECLARE
    v_matview record;
    v_start   timestamptz;
BEGIN
    FOR v_matview IN
        SELECT schema_name, matview_name, refresh_concurrently
        FROM ops.matview_governance
        ORDER BY id
    LOOP
        v_start := clock_timestamp();
        BEGIN
            IF v_matview.refresh_concurrently THEN
                EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I.%I',
                               v_matview.schema_name, v_matview.matview_name);
            ELSE
                EXECUTE format('REFRESH MATERIALIZED VIEW %I.%I',
                               v_matview.schema_name, v_matview.matview_name);
            END IF;

            UPDATE ops.matview_governance
            SET last_refreshed_at = clock_timestamp()
            WHERE schema_name = v_matview.schema_name
              AND matview_name = v_matview.matview_name;

            RAISE NOTICE '✓ Refreshed %.% in %ms',
                v_matview.schema_name, v_matview.matview_name,
                EXTRACT(milliseconds FROM clock_timestamp() - v_start);

        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '✗ Failed to refresh %.%: %',
                v_matview.schema_name, v_matview.matview_name, SQLERRM;
        END;
    END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_refresh_all_matviews() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_refresh_all_matviews() TO service_role;

-- ============================================================
-- Register cron: refresh matviews every 30 min
-- ============================================================
SELECT cron.schedule(
    'matview-refresh-all',
    '*/30 * * * *',
    'SELECT ops.fn_refresh_all_matviews()'
) WHERE NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'matview-refresh-all'
);

SELECT 'Migration 20260727300030 complete. '
       'ops.matview_governance seeded with 6 zapp matviews. '
       'ops.v_matview_staleness view created. '
       'ops.fn_refresh_all_matviews() cron registered (every 30 min). '
       'ACTION NEEDED: Add unique indexes to all 6 matviews to enable CONCURRENT refresh.' AS status;
