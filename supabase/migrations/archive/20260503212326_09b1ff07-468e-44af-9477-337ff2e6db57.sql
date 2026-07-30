-- Tabela para gerenciar instâncias de forma granular
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'evolution', -- ex: 'evolution', 'official', 'cloud_api'
    api_url TEXT,
    api_token TEXT, -- Sensitive, mas RLS protege
    status TEXT NOT NULL DEFAULT 'disconnected',
    config JSONB DEFAULT '{}'::jsonb,
    owner_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Instâncias visíveis para todos os autenticados" ON public.whatsapp_instances
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Apenas admin pode gerenciar instâncias" ON public.whatsapp_instances
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dev')
        )
    );

-- Relacionar conexões com instâncias (se aplicável)
ALTER TABLE public.whatsapp_connections 
ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_whatsapp_instances_updated_at ON public.whatsapp_instances;
CREATE TRIGGER update_whatsapp_instances_updated_at
    BEFORE UPDATE ON public.whatsapp_instances
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();