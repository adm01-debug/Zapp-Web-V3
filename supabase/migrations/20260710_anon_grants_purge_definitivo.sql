-- ============================================================
-- MIGRATION: 20260710_anon_grants_purge_definitivo.sql
-- SEGURANCA CRITICA: purge completo de grants anon em evo+zapp
-- + prevencao definitiva via ALTER DEFAULT PRIVILEGES
--
-- Descoberto em validacao exaustiva: 10 tabelas com grants FULL
-- (SELECT/INSERT/UPDATE/DELETE) para anon:
--   zapp: agent_achievements, agent_installed_skills (novas, deploy Lovable)
--   evo: _secure_config (GRAVISSIMO), evolution_alerts,
--        evolution_api_consumers, evolution_automation_logs,
--        evolution_bitrix_queue, evolution_mirror_batches,
--        evolution_webhook_events_v2_2027_01, vps_etapas
--
-- Causa raiz: grants default do schema aplicados na criacao de tabelas.
-- RLS estava ON (trigger rls_auto_enable OK) mas grants diretos
-- enfraquecem defesa em camadas do hardening v6.1.1.
-- ============================================================

-- FASE 1: REVOKE em todas as tabelas afetadas
REVOKE ALL ON zapp.agent_achievements FROM anon;
REVOKE ALL ON zapp.agent_installed_skills FROM anon;
REVOKE ALL ON evo._secure_config FROM anon;
REVOKE ALL ON evo.evolution_alerts FROM anon;
REVOKE ALL ON evo.evolution_api_consumers FROM anon;
REVOKE ALL ON evo.evolution_automation_logs FROM anon;
REVOKE ALL ON evo.evolution_bitrix_queue FROM anon;
REVOKE ALL ON evo.evolution_mirror_batches FROM anon;
REVOKE ALL ON evo.evolution_webhook_events_v2_2027_01 FROM anon;
REVOKE ALL ON evo.vps_etapas FROM anon;

-- FASE 2: PREVENCAO DEFINITIVA - novas tabelas nunca herdam grants anon
ALTER DEFAULT PRIVILEGES IN SCHEMA zapp REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA evo REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA zapp REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA evo REVOKE ALL ON TABLES FROM anon;

-- VERIFICACOES POS-DEPLOY
-- 1. Zero grants anon em evo+zapp
SELECT COUNT(*)=0 AS anon_zero
FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema IN ('zapp','evo');

-- 2. Teste funcional: nova tabela nao herda grants
-- DO $$ ... CREATE TABLE zapp.__test; verificar 0 grants; DROP ... $$
-- Resultado do teste executado: PASS

-- 3. Score 100/A+
SELECT (fn_system_health_score()->>'score')::numeric=100.0 AS score_100;
