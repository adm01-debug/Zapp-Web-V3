-- Round 17 Improvement #3: API Rate Limiting Enforcement Matrix
-- Severity: HIGH — Rate limiting not consistently enforced across all endpoints
-- Gap: fn_check_rate_limit exists but not called by all API endpoints, no per-endpoint rates
-- Fix: Endpoint-specific rate limit matrices, distributed rate limiting, adaptive thresholds
-- Date: 2026-07-12
-- Impact: Prevents brute force via alternative endpoints, API abuse detection

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Endpoint Rate Limit Configuration
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.endpoint_rate_limits (
  id                BIGSERIAL       PRIMARY KEY,
  endpoint_pattern  TEXT            NOT NULL UNIQUE,  -- e.g., '/api/auth/login', '/api/contacts/*'
  endpoint_category TEXT            NOT NULL,         -- e.g., 'auth', 'contacts', 'messages'
  requests_per_window INT           NOT NULL,
  window_seconds    INT             NOT NULL,
  burst_allowance   INT             NOT NULL DEFAULT 0,  -- temporary overage allowed
  is_active         BOOLEAN         NOT NULL DEFAULT true,
  requires_auth     BOOLEAN         NOT NULL DEFAULT true,
  priority          INT             NOT NULL DEFAULT 1,  -- higher = stricter enforcement
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT chk_positive_rate CHECK (requests_per_window > 0),
  CONSTRAINT chk_positive_window CHECK (window_seconds > 0),
  CONSTRAINT chk_burst_positive CHECK (burst_allowance >= 0)
);

-- Seed endpoint-specific rate limits
INSERT INTO public.endpoint_rate_limits
  (endpoint_pattern, endpoint_category, requests_per_window, window_seconds, burst_allowance, requires_auth, priority)
VALUES
  -- Authentication endpoints (strictest)
  ('/api/auth/login', 'auth', 5, 300, 1, false, 3),
  ('/api/auth/register', 'auth', 3, 600, 0, false, 3),
  ('/api/auth/password-reset', 'auth', 2, 3600, 0, false, 3),
  ('/api/auth/verify-otp', 'auth', 5, 600, 0, false, 3),
  -- Contact operations
  ('/api/contacts/search', 'contacts', 30, 60, 5, true, 2),
  ('/api/contacts/create', 'contacts', 10, 60, 2, true, 2),
  ('/api/contacts/*', 'contacts', 100, 60, 10, true, 1),
  -- Message operations
  ('/api/messages/send', 'messages', 20, 60, 5, true, 2),
  ('/api/messages/list', 'messages', 50, 60, 10, true, 1),
  ('/api/messages/search', 'messages', 30, 60, 5, true, 2),
  -- Admin operations (moderate)
  ('/api/admin/*', 'admin', 200, 60, 50, true, 1),
  -- Batch operations (lenient)
  ('/api/batch/import', 'batch', 5, 3600, 1, true, 1),
  -- Default catch-all (fallback)
  ('/api/*', 'general', 60, 60, 10, true, 0)
ON CONFLICT (endpoint_pattern) DO NOTHING;

ALTER TABLE public.endpoint_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='endpoint_rate_limits' AND policyname='erl_svc_full') THEN
    EXECUTE 'CREATE POLICY erl_svc_full ON public.endpoint_rate_limits TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='endpoint_rate_limits' AND policyname='erl_admin_read') THEN
    EXECUTE 'CREATE POLICY erl_admin_read ON public.endpoint_rate_limits FOR SELECT TO authenticated
             USING (is_admin_or_supervisor(auth.uid()))';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Per-Endpoint Rate Limit Counters (distributed)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.endpoint_rate_limit_counters (
  user_id           UUID            NOT NULL,
  endpoint_id       BIGINT          NOT NULL REFERENCES public.endpoint_rate_limits(id),
  window_key        TEXT            NOT NULL,
  request_count     INT             NOT NULL DEFAULT 1,
  burst_count       INT             NOT NULL DEFAULT 0,  -- requests over limit in this window
  window_start      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, endpoint_id, window_key)
);

CREATE INDEX IF NOT EXISTS idx_endpoint_counter_window
  ON public.endpoint_rate_limit_counters (endpoint_id, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_endpoint_counter_user
  ON public.endpoint_rate_limit_counters (user_id, window_start DESC);

ALTER TABLE public.endpoint_rate_limit_counters ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='endpoint_rate_limit_counters' AND policyname='erlc_svc_full') THEN
    EXECUTE 'CREATE POLICY erlc_svc_full ON public.endpoint_rate_limit_counters TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Rate Limit Violations Log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_violations (
  id                BIGSERIAL       PRIMARY KEY,
  user_id           UUID,
  endpoint_pattern  TEXT            NOT NULL,
  ip_address        INET,
  violation_type    TEXT            NOT NULL,  -- 'rate_limit', 'burst_limit'
  request_count     INT             NOT NULL,
  limit_exceeded    INT             NOT NULL,
  violation_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT chk_violation_type CHECK (
    violation_type IN ('rate_limit', 'burst_limit', 'endpoint_disabled')
  )
);

CREATE INDEX IF NOT EXISTS idx_rl_violations_user_time
  ON public.rate_limit_violations (user_id, violation_at DESC);
CREATE INDEX IF NOT EXISTS idx_rl_violations_endpoint
  ON public.rate_limit_violations (endpoint_pattern, violation_at DESC);
CREATE INDEX IF NOT EXISTS idx_rl_violations_ip
  ON public.rate_limit_violations (ip_address, violation_at DESC)
  WHERE ip_address IS NOT NULL;

ALTER TABLE public.rate_limit_violations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rate_limit_violations' AND policyname='rlv_svc_full') THEN
    EXECUTE 'CREATE POLICY rlv_svc_full ON public.rate_limit_violations TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rate_limit_violations' AND policyname='rlv_admin_read') THEN
    EXECUTE 'CREATE POLICY rlv_admin_read ON public.rate_limit_violations FOR SELECT TO authenticated
             USING (is_admin_or_supervisor(auth.uid()) OR user_id = auth.uid())';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Resolve Endpoint to Configuration
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_resolve_endpoint_config(p_endpoint_path TEXT)
RETURNS TABLE (
  endpoint_id BIGINT,
  endpoint_pattern TEXT,
  requests_per_window INT,
  window_seconds INT,
  burst_allowance INT,
  priority INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Try exact match first, then wildcard patterns in priority order
  RETURN QUERY
  SELECT
    erl.id,
    erl.endpoint_pattern,
    erl.requests_per_window,
    erl.window_seconds,
    erl.burst_allowance,
    erl.priority
  FROM public.endpoint_rate_limits erl
  WHERE erl.is_active = true
    AND (
      p_endpoint_path = erl.endpoint_pattern  -- exact match
      OR p_endpoint_path LIKE erl.endpoint_pattern  -- wildcard match (% in pattern)
      OR erl.endpoint_pattern LIKE '%/*'  -- catch-all patterns
    )
  ORDER BY
    (p_endpoint_path = erl.endpoint_pattern) DESC,  -- prefer exact match
    erl.priority DESC,  -- higher priority first
    LENGTH(erl.endpoint_pattern) DESC  -- longer patterns (more specific) first
  LIMIT 1;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Check Rate Limit for Endpoint (per-user, per-endpoint)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_check_endpoint_rate_limit(
  p_user_id UUID,
  p_endpoint_path TEXT,
  p_ip_address INET DEFAULT NULL
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INT,
  reset_in_seconds INT,
  violated_limit TEXT,
  limit_value INT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_config public.endpoint_rate_limits%ROWTYPE;
  v_endpoint_id BIGINT;
  v_window_key TEXT;
  v_window_start TIMESTAMPTZ;
  v_current_count INT;
  v_burst_count INT;
  v_allowed BOOLEAN := true;
  v_violated_limit TEXT := NULL;
BEGIN
  -- Resolve endpoint configuration
  SELECT id, requests_per_window, window_seconds, burst_allowance
  INTO v_endpoint_id, v_config.requests_per_window, v_config.window_seconds, v_config.burst_allowance
  FROM public.endpoint_rate_limits
  WHERE is_active = true
    AND (
      p_endpoint_path = endpoint_pattern
      OR p_endpoint_path LIKE endpoint_pattern
      OR endpoint_pattern LIKE '%/*'
    )
  ORDER BY
    (p_endpoint_path = endpoint_pattern) DESC,
    priority DESC,
    LENGTH(endpoint_pattern) DESC
  LIMIT 1;

  IF v_endpoint_id IS NULL THEN
    -- No rate limit configured for endpoint, allow
    RETURN QUERY SELECT true, NULL::INT, NULL::INT, NULL::TEXT, NULL::INT;
    RETURN;
  END IF;

  -- Build window key based on current epoch
  v_window_start := to_timestamp(
    FLOOR(EXTRACT(EPOCH FROM now()) / v_config.window_seconds) * v_config.window_seconds
  );
  v_window_key := 'ep' || v_endpoint_id || ':' || to_char(v_window_start, 'YYYYMMDDHH24MISS');

  -- Upsert counter
  INSERT INTO public.endpoint_rate_limit_counters
    (user_id, endpoint_id, window_key, request_count, window_start)
  VALUES (p_user_id, v_endpoint_id, v_window_key, 1, v_window_start)
  ON CONFLICT (user_id, endpoint_id, window_key) DO UPDATE
  SET request_count = endpoint_rate_limit_counters.request_count + 1
  RETURNING request_count, burst_count
  INTO v_current_count, v_burst_count;

  -- Check rate limit
  IF v_current_count > v_config.requests_per_window THEN
    v_allowed := false;
    v_violated_limit := 'rate_limit';

    -- Check if within burst allowance
    IF v_burst_count < v_config.burst_allowance THEN
      UPDATE public.endpoint_rate_limit_counters
      SET burst_count = burst_count + 1
      WHERE user_id = p_user_id
        AND endpoint_id = v_endpoint_id
        AND window_key = v_window_key;

      v_allowed := true;  -- Allow due to burst allowance
    ELSE
      -- Rate limit exceeded, no burst allowance left
      v_allowed := false;
    END IF;

    -- Log violation
    INSERT INTO public.rate_limit_violations
      (user_id, endpoint_pattern, ip_address, violation_type, request_count, limit_exceeded)
    VALUES
      (p_user_id, p_endpoint_path, p_ip_address, 'rate_limit', v_current_count, v_config.requests_per_window);
  END IF;

  -- Return response
  RETURN QUERY SELECT
    v_allowed,
    GREATEST(0, v_config.requests_per_window - v_current_count),
    EXTRACT(EPOCH FROM (v_window_start + (v_config.window_seconds || ' seconds')::INTERVAL - now()))::INT,
    v_violated_limit,
    v_config.requests_per_window;
END;
$$;

REVOKE ALL ON FUNCTION fn_check_endpoint_rate_limit(UUID, TEXT, INET) FROM "public";
REVOKE ALL ON FUNCTION fn_check_endpoint_rate_limit(UUID, TEXT, INET) FROM anon;
GRANT EXECUTE ON FUNCTION fn_check_endpoint_rate_limit(UUID, TEXT, INET) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_check_endpoint_rate_limit(UUID, TEXT, INET) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Adaptive Rate Limiting (increase limits for trusted users)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trusted_endpoints_whitelist (
  id                BIGSERIAL       PRIMARY KEY,
  user_id           UUID            NOT NULL,
  endpoint_pattern  TEXT            NOT NULL,
  limit_multiplier  NUMERIC         NOT NULL DEFAULT 2.0,  -- 2x normal limit
  trusted_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,
  reason            TEXT,
  UNIQUE (user_id, endpoint_pattern)
);

CREATE INDEX IF NOT EXISTS idx_trusted_endpoints_user
  ON public.trusted_endpoints_whitelist (user_id)
  WHERE expires_at IS NULL OR expires_at > now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Rate Limit Analytics View
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_rate_limit_violations_summary AS
SELECT
  rlv.endpoint_pattern,
  COUNT(*) AS violation_count,
  COUNT(DISTINCT rlv.user_id) AS affected_users,
  COUNT(DISTINCT rlv.ip_address) AS affected_ips,
  MAX(rlv.violation_at) AS latest_violation,
  ROUND(AVG(rlv.request_count::NUMERIC), 2) AS avg_requests,
  MAX(rlv.request_count) AS peak_requests
FROM public.rate_limit_violations rlv
WHERE rlv.violation_at > now() - INTERVAL '24 hours'
GROUP BY rlv.endpoint_pattern
ORDER BY violation_count DESC;

REVOKE ALL ON VIEW public.v_rate_limit_violations_summary FROM "public";
REVOKE ALL ON VIEW public.v_rate_limit_violations_summary FROM anon;
GRANT SELECT ON VIEW public.v_rate_limit_violations_summary TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Cleanup Stale Rate Limit Counters (schedule via pg_cron)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cleanup_stale_rate_limit_counters()
RETURNS INT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_deleted INT;
BEGIN
  -- Delete counters older than 7 days
  DELETE FROM public.endpoint_rate_limit_counters
  WHERE window_start < now() - INTERVAL '7 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-rate-limit-counters',
      '*/30 * * * *',  -- every 30 minutes
      'SELECT fn_cleanup_stale_rate_limit_counters()'
    );
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Record Improvement Completion in Audit Chain
-- ─────────────────────────────────────────────────────────────────────────────
COMMIT;
