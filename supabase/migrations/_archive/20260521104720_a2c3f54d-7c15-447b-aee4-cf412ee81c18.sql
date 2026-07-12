-- 1. Colunas finais de compatibilidade
ALTER TABLE public.qr_attempts ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES auth.users(id);
ALTER TABLE public.department_invitations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 2. Refinamento da função de gerenciamento de membros para suportar os tipos do frontend
CREATE OR REPLACE FUNCTION public.manage_department_member(
    p_profile_id UUID,
    p_department_id UUID,
    p_action TEXT,
    _admin_user_id UUID DEFAULT NULL -- Parâmetro opcional para bater com chamadas que injetam o ID do admin
) RETURNS BOOLEAN AS $$
BEGIN
    IF p_action = 'add' THEN
        UPDATE public.profiles SET department_id = p_department_id WHERE id = p_profile_id;
    ELSIF p_action = 'remove' THEN
        UPDATE public.profiles SET department_id = NULL WHERE id = p_profile_id;
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPCs de ação em massa para DLQ (Dead Letter Queue)
CREATE OR REPLACE FUNCTION public.rpc_dlq_abandon(p_item_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.failed_messages SET status = 'abandoned' WHERE id = p_item_id;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rpc_dlq_bulk_abandon(p_ids UUID[])
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.failed_messages SET status = 'abandoned' WHERE id = ANY(p_ids);
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Ajuste na rpc_dlq_log_item_action para aceitar múltiplos IDs se necessário (suporte ao frontend)
CREATE OR REPLACE FUNCTION public.rpc_dlq_log_item_action(
    p_item_id UUID DEFAULT NULL,
    p_action TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_ids UUID[] DEFAULT NULL -- Suporte para ações em massa
) RETURNS BOOLEAN AS $$
BEGIN
    IF p_ids IS NOT NULL THEN
        INSERT INTO public.dlq_audit_log (item_id, action, reason, performed_by)
        SELECT id, p_action, p_reason, auth.uid() FROM unnest(p_ids) as id;
    ELSIF p_item_id IS NOT NULL THEN
        INSERT INTO public.dlq_audit_log (item_id, action, reason, performed_by)
        VALUES (p_item_id, p_action, p_reason, auth.uid());
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
