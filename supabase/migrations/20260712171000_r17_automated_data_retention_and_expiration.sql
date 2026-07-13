-- Round 17 Improvement #1: Automated Data Retention & Expiration Policies
-- Severity: CRITICAL — LGPD compliance, audit log bloat, storage costs spike
-- Gap: No automated data expiration policies. Old audit logs, auth failures, sessions accumulate indefinitely.
-- Fix: Automated retention enforcement with lifecycle policies, archival triggers, compliance attestation.
-- Date: 2026-07-12
-- Impact: LGPD Article 17 (erasure) enforcement, audit trail bounded, storage costs controlled

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Data Retention Policy Registry
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_retention_policies (
  id                BIGSERIAL       PRIMARY KEY,
  schema_name       TEXT            NOT NULL,
  table_name        TEXT            NOT NULL,
  policy_name       TEXT            NOT NULL,
  retention_days    INT             NOT NULL,  -- days to keep data
  purge_condition   TEXT            NOT NULL,  -- SQL WHERE clause for deletion
  is_active         BOOLEAN         NOT NULL DEFAULT true,
  last_purge_at     TIMESTAMPTZ,
  purge_count       BIGINT          DEFAULT 0,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
  UNIQUE (schema_name, table_name, policy_name),
  CONSTRAINT chk_retention_positive CHECK (retention_days > 0),
  CONSTRAINT chk_retention_max CHECK (retention_days <= 3650)  -- max 10 years
);

-- Seed retention policies for security/compliance tables
INSERT INTO public.data_retention_policies
  (schema_name, table_name, policy_name, retention_days, purge_condition)
VALUES
  ('public', 'auth_failure_tracker', 'cleanup_old_failures', 7,
   'failed_at < now() - INTERVAL ''7 days'''),
  ('public', 'session_blacklist', 'cleanup_expired_sessions', 30,
   'expires_at < now()'),
  ('public', 'api_rate_limit_counters', 'cleanup_old_windows', 2,
   'window_start < now() - INTERVAL ''2 days'''),
  ('public', 'security_audit_chain', 'retention_1_year', 365,
   'event_time < now() - INTERVAL ''365 days'''),
  ('public', 'account_lockouts', 'cleanup_old_lockouts', 30,
   'unlock_at < now()'),
  ('public', 'timed_privilege_grants', 'cleanup_expired_grants', 90,
   'expires_at < now() - INTERVAL ''90 days'' AND revoked_at IS NOT NULL')
ON CONFLICT (schema_name, table_name, policy_name) DO NOTHING;

ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='data_retention_policies' AND policyname='drp_svc_full') THEN
    EXECUTE 'CREATE POLICY drp_svc_full ON public.data_retention_policies TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='data_retention_policies' AND policyname='drp_admin_read') THEN
    EXECUTE 'CREATE POLICY drp_admin_read ON public.data_retention_policies FOR SELECT TO authenticated
             USING (is_admin_or_supervisor(auth.uid()))';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Data Purge Audit Trail
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_purge_audit (
  id                BIGSERIAL       PRIMARY KEY,
  policy_id         BIGINT          NOT NULL REFERENCES public.data_retention_policies(id),
  purge_timestamp   TIMESTAMPTZ     NOT NULL DEFAULT now(),
  rows_deleted      BIGINT          NOT NULL,
  purge_status      TEXT            NOT NULL DEFAULT 'success',
  error_message     TEXT,
  CONSTRAINT chk_purge_status CHECK (
    purge_status IN ('success', 'failed', 'partial', 'skipped')
  )
);

CREATE INDEX IF NOT EXISTS idx_purge_audit_timestamp
  ON public.data_purge_audit (purge_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_purge_audit_policy
  ON public.data_purge_audit (policy_id, purge_timestamp DESC);

ALTER TABLE public.data_purge_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='data_purge_audit' AND policyname='dpa_svc_full') THEN
    EXECUTE 'CREATE POLICY dpa_svc_full ON public.data_purge_audit TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='data_purge_audit' AND policyname='dpa_admin_read') THEN
    EXECUTE 'CREATE POLICY dpa_admin_read ON public.data_purge_audit FOR SELECT TO authenticated
             USING (is_admin_or_supervisor(auth.uid()))';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Execute Single Retention Policy Safely
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_execute_retention_policy(
  p_policy_id BIGINT,
  p_batch_size INT DEFAULT 5000
)
RETURNS TABLE (
  rows_deleted BIGINT,
  status TEXT,
  error_msg TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_policy public.data_retention_policies%ROWTYPE;
  v_deleted BIGINT := 0;
  v_status TEXT := 'success';
  v_error TEXT;
  v_sql TEXT;
  v_batch_count INT := 0;
  v_max_batches INT := 100;  -- safety limit: max 500k rows per policy execution
BEGIN
  -- Fetch policy
  SELECT * INTO v_policy
  FROM public.data_retention_policies
  WHERE id = p_policy_id
    AND is_active = true;

  IF v_policy.id IS NULL THEN
    RETURN QUERY SELECT 0::BIGINT, 'skipped'::TEXT, 'Policy not found or inactive'::TEXT;
    RETURN;
  END IF;

  -- Build DELETE statement with WHERE condition
  v_sql := format(
    'DELETE FROM %I.%I WHERE %s RETURNING 1',
    v_policy.schema_name,
    v_policy.table_name,
    v_policy.purge_condition
  );

  -- Execute in batches (safety: prevent locking entire table)
  WHILE v_batch_count < v_max_batches LOOP
    BEGIN
      -- Batch delete up to p_batch_size rows
      EXECUTE format(
        'DELETE FROM %I.%I WHERE %s LIMIT %L',
        v_policy.schema_name,
        v_policy.table_name,
        v_policy.purge_condition,
        p_batch_size
      );

      GET DIAGNOSTICS v_deleted = ROW_COUNT;

      IF v_deleted = 0 THEN
        EXIT;  -- No more rows to delete
      END IF;

      v_batch_count := v_batch_count + 1;

      -- Small pause between batches to avoid overwhelming I/O
      -- Note: can't use SLEEP in migrations, just commit and move on
      COMMIT;  -- Intermediate commits for safety
    EXCEPTION WHEN OTHERS THEN
      v_status := 'partial';
      v_error := SQLERRM;
      EXIT;
    END;
  END LOOP;

  -- Record in audit trail
  INSERT INTO public.data_purge_audit (policy_id, rows_deleted, purge_status, error_message)
  VALUES (p_policy_id, v_deleted, v_status, v_error);

  -- Update policy's last_purge_at timestamp
  UPDATE public.data_retention_policies
  SET last_purge_at = now(),
      purge_count = COALESCE(purge_count, 0) + v_deleted
  WHERE id = p_policy_id;

  -- Record audit event
  PERFORM fn_append_audit_event(
    'DATA_RETENTION_POLICY_EXECUTED',
    NULL,
    'retention_policy',
    p_policy_id::TEXT,
    jsonb_build_object(
      'policy_name', v_policy.policy_name,
      'table', format('%s.%s', v_policy.schema_name, v_policy.table_name),
      'rows_deleted', v_deleted,
      'retention_days', v_policy.retention_days,
      'status', v_status
    )
  );

  RETURN QUERY SELECT v_deleted, v_status, v_error;
END;
$$;

REVOKE ALL ON FUNCTION fn_execute_retention_policy(BIGINT, INT) FROM "public";
REVOKE ALL ON FUNCTION fn_execute_retention_policy(BIGINT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_execute_retention_policy(BIGINT, INT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Execute All Active Retention Policies
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_execute_all_retention_policies()
RETURNS TABLE (
  policy_name TEXT,
  rows_deleted BIGINT,
  status TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_policy RECORD;
  v_result RECORD;
BEGIN
  FOR v_policy IN
    SELECT id, policy_name
    FROM public.data_retention_policies
    WHERE is_active = true
    ORDER BY id
  LOOP
    SELECT * INTO v_result
    FROM fn_execute_retention_policy(v_policy.id);

    RETURN QUERY
    SELECT v_policy.policy_name, v_result.rows_deleted, v_result.status;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION fn_execute_all_retention_policies() FROM "public";
REVOKE ALL ON FUNCTION fn_execute_all_retention_policies() FROM anon;
GRANT EXECUTE ON FUNCTION fn_execute_all_retention_policies() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Schedule Cleanup Jobs (if pg_cron available)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Run data retention policies daily at 02:00 UTC
    PERFORM cron.schedule(
      'execute-retention-policies',
      '0 2 * * *',
      'SELECT fn_execute_all_retention_policies()'
    );
    RAISE NOTICE 'pg_cron: data retention policies scheduled daily at 02:00 UTC';
  ELSE
    RAISE NOTICE 'pg_cron not available — call fn_execute_all_retention_policies() manually or via external scheduler';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Compliance Attestation: Verify retention policies are working
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_verify_retention_compliance()
RETURNS TABLE (
  policy_name TEXT,
  schema_name TEXT,
  table_name TEXT,
  last_purge TIMESTAMPTZ,
  days_since_purge INT,
  status TEXT,
  issue TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    drp.policy_name,
    drp.schema_name,
    drp.table_name,
    drp.last_purge_at,
    COALESCE(EXTRACT(DAY FROM (now() - drp.last_purge_at))::INT, -1) AS days_since_purge,
    CASE
      WHEN drp.last_purge_at IS NULL THEN 'WARNING'::TEXT
      WHEN (now() - drp.last_purge_at) > (drp.retention_days || ' days')::INTERVAL THEN 'CRITICAL'::TEXT
      WHEN (now() - drp.last_purge_at) > ((drp.retention_days * 1.5) || ' days')::INTERVAL THEN 'WARNING'::TEXT
      ELSE 'OK'::TEXT
    END AS status,
    CASE
      WHEN drp.last_purge_at IS NULL THEN 'Retention policy has never been executed'::TEXT
      WHEN (now() - drp.last_purge_at) > (drp.retention_days || ' days')::INTERVAL THEN
        format('Data retention violated: policy allows %s days, last purge was %s days ago',
          drp.retention_days,
          EXTRACT(DAY FROM (now() - drp.last_purge_at))::INT)
      ELSE NULL::TEXT
    END AS issue
  FROM public.data_retention_policies drp
  WHERE drp.is_active = true
  ORDER BY drp.id;
END;
$$;

REVOKE ALL ON FUNCTION fn_verify_retention_compliance() FROM "public";
REVOKE ALL ON FUNCTION fn_verify_retention_compliance() FROM anon;
GRANT EXECUTE ON FUNCTION fn_verify_retention_compliance() TO service_role;
GRANT EXECUTE ON FUNCTION fn_verify_retention_compliance() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Record Improvement Completion in Audit Chain
-- ─────────────────────────────────────────────────────────────────────────────
COMMIT;
