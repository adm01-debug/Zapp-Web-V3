-- Tabela de pausas por instância
CREATE TABLE IF NOT EXISTS public.instance_processing_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name text NOT NULL,
  paused_until timestamptz NOT NULL,
  reason text NOT NULL,
  trigger_count integer NOT NULL DEFAULT 0,
  paused_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  auto_paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices: (instance_name, paused_until) para consulta rápida do "ainda em pausa"
CREATE INDEX IF NOT EXISTS idx_ipp_instance_active
  ON public.instance_processing_pauses (instance_name, paused_until DESC);
CREATE INDEX IF NOT EXISTS idx_ipp_paused_until
  ON public.instance_processing_pauses (paused_until DESC);

-- Apenas uma pausa "ativa" por instância (paused_until > now()) — garantida via lookup,
-- não constraint, porque NOW() não é imutável.

ALTER TABLE public.instance_processing_pauses ENABLE ROW LEVEL SECURITY;

-- Admins e supervisores podem tudo
CREATE POLICY "ipp_admin_all"
  ON public.instance_processing_pauses
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- Trigger updated_at
CREATE TRIGGER trg_ipp_updated_at
  BEFORE UPDATE ON public.instance_processing_pauses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função: instância está pausada agora?
CREATE OR REPLACE FUNCTION public.is_instance_paused(p_instance text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.instance_processing_pauses
    WHERE instance_name = p_instance
      AND paused_until > now()
  );
$$;

-- Função: pausar manualmente (admin)
CREATE OR REPLACE FUNCTION public.pause_instance(
  p_instance text,
  p_reason text,
  p_minutes integer DEFAULT 15,
  p_trigger_count integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  IF p_minutes <= 0 OR p_minutes > 1440 THEN
    RAISE EXCEPTION 'p_minutes must be between 1 and 1440';
  END IF;

  INSERT INTO public.instance_processing_pauses (
    instance_name, paused_until, reason, trigger_count, paused_by, auto_paused
  )
  VALUES (
    p_instance,
    now() + (p_minutes || ' minutes')::interval,
    COALESCE(NULLIF(trim(p_reason), ''), 'manual_pause'),
    GREATEST(0, COALESCE(p_trigger_count, 0)),
    auth.uid(),
    false
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'instance_paused',
    'instance_processing_pauses',
    v_id::text,
    jsonb_build_object(
      'instance', p_instance,
      'minutes', p_minutes,
      'reason', p_reason,
      'trigger_count', p_trigger_count
    )
  );

  RETURN v_id;
END;
$$;

-- Função: retomar manualmente (encerra TODAS as pausas ativas da instância)
CREATE OR REPLACE FUNCTION public.unpause_instance(p_instance text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  UPDATE public.instance_processing_pauses
     SET paused_until = now(),
         updated_at = now()
   WHERE instance_name = p_instance
     AND paused_until > now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'instance_unpaused',
      'instance_processing_pauses',
      p_instance,
      jsonb_build_object('instance', p_instance, 'cleared', v_count)
    );
  END IF;

  RETURN v_count;
END;
$$;

-- Função: auto-pausar (chamada pelas edge functions com service role)
CREATE OR REPLACE FUNCTION public.auto_pause_instance_on_auth_spike(
  p_instance text,
  p_reason text,
  p_trigger_count integer,
  p_minutes integer DEFAULT 15
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_existing uuid;
BEGIN
  IF p_minutes <= 0 OR p_minutes > 1440 THEN
    p_minutes := 15;
  END IF;

  -- Se já há pausa ativa, estende-a (não cria duplicata)
  SELECT id INTO v_existing
    FROM public.instance_processing_pauses
   WHERE instance_name = p_instance
     AND paused_until > now()
   ORDER BY paused_until DESC
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.instance_processing_pauses
       SET paused_until = GREATEST(paused_until, now() + (p_minutes || ' minutes')::interval),
           trigger_count = trigger_count + GREATEST(0, COALESCE(p_trigger_count, 0)),
           reason = p_reason,
           updated_at = now()
     WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO public.instance_processing_pauses (
    instance_name, paused_until, reason, trigger_count, auto_paused
  )
  VALUES (
    p_instance,
    now() + (p_minutes || ' minutes')::interval,
    p_reason,
    GREATEST(0, COALESCE(p_trigger_count, 0)),
    true
  )
  RETURNING id INTO v_id;

  -- Audit log sem user_id (auto)
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    NULL,
    'instance_auto_paused',
    'instance_processing_pauses',
    v_id::text,
    jsonb_build_object(
      'instance', p_instance,
      'minutes', p_minutes,
      'reason', p_reason,
      'trigger_count', p_trigger_count
    )
  );

  RETURN v_id;
END;
$$;

-- Concede execução
GRANT EXECUTE ON FUNCTION public.is_instance_paused(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pause_instance(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpause_instance(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_pause_instance_on_auth_spike(text, text, integer, integer) TO service_role;