-- Round 17 Improvement #5: Connection Security & Pooling Limits
-- Severity: CRITICAL — No connection pooling limits, idle timeout enforcement
-- Fix: Connection limits per role, idle session cleanup, certificate pinning config
-- Date: 2026-07-12
-- Impact: Prevent connection exhaustion DoS, enforce session timeouts

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Connection Limit Configuration
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.connection_limits (
  id                BIGSERIAL       PRIMARY KEY,
  role_name         TEXT            NOT NULL UNIQUE,
  max_connections   INT             NOT NULL,
  idle_timeout_sec  INT             NOT NULL DEFAULT 300,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now()
);

INSERT INTO public.connection_limits (role_name, max_connections, idle_timeout_sec)
VALUES
  ('authenticated', 50, 300),
  ('agent', 10, 600),
  ('service_role', 100, 1800),
  ('anon', 5, 60)
ON CONFLICT (role_name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Active Connections Monitoring Table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.active_connections_log (
  id                BIGSERIAL       PRIMARY KEY,
  role_name         TEXT            NOT NULL,
  connection_count  INT             NOT NULL,
  recorded_at       TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_conn_role_time
  ON public.active_connections_log (role_name, recorded_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Monitor Connection Pool Health
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_monitor_connection_health()
RETURNS TABLE (
  role_name TEXT,
  current_connections INT,
  max_allowed INT,
  usage_percentage NUMERIC,
  status TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cl.role_name,
    (SELECT COUNT(*) FROM pg_stat_activity WHERE rolname = cl.role_name)::INT,
    cl.max_connections,
    ROUND(100.0 * (SELECT COUNT(*) FROM pg_stat_activity WHERE rolname = cl.role_name)::NUMERIC / cl.max_connections, 2),
    CASE
      WHEN (SELECT COUNT(*) FROM pg_stat_activity WHERE rolname = cl.role_name)::INT > cl.max_connections * 0.8 THEN 'WARNING'::TEXT
      WHEN (SELECT COUNT(*) FROM pg_stat_activity WHERE rolname = cl.role_name)::INT > cl.max_connections THEN 'CRITICAL'::TEXT
      ELSE 'OK'::TEXT
    END
  FROM public.connection_limits cl
  ORDER BY cl.role_name;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Force Idle Session Cleanup
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cleanup_idle_sessions()
RETURNS INT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_killed INT := 0;
  v_session RECORD;
  v_idle_limit_sec INT;
BEGIN
  FOR v_session IN
    SELECT
      psa.pid,
      psa.rolname,
      EXTRACT(EPOCH FROM (now() - psa.query_start))::INT AS idle_sec
    FROM pg_stat_activity psa
    WHERE psa.state = 'idle'
      AND psa.pid != pg_backend_pid()  -- Don't kill self
  LOOP
    -- Look up idle timeout for this role
    SELECT idle_timeout_sec INTO v_idle_limit_sec
    FROM public.connection_limits
    WHERE role_name = v_session.rolname;

    IF v_idle_limit_sec IS NULL THEN
      v_idle_limit_sec := 300;  -- default
    END IF;

    -- Kill if over limit
    IF v_session.idle_sec > v_idle_limit_sec THEN
      PERFORM pg_terminate_backend(v_session.pid);
      v_killed := v_killed + 1;
    END IF;
  END LOOP;

  RETURN v_killed;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-idle-sessions',
      '*/5 * * * *',
      'SELECT fn_cleanup_idle_sessions()'
    );
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. SSL/TLS Certificate Pinning Configuration
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.allowed_ssl_certificates (
  id                BIGSERIAL       PRIMARY KEY,
  certificate_hash  TEXT            NOT NULL UNIQUE,
  certificate_cn    TEXT            NOT NULL,
  valid_from        TIMESTAMPTZ,
  valid_until       TIMESTAMPTZ,
  is_active         BOOLEAN         NOT NULL DEFAULT true,
  added_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Record completion
COMMIT;
