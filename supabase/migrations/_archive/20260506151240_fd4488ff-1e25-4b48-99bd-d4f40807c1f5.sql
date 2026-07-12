-- Tabela de auditoria de conversas
CREATE TABLE IF NOT EXISTS public.conversation_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    event_type TEXT NOT NULL, -- 'send_attempt', 'delivered', 'failed', 'media_upload'
    status TEXT NOT NULL,
    attempt_number INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexação para performance de busca por conversa
CREATE INDEX IF NOT EXISTS idx_audit_logs_conversation_id ON public.conversation_audit_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.conversation_audit_logs(created_at);

-- Cache de mídia para evitar uploads duplicados
CREATE TABLE IF NOT EXISTS public.media_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_hash TEXT UNIQUE NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.conversation_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_cache ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (admin/supervisor podem ver tudo)
CREATE POLICY "Admins can view audit logs" ON public.conversation_audit_logs
    FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'supervisor')));

CREATE POLICY "Admins can view media cache" ON public.media_cache
    FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'supervisor')));

-- Trigger para atualizar timestamp de acesso no cache
CREATE OR REPLACE FUNCTION public.update_media_cache_access()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_accessed_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_media_cache_access
BEFORE UPDATE ON public.media_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_media_cache_access();