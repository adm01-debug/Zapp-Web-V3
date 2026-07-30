CREATE TABLE IF NOT EXISTS public.instance_auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('invalid_signature', 'auth_401', 'auth_403')),
  source text NOT NULL CHECK (source IN ('webhook', 'evolution-api')),
  http_status integer,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_iae_created_at ON public.instance_auth_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_iae_instance_created ON public.instance_auth_events (instance_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_iae_reason_created ON public.instance_auth_events (reason, created_at DESC);

ALTER TABLE public.instance_auth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iae_admin_select"
  ON public.instance_auth_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- Sem policies de INSERT/UPDATE/DELETE p/ usuários — apenas service role escreve

-- ============================================================
-- RPC: tendência (série temporal) com buckets adaptativos
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_instance_auth_event_trend(
  p_hours integer DEFAULT 24,
  p_instance text DEFAULT NULL
)
RETURNS TABLE(
  bucket timestamptz,
  instance_name text,
  invalid_signature integer,
  auth_401 integer,
  auth_403 integer,
  total integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours integer;
  v_bucket_minutes integer;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_hours, 24), 168));
  v_bucket_minutes := CASE
    WHEN v_hours <= 24 THEN 10
    WHEN v_hours <= 72 THEN 30
    ELSE 60
  END;

  RETURN QUERY
  SELECT
    date_bin((v_bucket_minutes || ' minutes')::interval, e.created_at, TIMESTAMPTZ '2000-01-01') AS bucket,
    e.instance_name,
    COUNT(*) FILTER (WHERE e.reason = 'invalid_signature')::integer AS invalid_signature,
    COUNT(*) FILTER (WHERE e.reason = 'auth_401')::integer AS auth_401,
    COUNT(*) FILTER (WHERE e.reason = 'auth_403')::integer AS auth_403,
    COUNT(*)::integer AS total
  FROM public.instance_auth_events e
  WHERE e.created_at > now() - (v_hours || ' hours')::interval
    AND (p_instance IS NULL OR e.instance_name = p_instance)
  GROUP BY 1, 2
  ORDER BY 1 ASC, 2 ASC;
END;
$$;

-- ============================================================
-- RPC: resumo (KPIs)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_instance_auth_event_summary(
  p_hours integer DEFAULT 24,
  p_instance text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours integer;
  v_total bigint;
  v_invalid bigint;
  v_401 bigint;
  v_403 bigint;
  v_top jsonb;
  v_first timestamptz;
  v_last timestamptz;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_hours, 24), 168));

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE reason = 'invalid_signature'),
    COUNT(*) FILTER (WHERE reason = 'auth_401'),
    COUNT(*) FILTER (WHERE reason = 'auth_403'),
    MIN(created_at),
    MAX(created_at)
  INTO v_total, v_invalid, v_401, v_403, v_first, v_last
  FROM public.instance_auth_events
  WHERE created_at > now() - (v_hours || ' hours')::interval
    AND (p_instance IS NULL OR instance_name = p_instance);

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_top FROM (
    SELECT
      instance_name,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE reason = 'invalid_signature')::int AS invalid_signature,
      COUNT(*) FILTER (WHERE reason = 'auth_401')::int AS auth_401,
      COUNT(*) FILTER (WHERE reason = 'auth_403')::int AS auth_403
    FROM public.instance_auth_events
    WHERE created_at > now() - (v_hours || ' hours')::interval
      AND (p_instance IS NULL OR instance_name = p_instance)
    GROUP BY instance_name
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'window_hours', v_hours,
    'total', COALESCE(v_total, 0),
    'invalid_signature', COALESCE(v_invalid, 0),
    'auth_401', COALESCE(v_401, 0),
    'auth_403', COALESCE(v_403, 0),
    'first_event_at', v_first,
    'last_event_at', v_last,
    'top_instances', v_top
  );
END;
$$;

-- ============================================================
-- Cleanup utilitário
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_instance_auth_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.instance_auth_events
   WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_instance_auth_event_trend(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_instance_auth_event_summary(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_instance_auth_events() TO service_role;