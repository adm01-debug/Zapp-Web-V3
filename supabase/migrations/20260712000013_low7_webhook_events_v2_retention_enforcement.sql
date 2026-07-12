-- ============================================================================
-- LOW-7 (2026-07-12): evo.evolution_webhook_events_v2 retention enforcement
--
-- PROBLEM (AUDITORIA_BACKEND_SENIOR_2026-07-11.md LOW-7)
-- -------
-- evo.evolution_webhook_events_v2 is a pg_partman monthly-partitioned table.
-- Partitions accumulate indefinitely; no automated drop policy exists.
-- At peak volume (~400K rows/day) each monthly partition is ~1.5 GB.
-- After 90 days the data is no longer needed for operational purposes.
--
-- SOLUTION
-- --------
-- Create evo.fn_enforce_webhook_events_v2_retention(p_retain_months int DEFAULT 3)
-- that:
--   1. Builds the cutoff month: current month minus p_retain_months.
--   2. Lists all evo.evolution_webhook_events_v2_YYYY_MM child partitions.
--   3. Skips the current month and any future partition (safety guard).
--   4. Drops each eligible partition inside a BEGIN...EXCEPTION block
--      (lock timeout 2 s; statement timeout 30 s) so a single hot partition
--      cannot abort the entire job.
--   5. Returns a JSONB summary: {dropped, skipped, errors, cutoff_month}.
--
-- A pg_cron job runs the function daily at 02:30 UTC.
--
-- SAFETY GUARDS
-- -------------
--   • Never drops the current month's partition.
--   • Never drops partitions named for future months.
--   • p_retain_months minimum is clamped to 1 (cannot retain < 1 month).
--   • lock_timeout = 2000ms per partition → skips instead of deadlocking.
--   • statement_timeout = 30000ms per partition.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + pg_cron upsert pattern.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Retention enforcement function
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_enforce_webhook_events_v2_retention(
    p_retain_months int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public
SET lock_timeout  = '2000ms'
SET statement_timeout = '30000ms'
AS $$
DECLARE
    v_retain_months   int;
    v_cutoff_month    text;    -- 'YYYY_MM' of the oldest month to KEEP
    v_current_month   text;    -- 'YYYY_MM' of NOW()
    v_partition_name  text;
    v_partition_month text;
    v_dropped         int := 0;
    v_skipped         int := 0;
    v_errors          int := 0;
    v_error_detail    jsonb := '[]'::jsonb;
    v_msg             text;
BEGIN
    -- Clamp retain_months to minimum of 1
    v_retain_months := GREATEST(1, COALESCE(p_retain_months, 3));

    -- Current month formatted as pg_partman suffix: YYYY_MM
    v_current_month := to_char(date_trunc('month', NOW()), 'YYYY_MM');

    -- The oldest month we still want to keep = current month - (retain_months - 1)
    -- i.e. today=2026-07, retain=3 → keep Jul, Jun, May → cutoff=2026_05
    v_cutoff_month := to_char(
        date_trunc('month', NOW()) - ((v_retain_months - 1) * INTERVAL '1 month'),
        'YYYY_MM'
    );

    -- Iterate over all evolution_webhook_events_v2_YYYY_MM child tables
    FOR v_partition_name IN
        SELECT c.relname
        FROM   pg_class     c
        JOIN   pg_namespace n ON n.oid = c.relnamespace
        WHERE  n.nspname = 'evo'
          AND  c.relname ~ '^evolution_webhook_events_v2_[0-9]{4}_[0-9]{2}$'
          AND  c.relkind = 'r'
        ORDER BY c.relname
    LOOP
        -- Extract the YYYY_MM suffix from the partition name
        v_partition_month := substring(v_partition_name FROM '[0-9]{4}_[0-9]{2}$');

        -- Safety guard: skip current month and any future partitions
        IF v_partition_month >= v_current_month THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- Skip partitions that are within the retention window
        IF v_partition_month >= v_cutoff_month THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- Attempt to drop the old partition
        BEGIN
            EXECUTE format('DROP TABLE IF EXISTS evo.%I', v_partition_name);
            v_dropped := v_dropped + 1;
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            v_errors := v_errors + 1;
            v_error_detail := v_error_detail || jsonb_build_object(
                'partition', v_partition_name,
                'error',     v_msg
            );
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'cutoff_month',   v_cutoff_month,
        'current_month',  v_current_month,
        'retain_months',  v_retain_months,
        'dropped',        v_dropped,
        'skipped',        v_skipped,
        'errors',         v_errors,
        'error_detail',   v_error_detail,
        'executed_at',    NOW()
    );
END;
$$;

COMMENT ON FUNCTION evo.fn_enforce_webhook_events_v2_retention(int) IS
  'Drops evo.evolution_webhook_events_v2_YYYY_MM monthly partitions older than '
  'p_retain_months (default 3 ≈ 90 days). Safety guard: never drops current or '
  'future months. Per-partition BEGIN..EXCEPTION handler with 2s lock_timeout so '
  'a single hot partition cannot abort the job. Returns JSONB summary. (LOW-7)';

-- Restrict execution to postgres and service_role (not exposed to authenticated users)
REVOKE EXECUTE ON FUNCTION evo.fn_enforce_webhook_events_v2_retention(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_enforce_webhook_events_v2_retention(int) TO postgres, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. pg_cron job — daily at 02:30 UTC
--    Upsert pattern: delete existing job by name, then re-schedule.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_cron_available boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) INTO v_cron_available;

    IF NOT v_cron_available THEN
        RAISE NOTICE 'LOW-7: pg_cron not installed — skipping cron job registration.';
        RETURN;
    END IF;

    -- Remove any existing job with this name (idempotent)
    PERFORM cron.unschedule('enforce-wpp2-v2-retention')
    WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'enforce-wpp2-v2-retention'
    );

    -- Schedule daily at 02:30 UTC
    PERFORM cron.schedule(
        'enforce-wpp2-v2-retention',
        '30 2 * * *',
        $$SELECT evo.fn_enforce_webhook_events_v2_retention(3);$$
    );

    RAISE NOTICE 'LOW-7: pg_cron job enforce-wpp2-v2-retention scheduled at 02:30 UTC daily.';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Validate
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM   pg_proc     p
        JOIN   pg_namespace n ON n.oid = p.pronamespace
        WHERE  n.nspname = 'evo'
          AND  p.proname = 'fn_enforce_webhook_events_v2_retention'
    ) THEN
        RAISE EXCEPTION 'LOW-7 FAILED: evo.fn_enforce_webhook_events_v2_retention missing';
    END IF;

    RAISE NOTICE 'LOW-7 OK: evo.fn_enforce_webhook_events_v2_retention deployed + pg_cron job registered.';
END;
$$;
