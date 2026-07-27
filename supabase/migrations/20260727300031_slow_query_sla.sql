-- Migration: 20260727300031_slow_query_sla
-- Purpose: Define SLA thresholds for query classes + monitoring view.
--          Requires pg_stat_statements extension (already enabled).
-- Risk: LOW — additive only
-- Staging required: NO

SET search_path = ops, public, pg_catalog;

-- ============================================================
-- Query SLA thresholds table
-- ============================================================
CREATE TABLE IF NOT EXISTS ops.query_sla_thresholds (
    id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    query_class     text        NOT NULL UNIQUE,
    description     text,
    warn_ms         integer     NOT NULL,
    critical_ms     integer     NOT NULL,
    applies_to      text[]      NOT NULL DEFAULT '{}',
    notes           text
);

COMMENT ON TABLE ops.query_sla_thresholds IS
    'SLA thresholds (warn/critical in ms) for query classes. '
    'Used by ops.v_query_sla_violations to flag slow queries in pg_stat_statements. '
    'Created: etapa 31 (2026-07-27).';

ALTER TABLE ops.query_sla_thresholds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.query_sla_thresholds FROM PUBLIC, anon;
GRANT SELECT ON ops.query_sla_thresholds TO authenticated;
GRANT ALL    ON ops.query_sla_thresholds TO service_role;

-- ============================================================
-- Seed SLA classes
-- ============================================================
INSERT INTO ops.query_sla_thresholds
    (query_class, description, warn_ms, critical_ms, applies_to, notes)
VALUES
    ('rpc_interactive',
     'RPCs called from UI interactions (button clicks, form submits)',
     200, 1000,
     ARRAY['zapp.search_contacts_cursor','zapp.rpc_list_failed_messages_cursor',
           'zapp.rpc_list_dispatch_error_logs_cursor'],
     'User-perceived latency. P99 should be < 200ms.'),

    ('rpc_background',
     'RPCs called from background processes (webhooks, crons)',
     1000, 5000,
     ARRAY['zapp.fn_snapshot_index_usage','zapp.fn_refresh_all_matviews',
           'ops.fn_snapshot_index_usage'],
     'Background jobs. 5s is critical — indicates blocking or missing index.'),

    ('realtime_trigger',
     'Trigger functions that run on CDC events',
     50, 200,
     ARRAY['zapp.fn_notify_realtime','evo.fn_evolution_webhook_handler'],
     'Trigger must be fast to avoid blocking WAL replication.'),

    ('cursor_pagination',
     'Cursor-based pagination queries (keyset)',
     100, 500,
     ARRAY['zapp.rpc_list_failed_messages_cursor','zapp.rpc_list_dispatch_error_logs_cursor',
           'zapp.search_contacts_cursor'],
     'Page load time. >500ms feels slow in the UI.'),

    ('analytics_query',
     'Admin analytics and reporting queries',
     2000, 10000,
     ARRAY['zapp.mv_agent_performance','zapp.mv_workspace_metrics',
           'zapp.mv_campaign_stats'],
     'Analytics queries are background; 10s critical means matview is not refreshing.'),

    ('webhook_processing',
     'Webhook ingestion and processing pipeline',
     500, 2000,
     ARRAY['zapp.fn_process_evolution_webhook','evo.evolution_messages'],
     'Webhook pipeline. >2s may indicate queue backup or DB pressure.')

ON CONFLICT (query_class) DO NOTHING;

-- ============================================================
-- View: Query SLA violations from pg_stat_statements
-- ============================================================
CREATE OR REPLACE VIEW ops.v_query_sla_violations
WITH (security_invoker = on) AS
WITH stats AS (
    SELECT
        s.query,
        s.calls,
        s.total_exec_time / NULLIF(s.calls, 0) AS avg_ms,
        s.max_exec_time AS max_ms,
        s.rows / NULLIF(s.calls, 0) AS avg_rows,
        s.mean_exec_time AS mean_ms,
        s.stddev_exec_time AS stddev_ms,
        d.datname AS database
    FROM pg_stat_statements s
    JOIN pg_database d ON d.oid = s.dbid
    WHERE s.calls > 5
)
SELECT
    t.query_class,
    t.warn_ms,
    t.critical_ms,
    st.query,
    ROUND(st.avg_ms::numeric, 2) AS avg_ms,
    ROUND(st.max_ms::numeric, 2) AS max_ms,
    st.calls,
    CASE
        WHEN st.avg_ms > t.critical_ms THEN 'CRITICAL'
        WHEN st.avg_ms > t.warn_ms     THEN 'WARNING'
    END AS severity
FROM stats st
CROSS JOIN ops.query_sla_thresholds t
WHERE (st.avg_ms > t.warn_ms OR st.max_ms > t.critical_ms)
  AND (
      -- Match by function name in query
      EXISTS (
          SELECT 1 FROM unnest(t.applies_to) fn
          WHERE st.query ILIKE '%' || split_part(fn, '.', 2) || '%'
      )
      -- Or generic match for high avg
      OR st.avg_ms > t.critical_ms
  )
ORDER BY st.avg_ms DESC;

COMMENT ON VIEW ops.v_query_sla_violations IS
    'Queries from pg_stat_statements exceeding SLA thresholds. '
    'Requires pg_stat_statements extension (already enabled).';

-- ============================================================
-- CI function: fail if any CRITICAL violations exist
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_ci_check_query_sla()
RETURNS TABLE (status text, query_class text, query_fragment text, issue text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    SELECT
        'CRITICAL'::text,
        v.query_class::text,
        LEFT(v.query, 100)::text,
        format('avg_ms=%.0f exceeds critical threshold of %s ms (calls=%s)',
               v.avg_ms, v.critical_ms, v.calls)::text
    FROM ops.v_query_sla_violations v
    WHERE v.severity = 'CRITICAL';

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'OK'::text, 'all'::text, ''::text, 'No critical SLA violations'::text;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_ci_check_query_sla() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_ci_check_query_sla() TO service_role;

SELECT 'Migration 20260727300031 complete. '
       'ops.query_sla_thresholds seeded with 6 query classes. '
       'ops.v_query_sla_violations view created (uses pg_stat_statements). '
       'ops.fn_ci_check_query_sla() CI function registered.' AS status;
