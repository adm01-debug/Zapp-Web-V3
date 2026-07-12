-- 1. Atualização da tabela whatsapp_connections com campos de auto-reconexão
ALTER TABLE public.whatsapp_connections 
ADD COLUMN IF NOT EXISTS auto_reconnect_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS reconnect_interval_seconds INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS max_reconnect_attempts INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS loop_protection_active BOOLEAN DEFAULT false;

-- 2. Tabela de Logs de Reconexão
CREATE TABLE IF NOT EXISTS public.reconnection_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
    attempt_number INTEGER,
    status TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de Histórico de QR Code
CREATE TABLE IF NOT EXISTS public.qr_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
    status TEXT,
    error_code TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    connected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de Credenciais da API Oficial
CREATE TABLE IF NOT EXISTS public.whatsapp_official_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID UNIQUE REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
    app_id TEXT,
    app_secret TEXT,
    access_token TEXT,
    phone_number_id TEXT,
    waba_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabela de Credenciais da Evolution API
CREATE TABLE IF NOT EXISTS public.evolution_instance_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID UNIQUE REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
    instance_name TEXT NOT NULL,
    instance_token TEXT,
    webhook_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.reconnection_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_official_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_instance_credentials ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Allow service role all access" ON public.reconnection_logs FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role all access" ON public.qr_attempts FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role all access" ON public.whatsapp_official_credentials FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role all access" ON public.evolution_instance_credentials FOR ALL TO service_role USING (true);

-- Admins podem ver logs e credenciais
CREATE POLICY "Admins can view connection logs" ON public.reconnection_logs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);

CREATE POLICY "Admins can view qr attempts" ON public.qr_attempts FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);

CREATE POLICY "Admins can manage official credentials" ON public.whatsapp_official_credentials FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);

CREATE POLICY "Admins can manage evolution credentials" ON public.evolution_instance_credentials FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);
