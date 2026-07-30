-- 1. Alinhar policy de INSERT para admitir supervisor
DROP POLICY IF EXISTS "Service role and admins can insert failed messages" ON public.failed_messages;

CREATE POLICY "Service role admins and supervisors can insert failed messages"
  ON public.failed_messages
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- 2. rpc_list_failed_messages — relaxar para admin OR supervisor
CREATE OR REPLACE FUNCTION public.rpc_list_failed_messages(
  p_status text DEFAULT NULL,
  p_instance text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  remote_jid text,
  instance_name text,
  status text,
  retry_count int,
  max_retries int,
  http_status int,
  error_code text,
  error_message text,
  payload jsonb,
  next_attempt_at timestamptz,
  succeeded_at timestamptz,
  abandoned_at timestamptz,
  abandon_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.failed_messages fm
  WHERE
    (p_status IS NULL OR fm.status = p_status)
    AND (p_instance IS NULL OR fm.instance_name = p_instance)
    AND (p_search IS NULL OR fm.remote_jid ILIKE '%' || p_search || '%' OR fm.error_message ILIKE '%' || p_search || '%')
    AND (p_from IS NULL OR fm.created_at >= p_from)
    AND (p_to IS NULL OR fm.created_at <= p_to);

  RETURN QUERY
  SELECT
    fm.id, fm.remote_jid, fm.instance_name, fm.status,
    fm.retry_count, fm.max_retries, fm.http_status, fm.error_code,
    fm.error_message, fm.payload, fm.next_attempt_at,
    fm.succeeded_at, fm.abandoned_at, fm.abandon_reason,
    fm.created_at, fm.updated_at,
    v_total AS total_count
  FROM public.failed_messages fm
  WHERE
    (p_status IS NULL OR fm.status = p_status)
    AND (p_instance IS NULL OR fm.instance_name = p_instance)
    AND (p_search IS NULL OR fm.remote_jid ILIKE '%' || p_search || '%' OR fm.error_message ILIKE '%' || p_search || '%')
    AND (p_from IS NULL OR fm.created_at >= p_from)
    AND (p_to IS NULL OR fm.created_at <= p_to)
  ORDER BY fm.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 3. rpc_dlq_stats — relaxar para admin OR supervisor
CREATE OR REPLACE FUNCTION public.rpc_dlq_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  SELECT jsonb_build_object(
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'retrying', COUNT(*) FILTER (WHERE status = 'retrying'),
    'succeeded', COUNT(*) FILTER (WHERE status = 'succeeded'),
    'abandoned', COUNT(*) FILTER (WHERE status = 'abandoned'),
    'total', COUNT(*),
    'last_24h', COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')
  )
  INTO v_result
  FROM public.failed_messages;

  RETURN v_result;
END;
$$;