-- Item 53 da auditoria infra (AG-EX-01): indices duplicados em evo.evolution_messages_*
-- Mesmo conjunto de colunas, nao PK/UNIQUE. DROP no indice PAI remove filhos propagados nas 14 particoes.
-- Verificacao previa: pg_index (mesmas colunas), pg_stat_user_indexes (idx_scan), pg_inherits (arvore pai-filho).
-- Mantidos (mais usados): idx_messages_status_created (202 scans), pidx_msgs_created_at (178k scans),
--   idx_evo_msgs_remote_jid_created (54k scans), idx_evo_msgs_instance_created, idx_messages_contact_created_active.
-- 1) {status, created_at}: manter idx_messages_status_created, dropar idx_msgs_status_created (116 scans)
DROP INDEX IF EXISTS evo.idx_msgs_status_created;
-- 2) {created_at}: manter pidx_msgs_created_at, dropar idx_messages_pending_age (506 scans) e pidx_msgs_starred (0 scans)
DROP INDEX IF EXISTS evo.idx_messages_pending_age;
DROP INDEX IF EXISTS evo.pidx_msgs_starred;
-- 3) {remote_jid, created_at}: manter idx_evo_msgs_remote_jid_created; dropar 13 idx_msgs_*_jid_active diretos (0-1082 scans)
DROP INDEX IF EXISTS evo.idx_msgs_comercial_01_jid_active;
DROP INDEX IF EXISTS evo.idx_msgs_comercial_02_jid_active;
DROP INDEX IF EXISTS evo.idx_msgs_comercial_03_jid_active;
DROP INDEX IF EXISTS evo.idx_msgs_comercial_04_jid_active;
DROP INDEX IF EXISTS evo.idx_msgs_comercial_05_jid_active;
DROP INDEX IF EXISTS evo.idx_msgs_comercial_06_jid_active;
DROP INDEX IF EXISTS evo.idx_msgs_comercial_07_jid_active;
DROP INDEX IF EXISTS evo.idx_msgs_comercial_08_jid_active;
DROP INDEX IF EXISTS evo.idx_msgs_compras_jid_active;
DROP INDEX IF EXISTS evo.idx_msgs_default_jid_active;
DROP INDEX IF EXISTS evo.idx_msgs_financeiro_jid_active;
DROP INDEX IF EXISTS evo.idx_msgs_logistica_jid_active;
DROP INDEX IF EXISTS evo.idx_msgs_marketing_jid_active;
-- 4) wpp2 extras: {created_at} duplicado (idx_wpp2_status_coalesce_created) e {id} duplicado (idx_wpp2_active_count)
DROP INDEX IF EXISTS evo.idx_wpp2_status_coalesce_created;
DROP INDEX IF EXISTS evo.idx_wpp2_active_count;
-- 5) wpp2_archive (tabela comum): triplicata {remote_jid, created_at} e duplicata {created_at}
DROP INDEX IF EXISTS evo.evolution_messages_wpp2_archive_remote_jid_created_at_idx1;
DROP INDEX IF EXISTS evo.evolution_messages_wpp2_archive_remote_jid_created_at_idx2;
DROP INDEX IF EXISTS evo.idx_messages_wpp2_archive_created_at;
-- evolution_contacts: sem duplicatas exatas (trgm sao GIN opclass distinta; btree unicos/prefix) — nada dropado.
