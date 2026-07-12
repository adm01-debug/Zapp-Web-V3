-- 1. Remover função antiga para permitir alteração do tipo de retorno
DROP FUNCTION IF EXISTS public.rpc_instance_auth_event_trend(text,integer);

-- 2. Recriar com o esquema completo solicitado pelo frontend
CREATE OR REPLACE FUNCTION public.rpc_instance_auth_event_trend(p_instance TEXT, p_hours INTEGER DEFAULT 24)
RETURNS TABLE (
    bucket TIMESTAMPTZ, 
    instance_name TEXT,
    success_count BIGINT, 
    failure_count BIGINT,
    invalid_signature BIGINT,
    auth_401 BIGINT,
    auth_403 BIGINT,
    total BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        date_trunc('hour', created_at) as bucket,
        COALESCE(instance_auth_events.instance_name, 'all'),
        count(*) FILTER (WHERE event_type = 'auth.success') as success_count,
        count(*) FILTER (WHERE event_type = 'auth.failure') as failure_count,
        count(*) FILTER (WHERE event_type = 'auth.invalid_signature') as invalid_signature,
        count(*) FILTER (WHERE event_type = 'auth.401') as auth_401,
        count(*) FILTER (WHERE event_type = 'auth.403') as auth_403,
        count(*) as total
    FROM public.instance_auth_events
    WHERE (p_instance IS NULL OR instance_auth_events.instance_name = p_instance)
      AND created_at > now() - (p_hours || ' hours')::interval
    GROUP BY 1, 2 ORDER BY 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Funções de ação do DLQ
CREATE OR REPLACE FUNCTION public.rpc_dlq_log_item_action(
    p_item_id UUID,
    p_action TEXT,
    p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO public.dlq_audit_log (item_id, action, reason, performed_by)
    VALUES (p_item_id, p_action, p_reason, auth.uid());
    
    IF p_action = 'delete' THEN
        DELETE FROM public.failed_messages WHERE id = p_item_id;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rpc_dlq_retry_now(p_item_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.failed_messages 
    SET next_retry_at = now(), status = 'pending' 
    WHERE id = p_item_id;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Colunas finais de compatibilidade
ALTER TABLE public.qr_attempts ADD COLUMN IF NOT EXISTS connection_name TEXT;
ALTER TABLE public.department_invitations ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS _admin_user_id UUID;
