-- Valida que E2E_USER_EMAIL existe, está ativo e tem permissão de CRM.
-- Falha explicitamente (RAISE EXCEPTION) se qualquer condição não for atendida,
-- fazendo o job de CI abortar com exit code não-zero.
--
-- Uso:
--   psql "$SUPABASE_DB_URL" -v email="'e2e-bot@zappweb.test'" \
--     -f scripts/validate-e2e-user.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_email        text := :'email';
  v_user_id      uuid;
  v_is_active    boolean;
  v_confirmed    timestamptz;
  v_banned_until timestamptz;
  v_role_count   integer;
  v_has_crm      boolean;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'E2E_VALIDATION_FAIL: parâmetro :email vazio';
  END IF;

  -- 1) usuário existe em auth.users, confirmado, não banido
  SELECT id, email_confirmed_at, banned_until
    INTO v_user_id, v_confirmed, v_banned_until
    FROM auth.users
   WHERE email = v_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'E2E_VALIDATION_FAIL: usuário % não existe em auth.users. Rode o workflow seed-e2e-user antes.', v_email;
  END IF;

  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'E2E_VALIDATION_FAIL: usuário % existe mas email_confirmed_at é NULL. Login vai falhar.', v_email;
  END IF;

  IF v_banned_until IS NOT NULL AND v_banned_until > now() THEN
    RAISE EXCEPTION 'E2E_VALIDATION_FAIL: usuário % está banido até %.', v_email, v_banned_until;
  END IF;

  -- 2) profile ativo em zapp.profiles
  SELECT is_active INTO v_is_active
    FROM zapp.profiles
   WHERE user_id = v_user_id;

  IF v_is_active IS NULL THEN
    RAISE EXCEPTION 'E2E_VALIDATION_FAIL: profile zapp.profiles ausente para %.', v_email;
  END IF;

  IF v_is_active IS FALSE THEN
    RAISE EXCEPTION 'E2E_VALIDATION_FAIL: profile de % marcado como inativo (is_active=false).', v_email;
  END IF;

  -- 3) roles com acesso a CRM: agent, supervisor ou admin
  SELECT count(*),
         bool_or(role::text IN ('agent','supervisor','admin'))
    INTO v_role_count, v_has_crm
    FROM zapp.user_roles
   WHERE user_id = v_user_id;

  IF v_role_count = 0 THEN
    RAISE EXCEPTION 'E2E_VALIDATION_FAIL: usuário % não tem nenhuma role em zapp.user_roles.', v_email;
  END IF;

  IF v_has_crm IS NOT TRUE THEN
    RAISE EXCEPTION 'E2E_VALIDATION_FAIL: usuário % não possui role de CRM (agent/supervisor/admin).', v_email;
  END IF;

  -- 4) smoke check: existe alguma policy que autorize esse role a ler contacts
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'zapp' AND tablename = 'contacts'
  ) THEN
    RAISE EXCEPTION 'E2E_VALIDATION_FAIL: tabela zapp.contacts sem RLS policies — acesso via Data API bloqueado.';
  END IF;

  RAISE NOTICE 'E2E_VALIDATION_OK: % (id=%) ativo, % role(s), CRM=%',
    v_email, v_user_id, v_role_count, v_has_crm;
END $$;
