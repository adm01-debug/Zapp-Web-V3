-- 1. Adicionar campos de configuração de reconexão na tabela principal
ALTER TABLE public.whatsapp_connections 
ADD COLUMN IF NOT EXISTS reconnect_interval_seconds INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS max_reconnect_attempts INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS auto_reconnect_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS loop_protection_active BOOLEAN DEFAULT false;

-- 2. Tabela de logs de auditoria de reconexão
CREATE TABLE IF NOT EXISTS public.reconnection_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    status_before TEXT,
    health_reason_before TEXT,
    action_taken TEXT DEFAULT 'restart_instance',
    result TEXT, -- 'success', 'failed', 'ignored_loop'
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Habilitar RLS
ALTER TABLE public.reconnection_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view reconnection logs" ON public.reconnection_logs FOR SELECT TO authenticated USING (true);

-- 4. Função para detecção de loop e log de auditoria
CREATE OR REPLACE FUNCTION public.fn_log_reconnection_attempt(
    p_connection_id UUID,
    p_attempt INTEGER,
    p_status_before TEXT,
    p_reason_before TEXT,
    p_result TEXT,
    p_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    recent_changes_count INTEGER;
BEGIN
    -- Registrar o log
    INSERT INTO public.reconnection_logs (connection_id, attempt_number, status_before, health_reason_before, result, error_message)
    VALUES (p_connection_id, p_attempt, p_status_before, p_reason_before, p_result, p_error);

    -- Detecção de Loop: Contar quantas vezes a instância mudou de status nos últimos 5 minutos
    SELECT count(*) INTO recent_changes_count 
    FROM public.instance_alerts 
    WHERE connection_id = p_connection_id 
    AND created_at > now() - interval '5 minutes';

    -- Se houve mais de 6 mudanças (3 quedas e 3 voltas) em 5 min, ativa proteção de loop
    IF recent_changes_count >= 6 THEN
        UPDATE public.whatsapp_connections 
        SET loop_protection_active = true,
            auto_reconnect_enabled = false
        WHERE id = p_connection_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;