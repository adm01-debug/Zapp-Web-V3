-- Tipo de provedor
DO $$ BEGIN
  CREATE TYPE public.provider_type AS ENUM ('evolution','wppconnect','baileys','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1) Configurações de provedores
CREATE TABLE IF NOT EXISTS public.provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  provider_type public.provider_type NOT NULL,
  base_url text NOT NULL,
  auth_token text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('online','degraded','offline','unknown')),
  last_ping_at timestamptz,
  last_ping_latency_ms integer,
  last_error text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_configs_active ON public.provider_configs(is_active, priority);

ALTER TABLE public.provider_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage providers"
  ON public.provider_configs FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated read providers (sem token)"
  ON public.provider_configs FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER provider_configs_updated_at
  BEFORE UPDATE ON public.provider_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Roteamento por canal: primário + fallback
CREATE TABLE IF NOT EXISTS public.channel_provider_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_connection_id uuid REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  primary_provider_id uuid NOT NULL REFERENCES public.provider_configs(id) ON DELETE RESTRICT,
  fallback_provider_id uuid REFERENCES public.provider_configs(id) ON DELETE SET NULL,
  current_provider_id uuid REFERENCES public.provider_configs(id) ON DELETE SET NULL,
  switched_at timestamptz,
  switched_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_channel_ref CHECK (
    (channel_connection_id IS NOT NULL)::int + (whatsapp_connection_id IS NOT NULL)::int = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_route_channel
  ON public.channel_provider_routes(channel_connection_id) WHERE channel_connection_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_route_wpp
  ON public.channel_provider_routes(whatsapp_connection_id) WHERE whatsapp_connection_id IS NOT NULL;

ALTER TABLE public.channel_provider_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage routes"
  ON public.channel_provider_routes FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated read routes"
  ON public.channel_provider_routes FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER channel_provider_routes_updated_at
  BEFORE UPDATE ON public.channel_provider_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Sessões de provedor (uma por canal+provedor enquanto viva)
CREATE TABLE IF NOT EXISTS public.provider_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.provider_configs(id) ON DELETE CASCADE,
  channel_connection_id uuid REFERENCES public.channel_connections(id) ON DELETE SET NULL,
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'connecting'
    CHECK (status IN ('connecting','connected','degraded','disconnected','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  last_heartbeat_at timestamptz DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_provider_sessions_open
  ON public.provider_sessions(provider_id, status) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_provider_sessions_channel
  ON public.provider_sessions(channel_connection_id, started_at DESC);

ALTER TABLE public.provider_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sessions"
  ON public.provider_sessions FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated read sessions"
  ON public.provider_sessions FOR SELECT TO authenticated
  USING (true);

-- 4) Logs por sessão
CREATE TABLE IF NOT EXISTS public.provider_session_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.provider_sessions(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.provider_configs(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  event text NOT NULL,  -- connect, disconnect, send, recv, switchover, ping, error, healthcheck
  message text,
  latency_ms integer,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_session_logs_session
  ON public.provider_session_logs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_session_logs_provider
  ON public.provider_session_logs(provider_id, created_at DESC);

ALTER TABLE public.provider_session_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage provider logs"
  ON public.provider_session_logs FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated read provider logs"
  ON public.provider_session_logs FOR SELECT TO authenticated
  USING (true);

-- 5) RPC: painel de provedores com agregados de sessão
CREATE OR REPLACE FUNCTION public.rpc_provider_panel()
RETURNS TABLE (
  provider_id uuid,
  name text,
  provider_type public.provider_type,
  base_url text,
  is_active boolean,
  priority integer,
  status text,
  last_ping_at timestamptz,
  last_ping_latency_ms integer,
  last_error text,
  open_sessions bigint,
  events_24h bigint,
  errors_24h bigint,
  routes_primary bigint,
  routes_fallback bigint,
  routes_active bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.name, p.provider_type, p.base_url, p.is_active, p.priority,
    p.status, p.last_ping_at, p.last_ping_latency_ms, p.last_error,
    COALESCE((SELECT COUNT(*) FROM provider_sessions s
              WHERE s.provider_id = p.id AND s.ended_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM provider_session_logs l
              WHERE l.provider_id = p.id AND l.created_at > now() - interval '24 hours'), 0),
    COALESCE((SELECT COUNT(*) FROM provider_session_logs l
              WHERE l.provider_id = p.id AND l.level = 'error'
                AND l.created_at > now() - interval '24 hours'), 0),
    COALESCE((SELECT COUNT(*) FROM channel_provider_routes r WHERE r.primary_provider_id = p.id), 0),
    COALESCE((SELECT COUNT(*) FROM channel_provider_routes r WHERE r.fallback_provider_id = p.id), 0),
    COALESCE((SELECT COUNT(*) FROM channel_provider_routes r WHERE r.current_provider_id = p.id), 0)
  FROM provider_configs p
  ORDER BY p.priority ASC, p.name ASC;
END;
$$;

-- 6) RPC: timeline de logs por sessão (com nome do provedor)
CREATE OR REPLACE FUNCTION public.rpc_provider_session_timeline(
  p_provider_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  log_id uuid,
  session_id uuid,
  provider_id uuid,
  provider_name text,
  level text,
  event text,
  message text,
  latency_ms integer,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  SELECT l.id, l.session_id, l.provider_id, p.name,
         l.level, l.event, l.message, l.latency_ms, l.created_at
  FROM provider_session_logs l
  JOIN provider_configs p ON p.id = l.provider_id
  WHERE (p_provider_id IS NULL OR l.provider_id = p_provider_id)
    AND (p_session_id IS NULL OR l.session_id = p_session_id)
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
END;
$$;

-- 7) Trigger: log automático de switchover quando current_provider_id muda
CREATE OR REPLACE FUNCTION public.fn_log_route_switchover()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.current_provider_id IS DISTINCT FROM NEW.current_provider_id
     AND NEW.current_provider_id IS NOT NULL THEN
    INSERT INTO public.provider_session_logs (provider_id, level, event, message, payload)
    VALUES (
      NEW.current_provider_id,
      'warn',
      'switchover',
      COALESCE(NEW.switched_reason, 'route changed'),
      jsonb_build_object(
        'from_provider', OLD.current_provider_id,
        'to_provider', NEW.current_provider_id,
        'channel_connection_id', NEW.channel_connection_id,
        'whatsapp_connection_id', NEW.whatsapp_connection_id
      )
    );
    NEW.switched_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_route_switchover ON public.channel_provider_routes;
CREATE TRIGGER trg_log_route_switchover
  BEFORE UPDATE ON public.channel_provider_routes
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_route_switchover();