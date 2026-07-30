-- RPC para auditar disparo manual do "Reprocessar agora" (que invoca a edge function)
CREATE OR REPLACE FUNCTION public.rpc_dlq_log_reprocess_trigger(p_source text DEFAULT 'panel')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'dlq_reprocess_trigger',
    'failed_messages',
    NULL,
    jsonb_build_object(
      'source', COALESCE(NULLIF(TRIM(p_source), ''), 'panel'),
      'triggered_at', now()
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_dlq_log_reprocess_trigger(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_dlq_log_reprocess_trigger(text) TO authenticated;