
CREATE TABLE IF NOT EXISTS public.route_permissions (
  path text PRIMARY KEY,
  allowed_roles app_role[] NOT NULL DEFAULT '{}',
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.route_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin/dev view route_permissions"
ON public.route_permissions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dev'));

CREATE POLICY "admin/dev insert route_permissions"
ON public.route_permissions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dev'));

CREATE POLICY "admin/dev update route_permissions"
ON public.route_permissions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dev'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dev'));

CREATE POLICY "admin/dev delete route_permissions"
ON public.route_permissions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dev'));

-- Authenticated users can read the role list for their own access checks
CREATE POLICY "authenticated read for access checks"
ON public.route_permissions FOR SELECT TO authenticated
USING (true);

CREATE TRIGGER trg_route_permissions_updated_at
BEFORE UPDATE ON public.route_permissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: roles allowed for a path (returns empty if path not registered)
CREATE OR REPLACE FUNCTION public.get_route_roles(_path text)
RETURNS app_role[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT allowed_roles FROM public.route_permissions WHERE path = _path
$$;

-- Seed current routes
INSERT INTO public.route_permissions (path, allowed_roles, description, is_system) VALUES
  ('/queue/:id',                 ARRAY[]::app_role[],                                'Detalhes da fila (qualquer autenticado)', false),
  ('/queues/comparison',         ARRAY[]::app_role[],                                'Comparação de filas', false),
  ('/sla',                       ARRAY[]::app_role[],                                'Dashboard SLA', false),
  ('/sla/history',               ARRAY[]::app_role[],                                'Histórico SLA', false),
  ('/sla/preferences',           ARRAY[]::app_role[],                                'Preferências de alertas SLA', false),
  ('/sla/alerts',                ARRAY[]::app_role[],                                'Histórico de alertas SLA', false),
  ('/debug/send-status-bus',     ARRAY['dev']::app_role[],                           'Debug send status bus', false),
  ('/debug/realtime-fanout',     ARRAY['dev']::app_role[],                           'Debug realtime fanout', false),
  ('/admin/roles',               ARRAY['admin','dev']::app_role[],                   'Gestão de papéis', false),
  ('/admin/departments',         ARRAY['admin','dev']::app_role[],                   'Departamentos', false),
  ('/admin/rate-limit',          ARRAY['admin','dev']::app_role[],                   'Rate limit', false),
  ('/admin/hmac-selftest',       ARRAY['admin','supervisor','dev']::app_role[],      'HMAC self-test', false),
  ('/admin/operations',          ARRAY['admin','supervisor','dev']::app_role[],      'Operations Hub', false),
  ('/admin/channels',            ARRAY['admin','supervisor','dev']::app_role[],      'Canais', false),
  ('/admin/queues',              ARRAY['admin','supervisor','dev']::app_role[],      'Filas', false),
  ('/admin/providers',           ARRAY['admin','supervisor','dev']::app_role[],      'Provedores', false),
  ('/admin/failed-auth-messages',ARRAY['admin','dev']::app_role[],                   'Mensagens com falha de auth', false),
  ('/admin/route-permissions',   ARRAY['admin','dev']::app_role[],                   'Gestão de permissões de rota', true)
ON CONFLICT (path) DO NOTHING;
