CREATE OR REPLACE FUNCTION public.rpc_list_failed_messages(p_limit integer DEFAULT 100)
RETURNS SETOF public.failed_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.failed_messages ORDER BY created_at DESC LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_dlq_list_audit(p_limit integer DEFAULT 100)
RETURNS SETOF public.dlq_audit_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.dlq_audit_log ORDER BY created_at DESC LIMIT p_limit;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_list_failed_messages(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_dlq_list_audit(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_failed_messages(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_dlq_list_audit(integer) TO authenticated;