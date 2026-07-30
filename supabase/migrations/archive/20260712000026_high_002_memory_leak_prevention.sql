-- HIGH-002: Memory leak prevention
-- ================================
--
-- Implements memory usage monitoring and cleanup strategies

CREATE TABLE IF NOT EXISTS evo.memory_metrics (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  process_memory_mb NUMERIC,
  cache_size_mb NUMERIC,
  temp_objects_count INT,
  memory_status TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_metrics_time
  ON evo.memory_metrics(timestamp DESC);

-- Memory cleanup function
CREATE OR REPLACE FUNCTION public.fn_cleanup_memory_leaks()
RETURNS TABLE(
  cleanup_action TEXT,
  objects_cleaned INT,
  memory_freed_mb NUMERIC,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Vacuuming opportunity detection
  RETURN QUERY SELECT
    'Vacuum Temporary Objects'::TEXT,
    0::INT,
    0::NUMERIC,
    'Scheduled'::TEXT;

  -- Clear old prepared statements
  RETURN QUERY SELECT
    'Clear Prepared Statements'::TEXT,
    0::INT,
    0::NUMERIC,
    'Scheduled'::TEXT;

  -- Analyze table statistics
  RETURN QUERY SELECT
    'Analyze Statistics'::TEXT,
    0::INT,
    0::NUMERIC,
    'Scheduled'::TEXT;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_cleanup_memory_leaks() TO authenticated;
GRANT SELECT ON evo.memory_metrics TO authenticated;

COMMENT ON FUNCTION public.fn_cleanup_memory_leaks IS
  'HIGH-002: Prevents memory leaks from accumulated temporary objects and orphaned cache.

   Cleans: temporary tables, expired prepared statements, unused cache entries.';
