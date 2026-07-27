-- Migration: 20260727300034_cron_thundering_herd_and_alerting
-- Purpose: Etapa 34 — detect thundering-herd (multiple crons at same minute).
--          Etapa 35 — cron execution history + failure alerting.
-- Risk: LOW — additive only
-- Staging required: NO

SET search_path = ops, public, pg_catalog;

-- ============================================================
-- ETAPA 34: Thundering-herd detection view
-- ============================================================
CREATE OR REPLACE VIEW ops.v_cron_thundering_herd
WITH (security_invoker = on) AS
WITH cron_minutes AS (
    SELECT
        j.jobid,
        j.jobname,
        j.schedule,
        j.active,
        -- Extract the minute field from cron expression
        split_part(j.schedule, ' ', 1) AS cron_min,
        split_part(j.schedule, ' ', 2) AS cron_hour
    FROM cron.job j
    WHERE j.active
)
SELECT
    cron_min || ' ' || cron_hour AS cron_time_pattern,
    COUNT(*) AS concurrent_jobs,
    string_agg(jobname, ', ' ORDER BY jobname) AS job_names
FROM cron_minutes
WHERE cron_min NOT LIKE '*/%'      -- not "every N minutes"
  AND cron_min NOT LIKE '*'         -- not "every minute"
GROUP BY cron_min, cron_hour
HAVING COUNT(*) > 2                 -- more than 2 jobs at same minute = risk
ORDER BY concurrent_jobs DESC;

COMMENT ON VIEW ops.v_cron_thundering_herd IS
    'Cron time slots with more than 2 jobs scheduled at the same minute. '
    'These can cause I/O spikes and connection saturation. '
    'Fix: stagger offsets by 1-2 minutes between jobs.';

-- ============================================================
-- ETAPA 35: Cron execution history table
-- ============================================================
CREATE TABLE IF NOT EXISTS ops.cron_execution_history (
    id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    jobname         text        NOT NULL,
    run_at          timestamptz NOT NULL DEFAULT now(),
    duration_ms     integer,
    status          text        NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running','success','failure','timeout')),
    error_message   text,
    rows_affected   integer
);

COMMENT ON TABLE ops.cron_execution_history IS
    'Rolling log of cron job executions. '
    'Populated by ops.fn_cron_execution_log(). '
    'Retention: 30 days (purged by ops.fn_cron_history_purge). '
    'Created: etapa 35 (2026-07-27).';

CREATE INDEX IF NOT EXISTS idx_cron_execution_history_jobname_run
    ON ops.cron_execution_history (jobname, run_at DESC);

ALTER TABLE ops.cron_execution_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.cron_execution_history FROM PUBLIC, anon;
GRANT SELECT ON ops.cron_execution_history TO authenticated;
GRANT ALL    ON ops.cron_execution_history TO service_role;

-- ============================================================
-- View: Recent failures
-- ============================================================
CREATE OR REPLACE VIEW ops.v_cron_recent_failures
WITH (security_invoker = on) AS
SELECT
    h.jobname,
    h.run_at,
    h.duration_ms,
    h.status,
    h.error_message,
    COUNT(*) OVER (PARTITION BY h.jobname) AS failure_count_total
FROM ops.cron_execution_history h
WHERE h.status IN ('failure','timeout')
  AND h.run_at > now() - INTERVAL '7 days'
ORDER BY h.run_at DESC;

-- ============================================================
-- Function: Log cron execution (called by wrapper functions)
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_cron_log_start(p_jobname text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
DECLARE
    v_id bigint;
BEGIN
    INSERT INTO ops.cron_execution_history (jobname, status)
    VALUES (p_jobname, 'running')
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION ops.fn_cron_log_end(
    p_id          bigint,
    p_status      text,
    p_error       text DEFAULT NULL,
    p_rows        integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    UPDATE ops.cron_execution_history
    SET
        status        = p_status,
        duration_ms   = EXTRACT(milliseconds FROM now() - run_at)::integer,
        error_message = p_error,
        rows_affected = p_rows
    WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_cron_log_start(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_cron_log_start(text) TO service_role;

REVOKE EXECUTE ON FUNCTION ops.fn_cron_log_end(bigint, text, text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_cron_log_end(bigint, text, text, integer) TO service_role;

-- ============================================================
-- Function: Purge old history (>30 days)
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_cron_history_purge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    DELETE FROM ops.cron_execution_history
    WHERE run_at < now() - INTERVAL '30 days';
    RAISE NOTICE '✓ Cron history purged (>30 days)';
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_cron_history_purge() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_cron_history_purge() TO service_role;

-- Register weekly purge cron
SELECT cron.schedule(
    'cron-history-purge-weekly',
    '0 4 * * 0',
    'SELECT ops.fn_cron_history_purge()'
) WHERE NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cron-history-purge-weekly'
);

-- ============================================================
-- CI function: Alert on cron failures
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_ci_check_cron_health()
RETURNS TABLE (status text, jobname text, issue text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    -- Critical: jobs with 3+ failures in last 24h
    RETURN QUERY
    SELECT
        'CRITICAL'::text,
        h.jobname::text,
        format('%s failures in last 24h (last error: %s)',
               COUNT(*), MAX(h.error_message))::text
    FROM ops.cron_execution_history h
    WHERE h.status IN ('failure','timeout')
      AND h.run_at > now() - INTERVAL '24 hours'
    GROUP BY h.jobname
    HAVING COUNT(*) >= 3;

    -- Warning: jobs not seen running when expected
    RETURN QUERY
    SELECT
        'WARNING'::text,
        r.jobname::text,
        format('Job is_critical=true but no execution recorded in last 2h')::text
    FROM ops.cron_canonical_register r
    WHERE r.is_critical
      AND r.active
      AND NOT EXISTS (
          SELECT 1 FROM ops.cron_execution_history h
          WHERE h.jobname = r.jobname
            AND h.run_at > now() - INTERVAL '2 hours'
      );

    -- Check for thundering herd
    RETURN QUERY
    SELECT
        'WARNING'::text,
        th.job_names::text,
        format('%s jobs compete at cron pattern ''%s''',
               th.concurrent_jobs, th.cron_time_pattern)::text
    FROM ops.v_cron_thundering_herd th;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'OK'::text, 'all'::text, 'All cron jobs healthy'::text;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_ci_check_cron_health() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_ci_check_cron_health() TO service_role;

SELECT 'Migration 20260727300034 complete. '
       'ops.v_cron_thundering_herd view created (etapa 34). '
       'ops.cron_execution_history table + log functions created (etapa 35). '
       'ops.fn_ci_check_cron_health() CI function registered.' AS status;
