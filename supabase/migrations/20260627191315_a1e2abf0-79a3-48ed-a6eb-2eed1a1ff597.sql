
-- 1) RLS denied log
CREATE TABLE IF NOT EXISTS public.rls_denied_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  resource text NOT NULL,
  required_role text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.rls_denied_log TO authenticated;
GRANT ALL ON public.rls_denied_log TO service_role;

ALTER TABLE public.rls_denied_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view rls_denied_log" ON public.rls_denied_log;
CREATE POLICY "Admins view rls_denied_log" ON public.rls_denied_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE INDEX IF NOT EXISTS idx_rls_denied_user_created ON public.rls_denied_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rls_denied_resource_created ON public.rls_denied_log(resource, created_at DESC);

-- 2) Helper to log denied access
CREATE OR REPLACE FUNCTION public.log_rls_denied(
  p_resource text,
  p_required_role text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.rls_denied_log(user_id, resource, required_role, context)
  VALUES (auth.uid(), p_resource, p_required_role, COALESCE(p_context, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
  -- never block on logging failures
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_rls_denied(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_rls_denied(text, text, jsonb) TO authenticated;

-- 3) Paginated DLQ list with filters + role gating
DROP FUNCTION IF EXISTS public.rpc_list_failed_messages(text[], text, text, timestamptz, timestamptz, integer, integer);
CREATE OR REPLACE FUNCTION public.rpc_list_failed_messages(
  p_status text[],
  p_instance text,
  p_search text,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer,
  p_offset integer
)
RETURNS TABLE(
  id uuid,
  instance_name text,
  message_id text,
  error_message text,
  retry_count integer,
  next_retry_at timestamptz,
  status text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM public.log_rls_denied('failed_messages', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_list_failed_messages', 'filters',
        jsonb_build_object('status', p_status, 'instance', p_instance, 'search', p_search)));
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT fm.id, fm.instance_name, fm.message_id, fm.error_message,
         fm.retry_count, fm.next_retry_at, fm.status, fm.created_at,
         COUNT(*) OVER()::bigint AS total_count
  FROM public.failed_messages fm
  WHERE (p_status IS NULL OR fm.status = ANY(p_status))
    AND (p_instance IS NULL OR fm.instance_name = p_instance)
    AND (p_search IS NULL OR fm.error_message ILIKE '%'||p_search||'%' OR fm.message_id ILIKE '%'||p_search||'%')
    AND (p_from IS NULL OR fm.created_at >= p_from)
    AND (p_to IS NULL OR fm.created_at <= p_to)
  ORDER BY fm.created_at DESC
  LIMIT COALESCE(p_limit, 50)
  OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_list_failed_messages(text[], text, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_failed_messages(text[], text, text, timestamptz, timestamptz, integer, integer) TO authenticated;

-- 4) Paginated DLQ audit with action filter + role gating
CREATE OR REPLACE FUNCTION public.rpc_dlq_list_audit(
  p_limit integer,
  p_offset integer,
  p_action text
)
RETURNS TABLE(
  id uuid,
  action text,
  entity_id text,
  details jsonb,
  created_at timestamptz,
  user_id uuid,
  user_name text,
  user_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM public.log_rls_denied('dlq_audit_log', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_dlq_list_audit', 'action', p_action));
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT al.id,
         al.action::text,
         al.entity_id::text,
         al.details,
         al.created_at,
         al.user_id,
         p.name AS user_name,
         p.email AS user_email
  FROM public.audit_logs al
  LEFT JOIN public.profiles p ON p.user_id = al.user_id
  WHERE al.entity_type = 'failed_messages'
    AND (p_action IS NULL OR p_action = 'all' OR al.action = p_action)
  ORDER BY al.created_at DESC
  LIMIT COALESCE(p_limit, 30)
  OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_dlq_list_audit(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_dlq_list_audit(integer, integer, text) TO authenticated;

-- 5) Paginated transfers list (SECURITY INVOKER → respeita RLS de conversation_transfers)
CREATE OR REPLACE FUNCTION public.rpc_list_transfers_paginated(
  p_status text DEFAULT NULL,
  p_priority integer DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  source_instance text,
  target_instance text,
  remote_jid text,
  contact_name text,
  status text,
  priority integer,
  transfer_type text,
  category text,
  reason text,
  from_agent_id uuid,
  to_agent_id uuid,
  expires_at timestamptz,
  created_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT t.id, t.source_instance, t.target_instance, t.remote_jid, t.contact_name,
         t.status, t.priority, t.transfer_type, t.category, t.reason,
         t.from_agent_id, t.to_agent_id, t.expires_at,
         t.created_at, t.accepted_at, t.completed_at,
         COUNT(*) OVER()::bigint AS total_count
  FROM public.conversation_transfers t
  WHERE (p_status IS NULL OR t.status = p_status)
    AND (p_priority IS NULL OR t.priority = p_priority)
    AND (p_from IS NULL OR t.created_at >= p_from)
    AND (p_to IS NULL OR t.created_at <= p_to)
  ORDER BY t.created_at DESC
  LIMIT COALESCE(p_limit, 50)
  OFFSET COALESCE(p_offset, 0);
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_list_transfers_paginated(text, integer, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_transfers_paginated(text, integer, timestamptz, timestamptz, integer, integer) TO authenticated;
