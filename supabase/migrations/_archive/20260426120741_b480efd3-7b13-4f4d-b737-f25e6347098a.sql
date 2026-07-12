-- RPC de métricas operacionais para canais e filas
CREATE OR REPLACE FUNCTION public.rpc_ops_metrics(p_window_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(hours => GREATEST(p_window_hours, 1));
  v_result jsonb;
BEGIN
  -- Bloqueia agentes
  IF NOT (public.is_admin_or_supervisor(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH
  pml AS (
    SELECT * FROM public.provider_message_log WHERE received_at >= v_since
  ),
  by_channel AS (
    SELECT
      sc.id AS channel_id,
      sc.name AS channel_name,
      sc.channel_type,
      sc.status,
      COUNT(*) FILTER (WHERE p.direction = 'inbound') AS msgs_in,
      COUNT(*) FILTER (WHERE p.direction = 'outbound') AS msgs_out,
      COUNT(*) FILTER (WHERE p.delivery_status IN ('failed','error')) AS msgs_failed
    FROM public.service_channels sc
    LEFT JOIN pml p ON p.instance_name = sc.instance_name
    GROUP BY sc.id, sc.name, sc.channel_type, sc.status
  ),
  by_queue AS (
    SELECT
      q.id AS queue_id,
      q.name AS queue_name,
      q.status AS queue_status,
      COUNT(c.id) FILTER (WHERE c.assigned_to IS NULL) AS waiting,
      COUNT(c.id) FILTER (WHERE c.assigned_to IS NOT NULL) AS in_service,
      AVG(EXTRACT(EPOCH FROM (now() - c.created_at)))
        FILTER (WHERE c.assigned_to IS NULL) AS avg_wait_seconds,
      PERCENTILE_DISC(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (now() - c.created_at)))
        FILTER (WHERE c.assigned_to IS NULL) AS p99_wait_seconds
    FROM public.queues q
    LEFT JOIN public.contacts c ON c.queue_id = q.id
    GROUP BY q.id, q.name, q.status
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*) FROM pml WHERE direction='inbound') AS total_in,
      (SELECT COUNT(*) FROM pml WHERE direction='outbound') AS total_out,
      (SELECT COUNT(*) FROM pml WHERE delivery_status IN ('failed','error')) AS total_failed,
      (SELECT COUNT(*) FROM public.service_channels WHERE status='active') AS active_channels,
      (SELECT COUNT(*) FROM public.queues WHERE status='active') AS active_queues,
      (SELECT COUNT(DISTINCT user_id) FROM public.profiles WHERE status='online') AS online_agents
  )
  SELECT jsonb_build_object(
    'window_hours', p_window_hours,
    'generated_at', now(),
    'totals', (SELECT to_jsonb(t) FROM totals t),
    'by_channel', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.msgs_in DESC) FROM by_channel c), '[]'::jsonb),
    'by_queue', COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.waiting DESC) FROM by_queue q), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_ops_metrics(integer) TO authenticated;

-- Índices p/ acelerar agregações
CREATE INDEX IF NOT EXISTS idx_pml_received_at_dir ON public.provider_message_log (received_at DESC, direction);
CREATE INDEX IF NOT EXISTS idx_pml_instance_received ON public.provider_message_log (instance_name, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created ON public.audit_logs (entity_type, created_at DESC);