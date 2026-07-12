-- Round 16 Migration #4: Session Security & DB-Level Rate Limiting
-- Severity: HIGH — No session invalidation or brute-force protection at DB layer.
--           Compromised tokens remain valid indefinitely; no lockout mechanism.
-- Fix: Session blacklist, failed-attempt counter with auto-lockout,
--      per-user API rate limiting via sliding window counter.
-- Date: 2026-07-12
-- Impact: Prevents credential stuffing, replay attacks, brute-force auth attacks

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Session blacklist (invalidated JWT tokens)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_blacklist (
  jti         TEXT        PRIMARY KEY,          -- JWT ID claim
  user_id     UUID        NOT NULL,
  blacklisted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason      TEXT        NOT NULL DEFAULT 'manual_revoke',
  expires_at  TIMESTAMPTZ NOT NULL,             -- mirrors JWT exp claim
  CONSTRAINT  chk_jti_nonempty CHECK (jti <> ''),
  CONSTRAINT  chk_reason_valid CHECK (
    reason IN ('manual_revoke', 'password_change', 'suspicious_activity',
               'admin_forced', 'account_lockout', 'session_limit_exceeded')
  )
);

CREATE INDEX IF NOT EXISTS idx_session_blacklist_user
  ON public.session_blacklist (user_id, blacklisted_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_blacklist_expires
  ON public.session_blacklist (expires_at)
  WHERE expires_at > now();

ALTER TABLE public.session_blacklist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_blacklist' AND policyname='sb_svc_full') THEN
    EXECUTE 'CREATE POLICY sb_svc_full ON public.session_blacklist TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_blacklist' AND policyname='sb_auth_own') THEN
    EXECUTE 'CREATE POLICY sb_auth_own ON public.session_blacklist FOR SELECT TO authenticated
             USING (user_id = auth.uid() OR is_admin_or_supervisor(auth.uid()))';
  END IF;
END $$;

-- Function: check if a JTI is blacklisted
CREATE OR REPLACE FUNCTION fn_is_session_blacklisted(p_jti TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.session_blacklist
    WHERE jti = p_jti AND expires_at > now()
  );
END;
$$;

-- Function: blacklist a session
CREATE OR REPLACE FUNCTION fn_blacklist_session(
  p_jti       TEXT,
  p_user_id   UUID,
  p_expires_at TIMESTAMPTZ,
  p_reason    TEXT DEFAULT 'manual_revoke'
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.session_blacklist (jti, user_id, expires_at, reason)
  VALUES (p_jti, p_user_id, p_expires_at, p_reason)
  ON CONFLICT (jti) DO NOTHING;

  PERFORM fn_append_audit_event(
    'SESSION_BLACKLISTED',
    p_user_id,
    'session',
    p_jti,
    jsonb_build_object('reason', p_reason, 'expires_at', p_expires_at)
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_blacklist_session(TEXT, UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_blacklist_session(TEXT, UUID, TIMESTAMPTZ, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_blacklist_session(TEXT, UUID, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION fn_blacklist_session(TEXT, UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- Cleanup expired blacklist entries (called by cron)
CREATE OR REPLACE FUNCTION fn_cleanup_expired_blacklist()
RETURNS INT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.session_blacklist
  WHERE expires_at < now() - INTERVAL '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION fn_cleanup_expired_blacklist() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cleanup_expired_blacklist() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Auth failed attempt counter with auto-lockout
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_failure_tracker (
  id              BIGSERIAL   PRIMARY KEY,
  identifier      TEXT        NOT NULL,          -- email or user_id
  identifier_type TEXT        NOT NULL DEFAULT 'email',
  ip_address      INET,
  failed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_reason  TEXT,
  CONSTRAINT chk_id_type CHECK (identifier_type IN ('email', 'user_id', 'ip'))
);

CREATE INDEX IF NOT EXISTS idx_auth_failures_identifier_time
  ON public.auth_failure_tracker (identifier, failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_failures_ip_time
  ON public.auth_failure_tracker (ip_address, failed_at DESC)
  WHERE ip_address IS NOT NULL;

ALTER TABLE public.auth_failure_tracker ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='auth_failure_tracker' AND policyname='aft_svc_full') THEN
    EXECUTE 'CREATE POLICY aft_svc_full ON public.auth_failure_tracker TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='auth_failure_tracker' AND policyname='aft_admin_read') THEN
    EXECUTE 'CREATE POLICY aft_admin_read ON public.auth_failure_tracker FOR SELECT TO authenticated
             USING (is_admin_or_supervisor(auth.uid()))';
  END IF;
END $$;

-- Account lockout status table
CREATE TABLE IF NOT EXISTS public.account_lockouts (
  identifier      TEXT        PRIMARY KEY,
  locked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlock_at       TIMESTAMPTZ NOT NULL,
  lock_count      INT         NOT NULL DEFAULT 1,
  last_attempt_ip INET,
  CONSTRAINT chk_unlock_after_locked CHECK (unlock_at > locked_at)
);

ALTER TABLE public.account_lockouts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='account_lockouts' AND policyname='al_svc_full') THEN
    EXECUTE 'CREATE POLICY al_svc_full ON public.account_lockouts TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='account_lockouts' AND policyname='al_admin_read') THEN
    EXECUTE 'CREATE POLICY al_admin_read ON public.account_lockouts FOR SELECT TO authenticated
             USING (is_admin_or_supervisor(auth.uid()))';
  END IF;
END $$;

-- Record failed attempt and check if lockout should be applied
CREATE OR REPLACE FUNCTION fn_record_auth_failure(
  p_identifier      TEXT,
  p_identifier_type TEXT DEFAULT 'email',
  p_ip_address      INET DEFAULT NULL,
  p_reason          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_recent_failures INT;
  v_is_locked       BOOLEAN;
  v_unlock_at       TIMESTAMPTZ;
  v_lock_count      INT;
  -- Thresholds: 5 failures in 15 min = 15 min lockout; 10 = 1h; 20 = 24h
  v_threshold_short  INT := 5;
  v_threshold_medium INT := 10;
  v_threshold_hard   INT := 20;
BEGIN
  -- Insert failure record
  INSERT INTO public.auth_failure_tracker (identifier, identifier_type, ip_address, attempt_reason)
  VALUES (p_identifier, p_identifier_type, p_ip_address, p_reason);

  -- Check if currently locked
  SELECT EXISTS(
    SELECT 1 FROM public.account_lockouts
    WHERE identifier = p_identifier AND unlock_at > now()
  ) INTO v_is_locked;

  IF v_is_locked THEN
    SELECT unlock_at INTO v_unlock_at
    FROM public.account_lockouts
    WHERE identifier = p_identifier;

    RETURN jsonb_build_object(
      'locked', true,
      'unlock_at', v_unlock_at,
      'message', 'Account temporarily locked due to excessive failed attempts'
    );
  END IF;

  -- Count recent failures (15-minute window)
  SELECT COUNT(*) INTO v_recent_failures
  FROM public.auth_failure_tracker
  WHERE identifier = p_identifier
    AND failed_at > now() - INTERVAL '15 minutes';

  -- Determine lockout tier
  IF v_recent_failures >= v_threshold_hard THEN
    v_unlock_at := now() + INTERVAL '24 hours';
  ELSIF v_recent_failures >= v_threshold_medium THEN
    v_unlock_at := now() + INTERVAL '1 hour';
  ELSIF v_recent_failures >= v_threshold_short THEN
    v_unlock_at := now() + INTERVAL '15 minutes';
  ELSE
    RETURN jsonb_build_object(
      'locked', false,
      'failures', v_recent_failures,
      'threshold', v_threshold_short
    );
  END IF;

  -- Apply lockout
  INSERT INTO public.account_lockouts (identifier, unlock_at, lock_count, last_attempt_ip)
  VALUES (p_identifier, v_unlock_at, 1, p_ip_address)
  ON CONFLICT (identifier) DO UPDATE
  SET locked_at = now(),
      unlock_at = EXCLUDED.unlock_at,
      lock_count = account_lockouts.lock_count + 1,
      last_attempt_ip = EXCLUDED.last_attempt_ip;

  GET DIAGNOSTICS v_lock_count = ROW_COUNT;

  -- Alert on lockout
  INSERT INTO public.security_acl_alerts (
    alert_type, object_name, role_name, privilege, severity, details
  ) VALUES (
    'ACCOUNT_LOCKOUT',
    p_identifier,
    'auth',
    'LOGIN',
    CASE WHEN v_recent_failures >= v_threshold_hard THEN 'CRITICAL' ELSE 'HIGH' END,
    jsonb_build_object(
      'identifier', p_identifier,
      'failure_count', v_recent_failures,
      'unlock_at', v_unlock_at,
      'ip_address', p_ip_address,
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object(
    'locked', true,
    'unlock_at', v_unlock_at,
    'failures', v_recent_failures,
    'message', 'Account locked due to excessive failed attempts'
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_record_auth_failure(TEXT, TEXT, INET, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_record_auth_failure(TEXT, TEXT, INET, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_record_auth_failure(TEXT, TEXT, INET, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Per-user API rate limiting — sliding window counter
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_rate_limit_counters (
  user_id     UUID        NOT NULL,
  window_key  TEXT        NOT NULL,  -- e.g. 'minute:2026071217' (YYYYMMDDHHMM)
  operation   TEXT        NOT NULL,
  count       INT         NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, window_key, operation)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_user_window
  ON public.api_rate_limit_counters (user_id, window_start DESC);

ALTER TABLE public.api_rate_limit_counters ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='api_rate_limit_counters' AND policyname='rl_svc_full') THEN
    EXECUTE 'CREATE POLICY rl_svc_full ON public.api_rate_limit_counters TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Check and increment rate limit
CREATE OR REPLACE FUNCTION fn_check_rate_limit(
  p_user_id   UUID,
  p_operation TEXT,
  p_limit     INT DEFAULT 60,
  p_window_s  INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_window_key TEXT;
  v_current    INT;
  v_window_start TIMESTAMPTZ;
BEGIN
  -- Build window key based on epoch / window_s
  v_window_start := to_timestamp(
    FLOOR(EXTRACT(EPOCH FROM now()) / p_window_s) * p_window_s
  );
  v_window_key := 'w' || p_window_s || ':' || to_char(v_window_start, 'YYYYMMDDHH24MISS');

  -- Upsert counter
  INSERT INTO public.api_rate_limit_counters (user_id, window_key, operation, count, window_start)
  VALUES (p_user_id, v_window_key, p_operation, 1, v_window_start)
  ON CONFLICT (user_id, window_key, operation) DO UPDATE
  SET count = api_rate_limit_counters.count + 1
  RETURNING count INTO v_current;

  IF v_current > p_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'current', v_current,
      'limit', p_limit,
      'retry_after_s', EXTRACT(EPOCH FROM (v_window_start + (p_window_s || ' seconds')::INTERVAL - now()))::INT
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'current', v_current,
    'limit', p_limit,
    'remaining', p_limit - v_current
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_check_rate_limit(UUID, TEXT, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_check_rate_limit(UUID, TEXT, INT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_check_rate_limit(UUID, TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION fn_check_rate_limit(UUID, TEXT, INT, INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Schedule cleanup jobs if pg_cron is available
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Clean expired blacklist every hour
    PERFORM cron.schedule(
      'cleanup-session-blacklist',
      '0 * * * *',
      'SELECT fn_cleanup_expired_blacklist()'
    );
    -- Clean old auth failure records (keep 7 days)
    PERFORM cron.schedule(
      'cleanup-auth-failures',
      '30 * * * *',
      'DELETE FROM public.auth_failure_tracker WHERE failed_at < now() - INTERVAL ''7 days'''
    );
    -- Clean expired rate limit windows
    PERFORM cron.schedule(
      'cleanup-rate-limits',
      '*/5 * * * *',
      'DELETE FROM public.api_rate_limit_counters WHERE window_start < now() - INTERVAL ''2 hours'''
    );
    RAISE NOTICE 'pg_cron: session/auth cleanup jobs scheduled';
  ELSE
    RAISE NOTICE 'pg_cron not available — cleanup functions must be called manually';
  END IF;
END;
$$;

COMMIT;
