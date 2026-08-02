-- R28d: Fix bug critico em zapp.handle_new_user()
-- BUG: INSERT INTO zapp.agent_stats (profile_id) VALUES (NEW.id) usa NEW.id (auth user UUID)
-- mas a FK agent_stats_profile_id_fkey aponta para zapp.profiles(id) (UUID diferente = gen_random_uuid())
-- RESULTADO: qualquer criacao de usuario via Auth Admin API falhava com FK violation
-- FIX: remover o INSERT duplicado de agent_stats -- o trigger on_profile_created_init_stats
--      (init_agent_stats) ja insere corretamente com NEW.id = profiles.id apos INSERT de profiles

CREATE OR REPLACE FUNCTION zapp.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO zapp.profiles (user_id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'agent')
  );

  -- REMOVIDO (era bug): INSERT INTO zapp.agent_stats (profile_id) VALUES (NEW.id)
  -- NEW.id aqui eh auth.users.id, nao zapp.profiles.id (sao UUIDs diferentes!)
  -- O trigger on_profile_created_init_stats -> init_agent_stats() ja faz corretamente

  INSERT INTO zapp.user_settings (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error for %: %', NEW.email, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.handle_new_user() FROM PUBLIC;

DO $$
DECLARE v_body text;
BEGIN
  SELECT prosrc INTO v_body FROM pg_proc
  WHERE proname='handle_new_user' AND pronamespace='zapp'::regnamespace;
  IF v_body ILIKE '%INSERT INTO zapp.agent_stats (profile_id) VALUES (NEW.id)%'
     AND v_body NOT ILIKE '%REMOVIDO%' THEN
    RAISE EXCEPTION 'FIX FALHOU: linha bugada ainda presente';
  END IF;
  RAISE NOTICE 'R28d: handle_new_user corrigido';
END $$;
