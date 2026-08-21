-- 20260820192000 — f007_extra_dup_idx_fk_indexes (F-007 extensao + bateria "FKs sem indice" = 0)
-- =============================================================================
-- Rodada final da bateria de validacao do plano 100 etapas (2026-08-20) encontrou
-- 2 grupos NOVOS de indices duplicados (fora dos 7 da auditoria, ja tratados em
-- 20260820120500) e 4 FKs sem indice de suporte no lado filho.
--
-- ATENCAO: CREATE/DROP INDEX CONCURRENTLY nao roda dentro de transacao — aplicar
-- statement a statement (como foi feito via MCP).
--
-- 1) evo.recon_coverage_daily: indice comum em snapshot_date redundante com a PK
--    (idx_scan=0 vs pkey=8).
DROP INDEX CONCURRENTLY IF EXISTS evo.idx_recon_coverage_daily_snapshot_date;
-- ROLLBACK: CREATE INDEX CONCURRENTLY idx_recon_coverage_daily_snapshot_date ON evo.recon_coverage_daily (snapshot_date DESC);

-- 2) zapp.contact_tags: DOIS indices identicos em (contact_id), ambos idx_scan=0 e
--    ambos redundantes com o prefixo da UNIQUE contact_tags_contact_id_tag_id_key.
DROP INDEX CONCURRENTLY IF EXISTS zapp.idx_contact_tags_contact;
DROP INDEX CONCURRENTLY IF EXISTS zapp.idx_contact_tags_contact_id;
-- ROLLBACK: CREATE INDEX CONCURRENTLY idx_contact_tags_contact_id ON zapp.contact_tags (contact_id);

-- 3) FKs sem indice no lado filho (4 casos; tabelas pequenas de config/log):
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_sync_config_created_by ON zapp.crm_sync_config (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csat_surveys_whatsapp_connection_id ON zapp.csat_surveys (whatsapp_connection_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_n8n_config_updated_by ON zapp.n8n_config (updated_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_delivery_log_channel_id ON zapp.notification_delivery_log (channel_id);
-- ROLLBACK: DROP INDEX CONCURRENTLY IF EXISTS zapp.<indice>;

-- VALIDACAO pos-aplicacao (2026-08-20): query de grupos duplicados = 0 linhas;
-- query de FKs sem indice (zapp+evo) = 0 linhas.

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260820192000', 'f007_extra_dup_idx_fk_indexes')
ON CONFLICT DO NOTHING;
