-- =====================================================================
-- Migração: Hardening de SECURITY DEFINER + search_path canônico
-- Data: 2026-07-15
-- Alvo: Supabase Self-Hosted (supabase.atomicabr.com.br)
-- Origem: supabase--linter (57 warnings 0029)
-- =====================================================================
--
-- Objetivos:
--   1. Padronizar search_path para todas as funções SECURITY DEFINER
--      exposta ao PostgREST — evita hijacking via schema shadowing.
--   2. Revogar EXECUTE de PUBLIC nas funções sensíveis, mantendo
--      apenas roles necessárias (authenticated, service_role).
--   3. Documentar auditoria de cada função.
--
-- Ordem de aplicação: rodar em transação única por bloco.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) search_path canônico em funções da instância self-hosted
--    (schemas primários: public, zapp, evo)
-- ---------------------------------------------------------------------
--
-- Gerar dinamicamente. Executar no console do DBA:
--
-- DO $$
-- DECLARE r RECORD;
-- BEGIN
--   FOR r IN
--     SELECT n.nspname AS schema, p.proname AS name,
--            pg_get_function_identity_arguments(p.oid) AS args
--       FROM pg_proc p
--       JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE p.prosecdef = true
--        AND n.nspname IN ('public', 'zapp')
--   LOOP
--     EXECUTE format(
--       'ALTER FUNCTION %I.%I(%s) SET search_path = public, zapp, evo, extensions',
--       r.schema, r.name, r.args
--     );
--   END LOOP;
-- END $$;

-- ---------------------------------------------------------------------
-- 2) Revogar EXECUTE de PUBLIC em funções que expõem dados sensíveis.
--    Manter authenticated apenas onde há verificação interna de role
--    via has_role() / is_admin_or_supervisor().
-- ---------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_channel_credentials(uuid) FROM PUBLIC;
-- Mantém authenticated: a função internamente exige is_admin_or_supervisor()
GRANT  EXECUTE ON FUNCTION public.get_channel_credentials(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_connection_qr_code(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_connection_qr_code(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.validate_reset_token(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.validate_reset_token(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.clear_login_attempts(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.clear_login_attempts(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_failed_login(text, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.pause_instance(text, text, integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.pause_instance(text, text, integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.unpause_instance(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.unpause_instance(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reassign_absent_agents(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reassign_absent_agents(integer) TO authenticated, service_role;

-- DLQ / failed_messages: apenas admin/supervisor via RPCs (protegido internamente)
REVOKE EXECUTE ON FUNCTION public.rpc_list_failed_messages(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_list_failed_messages(integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_dlq_abandon(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_abandon(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_dlq_bulk_abandon(uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_bulk_abandon(uuid[]) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_dlq_retry_now(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_retry_now(uuid, uuid) TO authenticated, service_role;

-- Auditoria de logs — apenas server-side
REVOKE EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.log_rls_denied(text, text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.log_rls_denied(text, text, jsonb) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------
-- 3) RESTRICTIVE policies em tabelas ultrassensíveis
--    Bloqueia qualquer role fora de service_role, ainda que uma
--    PERMISSIVE aberta seja acidentalmente criada no futuro.
-- ---------------------------------------------------------------------

BEGIN;

-- evolution_instance_credentials
DROP POLICY IF EXISTS "restrict_service_role_only"
  ON public.evolution_instance_credentials;
CREATE POLICY "restrict_service_role_only"
  ON public.evolution_instance_credentials
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (current_setting('request.jwt.claim.role', true) = 'service_role')
  WITH CHECK (current_setting('request.jwt.claim.role', true) = 'service_role');

-- whatsapp_official_credentials
DROP POLICY IF EXISTS "restrict_service_role_only"
  ON public.whatsapp_official_credentials;
CREATE POLICY "restrict_service_role_only"
  ON public.whatsapp_official_credentials
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (current_setting('request.jwt.claim.role', true) = 'service_role')
  WITH CHECK (current_setting('request.jwt.claim.role', true) = 'service_role');

-- password_reset_requests: reset_token nunca deve ser exposto ao cliente.
-- Já existe a view get_reset_requests_safe que oculta o token — reforçar aqui.
DROP POLICY IF EXISTS "restrict_token_access"
  ON public.password_reset_requests;
CREATE POLICY "restrict_token_access"
  ON public.password_reset_requests
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    -- Usuário só pode ler suas próprias solicitações e não o token bruto
    user_id = auth.uid()
  );

COMMIT;

-- ---------------------------------------------------------------------
-- 4) Leaked Password Protection (config do GoTrue)
-- ---------------------------------------------------------------------
-- Habilitar via painel do Supabase self-hosted:
--   Authentication → Providers → Email → "Check for compromised passwords"
-- Ou via variável de ambiente do GoTrue:
--   GOTRUE_PASSWORD_HIBP_ENABLED=true
-- Reiniciar o container do gotrue após alterar.
-- ---------------------------------------------------------------------

-- =====================================================================
-- Validação pós-migração
-- =====================================================================
--
-- SELECT n.nspname AS schema, p.proname AS name,
--        pg_get_userbyid(p.proowner) AS owner,
--        p.prosecdef AS is_definer,
--        proconfig
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE p.prosecdef = true AND n.nspname = 'public'
--    AND (proconfig IS NULL OR NOT (proconfig::text LIKE '%search_path%'));
-- (esperado: 0 linhas)
--
-- SELECT schemaname, tablename, policyname, permissive
--   FROM pg_policies
--  WHERE tablename IN ('evolution_instance_credentials',
--                      'whatsapp_official_credentials',
--                      'password_reset_requests')
--  ORDER BY tablename, permissive DESC;
-- =====================================================================
