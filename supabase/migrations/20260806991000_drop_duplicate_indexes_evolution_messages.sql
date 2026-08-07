-- =====================================================================
-- (incluído do merge com main — idempotente)
-- TOMBSTONE — Drop de índices duplicados em evo.evolution_messages
-- ============================================================================
-- Aplicado em produção via MCP em 2026-08-06.
-- Este arquivo existe para registro histórico no git.
--
-- CONTEXTO:
--   A tabela evo.evolution_messages é particionada (relkind='p').
--   Cada partição acumulou índices com nomes no padrão antigo
--   (evolution_messages_PART_col_idx) que duplicavam os índices parent-level
--   (pidx_msgs_* e idx_evo_msgs_*) criados com "CREATE INDEX ON ONLY".
--   Os duplicados foram removidos pois:
--     - Aumentavam custo de INSERT/UPDATE sem benefício de query
--     - O planner usa os índices parent-level quando disponíveis
--     - Ocupavam ~280 MB de espaço duplicado nas partições
--
-- ÍNDICES REMOVIDOS (idempotente — IF EXISTS):
--   Padrão: índices herdados de geração anterior do schema (prefixo antigo
--   "evolution_messages_{particao}_follow_up_at_idx" e similares).
--
-- ESTADO APÓS MIGRATION:
--   Cada partição mantém apenas os índices canônicos:
--     pidx_msgs_created_at_{part}
--     pidx_msgs_followup_pending_{part}
--     evolution_messages_{part}_contact_id_created_at_idx1
--     evolution_messages_{part}_deleted_at_idx
--     evolution_messages_{part}_id_idx
--     evolution_messages_{part}_instance_name_created_at_idx
--     evolution_messages_{part}_media_status_created_at_idx
--     evolution_messages_{part}_message_id_instance_name_key (UNIQUE)
--     evolution_messages_{part}_remote_jid_created_at_idx
--     evolution_messages_{part}_reply_to_id_idx
--     evolution_messages_{part}_status_created_at_idx1
-- ============================================================================

-- Índices duplicados removidos por partição (nomes do padrão antigo):
DROP INDEX IF EXISTS evo.evolution_messages_wpp2_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_wpp2_created_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_wpp2_remote_jid_idx;
DROP INDEX IF EXISTS evo.evolution_messages_wpp2_message_id_idx;
DROP INDEX IF EXISTS evo.evolution_messages_wpp2_contact_id_idx;

DROP INDEX IF EXISTS evo.evolution_messages_comercial_01_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_01_created_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_01_remote_jid_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_01_message_id_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_01_contact_id_idx;

DROP INDEX IF EXISTS evo.evolution_messages_comercial_02_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_02_created_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_02_remote_jid_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_02_message_id_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_02_contact_id_idx;

DROP INDEX IF EXISTS evo.evolution_messages_comercial_03_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_03_created_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_03_remote_jid_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_03_message_id_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_03_contact_id_idx;

DROP INDEX IF EXISTS evo.evolution_messages_comercial_04_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_04_created_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_04_remote_jid_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_04_message_id_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_04_contact_id_idx;

DROP INDEX IF EXISTS evo.evolution_messages_comercial_05_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_05_created_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_05_remote_jid_idx;

DROP INDEX IF EXISTS evo.evolution_messages_comercial_06_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_06_created_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_06_remote_jid_idx;

DROP INDEX IF EXISTS evo.evolution_messages_comercial_07_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_07_created_at_idx;

DROP INDEX IF EXISTS evo.evolution_messages_comercial_08_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_comercial_08_created_at_idx;

DROP INDEX IF EXISTS evo.evolution_messages_compras_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_compras_created_at_idx;

DROP INDEX IF EXISTS evo.evolution_messages_financeiro_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_financeiro_created_at_idx;

DROP INDEX IF EXISTS evo.evolution_messages_logistica_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_logistica_created_at_idx;

DROP INDEX IF EXISTS evo.evolution_messages_marketing_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_marketing_created_at_idx;

DROP INDEX IF EXISTS evo.evolution_messages_default_follow_up_at_idx;
DROP INDEX IF EXISTS evo.evolution_messages_default_created_at_idx;
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
