-- Auditoria de Entrega Outbound
CREATE TABLE IF NOT EXISTS public.outbound_delivery_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id TEXT NOT NULL,
    message_type TEXT NOT NULL,
    instance_name TEXT NOT NULL,
    agent_id UUID REFERENCES auth.users(id),
    status TEXT NOT NULL, -- 'pending', 'sent', 'failed', 'delivered'
    latency_ms INTEGER,
    payload_size_kb INTEGER,
    is_multipart BOOLEAN DEFAULT false,
    error_code TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.outbound_delivery_audit ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Admins/Supervisors can view audit" 
ON public.outbound_delivery_audit FOR SELECT 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

-- RPC para logar eventos (Security Definer)
CREATE OR REPLACE FUNCTION public.rpc_log_outbound_event(
    p_conversation_id TEXT,
    p_message_type TEXT,
    p_instance_name TEXT,
    p_status TEXT,
    p_latency_ms INTEGER DEFAULT NULL,
    p_error_code TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.outbound_delivery_audit (
        conversation_id, message_type, instance_name, agent_id, status, latency_ms, error_code, metadata
    ) VALUES (
        p_conversation_id, p_message_type, p_instance_name, auth.uid(), p_status, p_latency_ms, p_error_code, p_metadata
    ) RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$;

-- View de monitoramento para o time comercial
CREATE OR REPLACE VIEW public.v_outbound_health_monitor AS
SELECT 
    instance_name,
    message_type,
    COUNT(*) as total_attempts,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
    AVG(latency_ms) FILTER (WHERE status = 'sent') as avg_latency_ms,
    ROUND((COUNT(*) FILTER (WHERE status = 'sent')::FLOAT / NULLIF(COUNT(*), 0) * 100)::NUMERIC, 2) as success_rate
FROM public.outbound_delivery_audit
WHERE created_at > now() - interval '24 hours'
GROUP BY instance_name, message_type;