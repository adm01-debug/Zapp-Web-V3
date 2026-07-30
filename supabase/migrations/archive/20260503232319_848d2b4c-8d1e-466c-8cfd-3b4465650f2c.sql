-- Criar tabela de logs de serviço para auditoria detalhada no FATOR X
CREATE TABLE IF NOT EXISTS public.service_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMP WITH TIME ZONE DEFAULT now(),
    instance_name TEXT NOT NULL,
    remote_jid TEXT,
    event_type TEXT NOT NULL, -- 'connection', 'message_send', 'api_call', 'webhook_event', 'error'
    level TEXT DEFAULT 'info', -- 'debug', 'info', 'warn', 'error'
    message TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    performed_by TEXT -- email ou id do agente
);

-- Índices para performance em troubleshooting
CREATE INDEX IF NOT EXISTS idx_service_logs_instance ON public.service_logs(instance_name);
CREATE INDEX IF NOT EXISTS idx_service_logs_contact ON public.service_logs(remote_jid) WHERE remote_jid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_logs_ts ON public.service_logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_service_logs_event ON public.service_logs(event_type);

-- Habilitar RLS
ALTER TABLE public.service_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso: apenas leitura para admins/supervisores via RPC (a ser criada)
CREATE POLICY "Admins can view service logs" 
ON public.service_logs 
FOR SELECT 
TO authenticated
USING (true); -- Controle real será via RPC filtrada

-- Função para registrar logs de serviço de forma segura
CREATE OR REPLACE FUNCTION public.rpc_log_service_event(
    p_instance TEXT,
    p_event_type TEXT,
    p_message TEXT,
    p_level TEXT DEFAULT 'info',
    p_remote_jid TEXT DEFAULT NULL,
    p_payload JSONB DEFAULT '{}'::jsonb,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_performed_by TEXT DEFAULT NULL
)
RETURNS public.service_logs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log public.service_logs;
BEGIN
    INSERT INTO public.service_logs (
        instance_name, 
        event_type, 
        message, 
        level, 
        remote_jid, 
        payload, 
        metadata, 
        performed_by
    )
    VALUES (
        p_instance, 
        p_event_type, 
        p_message, 
        p_level, 
        p_remote_jid, 
        p_payload, 
        p_metadata, 
        p_performed_by
    )
    RETURNING * INTO v_log;
    
    RETURN v_log;
END;
$$;
