CREATE OR REPLACE FUNCTION public.fn_safe_audit_log(
    p_entity_type text,
    p_entity_id uuid,
    p_action text,
    p_performed_by text,
    p_details jsonb DEFAULT '{}'::jsonb
) RETURNS uuid AS $$
DECLARE
    v_log_id uuid;
BEGIN
    INSERT INTO public.audit_logs (
        entity_type,
        entity_id,
        action,
        performed_by,
        details
    ) VALUES (
        p_entity_type,
        p_entity_id,
        p_action,
        p_performed_by,
        p_details
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
EXCEPTION WHEN OTHERS THEN
    -- Silently fail audit to not block main transaction
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;