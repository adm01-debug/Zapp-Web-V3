-- Append-only audit log for dispatch errors.
-- Distinct from `failed_messages` (mutable DLQ) — this preserves the full
-- history of every failed attempt for forensic analysis even after the DLQ
-- entry is retried, succeeded or abandoned.
CREATE TABLE IF NOT EXISTS public.dispatch_error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  failed_message_id UUID REFERENCES public.failed_messages(id) ON DELETE SET NULL,
  instance_name TEXT NOT NULL,
  remote_jid TEXT,
  channel_type TEXT,
  agent_email TEXT,
  agent_user_id UUID,
  error_code TEXT,
  error_message TEXT,
  http_status INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB,
  context JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_error_logs_occurred_at
  ON public.dispatch_error_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_error_logs_instance
  ON public.dispatch_error_logs (instance_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_error_logs_agent
  ON public.dispatch_error_logs (agent_email, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_error_logs_error_code
  ON public.dispatch_error_logs (error_code, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_error_logs_failed_message
  ON public.dispatch_error_logs (failed_message_id);

ALTER TABLE public.dispatch_error_logs ENABLE ROW LEVEL SECURITY;

-- Read: admin or supervisor (audit access).
CREATE POLICY "dispatch_error_logs_read_admin_supervisor"
  ON public.dispatch_error_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- Insert: any authenticated user (so the dispatch pipeline running under
-- any agent context can record its own failures). The table is otherwise
-- write-once: no UPDATE/DELETE policies are created, so PostgREST blocks them.
CREATE POLICY "dispatch_error_logs_insert_authenticated"
  ON public.dispatch_error_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Service role bypasses RLS, so edge functions and webhooks can also write.

-- Convenience RPC: paginated, filterable read used by the admin UI.
CREATE OR REPLACE FUNCTION public.rpc_list_dispatch_error_logs(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_instance TEXT DEFAULT NULL,
  p_agent TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  failed_message_id UUID,
  instance_name TEXT,
  remote_jid TEXT,
  channel_type TEXT,
  agent_email TEXT,
  agent_user_id UUID,
  error_code TEXT,
  error_message TEXT,
  http_status INTEGER,
  retry_count INTEGER,
  payload JSONB,
  context JSONB,
  occurred_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit INTEGER;
  v_search TEXT;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH filtered AS (
    SELECT d.*
    FROM public.dispatch_error_logs d
    WHERE (p_from IS NULL OR d.occurred_at >= p_from)
      AND (p_to IS NULL OR d.occurred_at <= p_to)
      AND (p_instance IS NULL OR d.instance_name = p_instance)
      AND (p_agent IS NULL OR d.agent_email = p_agent)
      AND (p_error_code IS NULL OR d.error_code = p_error_code)
      AND (
        v_search IS NULL OR (
          d.remote_jid ILIKE '%' || v_search || '%' OR
          d.error_message ILIKE '%' || v_search || '%' OR
          d.error_code ILIKE '%' || v_search || '%'
        )
      )
  ), counted AS (
    SELECT COUNT(*)::BIGINT AS total FROM filtered
  )
  SELECT
    f.id, f.failed_message_id, f.instance_name, f.remote_jid,
    f.channel_type, f.agent_email, f.agent_user_id,
    f.error_code, f.error_message, f.http_status, f.retry_count,
    f.payload, f.context, f.occurred_at,
    c.total
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.occurred_at DESC
  LIMIT v_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- Aggregated stats RPC for dashboards.
CREATE OR REPLACE FUNCTION public.rpc_dispatch_error_stats(
  p_hours INTEGER DEFAULT 24
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hours INTEGER;
  v_total BIGINT;
  v_by_agent JSONB;
  v_by_instance JSONB;
  v_by_code JSONB;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_hours, 24), 720));

  SELECT COUNT(*) INTO v_total
  FROM public.dispatch_error_logs
  WHERE occurred_at > now() - (v_hours || ' hours')::interval;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_agent FROM (
    SELECT COALESCE(agent_email, 'sem-agente') AS agent, COUNT(*)::INT AS total
    FROM public.dispatch_error_logs
    WHERE occurred_at > now() - (v_hours || ' hours')::interval
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_instance FROM (
    SELECT instance_name AS instance, COUNT(*)::INT AS total
    FROM public.dispatch_error_logs
    WHERE occurred_at > now() - (v_hours || ' hours')::interval
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_code FROM (
    SELECT COALESCE(error_code, 'unknown') AS code, COUNT(*)::INT AS total
    FROM public.dispatch_error_logs
    WHERE occurred_at > now() - (v_hours || ' hours')::interval
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'window_hours', v_hours,
    'total', COALESCE(v_total, 0),
    'by_agent', v_by_agent,
    'by_instance', v_by_instance,
    'by_error_code', v_by_code
  );
END;
$$;

-- Trigger: every time a row is inserted in failed_messages, also append a
-- log entry. Keeps the audit trail in sync with the operational DLQ without
-- requiring callers to dual-write.
CREATE OR REPLACE FUNCTION public.fn_log_dispatch_error()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent_email TEXT;
BEGIN
  v_agent_email := COALESCE(
    NEW.payload->>'agent_email',
    NEW.payload->>'agentEmail',
    NEW.payload->>'assigned_to',
    NEW.payload->>'user_email'
  );

  INSERT INTO public.dispatch_error_logs (
    failed_message_id, instance_name, remote_jid,
    agent_email, error_code, error_message, http_status,
    retry_count, payload, occurred_at
  ) VALUES (
    NEW.id, NEW.instance_name, NEW.remote_jid,
    v_agent_email, NEW.error_code, NEW.error_message, NEW.http_status,
    COALESCE(NEW.retry_count, 0), NEW.payload, COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_dispatch_error ON public.failed_messages;
CREATE TRIGGER trg_log_dispatch_error
AFTER INSERT ON public.failed_messages
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_dispatch_error();

-- Retention: keep 90 days. Run via cron/edge function as needed.
CREATE OR REPLACE FUNCTION public.cleanup_dispatch_error_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin or service_role required';
  END IF;

  DELETE FROM public.dispatch_error_logs
  WHERE occurred_at < now() - interval '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;