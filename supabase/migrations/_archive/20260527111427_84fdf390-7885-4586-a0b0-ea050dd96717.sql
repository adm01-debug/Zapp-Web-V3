-- Ensure permissions table exists
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ensure role_permissions table exists
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role public.app_role NOT NULL,
    permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(role, permission_id)
);

-- Grant access
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
GRANT ALL ON public.role_permissions TO service_role;

-- Enable RLS
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Simple policies for viewing
DROP POLICY IF EXISTS "Anyone authenticated can view permissions" ON public.permissions;
CREATE POLICY "Anyone authenticated can view permissions" ON public.permissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Anyone authenticated can view role_permissions" ON public.role_permissions;
CREATE POLICY "Anyone authenticated can view role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);

-- Insert Permissions
INSERT INTO public.permissions (name, description, category) VALUES
('inbox.view_mine', 'Ver apenas as próprias conversas', 'inbox'),
('inbox.view_department', 'Ver conversas de todo o departamento', 'inbox'),
('inbox.view_all', 'Ver conversas de todos os departamentos', 'inbox'),
('dashboard.view', 'Acessar o dashboard principal', 'dashboard'),
('contacts.view', 'Visualizar lista de contatos', 'contacts'),
('contacts.edit', 'Editar informações de contatos', 'contacts'),
('reports.view', 'Visualizar relatórios e métricas', 'reports'),
('settings.view', 'Visualizar configurações do sistema', 'settings'),
('settings.edit', 'Alterar configurações do sistema', 'settings')
ON CONFLICT (name) DO UPDATE SET 
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Assign permissions to roles
DO $$
BEGIN
    -- Agent
    INSERT INTO public.role_permissions (role, permission_id) 
    SELECT 'agent'::public.app_role, id FROM public.permissions WHERE name IN ('inbox.view_mine', 'dashboard.view', 'contacts.view')
    ON CONFLICT DO NOTHING;
    
    -- Supervisor
    INSERT INTO public.role_permissions (role, permission_id) 
    SELECT 'supervisor'::public.app_role, id FROM public.permissions WHERE name IN ('inbox.view_mine', 'inbox.view_department', 'dashboard.view', 'contacts.view', 'contacts.edit', 'reports.view')
    ON CONFLICT DO NOTHING;
    
    -- Manager
    INSERT INTO public.role_permissions (role, permission_id) 
    SELECT 'manager'::public.app_role, id FROM public.permissions WHERE name IN ('inbox.view_mine', 'inbox.view_department', 'inbox.view_all', 'dashboard.view', 'contacts.view', 'contacts.edit', 'reports.view', 'settings.view')
    ON CONFLICT DO NOTHING;
    
    -- Admin & Dev
    INSERT INTO public.role_permissions (role, permission_id) 
    SELECT 'admin'::public.app_role, id FROM public.permissions
    ON CONFLICT DO NOTHING;
    
    INSERT INTO public.role_permissions (role, permission_id) 
    SELECT 'dev'::public.app_role, id FROM public.permissions
    ON CONFLICT DO NOTHING;
END $$;
