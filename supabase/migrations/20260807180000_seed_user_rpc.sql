-- =============================================================================
-- Migration: zapp.rpc_e2e_seed_user() — cria/atualiza o usuário E2E
--
-- Contexto (2026-08-07): o antigo scripts/seed-e2e-user.sql rodava via SSH
-- (porta 22 fechada — E2E-05). O usuário E2E existia em auth.users (criado
-- antes da quebra) mas SEM roles em zapp.user_roles → validate REST acusava
-- has_roles=false (run 31172073095).
--
-- Esta RPC transpõe o script (idempotente): auth.users upsert por email
-- (senha bcrypt via pgcrypto em `extensions`), zapp.profiles ativo (agent),
-- zapp.user_roles com a estrutura ATUAL da tabela (id/role_key/workspace_id/
-- role; UNIQUE (user_id, workspace_id) → 1 role por workspace; UNIQUE
-- (user_id, role)) — role 'agent' (base CRM; supervisor/admin não cabem no
-- mesmo workspace por constraint). Wrapper public.* p/ exposição PostgREST.
--
-- Segurança: SECURITY DEFINER, search_path = zapp, auth, extensions, public
-- (pgcrypto vive em `extensions`), sem anon; GRANT apenas service_role
-- (senha trafega no corpo do POST — HTTPS; nunca anon/authenticated).
--
-- Rollback: DROP FUNCTION zapp.rpc_e2e_seed_user(text, text);
--           DROP FUNCTION public.rpc_e2e_seed_user(text, text);
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.rpc_e2e_seed_user(p_email text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, auth, extensions, public
AS $$
DECLARE
  v_user_id       uuid;
  v_encrypted     text;
  v_user_action   text := 'unchanged';
  v_roles_before  int  := 0;
  v_roles_after   int  := 0;
  v_roles_added   int  := 0;
  v_roles_list    text[];
  v_workspace     uuid := 'd188f2f8-1ca3-4176-bcbc-1a1c481e24ad'; -- workspace do app
BEGIN
  IF p_email IS NULL OR p_password IS NULL OR p_email = '' OR p_password = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email e password obrigatorios');
  END IF;

  v_encrypted := crypt(p_password, gen_salt('bf', 10));

  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      p_email, v_encrypted, now(), now(), now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object('name','E2E Bot','seed','e2e'),
      false
    );
    v_user_action := 'inserted';
  ELSE
    UPDATE auth.users
       SET encrypted_password = v_encrypted,
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at         = now(),
           banned_until       = NULL,
           deleted_at         = NULL
     WHERE id = v_user_id;
    v_user_action := 'updated';
  END IF;

  INSERT INTO zapp.profiles (user_id, name, email, role, is_active, access_level)
  VALUES (v_user_id, 'E2E Bot', p_email, 'agent', true, 'agent')
  ON CONFLICT (user_id) DO UPDATE
    SET is_active    = true,
        role         = COALESCE(zapp.profiles.role, 'agent'),
        access_level = COALESCE(zapp.profiles.access_level, 'agent'),
        email        = EXCLUDED.email,
        updated_at   = now();

  SELECT COUNT(*) INTO v_roles_before
    FROM zapp.user_roles WHERE user_id = v_user_id;

  INSERT INTO zapp.user_roles (id, user_id, role_key, workspace_id, role, created_at)
  VALUES (gen_random_uuid(), v_user_id, 'agent', v_workspace, 'agent', now())
  ON CONFLICT (user_id, workspace_id) DO UPDATE
    SET role = 'agent', role_key = 'agent';

  SELECT COUNT(*), array_agg(role::text ORDER BY role::text)
    INTO v_roles_after, v_roles_list
    FROM zapp.user_roles WHERE user_id = v_user_id;

  v_roles_added := v_roles_after - v_roles_before;

  RETURN jsonb_build_object(
    'ok',          true,
    'email',       p_email,
    'user_id',     v_user_id,
    'user_action', v_user_action,
    'roles',       to_jsonb(v_roles_list),
    'roles_total', v_roles_after,
    'roles_added', v_roles_added
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_e2e_seed_user(p_email text, p_password text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp, public
AS $$ SELECT zapp.rpc_e2e_seed_user(p_email, p_password) $$;

REVOKE ALL ON FUNCTION zapp.rpc_e2e_seed_user(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_e2e_seed_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_e2e_seed_user(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_seed_user(text, text) TO service_role;
