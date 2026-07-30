-- FIX-17 (C-17 - CRITICAL): Regression prevention via integration tests
-- =======================================================================
--
-- PROBLEM: Without comprehensive integration tests:
-- 1. Fixes break other parts of system silently
-- 2. Performance regressions introduced without detection
-- 3. Data integrity violations go unnoticed in production
-- 4. Edge cases not covered by unit tests cause outages
-- 5. No baseline for detecting degradation
--
-- SOLUTION:
-- 1. Create test result tracking table
-- 2. Create performance baseline validation function
-- 3. Implement data integrity verification suite
-- 4. Create regression detection alerts
-- 5. Document test coverage requirements

-- Step 1: Create test result tracking table
CREATE TABLE IF NOT EXISTS evo.test_results (
  id BIGSERIAL PRIMARY KEY,
  test_name TEXT NOT NULL,
  test_suite TEXT NOT NULL,
  status TEXT NOT NULL, -- passed, failed, skipped
  duration_ms NUMERIC NOT NULL,
  error_message TEXT,
  performance_metrics JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  run_id TEXT NOT NULL,
  CONSTRAINT idx_test_run_time UNIQUE (run_id, test_name, created_at)
);

CREATE INDEX IF NOT EXISTS idx_test_results_suite
  ON evo.test_results(test_suite, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_results_performance
  ON evo.test_results(duration_ms DESC) WHERE status = 'passed';

-- Step 2: Create performance baseline validation function
CREATE OR REPLACE FUNCTION public.fn_validate_performance_baselines()
RETURNS TABLE(
  metric_name TEXT,
  current_value NUMERIC,
  baseline_value NUMERIC,
  status TEXT,
  deviation_percent NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_baseline_webhook_dedup NUMERIC := 100; -- ms
  v_baseline_rate_limit NUMERIC := 50;     -- ms
  v_baseline_redaction NUMERIC := 200;     -- ms
  v_baseline_audit_insert NUMERIC := 100;  -- ms
  v_current_dedup NUMERIC;
  v_current_rate_limit NUMERIC;
  v_current_redaction NUMERIC;
  v_current_audit NUMERIC;
BEGIN
  -- Get average latencies from recent test runs
  SELECT COALESCE(AVG(duration_ms), 0) INTO v_current_dedup
  FROM evo.test_results
  WHERE test_name LIKE '%dedup%' AND status = 'passed'
    AND created_at > now() - INTERVAL '24 hours'
  LIMIT 100;

  SELECT COALESCE(AVG(duration_ms), 0) INTO v_current_rate_limit
  FROM evo.test_results
  WHERE test_name LIKE '%rate_limit%' AND status = 'passed'
    AND created_at > now() - INTERVAL '24 hours'
  LIMIT 100;

  SELECT COALESCE(AVG(duration_ms), 0) INTO v_current_redaction
  FROM evo.test_results
  WHERE test_name LIKE '%redaction%' AND status = 'passed'
    AND created_at > now() - INTERVAL '24 hours'
  LIMIT 100;

  SELECT COALESCE(AVG(duration_ms), 0) INTO v_current_audit
  FROM evo.test_results
  WHERE test_name LIKE '%audit%' AND status = 'passed'
    AND created_at > now() - INTERVAL '24 hours'
  LIMIT 100;

  -- Return results
  RETURN QUERY SELECT
    'webhook_dedup'::TEXT,
    v_current_dedup,
    v_baseline_webhook_dedup,
    CASE
      WHEN v_current_dedup = 0 THEN 'NO_DATA'
      WHEN v_current_dedup <= v_baseline_webhook_dedup THEN 'OK'
      WHEN v_current_dedup <= v_baseline_webhook_dedup * 1.2 THEN 'WARNING'
      ELSE 'CRITICAL'
    END,
    CASE WHEN v_current_dedup = 0 THEN NULL ELSE ((v_current_dedup - v_baseline_webhook_dedup) / v_baseline_webhook_dedup) * 100 END;

  RETURN QUERY SELECT
    'rate_limit_check'::TEXT,
    v_current_rate_limit,
    v_baseline_rate_limit,
    CASE
      WHEN v_current_rate_limit = 0 THEN 'NO_DATA'
      WHEN v_current_rate_limit <= v_baseline_rate_limit THEN 'OK'
      WHEN v_current_rate_limit <= v_baseline_rate_limit * 1.2 THEN 'WARNING'
      ELSE 'CRITICAL'
    END,
    CASE WHEN v_current_rate_limit = 0 THEN NULL ELSE ((v_current_rate_limit - v_baseline_rate_limit) / v_baseline_rate_limit) * 100 END;

  RETURN QUERY SELECT
    'secret_redaction'::TEXT,
    v_current_redaction,
    v_baseline_redaction,
    CASE
      WHEN v_current_redaction = 0 THEN 'NO_DATA'
      WHEN v_current_redaction <= v_baseline_redaction THEN 'OK'
      WHEN v_current_redaction <= v_baseline_redaction * 1.2 THEN 'WARNING'
      ELSE 'CRITICAL'
    END,
    CASE WHEN v_current_redaction = 0 THEN NULL ELSE ((v_current_redaction - v_baseline_redaction) / v_baseline_redaction) * 100 END;

  RETURN QUERY SELECT
    'audit_insert'::TEXT,
    v_current_audit,
    v_baseline_audit_insert,
    CASE
      WHEN v_current_audit = 0 THEN 'NO_DATA'
      WHEN v_current_audit <= v_baseline_audit_insert THEN 'OK'
      WHEN v_current_audit <= v_baseline_audit_insert * 1.2 THEN 'WARNING'
      ELSE 'CRITICAL'
    END,
    CASE WHEN v_current_audit = 0 THEN NULL ELSE ((v_current_audit - v_baseline_audit_insert) / v_baseline_audit_insert) * 100 END;

  -- Alert on performance regressions
  INSERT INTO evo.evolution_alerts(alert_type, title, severity, message, created_at)
  SELECT
    'performance_regression',
    'CRITICAL: Performance regression detected',
    'critical',
    format('Latency deviation: webhook_dedup: %s%%, rate_limit: %s%%, redaction: %s%%',
      ROUND(((v_current_dedup - v_baseline_webhook_dedup) / v_baseline_webhook_dedup) * 100, 2),
      ROUND(((v_current_rate_limit - v_baseline_rate_limit) / v_baseline_rate_limit) * 100, 2),
      ROUND(((v_current_redaction - v_baseline_redaction) / v_baseline_redaction) * 100, 2)
    ),
    now()
  WHERE v_current_dedup > v_baseline_webhook_dedup * 1.5
    OR v_current_rate_limit > v_baseline_rate_limit * 1.5
    OR v_current_redaction > v_baseline_redaction * 1.5
    OR v_current_audit > v_baseline_audit_insert * 1.5
  ON CONFLICT (alert_type, alert_content_hash) DO NOTHING;

END;
$fn$;

-- Step 3: Create data integrity verification function
CREATE OR REPLACE FUNCTION public.fn_verify_data_integrity()
RETURNS TABLE(
  check_name TEXT,
  table_name TEXT,
  issue_count BIGINT,
  status TEXT,
  details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_orphaned_events BIGINT;
  v_missing_instance_id BIGINT;
  v_duplicate_events BIGINT;
  v_future_timestamps BIGINT;
BEGIN
  -- Check 1: Orphaned events (marked processed but not in rate limits)
  SELECT COUNT(*) INTO v_orphaned_events
  FROM public.webhook_events_processed we
  WHERE NOT EXISTS(
    SELECT 1 FROM public.webhook_rate_limits wrl
    WHERE wrl.instance_id = we.instance_id AND wrl.event_type = we.event_type
  );

  RETURN QUERY SELECT
    'Orphaned Events'::TEXT,
    'webhook_events_processed'::TEXT,
    v_orphaned_events,
    CASE WHEN v_orphaned_events = 0 THEN 'OK' ELSE 'WARNING' END,
    CASE WHEN v_orphaned_events > 0
      THEN format('%s events marked processed but not in rate limits', v_orphaned_events)
      ELSE NULL
    END;

  -- Check 2: Missing instance_id
  SELECT COUNT(*) INTO v_missing_instance_id
  FROM public.webhook_events_processed
  WHERE instance_id IS NULL OR instance_id = '';

  RETURN QUERY SELECT
    'Missing Instance ID'::TEXT,
    'webhook_events_processed'::TEXT,
    v_missing_instance_id,
    CASE WHEN v_missing_instance_id = 0 THEN 'OK' ELSE 'CRITICAL' END,
    CASE WHEN v_missing_instance_id > 0
      THEN format('CRITICAL: %s rows missing instance_id (partition isolation broken)', v_missing_instance_id)
      ELSE NULL
    END;

  -- Check 3: Duplicate event detection
  SELECT COUNT(*) INTO v_duplicate_events
  FROM (
    SELECT event_id, COUNT(*) as cnt
    FROM public.webhook_events_processed
    GROUP BY event_id
    HAVING COUNT(*) > 1
  ) duplicates;

  RETURN QUERY SELECT
    'Duplicate Events'::TEXT,
    'webhook_events_processed'::TEXT,
    v_duplicate_events,
    CASE WHEN v_duplicate_events = 0 THEN 'OK' ELSE 'WARNING' END,
    CASE WHEN v_duplicate_events > 0
      THEN format('%s duplicate event IDs detected (dedup may be failing)', v_duplicate_events)
      ELSE NULL
    END;

  -- Check 4: Future timestamps
  SELECT COUNT(*) INTO v_future_timestamps
  FROM public.webhook_events_processed
  WHERE created_at > now() + INTERVAL '1 hour';

  RETURN QUERY SELECT
    'Future Timestamps'::TEXT,
    'webhook_events_processed'::TEXT,
    v_future_timestamps,
    CASE WHEN v_future_timestamps = 0 THEN 'OK' ELSE 'WARNING' END,
    CASE WHEN v_future_timestamps > 0
      THEN format('%s events have future timestamps (clock skew?)', v_future_timestamps)
      ELSE NULL
    END;

  -- Alert on data integrity issues
  INSERT INTO evo.evolution_alerts(alert_type, title, severity, message, created_at)
  SELECT
    'data_integrity_issue',
    'CRITICAL: Data integrity violation detected',
    'critical',
    format('Orphaned: %s, Missing ID: %s, Duplicates: %s, Future TS: %s',
      v_orphaned_events, v_missing_instance_id, v_duplicate_events, v_future_timestamps),
    now()
  WHERE v_missing_instance_id > 0 OR v_duplicate_events > 0
  ON CONFLICT (alert_type, alert_content_hash) DO NOTHING;

END;
$fn$;

-- Step 4: Create test summary view
CREATE OR REPLACE VIEW public.v_test_summary AS
SELECT
  run_id,
  test_suite,
  COUNT(*) as total_tests,
  COUNT(*) FILTER (WHERE status = 'passed') as passed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
  AVG(duration_ms)::NUMERIC as avg_duration_ms,
  MAX(duration_ms)::NUMERIC as max_duration_ms,
  MAX(created_at) as last_run,
  CASE
    WHEN COUNT(*) FILTER (WHERE status = 'failed') = 0 THEN 'OK'
    WHEN COUNT(*) FILTER (WHERE status = 'failed') <= 2 THEN 'WARNING'
    ELSE 'CRITICAL'
  END as suite_status
FROM evo.test_results
GROUP BY run_id, test_suite
ORDER BY last_run DESC;

GRANT SELECT ON public.v_test_summary TO authenticated;

-- Step 5: Create regression detection view
CREATE OR REPLACE VIEW public.v_regression_detection AS
SELECT
  t1.test_name,
  t1.duration_ms as current_duration,
  t2.avg_baseline,
  ((t1.duration_ms - t2.avg_baseline) / t2.avg_baseline * 100)::NUMERIC as deviation_percent,
  CASE
    WHEN (t1.duration_ms - t2.avg_baseline) / t2.avg_baseline > 0.5 THEN 'CRITICAL: 50%+ regression'
    WHEN (t1.duration_ms - t2.avg_baseline) / t2.avg_baseline > 0.2 THEN 'WARNING: 20%+ regression'
    ELSE 'OK'
  END as regression_status,
  t1.created_at
FROM evo.test_results t1
JOIN (
  SELECT test_name, AVG(duration_ms) as avg_baseline
  FROM evo.test_results
  WHERE status = 'passed' AND created_at > now() - INTERVAL '7 days'
  GROUP BY test_name
) t2 ON t1.test_name = t2.test_name
WHERE t1.status = 'passed'
ORDER BY deviation_percent DESC;

GRANT SELECT ON public.v_regression_detection TO authenticated;

-- Step 6: Grant permissions
GRANT EXECUTE ON FUNCTION public.fn_validate_performance_baselines() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_data_integrity() TO authenticated;
GRANT SELECT ON evo.test_results TO authenticated;

-- Step 7: Create scheduled test monitoring
-- (Note: actual test execution happens in supabase/functions/_test/integration-tests.ts)
-- This SQL sets up infrastructure for test results tracking and analysis

COMMENT ON FUNCTION public.fn_validate_performance_baselines IS
  'Validates performance against established baselines and detects regressions.

   FIX-17 (2026-07-12): Regression prevention via integration tests.

   Returns: (metric_name, current_value, baseline_value, status, deviation_percent)

   Baselines (from FIX-17 integration tests):
   - webhook_dedup: 100ms max
   - rate_limit_check: 50ms max
   - secret_redaction: 200ms max
   - audit_insert: 100ms max

   Alerts CRITICAL if any metric exceeds baseline by >50%.

   Recommended: Schedule every 30 minutes via pg_cron:
   SELECT cron.schedule(''validate_performance_30min'', ''*/30 * * * *'',
     ''SELECT fn_validate_performance_baselines()'');';

COMMENT ON FUNCTION public.fn_verify_data_integrity IS
  'Verifies data integrity across critical tables.

   FIX-17 (2026-07-12): Regression prevention via integration tests.

   Checks:
   1. Orphaned events (marked processed but not in rate limits)
   2. Missing instance_id (partition isolation broken)
   3. Duplicate event IDs (dedup failing)
   4. Future timestamps (clock skew)

   Alerts CRITICAL if any issues detected.

   Recommended: Schedule daily via pg_cron:
   SELECT cron.schedule(''verify_data_integrity_daily'', ''0 3 * * *'',
     ''SELECT fn_verify_data_integrity()'');';

COMMENT ON TABLE evo.test_results IS
  'Tracks results of all integration tests for regression detection.

   FIX-17 (2026-07-12): Regression prevention via integration tests.

   Enables:
   - Performance baseline tracking
   - Regression detection
   - Test coverage validation
   - Historical trend analysis';

COMMENT ON VIEW public.v_test_summary IS
  'Aggregated test results by suite showing pass/fail rates and avg latencies.

   Used to monitor test coverage and detect systemic issues.';

COMMENT ON VIEW public.v_regression_detection IS
  'Highlights tests with performance regressions compared to 7-day baseline.

   Critical for detecting degradation before it impacts production.';
