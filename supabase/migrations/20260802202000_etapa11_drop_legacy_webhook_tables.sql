-- =============================================================================
-- E11: Remoção de tabelas legadas de webhook events + cron 87
-- VALIDAÇÃO PRÉ-DROP (2026-08-02):
--   ✅ 24 tabelas: 22 com 0 rows, 2 com 5 rows (resquício)
--   ✅ Zero FKs apontando para essas tabelas
--   ✅ Zero funções dependentes (excluindo evolution_webhook_events_v2*)
--   ✅ Cron 87 varria essas tabelas — inútil (sempre 0 matches)
--   ✅ CASCADE DROP + ROLLBACK simulado com sucesso
--   ✅ external-db-proxy whitelist atualizada (wpp2 → v2)
-- =============================================================================
-- ROLLBACK: recriar tabelas a partir do backup de schema (não há dados relevantes)
--   As tabelas tinham schema idêntico (13 colunas: id, event_type, instance_name,
--   remote_jid, from_me, message_type, push_name, payload, processed, processed_at,
--   error_message, status, retry_count, created_at)

-- Passo 1: Remover cron 87 (route-failed-webhooks-to-dlq)
SELECT cron.unschedule(87);

-- Passo 2: Dropar 24 tabelas legadas (com CASCADE para índices/toast)
DROP TABLE IF EXISTS evo.evolution_webhook_events CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_wpp2 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_default CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_artes CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_01 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_02 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_03 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_04 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_05 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_06 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_07 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_08 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_09 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_10 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_11 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_12 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_13 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_14 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_15 CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_compras CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_financeiro CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_gravacao CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_logistica CASCADE;
DROP TABLE IF EXISTS evo.evolution_webhook_events_marketing CASCADE;

-- Mantidas: evolution_webhook_events_v2* (12 partições, 46k registros de auditoria)
