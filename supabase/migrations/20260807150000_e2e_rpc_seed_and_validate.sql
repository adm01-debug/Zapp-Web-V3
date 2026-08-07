-- =============================================================================
-- Migration: RPCs E2E seed + validate (E2E-05 resolvido sem SSH)
--
-- Contexto (2026-08-07): porta 22 da VPS FECHADA para a internet
-- (ConnectionRefused em 209.142.67.51) → o padrão "SSH do GitHub → VPS"
-- dos workflows seed/validate/cleanup está quebrado por design de rede há
-- 10+ dias. Solução: toda a lógica vira RPC (SECURITY DEFINER, service_role)
-- chamada via PostgREST (REST) — sem SSH, sem psql remoto, sem runner.
--
--   - zapp.rpc_e2e_seed_contacts()    — transpõe scripts/seed-e2e-contacts.sql
--     (5 contatos, idempotente, introspecção de colunas)
--   - zapp.rpc_e2e_validate_user(email) — transpõe scripts/validate-e2e-user.sql
--     (exists/confirmed/banned/profile/roles CRM) — retorna veredito jsonb
--     (workflow decide o fail; sem RAISE para o REST não virar 500)
--
-- Cleanup já existe: zapp.rpc_e2e_cleanup() (20260807140000).
--
-- Segurança: SECURITY DEFINER com search_path fixo; sem EXECUTE para anon;
-- GRANT a service_role (chamada REST do CI) e authenticated.
--
-- Rollback: DROP FUNCTION zapp.rpc_e2e_seed_contacts();
--           DROP FUNCTION zapp.rpc_e2e_validate_user(text);
-- =============================================================================

-- ── zapp.rpc_e2e_seed_contacts() ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_e2e_seed_contacts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $$
DECLARE
  v_seeds jsonb := jsonb_build_array(
    jsonb_build_object('phone','5511999999901','name','E2E Contact Alpha',   'email','e2e-alpha@zappweb.test'),
    jsonb_build_object('phone','5511999999902','name','E2E Contact Beta',    'email','e2e-beta@zappweb.test'),
    jsonb_build_object('phone','5511999999903','name','E2E Contact Gamma',   'email','e2e-gamma@zappweb.test'),
    jsonb_build_object('phone','5511999999904','name','E2E Contact Delta',   'email','e2e-delta@zappweb.test'),
    jsonb_build_object('phone','5511999999905','name','E2E Contact Epsilon', 'email','e2e-epsilon@zappweb.test')
  );
  v_row jsonb;
  v_phone text;
  v_name  text;
  v_email text;
  v_jid   text;
  v_has_email     boolean;
  v_has_jid       boolean;
  v_has_active    boolean;
  v_has_tags      boolean;
  v_cols text;
  v_vals text;
  v_updates text;
  v_inserted int := 0;
  v_updated  int := 0;
  v_id uuid;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='zapp' AND table_name='contacts' AND column_name='email')      INTO v_has_email;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='zapp' AND table_name='contacts' AND column_name='remote_jid') INTO v_has_jid;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='zapp' AND table_name='contacts' AND column_name='is_active')  INTO v_has_active;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='zapp' AND table_name='contacts' AND column_name='tags')       INTO v_has_tags;

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_seeds) LOOP
    v_phone := v_row->>'phone';
    v_name  := v_row->>'name';
    v_email := v_row->>'email';
    v_jid   := v_phone || '@s.whatsapp.net';

    SELECT id INTO v_id FROM zapp.contacts WHERE phone = v_phone LIMIT 1;

    IF v_id IS NULL THEN
      v_cols := 'phone, name';
      v_vals := format('%L, %L', v_phone, v_name);
      IF v_has_email  THEN v_cols := v_cols || ', email';      v_vals := v_vals || format(', %L', v_email); END IF;
      IF v_has_jid    THEN v_cols := v_cols || ', remote_jid'; v_vals := v_vals || format(', %L', v_jid);   END IF;
      IF v_has_active THEN v_cols := v_cols || ', is_active';  v_vals := v_vals || ', true';                END IF;
      IF v_has_tags   THEN v_cols := v_cols || ', tags';       v_vals := v_vals || format(', %L::text[]', '{e2e,seed}'); END IF;
      EXECUTE format('INSERT INTO zapp.contacts (%s) VALUES (%s)', v_cols, v_vals);
      v_inserted := v_inserted + 1;
    ELSE
      v_updates := 'name = ' || quote_literal(v_name);
      IF v_has_email  THEN v_updates := v_updates || ', email = '      || quote_literal(v_email); END IF;
      IF v_has_jid    THEN v_updates := v_updates || ', remote_jid = ' || quote_literal(v_jid);   END IF;
      IF v_has_active THEN v_updates := v_updates || ', is_active = true'; END IF;
      EXECUTE format('UPDATE zapp.contacts SET %s WHERE id = %L', v_updates, v_id);
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'kind',      'contacts',
    'table',     'zapp.contacts',
    'inserted',  v_inserted,
    'updated',   v_updated,
    'total',     v_inserted + v_updated
  );
END;
$$;

-- ── zapp.rpc_e2e_validate_user(text) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_e2e_validate_user(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $$
DECLARE
  v_user_id      uuid;
  v_confirmed    timestamptz;
  v_banned_until timestamptz;
  v_is_active    boolean;
  v_role_count   integer;
  v_has_crm      boolean;
  v_checks jsonb;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'email vazio');
  END IF;

  SELECT id, email_confirmed_at, banned_until
    INTO v_user_id, v_confirmed, v_banned_until
    FROM auth.users
   WHERE email = p_email;

  v_checks := jsonb_build_object(
    'user_exists', v_user_id IS NOT NULL,
    'email_confirmed', v_confirmed IS NOT NULL,
    'not_banned', v_banned_until IS NULL OR v_banned_until <= now()
  );

  IF v_user_id IS NOT NULL THEN
    SELECT is_active INTO v_is_active
      FROM zapp.profiles
     WHERE user_id = v_user_id;

    v_checks := v_checks || jsonb_build_object('profile_exists', v_is_active IS NOT NULL, 'profile_active', v_is_active IS TRUE);

    SELECT count(*), bool_or(role::text IN ('agent','supervisor','admin'))
      INTO v_role_count, v_has_crm
      FROM zapp.user_roles
     WHERE user_id = v_user_id;

    v_checks := v_checks || jsonb_build_object('has_roles', coalesce(v_role_count,0) > 0, 'has_crm_role', coalesce(v_has_crm, false));
  ELSE
    v_checks := v_checks || jsonb_build_object('profile_exists', false, 'profile_active', false, 'has_roles', false, 'has_crm_role', false);
  END IF;

  RETURN jsonb_build_object(
    'valid', (v_checks->>'user_exists')::boolean
         AND (v_checks->>'email_confirmed')::boolean
         AND (v_checks->>'not_banned')::boolean
         AND (v_checks->>'profile_exists')::boolean
         AND (v_checks->>'profile_active')::boolean
         AND (v_checks->>'has_roles')::boolean
         AND (v_checks->>'has_crm_role')::boolean,
    'email',  p_email,
    'checks', v_checks
  );
END;
$$;

-- ── Grants (sem anon) ────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION zapp.rpc_e2e_seed_contacts() FROM PUBLIC;
REVOKE ALL ON FUNCTION zapp.rpc_e2e_validate_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_e2e_seed_contacts() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION zapp.rpc_e2e_validate_user(text) TO service_role, authenticated;
