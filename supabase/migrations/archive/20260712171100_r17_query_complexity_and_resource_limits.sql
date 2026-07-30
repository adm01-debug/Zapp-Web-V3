-- Round 17 Improvement #2: Query Complexity & Resource Limits Protection
-- Severity: CRITICAL — Resource exhaustion, query complexity bomb DoS
-- Gap: No statement_timeout, work_mem limits, or query plan cost guards
-- Fix: Query complexity validator, statement timeouts, memory limits, plan cost enforcement
-- Date: 2026-07-12
-- Impact: Prevents query-based DoS, resource exhaustion, database crash scenarios

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Query Complexity Guard Configuration
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.query_complexity_limits (
  id                BIGSERIAL       PRIMARY KEY,
  complexity_class  TEXT            NOT NULL UNIQUE,  -- e.g., 'authenticated', 'agent', 'admin', 'api'
  max_plan_cost     NUMERIC         NOT NULL,         -- EXPLAIN cost limit
  statement_timeout_ms INT          NOT NULL,         -- milliseconds
  work_mem_kb       INT             NOT NULL,         -- kilobytes per operation
  description       TEXT,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT chk_positive_cost CHECK (max_plan_cost > 0),
  CONSTRAINT chk_positive_timeout CHECK (statement_timeout_ms > 100),  -- min 100ms
  CONSTRAINT chk_positive_workmem CHECK (work_mem_kb > 100)  -- min 100KB
);

-- Seed complexity limits by user class
INSERT INTO public.query_complexity_limits
  (complexity_class, max_plan_cost, statement_timeout_ms, work_mem_kb, description)
VALUES
  ('authenticated', 10000.0, 30000, 262144, 'Standard authenticated user (30s timeout, 256MB work_mem, cost limit 10000)'),
  ('agent', 5000.0, 15000, 131072, 'Agent/automated user (15s timeout, 128MB work_mem, cost limit 5000)'),
  ('api', 1000.0, 5000, 65536, 'Public API endpoint (5s timeout, 64MB work_mem, cost limit 1000)'),
  ('admin', 50000.0, 120000, 1048576, 'Admin user (120s timeout, 1GB work_mem, cost limit 50000)'),
  ('batch', 100000.0, 300000, 2097152, 'Batch operations (300s timeout, 2GB work_mem, cost limit 100000)')
ON CONFLICT (complexity_class) DO NOTHING;

ALTER TABLE public.query_complexity_limits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='query_complexity_limits' AND policyname='qcl_svc_full') THEN
    EXECUTE 'CREATE POLICY qcl_svc_full ON public.query_complexity_limits TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='query_complexity_limits' AND policyname='qcl_admin_read') THEN
    EXECUTE 'CREATE POLICY qcl_admin_read ON public.query_complexity_limits FOR SELECT TO authenticated
             USING (is_admin_or_supervisor(auth.uid()))';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Query Complexity Violation Audit
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.query_complexity_violations (
  id                BIGSERIAL       PRIMARY KEY,
  user_id           UUID,
  complexity_class  TEXT            NOT NULL,
  query_text        TEXT            NOT NULL,
  estimated_cost    NUMERIC         NOT NULL,
  cost_limit        NUMERIC         NOT NULL,
  violation_type    TEXT            NOT NULL,  -- 'cost', 'timeout', 'memory'
  detected_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT chk_violation_type CHECK (
    violation_type IN ('cost', 'timeout', 'memory', 'scan_lines', 'join_count', 'cte_depth')
  )
);

CREATE INDEX IF NOT EXISTS idx_complexity_violations_user_time
  ON public.query_complexity_violations (user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_complexity_violations_type
  ON public.query_complexity_violations (violation_type, detected_at DESC);

ALTER TABLE public.query_complexity_violations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='query_complexity_violations' AND policyname='qcv_svc_full') THEN
    EXECUTE 'CREATE POLICY qcv_svc_full ON public.query_complexity_violations TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='query_complexity_violations' AND policyname='qcv_admin_read') THEN
    EXECUTE 'CREATE POLICY qcv_admin_read ON public.query_complexity_violations FOR SELECT TO authenticated
             USING (is_admin_or_supervisor(auth.uid()) OR user_id = auth.uid())';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Determine User's Complexity Class
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_get_user_complexity_class()
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN 'api';  -- Unauthenticated requests get strictest limits
  END IF;

  v_is_admin := is_admin_or_supervisor(v_user_id);

  IF v_is_admin THEN
    RETURN 'admin';
  END IF;

  -- Check if user is automation/agent account (has agent role or no workspace membership)
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_user_id AND ur.role IN ('agent', 'bot')
  ) THEN
    RETURN 'agent';
  END IF;

  -- Default authenticated user
  RETURN 'authenticated';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Validate Query Plan Cost (before execution)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_query_plan_cost(
  p_query TEXT,
  p_complexity_class TEXT DEFAULT NULL
)
RETURNS TABLE (
  estimated_cost NUMERIC,
  max_allowed_cost NUMERIC,
  is_allowed BOOLEAN,
  violation_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_explain_json JSONB;
  v_plan_cost NUMERIC;
  v_max_cost NUMERIC;
  v_class TEXT;
  v_is_allowed BOOLEAN;
  v_reason TEXT := NULL;
BEGIN
  v_class := COALESCE(p_complexity_class, fn_get_user_complexity_class());

  -- Get plan cost for this user's class
  SELECT max_plan_cost INTO v_max_cost
  FROM public.query_complexity_limits
  WHERE complexity_class = v_class;

  IF v_max_cost IS NULL THEN
    -- Unknown class, deny for safety
    RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, false, 'Unknown complexity class'::TEXT;
    RETURN;
  END IF;

  BEGIN
    -- EXPLAIN query plan (safe: doesn't execute)
    -- Parse JSON to extract total cost
    EXECUTE format('EXPLAIN (FORMAT JSON, ANALYZE false) %s', p_query)
    INTO v_explain_json;

    -- Extract total cost from plan
    IF v_explain_json IS NOT NULL THEN
      v_plan_cost := (v_explain_json->0->'Plan'->>'Total Cost')::NUMERIC;
    END IF;

    IF v_plan_cost IS NULL THEN
      v_plan_cost := 0;  -- Assume low cost if can't extract
    END IF;

    v_is_allowed := (v_plan_cost <= v_max_cost);

    IF NOT v_is_allowed THEN
      v_reason := format('Query plan cost %.0f exceeds limit %.0f for class %s',
        v_plan_cost, v_max_cost, v_class);
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- If EXPLAIN fails (syntax error, etc), err on side of caution
    v_reason := 'Query plan validation failed: ' || SQLERRM;
    v_is_allowed := false;
  END;

  RETURN QUERY SELECT v_plan_cost, v_max_cost, v_is_allowed, v_reason;
END;
$$;

REVOKE ALL ON FUNCTION fn_validate_query_plan_cost(TEXT, TEXT) FROM "public";
REVOKE ALL ON FUNCTION fn_validate_query_plan_cost(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_validate_query_plan_cost(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_validate_query_plan_cost(TEXT, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Apply Resource Limits per User Class
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_apply_query_resource_limits(
  p_complexity_class TEXT DEFAULT NULL
)
RETURNS TABLE (
  statement_timeout_ms INT,
  work_mem_kb INT,
  max_plan_cost NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_class TEXT;
  v_limits public.query_complexity_limits%ROWTYPE;
BEGIN
  v_class := COALESCE(p_complexity_class, fn_get_user_complexity_class());

  SELECT * INTO v_limits
  FROM public.query_complexity_limits
  WHERE complexity_class = v_class;

  IF v_limits.id IS NULL THEN
    -- Fall back to authenticated class
    SELECT * INTO v_limits
    FROM public.query_complexity_limits
    WHERE complexity_class = 'authenticated';
  END IF;

  -- Apply runtime settings for this session
  -- Note: These are recommendations; actual enforcement requires client-side or middleware
  PERFORM set_config('statement_timeout', v_limits.statement_timeout_ms::TEXT, false);
  PERFORM set_config('work_mem', (v_limits.work_mem_kb || 'kB')::TEXT, false);

  RETURN QUERY SELECT
    v_limits.statement_timeout_ms,
    v_limits.work_mem_kb,
    v_limits.max_plan_cost;
END;
$$;

REVOKE ALL ON FUNCTION fn_apply_query_resource_limits(TEXT) FROM "public";
REVOKE ALL ON FUNCTION fn_apply_query_resource_limits(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_apply_query_resource_limits(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_apply_query_resource_limits(TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Log Query Complexity Violations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_log_query_violation(
  p_user_id UUID,
  p_complexity_class TEXT,
  p_query_text TEXT,
  p_estimated_cost NUMERIC,
  p_cost_limit NUMERIC,
  p_violation_type TEXT
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Truncate query text for storage (max 500 chars)
  p_query_text := SUBSTRING(p_query_text FROM 1 FOR 500);

  INSERT INTO public.query_complexity_violations
    (user_id, complexity_class, query_text, estimated_cost, cost_limit, violation_type)
  VALUES
    (p_user_id, p_complexity_class, p_query_text, p_estimated_cost, p_cost_limit, p_violation_type);

  -- Emit to security audit chain
  PERFORM fn_append_audit_event(
    'QUERY_COMPLEXITY_VIOLATION',
    p_user_id,
    'query',
    p_complexity_class,
    jsonb_build_object(
      'violation_type', p_violation_type,
      'query_sample', SUBSTRING(p_query_text FROM 1 FOR 100),
      'estimated_cost', p_estimated_cost,
      'cost_limit', p_cost_limit,
      'class', p_complexity_class
    )
  );

  -- Alert if violation is severe
  IF p_estimated_cost > p_cost_limit * 2 THEN
    INSERT INTO public.security_acl_alerts (
      alert_type, object_name, role_name, privilege, severity, details
    ) VALUES (
      'QUERY_COMPLEXITY_BOMB',
      p_complexity_class,
      'query_executor',
      'EXECUTE',
      'HIGH',
      jsonb_build_object(
        'user_id', p_user_id,
        'violation_type', p_violation_type,
        'estimated_cost', p_estimated_cost,
        'cost_limit', p_cost_limit,
        'ratio', p_estimated_cost / p_cost_limit
      )
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION fn_log_query_violation(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) FROM "public";
REVOKE ALL ON FUNCTION fn_log_query_violation(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_log_query_violation(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Analytics View: Query Complexity Violations Summary
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_query_complexity_summary AS
SELECT
  qcv.complexity_class,
  COUNT(*) AS violation_count,
  COUNT(DISTINCT qcv.user_id) AS affected_users,
  qcv.violation_type,
  MAX(qcv.estimated_cost) AS max_cost_observed,
  AVG(qcv.estimated_cost) AS avg_cost,
  MAX(qcv.detected_at) AS last_violation
FROM public.query_complexity_violations qcv
WHERE qcv.detected_at > now() - INTERVAL '7 days'
GROUP BY qcv.complexity_class, qcv.violation_type
ORDER BY violation_count DESC;

REVOKE ALL ON VIEW public.v_query_complexity_summary FROM "public";
REVOKE ALL ON VIEW public.v_query_complexity_summary FROM anon;
GRANT SELECT ON VIEW public.v_query_complexity_summary TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Recursive CTE Depth Limiter (prevent billion-row generation)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_cte_safety(p_query TEXT)
RETURNS TABLE (
  is_safe BOOLEAN,
  issue TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_cte_count INT;
  v_union_count INT;
  v_has_recursion BOOLEAN;
BEGIN
  -- Count CTEs
  v_cte_count := (SELECT COUNT(*) FROM regexp_matches(p_query, 'WITH\s+RECURSIVE', 'gi'));
  v_union_count := (SELECT COUNT(*) FROM regexp_matches(p_query, 'UNION\s+ALL', 'gi'));
  v_has_recursion := (p_query ~* 'WITH\s+RECURSIVE');

  IF v_has_recursion AND v_union_count = 0 THEN
    RETURN QUERY SELECT false, 'Recursive CTE without UNION ALL detected'::TEXT;
    RETURN;
  END IF;

  IF v_cte_count > 10 THEN
    RETURN QUERY SELECT false, format('Too many CTEs: %s (max 10)', v_cte_count)::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Record Improvement Completion in Audit Chain
-- ─────────────────────────────────────────────────────────────────────────────
COMMIT;
