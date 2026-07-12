-- Create route_permissions table
CREATE TABLE public.route_permissions (
    path TEXT PRIMARY KEY,
    allowed_roles TEXT[] NOT NULL DEFAULT '{}',
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Grants
GRANT SELECT ON public.route_permissions TO anon, authenticated;
GRANT ALL ON public.route_permissions TO service_role;

-- RLS
ALTER TABLE public.route_permissions ENABLE ROW LEVEL SECURITY;

-- Read policy (everyone can read to allow routing)
CREATE POLICY "Route permissions are viewable by everyone" 
ON public.route_permissions 
FOR SELECT 
USING (true);

-- Manage policy (only admins and devs)
CREATE POLICY "Route permissions are manageable by admins and devs" 
ON public.route_permissions 
FOR ALL 
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() 
        AND role::text IN ('admin', 'dev')
    )
);

-- Seed some default system routes
INSERT INTO public.route_permissions (path, allowed_roles, description, is_system)
VALUES 
    ('/admin/roles', ARRAY['admin', 'dev'], 'Role management', true),
    ('/admin/route-permissions', ARRAY['admin', 'dev'], 'Route permission management', true),
    ('/admin/dev-diagnostics', ARRAY['dev'], 'Developer diagnostics', true);
