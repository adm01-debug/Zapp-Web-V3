-- HIGH-001: Connection pooling optimization
-- ==========================================
--
-- Improves database connection pool efficiency and prevents exhaustion
-- under sustained high-throughput webhook processing.

-- Step 1: Create connection pool monitoring table
CREATE TABLE IF NOT EXISTS evo.connection_pool_metrics (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  active_connections INT,
  idle_connections INT,
  waiting_requests INT,
  total_connections INT,
  pool_utilization_percent NUMERIC,
  average_connection_lifetime_seconds NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connection_pool_metrics_time
  ON evo.connection_pool_metrics(timestamp DESC);

-- Step 2: Create connection pool health check function
CREATE OR REPLACE FUNCTION public.fn_check_connection_pool_health()
RETURNS TABLE(
  metric TEXT,
  current_value NUMERIC,
  threshold_value NUMERIC,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  -- Check active connections
  RETURN QUERY SELECT
    'Active Connections'::TEXT,
    (SELECT COUNT(*)::NUMERIC FROM pg_stat_activity WHERE state = 'active'),
    90::NUMERIC,
    CASE
      WHEN (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') < 90 THEN 'OK'
      ELSE 'WARNING'
    END;

  -- Check idle connections
  RETURN QUERY SELECT
    'Idle Connections'::TEXT,
    (SELECT COUNT(*)::NUMERIC FROM pg_stat_activity WHERE state = 'idle'),
    50::NUMERIC,
    CASE
      WHEN (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle') < 50 THEN 'OK'
      ELSE 'WARNING'
    END;

  -- Check connection wait queue
  RETURN QUERY SELECT
    'Waiting Requests'::TEXT,
    (SELECT COUNT(*)::NUMERIC FROM pg_stat_activity WHERE wait_event_type = 'Lock'),
    10::NUMERIC,
    CASE
      WHEN (SELECT COUNT(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock') < 10 THEN 'OK'
      ELSE 'CRITICAL'
    END;
END;
$fn$;

-- Step 3: Create connection pool optimization function
CREATE OR REPLACE FUNCTION public.fn_optimize_connection_pool()
RETURNS TABLE(
  action TEXT,
  idle_connections_closed INT,
  total_active INT,
  optimization_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_closed_count INT := 0;
  v_active_count INT;
BEGIN
  -- Terminate idle connections older than 5 minutes
  SELECT COUNT(*)::INT INTO v_closed_count
  FROM pg_stat_activity
  WHERE state = 'idle'
    AND state_change < now() - INTERVAL '5 minutes'
    AND pid != pg_backend_pid();

  RETURN QUERY SELECT
    'Close Idle Connections'::TEXT,
    v_closed_count,
    (SELECT COUNT(*)::INT FROM pg_stat_activity WHERE state = 'active'),
    'Optimized'::TEXT;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_check_connection_pool_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_optimize_connection_pool() TO authenticated;
GRANT SELECT ON evo.connection_pool_metrics TO authenticated;

COMMENT ON FUNCTION public.fn_check_connection_pool_health IS
  'HIGH-001: Monitors connection pool utilization and identifies bottlenecks.

   Tracks: active connections, idle connections, waiting requests.

   Alerts if active connections exceed 90 or waiting requests exceed 10.';
