-- Migration: REVOKE INSERT/UPDATE de authenticated em zapp.evolution_instance_credentials
-- Detectado em auditoria exaustiva 2026-08-13/14 (Passo 3 dos próximos passos)
--
-- Contexto: tabela sensível com api_key/api_url das instâncias Evolution.
-- RLS policy evo_creds_service_role_only (cmd=ALL, roles={service_role}) impedia
-- qualquer acesso de authenticated em runtime. O grant era desnecessário e residual.
-- Verificado: todas as funções que fazem INSERT/UPDATE são SECURITY DEFINER com
-- guard auth.role() = 'service_role' — authenticated nunca alcança a tabela base.
-- SELECT e DELETE por authenticated não existiam (confirmado via information_schema).

REVOKE INSERT, UPDATE ON zapp.evolution_instance_credentials FROM authenticated;
