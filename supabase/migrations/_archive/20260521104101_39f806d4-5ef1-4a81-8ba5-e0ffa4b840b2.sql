-- 1. Colunas ausentes em qr_attempts
ALTER TABLE public.qr_attempts 
ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

-- 2. Colunas ausentes em evolution_instance_credentials para compatibilidade total
ALTER TABLE public.evolution_instance_credentials
ADD COLUMN IF NOT EXISTS api_url TEXT,
ADD COLUMN IF NOT EXISTS api_key TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMPTZ;

-- 3. Tabela de logs de saúde Evolution
CREATE TABLE IF NOT EXISTS public.evolution_health_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
    instance_name TEXT,
    status TEXT,
    response_time_ms INTEGER,
    error_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Funções RPC solicitadas pela UI de Automação e Evolution
CREATE OR REPLACE FUNCTION public.search_knowledge_base(search_query TEXT, max_results INTEGER DEFAULT 5)
RETURNS TABLE (
    id UUID,
    title TEXT,
    content TEXT,
    category TEXT,
    tags TEXT[],
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        kba.id,
        kba.title,
        kba.content,
        kba.category,
        kba.tags,
        ts_rank_cd(to_tsvector('portuguese', kba.title || ' ' || kba.content), plainto_tsquery('portuguese', search_query)) as rank
    FROM public.knowledge_base_articles kba
    WHERE to_tsvector('portuguese', kba.title || ' ' || kba.content) @@ plainto_tsquery('portuguese', search_query)
    ORDER BY rank DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC para upsert de contato (usado no webhook)
CREATE OR REPLACE FUNCTION public.rpc_upsert_contact(
    p_remote_jid TEXT,
    p_instance TEXT,
    p_push_name TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.contacts (remote_jid, push_name, instance, updated_at)
    VALUES (p_remote_jid, p_push_name, p_instance, now())
    ON CONFLICT (remote_jid) DO UPDATE 
    SET push_name = EXCLUDED.push_name,
        instance = EXCLUDED.instance,
        updated_at = now()
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Habilitar RLS e Políticas
ALTER TABLE public.evolution_health_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role all access" ON public.evolution_health_logs FOR ALL TO service_role USING (true);
CREATE POLICY "Admins can view health logs" ON public.evolution_health_logs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);
