-- HIGH-003: Cache invalidation strategies
CREATE TABLE IF NOT EXISTS evo.cache_state (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  cache_value JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  access_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cache_expires
  ON evo.cache_state(expires_at) WHERE expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_invalidate_expired_cache()
RETURNS TABLE(
  invalidated_keys INT,
  freed_memory_kb NUMERIC,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo
AS $fn$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM evo.cache_state WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT
    v_deleted,
    (v_deleted * 2)::NUMERIC,
    'Cache invalidated'::TEXT;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_invalidate_expired_cache() TO authenticated;
GRANT SELECT ON evo.cache_state TO authenticated;
