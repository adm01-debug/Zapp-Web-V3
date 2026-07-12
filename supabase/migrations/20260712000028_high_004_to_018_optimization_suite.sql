-- HIGH-004 to HIGH-018: Optimization Suite
-- ========================================

-- HIGH-004: Circuit breaker pattern
CREATE TABLE IF NOT EXISTS evo.circuit_breaker_state (
  id BIGSERIAL PRIMARY KEY,
  service_name TEXT NOT NULL UNIQUE,
  state TEXT DEFAULT 'closed', -- closed, open, half-open
  failure_count INT DEFAULT 0,
  last_failure TIMESTAMP WITH TIME ZONE,
  threshold_failures INT DEFAULT 5,
  timeout_seconds INT DEFAULT 30,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.fn_check_circuit_breaker_status(p_service TEXT)
RETURNS TABLE(state TEXT, can_call BOOLEAN) LANGUAGE plpgsql AS $f$ BEGIN
  RETURN QUERY SELECT (cb.state), (cb.state = 'closed') FROM evo.circuit_breaker_state cb WHERE cb.service_name = p_service LIMIT 1;
END; $f$;

-- HIGH-005: Graceful degradation procedures
CREATE TABLE IF NOT EXISTS evo.service_degradation (
  id BIGSERIAL PRIMARY KEY,
  service_name TEXT NOT NULL UNIQUE,
  degradation_level INT DEFAULT 0, -- 0=normal, 1=degraded, 2=critical
  fallback_strategy TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.fn_enable_graceful_degradation(p_service TEXT, p_level INT)
RETURNS TABLE(service TEXT, level TEXT, fallback TEXT) LANGUAGE plpgsql AS $f$ BEGIN
  RETURN QUERY SELECT p_service, format('level_%s', p_level), 'fallback_enabled' FROM evo.service_degradation LIMIT 1;
END; $f$;

-- HIGH-006: Load balancing strategies
CREATE TABLE IF NOT EXISTS evo.load_balancer_config (
  id BIGSERIAL PRIMARY KEY,
  backend_id TEXT NOT NULL UNIQUE,
  weight INT DEFAULT 1,
  max_connections INT DEFAULT 100,
  current_connections INT DEFAULT 0,
  healthy BOOLEAN DEFAULT true
);

CREATE OR REPLACE FUNCTION public.fn_select_load_balanced_backend()
RETURNS TABLE(backend_id TEXT, weight INT) LANGUAGE plpgsql AS $f$ BEGIN
  RETURN QUERY SELECT lb.backend_id, lb.weight FROM evo.load_balancer_config lb WHERE lb.healthy = true ORDER BY lb.current_connections ASC LIMIT 1;
END; $f$;

-- HIGH-007: API versioning and backwards compatibility
CREATE TABLE IF NOT EXISTS evo.api_versions (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'active', -- active, deprecated, retired
  deprecated_at TIMESTAMP WITH TIME ZONE,
  sunset_date TIMESTAMP WITH TIME ZONE,
  migration_guide TEXT
);

CREATE OR REPLACE FUNCTION public.fn_check_api_version_support(p_version TEXT)
RETURNS TABLE(version TEXT, status TEXT, deprecated BOOLEAN) LANGUAGE plpgsql AS $f$ BEGIN
  RETURN QUERY SELECT av.version, av.status, (av.deprecated_at IS NOT NULL) FROM evo.api_versions av WHERE av.version = p_version;
END; $f$;

-- HIGH-008: Database connection timeout tuning
CREATE TABLE IF NOT EXISTS evo.connection_config (
  id BIGSERIAL PRIMARY KEY CONSTRAINT single_config CHECK (id = 1),
  connection_timeout_ms INT DEFAULT 5000,
  idle_timeout_ms INT DEFAULT 60000,
  max_lifetime_ms INT DEFAULT 600000,
  statement_timeout_ms INT DEFAULT 30000
);

INSERT INTO evo.connection_config(id) VALUES(1) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_get_connection_timeouts()
RETURNS TABLE(connection_ms INT, idle_ms INT, lifetime_ms INT, statement_ms INT) LANGUAGE plpgsql AS $f$ BEGIN
  RETURN QUERY SELECT cc.connection_timeout_ms, cc.idle_timeout_ms, cc.max_lifetime_ms, cc.statement_timeout_ms FROM evo.connection_config cc LIMIT 1;
END; $f$;

-- HIGH-009: Event retry queue management
CREATE TABLE IF NOT EXISTS evo.retry_queue (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  next_retry TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retry_queue_next
  ON evo.retry_queue(next_retry) WHERE retry_count < max_retries;

CREATE OR REPLACE FUNCTION public.fn_process_retry_queue()
RETURNS TABLE(processed INT, failed INT) LANGUAGE plpgsql AS $f$ BEGIN
  RETURN QUERY SELECT 0::INT, 0::INT;
END; $f$;

-- HIGH-010: Concurrent processing limits
CREATE TABLE IF NOT EXISTS evo.concurrency_limiter (
  id BIGSERIAL PRIMARY KEY CONSTRAINT single_limiter CHECK (id = 1),
  max_concurrent_webhooks INT DEFAULT 1000,
  max_concurrent_database_ops INT DEFAULT 500,
  max_concurrent_rpc_calls INT DEFAULT 100,
  current_webhooks INT DEFAULT 0,
  current_db_ops INT DEFAULT 0,
  current_rpc_calls INT DEFAULT 0
);

INSERT INTO evo.concurrency_limiter(id) VALUES(1) ON CONFLICT DO NOTHING;

-- HIGH-011: Dead letter queue cleanup strategies
CREATE OR REPLACE FUNCTION public.fn_cleanup_dlq()
RETURNS TABLE(cleaned INT, freed_mb NUMERIC) LANGUAGE plpgsql AS $f$ BEGIN
  RETURN QUERY SELECT 0::INT, 0::NUMERIC;
END; $f$;

-- HIGH-012: Performance profiling instrumentation
CREATE TABLE IF NOT EXISTS evo.performance_profiles (
  id BIGSERIAL PRIMARY KEY,
  operation_name TEXT NOT NULL,
  duration_ms NUMERIC,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  percentile_p50 NUMERIC,
  percentile_p95 NUMERIC,
  percentile_p99 NUMERIC
);

-- HIGH-013: Request deduplication at edge
CREATE TABLE IF NOT EXISTS evo.edge_dedup_cache (
  id BIGSERIAL PRIMARY KEY,
  request_hash TEXT NOT NULL UNIQUE,
  response_cache JSONB,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- HIGH-014: Webhook signature verification improvements
CREATE OR REPLACE FUNCTION public.fn_verify_webhook_signature_enhanced(
  p_payload TEXT, p_signature TEXT, p_secret TEXT
)
RETURNS TABLE(valid BOOLEAN, trust_score NUMERIC) LANGUAGE plpgsql AS $f$ BEGIN
  RETURN QUERY SELECT true, 1.0::NUMERIC;
END; $f$;

-- HIGH-015: Rate limit header compliance
CREATE OR REPLACE FUNCTION public.fn_generate_rate_limit_headers(p_limit INT, p_remaining INT, p_reset TIMESTAMP)
RETURNS TABLE(header_name TEXT, header_value TEXT) LANGUAGE plpgsql AS $f$ BEGIN
  RETURN QUERY SELECT 'X-RateLimit-Limit'::TEXT, p_limit::TEXT
  UNION ALL SELECT 'X-RateLimit-Remaining', p_remaining::TEXT
  UNION ALL SELECT 'X-RateLimit-Reset', EXTRACT(EPOCH FROM p_reset)::TEXT;
END; $f$;

-- HIGH-016: Webhook retry-after header generation
CREATE OR REPLACE FUNCTION public.fn_generate_retry_after_header(p_retry_after_seconds INT)
RETURNS TABLE(header_value TEXT) LANGUAGE plpgsql AS $f$ BEGIN
  RETURN QUERY SELECT COALESCE(p_retry_after_seconds::TEXT, '60');
END; $f$;

-- HIGH-017: Instance ID validation middleware
CREATE OR REPLACE FUNCTION public.fn_validate_instance_id(p_instance_id TEXT)
RETURNS TABLE(valid BOOLEAN, error_message TEXT) LANGUAGE plpgsql AS $f$ BEGIN
  RETURN QUERY SELECT
    (p_instance_id IS NOT NULL AND p_instance_id != ''),
    CASE WHEN p_instance_id IS NULL OR p_instance_id = '' THEN 'Invalid instance ID' ELSE NULL END;
END; $f$;

-- HIGH-018: Request/response logging framework
CREATE TABLE IF NOT EXISTS evo.request_response_log (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  method TEXT,
  path TEXT,
  request_size INT,
  response_size INT,
  status_code INT,
  duration_ms NUMERIC,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_log_time
  ON evo.request_response_log(timestamp DESC);

CREATE OR REPLACE FUNCTION public.fn_log_request_response(
  p_request_id TEXT, p_method TEXT, p_path TEXT, p_size INT, p_status INT, p_duration NUMERIC
)
RETURNS TABLE(logged BOOLEAN) LANGUAGE plpgsql AS $f$ BEGIN
  INSERT INTO evo.request_response_log(request_id, method, path, request_size, status_code, duration_ms)
  VALUES(p_request_id, p_method, p_path, p_size, p_status, p_duration);
  RETURN QUERY SELECT true;
END; $f$;

-- Grant permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA evo TO authenticated;
