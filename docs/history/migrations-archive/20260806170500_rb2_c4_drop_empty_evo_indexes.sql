-- Runbook-2 (05/08/2026): Drop de 12 índices de tabelas vazias do schema evo (item C-4)
-- ===========================================================================
-- Sync repo x DB: os 12 índices abaixo foram dropados diretamente no banco
-- pelos agentes do runbook-2 em 05/08/2026 (tabelas vazias do Evolution API),
-- SEM cobertura versionada. Nenhum CREATE INDEX para estes nomes existe no
-- repo (verificado 2026-08-06) e nenhum existe mais em pg_indexes — a migration
-- apenas documenta o estado canônico de forma idempotente.
--
-- DROP INDEX IF EXISTS: re-aplicação é no-op (índice já ausente).
-- ===========================================================================

DROP INDEX IF EXISTS evo.evolution_conversations_artes_remote_jid_idx;
DROP INDEX IF EXISTS evo.evolution_conversations_artes_contact_id_idx;
DROP INDEX IF EXISTS evo.idx_evolution_ef_logs_ef_created;
DROP INDEX IF EXISTS evo.idx_evolution_ef_logs_level_created;
DROP INDEX IF EXISTS evo.idx_evo_ip_blocklist_active;
DROP INDEX IF EXISTS evo.idx_evo_ip_watch_ts;
DROP INDEX IF EXISTS evo.idx_label_assoc_active;
DROP INDEX IF EXISTS evo.idx_label_assoc_remote_jid;
DROP INDEX IF EXISTS evo.idx_notif_log_status;
DROP INDEX IF EXISTS evo.idx_evolution_notification_log_alert_id;
DROP INDEX IF EXISTS evo.idx_dlq_pending;
DROP INDEX IF EXISTS evo.idx_evo_status_reactions_status_id;
