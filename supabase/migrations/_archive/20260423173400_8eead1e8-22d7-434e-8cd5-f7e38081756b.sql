-- ============================================================
-- 1) rpc_list_failed_messages — listagem com filtros + paginação
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_list_failed_messages(
  p_status text[] DEFAULT NULL,
  p_instance text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  instance_name text,
  remote_jid text,
  payload jsonb,
  error_code text,
  error_message text,
  http_status int,
  retry_count int,
  max_retries int,
  status text,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  succeeded_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit int;
  v_search text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH filtered AS (
    SELECT fm.*
    FROM public.failed_messages fm
    WHERE (p_status IS NULL OR fm.status = ANY(p_status))
      AND (p_instance IS NULL OR fm.instance_name = p_instance)
      AND (p_from IS NULL OR fm.created_at >= p_from)
      AND (p_to IS NULL OR fm.created_at <= p_to)
      AND (
        v_search IS NULL OR (
          fm.remote_jid ILIKE '%' || v_search || '%' OR
          fm.error_message ILIKE '%' || v_search || '%' OR
          fm.error_code ILIKE '%' || v_search || '%'
        )
      )
  ), counted AS (
    SELECT COUNT(*)::bigint AS total FROM filtered
  )
  SELECT
    f.id, f.instance_name, f.remote_jid, f.payload, f.error_code, f.error_message,
    f.http_status, f.retry_count, f.max_retries, f.status,
    f.last_attempt_at, f.next_attempt_at, f.succeeded_at, f.created_at, f.updated_at,
    c.total
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.created_at DESC
  LIMIT v_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- ============================================================
-- 2) rpc_dlq_stats — KPIs para o header
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_dlq_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total bigint;
  v_total_24h bigint;
  v_oldest_pending timestamptz;
  v_by_status jsonb;
  v_by_instance jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.failed_messages;

  SELECT COUNT(*) INTO v_total_24h
  FROM public.failed_messages
  WHERE created_at > now() - interval '24 hours';

  SELECT MIN(created_at) INTO v_oldest_pending
  FROM public.failed_messages
  WHERE status IN ('pending','retrying');

  SELECT COALESCE(jsonb_object_agg(status, count), '{}'::jsonb) INTO v_by_status
  FROM (
    SELECT status, COUNT(*)::bigint AS count
    FROM public.failed_messages
    GROUP BY status
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('instance', instance_name, 'count', count) ORDER BY count DESC), '[]'::jsonb)
    INTO v_by_instance
  FROM (
    SELECT instance_name, COUNT(*)::bigint AS count
    FROM public.failed_messages
    GROUP BY instance_name
    ORDER BY COUNT(*) DESC
    LIMIT 20
  ) i;

  RETURN jsonb_build_object(
    'total', v_total,
    'total_24h', v_total_24h,
    'oldest_pending_at', v_oldest_pending,
    'by_status', v_by_status,
    'by_instance', v_by_instance
  );
END;
$$;

-- ============================================================
-- 3) rpc_dlq_retry_now — força reprocessamento
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_dlq_retry_now(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE public.failed_messages
     SET status = 'pending',
         next_attempt_at = now(),
         updated_at = now()
   WHERE id = p_id
     AND status IN ('pending','retrying','failed','abandoned');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'dlq_retry_now',
      'failed_messages',
      p_id::text,
      jsonb_build_object('forced_at', now())
    );
  END IF;

  RETURN v_updated > 0;
END;
$$;

-- ============================================================
-- 4) rpc_dlq_abandon — marca como abandonada
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_dlq_abandon(p_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated int;
  v_reason text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  v_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  UPDATE public.failed_messages
     SET status = 'abandoned',
         error_message = COALESCE(error_message, '') ||
           ' [ABANDONED: ' || COALESCE(v_reason, 'no reason given') || ']',
         updated_at = now()
   WHERE id = p_id
     AND status <> 'abandoned';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'dlq_abandon',
      'failed_messages',
      p_id::text,
      jsonb_build_object('reason', v_reason)
    );
  END IF;

  RETURN v_updated > 0;
END;
$$;

-- ============================================================
-- 5) rpc_dlq_bulk_abandon — abandona em lote
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_dlq_bulk_abandon(p_ids uuid[], p_reason text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated int;
  v_reason text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF array_length(p_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Bulk operation limited to 500 rows per call';
  END IF;

  v_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  UPDATE public.failed_messages
     SET status = 'abandoned',
         error_message = COALESCE(error_message, '') ||
           ' [ABANDONED: ' || COALESCE(v_reason, 'bulk') || ']',
         updated_at = now()
   WHERE id = ANY(p_ids)
     AND status <> 'abandoned';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'dlq_bulk_abandon',
      'failed_messages',
      NULL,
      jsonb_build_object('reason', v_reason, 'requested', array_length(p_ids, 1), 'updated', v_updated)
    );
  END IF;

  RETURN v_updated;
END;
$$;