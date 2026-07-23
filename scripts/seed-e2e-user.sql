-- Seed do usuário E2E com permissões de CRM no Supabase Self-Hosted (schema zapp).
--
-- Idempotente: pode rodar quantas vezes quiser. Cria/atualiza:
--   1. auth.users (email + senha bcrypt, email_confirmed)
--   2. zapp.profiles (ativo, role agent, access_level agent)
--   3. zapp.user_roles: 'agent' + 'supervisor' (garante CRUD de CRM)
--
-- Uso (na VPS):
--   psql "$SUPABASE_DB_URL" \
--     -v email="'e2e-bot@zappweb.test'" \
--     -v password="'change-me-in-ci'" \
--     -f scripts/seed-e2e-user.sql
--
-- Requer: extensão pgcrypto habilitada (Supabase já habilita por padrão).

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_email     text := :'email';
  v_password  text := :'password';
  v_user_id   uuid;
  v_encrypted text;
BEGIN
  IF v_email IS NULL OR v_password IS NULL THEN
    RAISE EXCEPTION 'Parâmetros :email e :password são obrigatórios';
  END IF;

  v_encrypted := crypt(v_password, gen_salt('bf', 10));

  -- 1) auth.users (upsert por email)
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, v_encrypted, now(), now(), now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object('name','E2E Bot','seed','e2e'),
      false
    );
    RAISE NOTICE 'auth.users criado: %', v_user_id;
  ELSE
    UPDATE auth.users
       SET encrypted_password = v_encrypted,
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at         = now(),
           banned_until       = NULL,
           deleted_at         = NULL
     WHERE id = v_user_id;
    RAISE NOTICE 'auth.users atualizado: %', v_user_id;
  END IF;

  -- 2) profile ativo (o trigger handle_new_user pode ter criado; garantimos flags)
  INSERT INTO zapp.profiles (user_id, name, email, role, is_active, access_level)
  VALUES (v_user_id, 'E2E Bot', v_email, 'agent', true, 'agent')
  ON CONFLICT (user_id) DO UPDATE
    SET is_active    = true,
        role         = COALESCE(zapp.profiles.role, 'agent'),
        access_level = COALESCE(zapp.profiles.access_level, 'agent'),
        email        = EXCLUDED.email,
        updated_at   = now();

  -- 3) roles: agent (base) + supervisor (permite CRUD amplo de CRM/contatos)
  INSERT INTO zapp.user_roles (user_id, role)
  VALUES (v_user_id, 'agent'), (v_user_id, 'supervisor')
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'Seed E2E concluído para % (id=%)', v_email, v_user_id;
END $$;

COMMIT;
