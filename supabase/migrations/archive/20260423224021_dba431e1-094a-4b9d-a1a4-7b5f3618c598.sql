-- Auditoria detalhada das operações de reprocessamento da DLQ.
-- Reaproveita a tabela `audit_logs` (já tem RLS admin-only) com action codes específicos:
--   * 'dlq_reprocess_trigger' — disparo manual (já existe)
--   * 'dlq_reprocess_result'  — resultado da execução (novo)
--   * 'dlq_retry_now'         — retry single via painel (novo)
--   * 'dlq_abandon'           — abandono single via painel (novo)
--   * 'dlq_bulk_retry'        — retry em massa (novo)
--   * 'dlq_bulk_abandon'      — abandono em massa (novo)

-- 1) Registra resultado de uma execução de reprocesso (chamado pelo cliente após
--    receber a resposta da edge function reprocess-failed-messages).
CREATE OR REPLACE FUNCTION public.rpc_dlq_log_reprocess_result(
  p_processed integer DEFAULT 0,
  p_succeeded integer DEFAULT 0,
  p_failed integer DEFAULT 0,
  p_abandoned integer DEFAULT 0,
  p_message text DEFAULT NULL,
  p_source text DEFAULT 'panel'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'dlq_reprocess_result',
    'failed_messages',
    NULL,
    jsonb_build_object(
      'source', COALESCE(NULLIF(TRIM(p_source), ''), 'panel'),
      'processed', GREATEST(COALESCE(p_processed, 0), 0),
      'succeeded', GREATEST(COALESCE(p_succeeded, 0), 0),
      'failed',    GREATEST(COALESCE(p_failed, 0), 0),
      'abandoned', GREATEST(COALESCE(p_abandoned, 0), 0),
      'message',   p_message,
      'finished_at', now()
    )
  );
END;
$$;

-- 2) Auditoria por item: retry/abandon disparados manualmente do painel.
CREATE OR REPLACE FUNCTION public.rpc_dlq_log_item_action(
  p_action text,
  p_ids uuid[],
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_action text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  v_action := CASE p_action
    WHEN 'retry'        THEN 'dlq_retry_now'
    WHEN 'abandon'      THEN 'dlq_abandon'
    WHEN 'bulk_retry'   THEN 'dlq_bulk_retry'
    WHEN 'bulk_abandon' THEN 'dlq_bulk_abandon'
    ELSE NULL
  END;

  IF v_action IS NULL THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_action,
    'failed_messages',
    CASE WHEN array_length(p_ids, 1) = 1 THEN p_ids[1]::text ELSE NULL END,
    jsonb_build_object(
      'ids', to_jsonb(p_ids),
      'count', array_length(p_ids, 1),
      'reason', p_reason,
      'performed_at', now()
    )
  );
END;
$$;

-- 3) Lista histórico de auditoria DLQ (admin only). Retorna nome do operador
--    via JOIN com profiles para a UI.
CREATE OR REPLACE FUNCTION public.rpc_dlq_list_audit(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_action text DEFAULT NULL
)
RETURNS TABLE (
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
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.action,
    a.entity_id,
    a.details,
    a.created_at,
    a.user_id,
    p.name AS user_name,
    p.email AS user_email
  FROM public.audit_logs a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.entity_type = 'failed_messages'
    AND (
      p_action IS NULL
      OR a.action = p_action
      OR (p_action = 'all' AND a.action LIKE 'dlq_%')
    )
    AND a.action LIKE 'dlq_%'
  ORDER BY a.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_dlq_log_reprocess_result(integer, integer, integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_dlq_log_item_action(text, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_dlq_list_audit(integer, integer, text) TO authenticated;