-- ESPELHO repo×DB — migration aplicada via MCP (supabase_apply_migration) na auditoria Hermes 2026-08-06/07.
-- Registro em supabase_migrations.schema_migrations; este arquivo é o registro histórico (DB-as-source).
-- ONDA 4 (validacao): correcoes pos-revalidacao do orquestrador.
GRANT SELECT ON zapp.feature_flags TO anon;  -- F6: policy anon (is_public) existia, grant faltava
DROP POLICY IF EXISTS auth_admin_write_agents ON zapp.agents;  -- F3: escrita admin em agents
CREATE POLICY auth_admin_write_agents ON zapp.agents FOR ALL TO authenticated
  USING (is_admin_or_supervisor()) WITH CHECK (is_admin_or_supervisor());
ALTER FUNCTION zapp.rpc_e2e_cleanup() SET search_path TO 'zapp, evo, pg_temp';  -- F2: 8x rpc_e2e_*
ALTER FUNCTION zapp.rpc_e2e_seed_contacts() SET search_path TO 'zapp, pg_temp';
ALTER FUNCTION zapp.rpc_e2e_seed_user(p_email text, p_password text) SET search_path TO 'zapp, auth, extensions, pg_temp';
ALTER FUNCTION zapp.rpc_e2e_validate_user(p_email text) SET search_path TO 'zapp, pg_temp';
ALTER FUNCTION public.rpc_e2e_cleanup() SET search_path TO 'zapp, pg_temp';
ALTER FUNCTION public.rpc_e2e_seed_contacts() SET search_path TO 'zapp, pg_temp';
ALTER FUNCTION public.rpc_e2e_seed_user(p_email text, p_password text) SET search_path TO 'zapp, pg_temp';
ALTER FUNCTION public.rpc_e2e_validate_user(p_email text) SET search_path TO 'zapp, pg_temp';
