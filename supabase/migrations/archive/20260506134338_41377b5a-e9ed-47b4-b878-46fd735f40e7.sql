ALTER TABLE public.transfer_audit_log ALTER COLUMN user_id DROP NOT NULL;

-- Garante que fn_auto_escalate_sla funcione
CREATE OR REPLACE FUNCTION public.fn_auto_escalate_sla()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.conversation_transfers
    SET 
        priority = CASE 
            WHEN priority < 4 THEN (priority + 1)
            ELSE 4
        END,
        escalation_count = COALESCE(escalation_count, 0) + 1,
        escalated_at = now(),
        updated_at = now()
    WHERE status = 'pending' 
    AND expires_at < now()
    AND (escalated_at IS NULL OR escalated_at < (now() - INTERVAL '1 hour'));

    -- Auditoria (user_id será nulo para o sistema)
    INSERT INTO public.transfer_audit_log (transfer_id, action, instance_name)
    SELECT id, 'sla_escalation', target_instance
    FROM public.conversation_transfers
    WHERE status = 'pending' AND expires_at < now() AND escalated_at >= (now() - INTERVAL '1 minute');
END;
$$;
