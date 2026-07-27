-- Create route_permissions table
CREATE TABLE IF NOT EXISTS public.route_permissions (
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
DROP POLICY IF EXISTS "Route permissions are viewable by everyone" ON public.route_permissions;
CREATE POLICY "Route permissions are viewable by everyone"
ON public.route_permissions
FOR SELECT
USING (true);

-- Manage policy (only admins and devs)
DROP POLICY IF EXISTS "Route permissions are manageable by admins and devs" ON public.route_permissions;
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
-- allowed_roles column type may be app_role[] (cast to handle both text[] and enum[])
INSERT INTO public.route_permissions (path, allowed_roles, description, is_system)
SELECT path, allowed_roles, description, is_system FROM (VALUES
    ('/admin/roles',              ARRAY['admin','dev']::text[],  'Role management', true),
    ('/admin/route-permissions',  ARRAY['admin','dev']::text[],  'Route permission management', true),
    ('/admin/dev-diagnostics',    ARRAY['dev']::text[],          'Developer diagnostics', true)
) AS v(path, allowed_roles, description, is_system)
ON CONFLICT (path) DO NOTHING;
