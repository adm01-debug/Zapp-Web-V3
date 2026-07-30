-- Tabela de logs de diagnóstico para Dev
CREATE TABLE IF NOT EXISTS public.dev_diagnostic_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    category TEXT NOT NULL,
    details JSONB,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ativar RLS
ALTER TABLE public.dev_diagnostic_logs ENABLE ROW LEVEL SECURITY;

-- Política: Apenas DEV pode ver e inserir logs de diagnóstico
CREATE POLICY "Dev access to diagnostic logs" 
ON public.dev_diagnostic_logs 
FOR ALL 
USING (public.has_role(auth.uid(), 'dev'))
WITH CHECK (public.has_role(auth.uid(), 'dev'));

-- Registrar a rota de Dev na matriz de permissões se não existir
INSERT INTO public.route_permissions (path, allowed_roles, description, is_system)
VALUES 
('/admin/dev-diagnostics', ARRAY['dev']::public.app_role[], 'Painel exclusivo de diagnóstico e logs brutos', true)
ON CONFLICT (path) DO UPDATE 
SET allowed_roles = ARRAY['dev']::public.app_role[], 
    is_system = true;
