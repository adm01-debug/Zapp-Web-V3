-- ============================================================
-- SERVICE CHANNELS — Canais de atendimento multicanal
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT,
  channel_type TEXT NOT NULL DEFAULT 'whatsapp',     -- whatsapp | instagram | telegram | email | webchat
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  default_queue_id UUID REFERENCES public.queues(id) ON DELETE SET NULL,
  routing_mode TEXT NOT NULL DEFAULT 'manual',       -- manual | sticky | rules | round_robin
  sticky_enabled BOOLEAN NOT NULL DEFAULT false,
  sticky_ttl_hours INTEGER NOT NULL DEFAULT 24 CHECK (sticky_ttl_hours BETWEEN 1 AND 720),
  status TEXT NOT NULL DEFAULT 'active',             -- active | paused | disabled
  is_default BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  icon TEXT,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  paused_at TIMESTAMPTZ,
  paused_reason TEXT,
  disabled_at TIMESTAMPTZ,
  disabled_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_channels_status_chk CHECK (status IN ('active','paused','disabled')),
  CONSTRAINT service_channels_type_chk CHECK (channel_type IN ('whatsapp','instagram','telegram','email','webchat')),
  CONSTRAINT service_channels_routing_chk CHECK (routing_mode IN ('manual','sticky','rules','round_robin'))
);

CREATE INDEX IF NOT EXISTS idx_svc_channels_status ON public.service_channels(status);
CREATE INDEX IF NOT EXISTS idx_svc_channels_type ON public.service_channels(channel_type);
CREATE INDEX IF NOT EXISTS idx_svc_channels_wpp ON public.service_channels(whatsapp_connection_id) WHERE whatsapp_connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_svc_channels_queue ON public.service_channels(default_queue_id) WHERE default_queue_id IS NOT NULL;

-- Garantir 1 default por channel_type
CREATE UNIQUE INDEX IF NOT EXISTS idx_svc_channels_default_per_type
  ON public.service_channels(channel_type)
  WHERE is_default = true;

-- updated_at
CREATE TRIGGER trg_svc_channels_updated
BEFORE UPDATE ON public.service_channels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.service_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "svc_channels_select_admin_supervisor"
ON public.service_channels FOR SELECT TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "svc_channels_admin_insert"
ON public.service_channels FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "svc_channels_admin_update"
ON public.service_channels FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "svc_channels_admin_delete"
ON public.service_channels FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- RPCs
-- ============================================================

-- Upsert (create + edit)
CREATE OR REPLACE FUNCTION public.rpc_upsert_service_channel(
  p_id UUID DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_display_name TEXT DEFAULT NULL,
  p_channel_type TEXT DEFAULT 'whatsapp',
  p_whatsapp_connection_id UUID DEFAULT NULL,
  p_default_queue_id UUID DEFAULT NULL,
  p_routing_mode TEXT DEFAULT 'manual',
  p_sticky_enabled BOOLEAN DEFAULT false,
  p_sticky_ttl_hours INTEGER DEFAULT 24,
  p_is_default BOOLEAN DEFAULT false,
  p_description TEXT DEFAULT NULL,
  p_icon TEXT DEFAULT NULL,
  p_color TEXT DEFAULT '#3B82F6'
)
RETURNS public.service_channels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.service_channels;
  v_old public.service_channels;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  -- Se este vai ser default, desmarca os outros do mesmo tipo
  IF p_is_default THEN
    UPDATE public.service_channels
       SET is_default = false
     WHERE channel_type = p_channel_type
       AND (p_id IS NULL OR id <> p_id)
       AND is_default = true;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.service_channels (
      name, display_name, channel_type, whatsapp_connection_id,
      default_queue_id, routing_mode, sticky_enabled, sticky_ttl_hours,
      is_default, description, icon, color, created_by
    ) VALUES (
      trim(p_name), p_display_name, p_channel_type, p_whatsapp_connection_id,
      p_default_queue_id, p_routing_mode, p_sticky_enabled, p_sticky_ttl_hours,
      p_is_default, p_description, p_icon, p_color, auth.uid()
    )
    RETURNING * INTO v_row;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'service_channel_created', 'service_channels', v_row.id::text,
            jsonb_build_object('name', v_row.name, 'type', v_row.channel_type));
  ELSE
    SELECT * INTO v_old FROM public.service_channels WHERE id = p_id;
    IF v_old.id IS NULL THEN RAISE EXCEPTION 'channel not found'; END IF;

    UPDATE public.service_channels SET
      name = trim(p_name),
      display_name = p_display_name,
      channel_type = p_channel_type,
      whatsapp_connection_id = p_whatsapp_connection_id,
      default_queue_id = p_default_queue_id,
      routing_mode = p_routing_mode,
      sticky_enabled = p_sticky_enabled,
      sticky_ttl_hours = p_sticky_ttl_hours,
      is_default = p_is_default,
      description = p_description,
      icon = p_icon,
      color = p_color
    WHERE id = p_id
    RETURNING * INTO v_row;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'service_channel_updated', 'service_channels', v_row.id::text,
            jsonb_build_object(
              'before', jsonb_build_object('name', v_old.name, 'queue', v_old.default_queue_id, 'sticky', v_old.sticky_enabled),
              'after',  jsonb_build_object('name', v_row.name, 'queue', v_row.default_queue_id, 'sticky', v_row.sticky_enabled)
            ));
  END IF;

  RETURN v_row;
END;
$$;

-- Pausar (esconde mas mantém conectado)
CREATE OR REPLACE FUNCTION public.rpc_pause_service_channel(p_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS public.service_channels
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.service_channels;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE public.service_channels SET
    status = 'paused',
    paused_at = now(),
    paused_reason = NULLIF(trim(COALESCE(p_reason,'')), '')
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'channel not found'; END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'service_channel_paused', 'service_channels', p_id::text,
          jsonb_build_object('reason', p_reason));

  RETURN v_row;
END;
$$;

-- Desativar (esconde + sinaliza disconnect — caller faz a chamada à Evolution API)
CREATE OR REPLACE FUNCTION public.rpc_disable_service_channel(p_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS public.service_channels
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.service_channels;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE public.service_channels SET
    status = 'disabled',
    disabled_at = now(),
    disabled_reason = NULLIF(trim(COALESCE(p_reason,'')), '')
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'channel not found'; END IF;

  -- Marca conexão whatsapp como desconectada (se houver)
  IF v_row.whatsapp_connection_id IS NOT NULL THEN
    UPDATE public.whatsapp_connections
       SET status = 'disconnected', updated_at = now()
     WHERE id = v_row.whatsapp_connection_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'service_channel_disabled', 'service_channels', p_id::text,
          jsonb_build_object('reason', p_reason, 'wpp_connection', v_row.whatsapp_connection_id));

  RETURN v_row;
END;
$$;

-- Reativar
CREATE OR REPLACE FUNCTION public.rpc_reactivate_service_channel(p_id UUID)
RETURNS public.service_channels
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.service_channels;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE public.service_channels SET
    status = 'active',
    paused_at = NULL,
    paused_reason = NULL,
    disabled_at = NULL,
    disabled_reason = NULL
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'channel not found'; END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'service_channel_reactivated', 'service_channels', p_id::text, '{}'::jsonb);

  RETURN v_row;
END;
$$;

-- Purge sticky assignments do canal
CREATE OR REPLACE FUNCTION public.rpc_purge_channel_sticky(p_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wpp_id UUID;
  v_count INTEGER := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT whatsapp_connection_id INTO v_wpp_id
    FROM public.service_channels WHERE id = p_id;

  IF v_wpp_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.sticky_assignments
   WHERE channel_connection_id = v_wpp_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'service_channel_sticky_purged', 'service_channels', p_id::text,
          jsonb_build_object('purged_count', v_count));

  RETURN v_count;
END;
$$;

-- Listar canais (com filtros)
CREATE OR REPLACE FUNCTION public.rpc_list_service_channels(
  p_status TEXT DEFAULT NULL,
  p_channel_type TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS SETOF public.service_channels
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  SELECT * FROM public.service_channels sc
   WHERE (p_status IS NULL OR sc.status = p_status)
     AND (p_channel_type IS NULL OR sc.channel_type = p_channel_type)
     AND (p_search IS NULL OR sc.name ILIKE '%'||p_search||'%' OR sc.display_name ILIKE '%'||p_search||'%')
   ORDER BY sc.is_default DESC, sc.name ASC;
END;
$$;