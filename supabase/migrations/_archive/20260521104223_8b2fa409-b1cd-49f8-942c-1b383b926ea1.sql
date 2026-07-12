-- 1. Correção de colunas em qr_attempts
ALTER TABLE public.qr_attempts 
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- 2. Correção de colunas em evolution_health_logs
ALTER TABLE public.evolution_health_logs 
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS online_instances INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_instances INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS performed_at TIMESTAMPTZ DEFAULT now();

-- 3. Tabela de preferências de alerta de conexão
CREATE TABLE IF NOT EXISTS public.connection_alert_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    push_enabled BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT true,
    alert_on_degraded BOOLEAN DEFAULT true,
    alert_on_disconnected BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Suporte a Departamentos (conforme solicitado pelos erros de build)
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    whatsapp_mode TEXT DEFAULT 'standard', -- 'standard' ou 'official'
    whatsapp_api_key TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Habilitar RLS e Políticas
ALTER TABLE public.connection_alert_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own alert prefs" ON public.connection_alert_preferences 
FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage departments" ON public.departments 
FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);

CREATE POLICY "All authenticated can view departments" ON public.departments 
FOR SELECT TO authenticated USING (true);
