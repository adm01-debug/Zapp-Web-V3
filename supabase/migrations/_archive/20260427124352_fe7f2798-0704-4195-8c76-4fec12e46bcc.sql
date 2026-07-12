
-- 1. Tabela de perfis de integração (1 ativo por vez)
CREATE TABLE IF NOT EXISTS public.integration_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('evolution','cloud')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  default_instance TEXT,
  display_phone TEXT,
  waba_name TEXT,
  detected_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  migration_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (migration_status IN ('pending','migrated','pending_credentials','noop','error')),
  migration_notes TEXT,
  migrated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_profiles_one_active
  ON public.integration_profiles (is_active) WHERE is_active = true;

ALTER TABLE public.integration_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins can manage integration profiles" ON public.integration_profiles;
CREATE POLICY "admins can manage integration profiles"
  ON public.integration_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "supervisors can view integration profiles" ON public.integration_profiles;
CREATE POLICY "supervisors can view integration profiles"
  ON public.integration_profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role));

CREATE OR REPLACE FUNCTION public.tg_integration_profiles_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_integration_profiles_updated ON public.integration_profiles;
CREATE TRIGGER trg_integration_profiles_updated
  BEFORE UPDATE ON public.integration_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_integration_profiles_updated();

-- 2. RPC de migração — idempotente
CREATE OR REPLACE FUNCTION public.rpc_migrate_whatsapp_integration()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evo_count INT := 0;
  v_evo_open  INT := 0;
  v_evo_default RECORD;
  v_cloud_phone TEXT;
  v_cloud_waba  TEXT;
  v_current_mode TEXT;
  v_chosen_provider TEXT;
  v_status TEXT;
  v_notes TEXT;
  v_signals JSONB;
  v_profile_id UUID;
  v_default_instance TEXT;
BEGIN
  -- Sinais Evolution: instâncias registradas localmente
  SELECT COUNT(*) INTO v_evo_count FROM public.whatsapp_connections;
  SELECT COUNT(*) INTO v_evo_open
    FROM public.whatsapp_connections
    WHERE COALESCE(status,'') IN ('open','connected');
  SELECT instance_id, name, phone_number, status
    INTO v_evo_default
    FROM public.whatsapp_connections
    WHERE is_default = true
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

  -- Sinais Cloud: settings já preenchidos
  SELECT value INTO v_cloud_phone FROM public.global_settings WHERE key = 'whatsapp_cloud_display_phone';
  SELECT value INTO v_cloud_waba  FROM public.global_settings WHERE key = 'whatsapp_cloud_waba_name';

  SELECT value INTO v_current_mode FROM public.global_settings WHERE key = 'whatsapp_mode';

  v_signals := jsonb_build_object(
    'evolution_instances_total', v_evo_count,
    'evolution_instances_open',  v_evo_open,
    'evolution_default_instance', COALESCE(v_evo_default.instance_id, NULL),
    'cloud_display_phone_set',   COALESCE(NULLIF(v_cloud_phone,''), NULL) IS NOT NULL,
    'cloud_waba_name_set',       COALESCE(NULLIF(v_cloud_waba,''),  NULL) IS NOT NULL,
    'previous_mode',             COALESCE(v_current_mode, 'unset')
  );

  -- Heurística: se já há instância Evolution conectada → unofficial.
  -- Se não há nada Evolution mas Cloud está preenchida → official.
  -- Caso contrário mantém o atual (default unofficial).
  IF v_evo_open > 0 OR v_evo_count > 0 THEN
    v_chosen_provider := 'evolution';
  ELSIF COALESCE(NULLIF(v_cloud_phone,''),'') <> '' THEN
    v_chosen_provider := 'cloud';
  ELSE
    v_chosen_provider := CASE WHEN v_current_mode = 'official' THEN 'cloud' ELSE 'evolution' END;
  END IF;

  v_default_instance := COALESCE(v_evo_default.instance_id, 'wpp2');

  -- Garante setting whatsapp_mode coerente
  INSERT INTO public.global_settings(key, value)
  VALUES ('whatsapp_mode', CASE WHEN v_chosen_provider = 'cloud' THEN 'official' ELSE 'unofficial' END)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now()
    WHERE public.global_settings.value IS DISTINCT FROM EXCLUDED.value;

  -- Status da migração
  IF v_chosen_provider = 'cloud' AND COALESCE(NULLIF(v_cloud_phone,''),'') = '' THEN
    v_status := 'pending_credentials';
    v_notes  := 'Modo oficial selecionado, mas faltam credenciais Meta (phone/WABA).';
  ELSIF v_chosen_provider = 'evolution' AND v_evo_count = 0 THEN
    v_status := 'pending_credentials';
    v_notes  := 'Modo Evolution selecionado, mas nenhuma instância registrada.';
  ELSE
    v_status := 'migrated';
    v_notes  := format('Provider %s ativado a partir dos sinais existentes.', v_chosen_provider);
  END IF;

  -- Desativa qualquer perfil ativo anterior
  UPDATE public.integration_profiles SET is_active = false WHERE is_active = true;

  -- Upsert do perfil ativo do provider escolhido
  SELECT id INTO v_profile_id
    FROM public.integration_profiles
    WHERE provider = v_chosen_provider
    ORDER BY updated_at DESC LIMIT 1;

  IF v_profile_id IS NULL THEN
    INSERT INTO public.integration_profiles
      (provider, is_active, default_instance, display_phone, waba_name,
       detected_signals, migration_status, migration_notes, migrated_at)
    VALUES
      (v_chosen_provider, true,
       CASE WHEN v_chosen_provider='evolution' THEN v_default_instance ELSE NULL END,
       NULLIF(v_cloud_phone,''), NULLIF(v_cloud_waba,''),
       v_signals, v_status, v_notes,
       CASE WHEN v_status = 'migrated' THEN now() ELSE NULL END)
    RETURNING id INTO v_profile_id;
  ELSE
    UPDATE public.integration_profiles
       SET is_active = true,
           default_instance = CASE WHEN v_chosen_provider='evolution' THEN v_default_instance ELSE default_instance END,
           display_phone = COALESCE(NULLIF(v_cloud_phone,''), display_phone),
           waba_name     = COALESCE(NULLIF(v_cloud_waba,''),  waba_name),
           detected_signals = v_signals,
           migration_status = v_status,
           migration_notes  = v_notes,
           migrated_at = CASE WHEN v_status = 'migrated' THEN now() ELSE migrated_at END
     WHERE id = v_profile_id;
  END IF;

  RETURN jsonb_build_object(
    'profile_id', v_profile_id,
    'provider',   v_chosen_provider,
    'mode',       CASE WHEN v_chosen_provider='cloud' THEN 'official' ELSE 'unofficial' END,
    'status',     v_status,
    'notes',      v_notes,
    'signals',    v_signals
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_migrate_whatsapp_integration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_migrate_whatsapp_integration() TO authenticated;

-- 3. Leitura do perfil ativo
CREATE OR REPLACE FUNCTION public.rpc_get_active_integration_profile()
RETURNS public.integration_profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.integration_profiles WHERE is_active = true LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_active_integration_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_active_integration_profile() TO authenticated;

-- 4. Auto-roda a migração agora (idempotente)
SELECT public.rpc_migrate_whatsapp_integration();
