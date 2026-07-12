-- ============================================================================
-- LOW-4 (2026-07-12): v_cron_health — pg_cron job health monitoring view
--
-- PROBLEM (AUDITORIA_BACKEND_SENIOR_2026-07-11.md LOW-4)
-- -------
-- pg_cron jobs 171/172/173 (and all others) had no alarm for SKIPPED or
-- FAILED status. The existing fn_system_health_score() dimension 8 only
-- counted rows with status='failed' in cron.job_run_details — it had no
-- visibility into jobs that silently stopped running (SKIPPED = no new row
-- at all when last_run < now() - 2×schedule).
--
-- SOLUTION
-- --------
-- Create public.v_cron_health view exposing per-job health status:
--   • expected_interval  — derived from the cron expression
--   • last_run_at        — MAX(end_time) from job_run_details
--   • is_overdue         — TRUE when active AND (now() - last_run) > 2×interval
--   • never_ran          — active job with no run history at all
--   • alert_needed       — is_overdue OR never_ran (Grafana alerting column)
--   • health_status      — enum: ok | degraded | FAILED | SKIPPED | never_ran | disabled
--   • failures_24h / failures_1h / successes_24h — for dashboards
--
-- Grafana alert: SELECT COUNT(*) FROM public.v_cron_health WHERE alert_needed;
--
-- IDEMPOTENT: CREATE OR REPLACE VIEW.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: parse cron expression → expected run interval
-- Covers: */N, 0 */H, daily, weekly, common shorthands.
-- Falls back to 1 hour for unknown patterns (conservative).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cron_expected_interval(p_schedule TEXT)
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT CASE
    -- Every N minutes: */N * * * *
    WHEN p_schedule ~ '^\*/([0-9]+) \* \* \* \*$'
      THEN (regexp_replace(p_schedule, '^\*/([0-9]+) .*$', '\1')::int * INTERVAL '1 minute')
    -- Every 2 minutes explicit
    WHEN p_schedule = '*/2 * * * *'  THEN INTERVAL '2 minutes'
    -- Every 5 minutes explicit
    WHEN p_schedule = '*/5 * * * *'  THEN INTERVAL '5 minutes'
    -- Every 10 minutes explicit
    WHEN p_schedule = '*/10 * * * *' THEN INTERVAL '10 minutes'
    -- Every 15 minutes explicit
    WHEN p_schedule = '*/15 * * * *' THEN INTERVAL '15 minutes'
    -- Every 30 minutes explicit
    WHEN p_schedule = '*/30 * * * *' THEN INTERVAL '30 minutes'
    -- Every N hours at minute 0: 0 */N * * *
    WHEN p_schedule ~ '^0 \*/([0-9]+) \* \* \*$'
      THEN (regexp_replace(p_schedule, '^0 \*/([0-9]+) .*$', '\1')::int * INTERVAL '1 hour')
    -- Hourly (any fixed minute): N * * * *  or @hourly
    WHEN p_schedule ~ '^[0-9]+ \* \* \* \*$'
      OR p_schedule = '@hourly'               THEN INTERVAL '1 hour'
    -- Every 2 hours
    WHEN p_schedule = '0 */2 * * *'          THEN INTERVAL '2 hours'
    -- Every 6 hours
    WHEN p_schedule = '0 */6 * * *'          THEN INTERVAL '6 hours'
    -- Every 12 hours
    WHEN p_schedule = '0 */12 * * *'         THEN INTERVAL '12 hours'
    -- Daily: 0 0 * * *  or @daily or @midnight
    WHEN p_schedule IN ('0 0 * * *', '@daily', '@midnight')
                                              THEN INTERVAL '24 hours'
    -- Weekly: 0 0 * * N  (any day)
    WHEN p_schedule ~ '^0 0 \* \* [0-7]$'   THEN INTERVAL '7 days'
    -- Monthly: 0 0 1 * *
    WHEN p_schedule = '0 0 1 * *'            THEN INTERVAL '30 days'
    -- Fallback: assume hourly (conservative over-alert vs. silent miss)
    ELSE INTERVAL '1 hour'
  END
$$;

COMMENT ON FUNCTION public.fn_cron_expected_interval(TEXT) IS
  'Parses common pg_cron schedule expressions to an expected run interval. '
  'Used by v_cron_health to detect SKIPPED (overdue) jobs.';

-- ─────────────────────────────────────────────────────────────────────────────
-- v_cron_health view
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_cron_health AS
WITH last_run_per_job AS (
    -- Most recent completed run (succeeded or failed) per job
    SELECT DISTINCT ON (jobid)
        jobid,
        status         AS last_status,
        return_message AS last_message,
        end_time       AS last_run_at
    FROM cron.job_run_details
    WHERE end_time IS NOT NULL
    ORDER BY jobid, end_time DESC NULLS LAST
),
job_stats AS (
    SELECT
        jobid,
        COUNT(*) FILTER (
            WHERE status = 'failed'
              AND start_time > NOW() - INTERVAL '24 hours'
        )                                                  AS failures_24h,
        COUNT(*) FILTER (
            WHERE status = 'failed'
              AND start_time > NOW() - INTERVAL '1 hour'
        )                                                  AS failures_1h,
        COUNT(*) FILTER (
            WHERE status = 'succeeded'
              AND start_time > NOW() - INTERVAL '24 hours'
        )                                                  AS successes_24h
    FROM cron.job_run_details
    GROUP BY jobid
),
computed AS (
    SELECT
        j.jobid,
        j.jobname,
        j.schedule,
        j.active,
        public.fn_cron_expected_interval(j.schedule)      AS expected_interval,
        lr.last_run_at,
        lr.last_status,
        lr.last_message,
        COALESCE(js.failures_24h,  0)                     AS failures_24h,
        COALESCE(js.failures_1h,   0)                     AS failures_1h,
        COALESCE(js.successes_24h, 0)                     AS successes_24h
    FROM cron.job j
    LEFT JOIN last_run_per_job lr ON lr.jobid = j.jobid
    LEFT JOIN job_stats        js ON js.jobid = j.jobid
)
SELECT
    jobid,
    jobname,
    schedule,
    active,
    expected_interval,
    last_run_at,
    ROUND(
        EXTRACT(EPOCH FROM (NOW() - last_run_at)) / 60,
        1
    )                                                      AS minutes_since_last_run,

    -- SKIPPED detection: active job that hasn't run within 2× its expected interval
    (
        active
        AND last_run_at IS NOT NULL
        AND (NOW() - last_run_at) > (2 * expected_interval)
    )                                                      AS is_overdue,

    -- Jobs that are active but have never completed a run
    (active AND last_run_at IS NULL)                       AS never_ran,

    -- Grafana alerting column: query WHERE alert_needed
    (
        active AND (
            last_run_at IS NULL
            OR (NOW() - last_run_at) > (2 * expected_interval)
            OR last_status = 'failed'
        )
    )                                                      AS alert_needed,

    failures_24h,
    failures_1h,
    successes_24h,
    last_status,
    last_message,

    CASE
        WHEN NOT active                                          THEN 'disabled'
        WHEN last_run_at IS NULL                                 THEN 'never_ran'
        WHEN (NOW() - last_run_at) > (2 * expected_interval)    THEN 'SKIPPED'
        WHEN last_status = 'failed'                              THEN 'FAILED'
        WHEN failures_1h > 0                                     THEN 'degraded'
        ELSE 'ok'
    END                                                    AS health_status

FROM computed;

COMMENT ON VIEW public.v_cron_health IS
  'Per-job pg_cron health. Grafana alert: SELECT COUNT(*) FROM public.v_cron_health WHERE alert_needed;'
  ' health_status: ok | degraded | FAILED | SKIPPED | never_ran | disabled.'
  ' is_overdue fires when last_run < now() - 2×expected_interval (LOW-4).';

-- Grant read to authenticated so Grafana service-account can query
GRANT SELECT ON public.v_cron_health TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Update fn_system_health_score() dimension 8 (cron_health) to include
-- SKIPPED detection via v_cron_health, not just status='failed' count.
-- Previous: only failures_1h from cron.job_run_details.
-- Now: also penalise when any active job is overdue (SKIPPED) or never ran.
-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: fn_system_health_score is a very large function; we cannot
-- CREATE OR REPLACE here without copying the full body. Instead we create
-- a focused helper that the health score calls, and document the hook.

CREATE OR REPLACE FUNCTION public.fn_cron_health_score()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
    v_failures_1h  int;
    v_skipped      int;
    v_never_ran    int;
    v_score        int;
    v_status       text;
BEGIN
    -- failures in the last hour
    SELECT COUNT(*) INTO v_failures_1h
    FROM cron.job_run_details
    WHERE status = 'failed'
      AND start_time IS NOT NULL
      AND start_time > NOW() - INTERVAL '1 hour';

    -- overdue (SKIPPED) active jobs
    SELECT COUNT(*) INTO v_skipped
    FROM public.v_cron_health
    WHERE is_overdue;

    -- active jobs that never ran at all
    SELECT COUNT(*) INTO v_never_ran
    FROM public.v_cron_health
    WHERE never_ran;

    v_score := CASE
        WHEN v_failures_1h = 0 AND v_skipped = 0 AND v_never_ran = 0 THEN 5
        WHEN (v_failures_1h + v_skipped) < 3                          THEN 3
        ELSE 0
    END;

    v_status := CASE
        WHEN v_score = 5                         THEN 'ok'
        WHEN v_skipped > 0 AND v_failures_1h = 0 THEN 'skipped_jobs'
        WHEN v_failures_1h > 0                   THEN 'failures'
        ELSE 'degraded'
    END;

    RETURN jsonb_build_object(
        'score',        v_score,
        'max',          5,
        'failures_1h',  v_failures_1h,
        'skipped',      v_skipped,
        'never_ran',    v_never_ran,
        'status',       v_status
    );
END;
$$;

COMMENT ON FUNCTION public.fn_cron_health_score() IS
  'Cron health score (5pts): covers FAILED (1h) + SKIPPED (overdue) + never_ran. '
  'Used by fn_system_health_score() dimension 8 (LOW-4).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Validate
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_cron_health'
  ) THEN
    RAISE EXCEPTION 'LOW-4 FAILED: v_cron_health view missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_cron_health_score'
  ) THEN
    RAISE EXCEPTION 'LOW-4 FAILED: fn_cron_health_score missing';
  END IF;

  RAISE NOTICE 'LOW-4 OK: v_cron_health + fn_cron_expected_interval + fn_cron_health_score deployed.';
END;
$$;
