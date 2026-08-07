-- ==========================================================================
-- Higiene: drops de fantasmas/índices/sequences, watchdog p/ ops, drop public._wal_slot_guard_events
-- Espelho versionado da onda de correção executada em 2026-08-07 (DB-as-source:
-- objetos JÁ aplicados em produção via psql; esta migration é NO-OP idempotente
-- que alinha o repo com o banco canônico).
-- Fonte: .hermes/audit-db-exaustiva/20260807/ (exec-01..14, fix_*.sql)
-- ==========================================================================

-- Tabelas fantasma (prova tripla na onda) — IF EXISTS p/ idempotência
DROP TABLE IF EXISTS zapp.agent_permissions;
DROP TABLE IF EXISTS zapp.agent_templates;
DROP TABLE IF EXISTS zapp.agent_traces;
DROP TABLE IF EXISTS zapp.agent_usage;
DROP TABLE IF EXISTS zapp.agent_versions;
-- Sequences mortas (nunca avançadas)
DROP SEQUENCE IF EXISTS zapp.proxy_alerts_id_seq;
DROP SEQUENCE IF EXISTS zapp.proxy_metrics_id_seq;
DROP SEQUENCE IF EXISTS zapp.webhook_audit_log_id_seq;
-- Índices redundantes (duplicados/subsumidos; canônicos preservados)
DROP INDEX IF EXISTS zapp.idx_media_queue_message_id_unique;
DROP INDEX IF EXISTS zapp.idx_zapp_conv_mem_updated_by;
DROP INDEX IF EXISTS evo.idx_evo_graveyard_expiration;
DROP INDEX IF EXISTS zapp.audio_meme_favorites_user_id_meme_id_key;
-- Watchdog tables: public -> ops (contrato public=só API); DO block p/ idempotência
DO $do$
BEGIN
  IF to_regclass('public._ck_viol_audit') IS NOT NULL AND to_regclass('ops._ck_viol_audit') IS NULL THEN
    ALTER TABLE public._ck_viol_audit SET SCHEMA ops;
  END IF;
  IF to_regclass('public._fk_orphan_audit') IS NOT NULL AND to_regclass('ops._fk_orphan_audit') IS NULL THEN
    ALTER TABLE public._fk_orphan_audit SET SCHEMA ops;
  END IF;
  IF to_regclass('public._msg_shard_orphan_audit') IS NOT NULL AND to_regclass('ops._msg_shard_orphan_audit') IS NULL THEN
    ALTER TABLE public._msg_shard_orphan_audit SET SCHEMA ops;
  END IF;
  IF to_regclass('public._wal_slot_guard_events') IS NOT NULL AND to_regclass('ops._wal_slot_guard_events') IS NULL THEN
    ALTER TABLE public._wal_slot_guard_events SET SCHEMA ops;
  END IF;
END
$do$;
-- Tabela recriada pelo produtor em public (config v13 agora escreve em ops)
DROP TABLE IF EXISTS public._wal_slot_guard_events;
