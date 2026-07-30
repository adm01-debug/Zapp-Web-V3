-- 1. Refinar a função de gerenciamento de membros para aceitar todos os parâmetros injetados pelo frontend
CREATE OR REPLACE FUNCTION public.manage_department_member(
    p_profile_id UUID DEFAULT NULL,
    p_department_id UUID DEFAULT NULL,
    p_action TEXT DEFAULT NULL,
    _admin_user_id UUID DEFAULT NULL,
    _target_profile_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_target_id UUID;
BEGIN
    v_target_id := COALESCE(p_profile_id, _target_profile_id);
    
    IF v_target_id IS NULL THEN
        RETURN FALSE;
    END IF;

    IF p_action = 'add' AND p_department_id IS NOT NULL THEN
        UPDATE public.profiles SET department_id = p_department_id WHERE id = v_target_id;
    ELSIF p_action = 'remove' THEN
        UPDATE public.profiles SET department_id = NULL WHERE id = v_target_id;
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Garantir que as funções de DLQ aceitem p_id (variante comum em hooks)
CREATE OR REPLACE FUNCTION public.rpc_dlq_abandon(p_item_id UUID DEFAULT NULL, p_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.failed_messages SET status = 'abandoned' WHERE id = COALESCE(p_item_id, p_id);
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rpc_dlq_retry_now(p_item_id UUID DEFAULT NULL, p_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.failed_messages SET next_retry_at = now(), status = 'pending' WHERE id = COALESCE(p_item_id, p_id);
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
