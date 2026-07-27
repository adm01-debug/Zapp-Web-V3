-- Migration: 20260727320000_fix_fn_ci_check_cron_health
-- Purpose: Fix false-OK in ops.fn_ci_check_cron_health().
--          The original used `IF NOT FOUND` which in PL/pgSQL only reflects
--          the LAST executed statement. With 3 RETURN QUERY calls, if the
--          first two emit rows but the third doesn't, NOT FOUND=true and the
--          function appended a spurious 'OK' row alongside real failures.
--          Fix: explicit v_rows_emitted counter accumulated across all 3 queries.
-- Risk: LOW — DROP/CREATE REPLACE of existing function, additive logic change only
-- Staging required: NO

SET search_path = ops, pg_catalog;

CREATE OR REPLACE FUNCTION ops.fn_ci_check_cron_health()
RETURNS TABLE (status text, jobname text, issue text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
DECLARE
    v_rows_emitted INT := 0;
    v_batch_rows   INT;
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

    GET DIAGNOSTICS v_batch_rows = ROW_COUNT;
    v_rows_emitted := v_rows_emitted + v_batch_rows;

    -- Warning: critical jobs not seen running when expected
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

    GET DIAGNOSTICS v_batch_rows = ROW_COUNT;
    v_rows_emitted := v_rows_emitted + v_batch_rows;

    -- Warning: thundering herd
    RETURN QUERY
    SELECT
        'WARNING'::text,
        th.job_names::text,
        format('%s jobs compete at cron pattern ''%s''',
               th.concurrent_jobs, th.cron_time_pattern)::text
    FROM ops.v_cron_thundering_herd th;

    GET DIAGNOSTICS v_batch_rows = ROW_COUNT;
    v_rows_emitted := v_rows_emitted + v_batch_rows;

    -- Only emit OK when no issues were found across ALL three checks
    IF v_rows_emitted = 0 THEN
        RETURN QUERY SELECT 'OK'::text, 'all'::text, 'All cron jobs healthy'::text;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_ci_check_cron_health() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_ci_check_cron_health() TO service_role;

SELECT 'Migration 20260727320000 complete. '
       'ops.fn_ci_check_cron_health() false-OK fixed: '
       'IF NOT FOUND replaced with explicit v_rows_emitted counter.' AS status;
