-- 1. Tabelas de suporte para WhatsApp Cloud e Webhooks
CREATE TABLE IF NOT EXISTS public.whatsapp_cloud_webhook_pings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
    event_id TEXT PRIMARY KEY,
    instance TEXT,
    event_type TEXT,
    processed_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Controle de Pausa de Instâncias e Telemetria
CREATE TABLE IF NOT EXISTS public.instance_processing_pauses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT NOT NULL,
    paused_until TIMESTAMPTZ NOT NULL,
    reason TEXT,
    trigger_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.instance_auth_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status_code INTEGER,
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Métricas de Retry (Evolution API)
CREATE TABLE IF NOT EXISTS public.evolution_retry_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    method TEXT,
    instance_name TEXT,
    idempotency_key TEXT,
    attempt_count INTEGER DEFAULT 1,
    final_status TEXT,
    final_http_status INTEGER,
    retry_reasons JSONB DEFAULT '[]'::jsonb,
    total_duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Funções RPC solicitadas pelas Edge Functions
CREATE OR REPLACE FUNCTION public.pause_instance(
    p_instance TEXT,
    p_reason TEXT,
    p_minutes INTEGER,
    p_trigger_count INTEGER DEFAULT 0
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_until TIMESTAMPTZ;
BEGIN
    v_until := now() + (p_minutes || ' minutes')::interval;
    
    INSERT INTO public.instance_processing_pauses (instance_name, paused_until, reason, trigger_count)
    VALUES (p_instance, v_until, p_reason, p_trigger_count)
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.unpause_instance(p_instance TEXT) 
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.instance_processing_pauses
    SET paused_until = now()
    WHERE instance_name = p_instance AND paused_until > now();
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Habilitar RLS e Criar Políticas
ALTER TABLE public.whatsapp_cloud_webhook_pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instance_processing_pauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instance_auth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_retry_metrics ENABLE ROW LEVEL SECURITY;

-- Políticas para Service Role (Edge Functions geralmente usam Service Role para escrita)
CREATE POLICY "Allow service role all access" ON public.whatsapp_cloud_webhook_pings FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role all access" ON public.processed_webhook_events FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role all access" ON public.instance_processing_pauses FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role all access" ON public.instance_auth_events FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role all access" ON public.evolution_retry_metrics FOR ALL TO service_role USING (true);

-- Políticas para Admin (visualização no Dashboard)
CREATE POLICY "Admins can view metrics" ON public.evolution_retry_metrics FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);

CREATE POLICY "Admins can manage pauses" ON public.instance_processing_pauses FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);
