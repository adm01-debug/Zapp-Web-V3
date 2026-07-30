-- Migracao: correcao da policy de workspaces
-- Data: 2026-07-16
-- Problema: policy 'service_role_all' estava aplicada a {authenticated}
--   em vez de {service_role}, dando ALL (inclusive DELETE) a qualquer agente.
--   O nome era enganoso e o escopo errado.
--
-- Analise: pg_stat_statements confirmou ZERO queries de mutacao em
--   zapp.workspaces vindas do frontend. Agentes precisam apenas de SELECT
--   para carregar configuracoes do workspace.
--   service_role tem pg_bypassrls e nao precisa de policy explicita.
--
-- Fix: substituir ALL por SELECT-only para {authenticated}.
--   Agora qualquer tentativa de INSERT/UPDATE/DELETE por um agente
--   autenticado e bloqueada silenciosamente por RLS.

DROP POLICY IF EXISTS service_role_all ON zapp.workspaces;

CREATE POLICY workspace_read_authenticated
  ON zapp.workspaces
  FOR SELECT
  TO authenticated
  USING (true);

-- Verificar resultado:
-- SELECT policyname, roles, cmd FROM pg_policies
-- WHERE schemaname='zapp' AND tablename='workspaces';
-- Esperado: workspace_read_authenticated | {authenticated} | SELECT
