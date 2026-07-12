CREATE OR REPLACE FUNCTION public.fn_auto_escalate_sla()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Escala prioridade de transferências expiradas (prioridade é INTEIRO: 1=low, 2=medium, 3=high, 4=urgent)
    UPDATE public.conversation_transfers
    SET 
        priority = CASE 
            WHEN priority < 4 THEN priority + 1
            ELSE priority
        END,
        escalation_count = COALESCE(escalation_count, 0) + 1,
        escalated_at = now(),
        updated_at = now()
    WHERE status = 'pending' 
    AND expires_at < now()
    AND (escalated_at IS NULL OR escalated_at < now() - INTERVAL '1 hour');

    INSERT INTO public.transfer_audit_log (transfer_id, action, performed_by)
    SELECT id, 'sla_escalation', 'system'
    FROM public.conversation_transfers
    WHERE status = 'pending' AND expires_at < now() AND escalated_at >= now() - INTERVAL '1 minute';
END;
$$;
