CREATE OR REPLACE FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
        PERFORM public.log_rls_denied('dlq_audit_log', 'admin|supervisor',
            jsonb_build_object('rpc', 'rpc_dlq_log_item_action', 'action', p_action, 'item_id', p_item_id));
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.dlq_audit_log (item_id, action, reason, performed_by)
    VALUES (p_item_id, p_action, p_reason, auth.uid());

    IF p_action = 'delete' THEN
        DELETE FROM public.failed_messages WHERE id = p_item_id;
    END IF;

    RETURN TRUE;
END;
$function$;