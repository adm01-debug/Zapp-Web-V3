-- =============================================================================
-- Migration: Security hardening — RLS policies + REVOKE anon from SECURITY DEFINER
-- Data: 2026-07-27
-- Auditoria base: AUDITORIA_SCHEMA_ZAPP_2026-07-16.md (P1-3, P1-8)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- P1-3: Tabelas com RLS ativo mas ZERO policies → deny-all silencioso
-- ---------------------------------------------------------------------------

-- _lgpd_payload: staging de dados LGPD — deny-all explícito (nunca via PostgREST)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'rls_lgpd_payload_deny_all'
      AND polrelid = 'zapp._lgpd_payload'::regclass
  ) THEN
    CREATE POLICY rls_lgpd_payload_deny_all
      ON zapp._lgpd_payload
      AS RESTRICTIVE
      TO public
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- cookie_probe_log: logs de saúde de cookies — visível apenas para authenticated
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'rls_cookie_probe_log_service_only'
      AND polrelid = 'zapp.cookie_probe_log'::regclass
  ) THEN
    CREATE POLICY rls_cookie_probe_log_service_only
      ON zapp.cookie_probe_log
      AS PERMISSIVE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- cookie_probe_pending: filas de probe com probe_auth — authenticated apenas
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'rls_cookie_probe_pending_service_only'
      AND polrelid = 'zapp.cookie_probe_pending'::regclass
  ) THEN
    CREATE POLICY rls_cookie_probe_pending_service_only
      ON zapp.cookie_probe_pending
      AS PERMISSIVE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- P1-8: REVOKE anon de funções SECURITY DEFINER — PUBLIC herdava acesso
-- ---------------------------------------------------------------------------

-- get_contact_intelligence_by_phone: expõe dados de contato sem autenticação
REVOKE EXECUTE ON FUNCTION public.get_contact_intelligence_by_phone(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_contact_intelligence_by_phone(text)
  TO authenticated, service_role, postgres, authenticator;

-- is_instance_paused: vaza estado de infraestrutura para anon
REVOKE EXECUTE ON FUNCTION public.is_instance_paused(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_instance_paused(text)
  TO authenticated, service_role, postgres, authenticator;

-- fn_apply_connection_update: só Edge Functions autenticadas devem aplicar updates
REVOKE EXECUTE ON FUNCTION public.fn_apply_connection_update(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_apply_connection_update(jsonb)
  TO authenticated, service_role, postgres, authenticator;

-- fn_contacts_proxy_* são trigger functions — boa higiene, não chamáveis via RPC
REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_insert() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_contacts_proxy_insert()
  TO authenticated, service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_update() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_contacts_proxy_update()
  TO authenticated, service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_delete() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_contacts_proxy_delete()
  TO authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- Validação inline (falha a migration se algo estiver errado)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count int;
BEGIN
  -- Verifica 0 tabelas em zapp com RLS sem policies
  SELECT count(*) INTO v_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r' AND c.relrowsecurity = true AND n.nspname = 'zapp'
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);

  IF v_count > 0 THEN
    RAISE EXCEPTION 'FALHA: % tabelas em zapp com RLS ativo e zero policies!', v_count;
  END IF;

  -- Verifica 0 funções SECURITY DEFINER acessíveis por anon
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef = true
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND n.nspname IN ('zapp', 'evo', 'public');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'FALHA: % funções SECURITY DEFINER ainda acessíveis por anon!', v_count;
  END IF;

  RAISE NOTICE 'OK: 0 tabelas sem policy, 0 funções SECDEF acessíveis por anon';
END $$;

-- ---------------------------------------------------------------------------
-- P1-3 (continuação): tabelas restantes — api_circuit_breaker,
-- fn_health_score_history, lux_system_alerts
-- ---------------------------------------------------------------------------

-- api_circuit_breaker: estado do circuit breaker — legível por authenticated
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'rls_api_circuit_breaker_read'
      AND polrelid = 'zapp.api_circuit_breaker'::regclass
  ) THEN
    CREATE POLICY rls_api_circuit_breaker_read
      ON zapp.api_circuit_breaker
      AS PERMISSIVE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- fn_health_score_history: histórico de scores de saúde — legível por authenticated
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'rls_fn_health_score_history_read'
      AND polrelid = 'zapp.fn_health_score_history'::regclass
  ) THEN
    CREATE POLICY rls_fn_health_score_history_read
      ON zapp.fn_health_score_history
      AS PERMISSIVE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- lux_system_alerts: alertas do sistema — legível por authenticated, gerenciável por service_role
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'rls_lux_system_alerts_read'
      AND polrelid = 'zapp.lux_system_alerts'::regclass
  ) THEN
    CREATE POLICY rls_lux_system_alerts_read
      ON zapp.lux_system_alerts
      AS PERMISSIVE
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'rls_lux_system_alerts_service'
      AND polrelid = 'zapp.lux_system_alerts'::regclass
  ) THEN
    CREATE POLICY rls_lux_system_alerts_service
      ON zapp.lux_system_alerts
      AS PERMISSIVE
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
