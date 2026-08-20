-- F-006/F-007 (PLANO-100-ETAPAS B4) — saneamento de índices duplicados + índice de suporte FK
-- Executado em produção 2026-08-20 via psql (apply_migration bugado no self-hosted).
-- Registro manual em supabase_migrations: 20260820120500.
--
-- NOTA F-006 (FKs): as 3 FKs de media_download_queue NÃO são redundâncias dropáveis.
-- fk_media_queue_message_uuid (parent, -> evo.evolution_messages) é auto-acompanhada por
-- clones internos (_fkey, _fkey1) criados pelo PG15 quando a FK referencia tabela
-- particionada (mecanismo de attach/detach). DROP do parent + re-ADD os recria.
-- Ação executada: reconstrução limpa do parent (DROP+ADD NOT VALID+VALIDATE) e criação
-- do índice de suporte no lado filho.

-- 1) Índice de suporte para FK (message_uuid, instance_name) — antes sem índice no filho
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mdq_message_uuid_instance
  ON evo.media_download_queue (message_uuid, instance_name);
-- ROLLBACK: DROP INDEX CONCURRENTLY IF EXISTS evo.idx_mdq_message_uuid_instance;

-- 2) evo.evolution_connection_history: drop do gêmeo sem uso (idx_scan=0; mantido idx_conn_history_instance_created com 4776 scans)
DROP INDEX CONCURRENTLY IF EXISTS evo.idx_evo_conn_history_instance_created;
-- ROLLBACK: CREATE INDEX CONCURRENTLY idx_evo_conn_history_instance_created ON evo.evolution_connection_history (instance_name, created_at DESC);

-- 3) zapp.agent_stats: drop da UNIQUE redundante em profile_id (mantida agent_stats_profile_id_key, que ancora a constraint)
DROP INDEX CONCURRENTLY IF EXISTS zapp.agent_stats_profile_unique;
-- ROLLBACK: CREATE UNIQUE INDEX CONCURRENTLY agent_stats_profile_unique ON zapp.agent_stats (profile_id);

-- 4) zapp.csat_responses: 2 pares duplicados — mantidos idx_csat_contact/idx_csat_created
DROP INDEX CONCURRENTLY IF EXISTS zapp.idx_csat_responses_contact;
DROP INDEX CONCURRENTLY IF EXISTS zapp.idx_csat_responses_created;
-- ROLLBACK: CREATE INDEX CONCURRENTLY idx_csat_responses_contact ON zapp.csat_responses (contact_id);
-- ROLLBACK: CREATE INDEX CONCURRENTLY idx_csat_responses_created ON zapp.csat_responses (created_at DESC);

-- 5) zapp.queue_positions: índice comum redundante com a UNIQUE queue_positions_contact_uniq
DROP INDEX CONCURRENTLY IF EXISTS zapp.idx_zapp_queue_pos_contact;
-- ROLLBACK: CREATE INDEX CONCURRENTLY idx_zapp_queue_pos_contact ON zapp.queue_positions (contact_id);

-- 6) zapp.scheduled_messages: gêmeo sem uso (mantido idx_scheduled_messages_contact_id, 123 scans)
DROP INDEX CONCURRENTLY IF EXISTS zapp.idx_zapp_sched_msg_contact;
-- ROLLBACK: CREATE INDEX CONCURRENTLY idx_zapp_sched_msg_contact ON zapp.scheduled_messages (contact_id);

-- FALSO-POSITIVO da auditoria (não dropar): trio de evo.evolution_contacts
-- idx_ec_coalesce_phone / evolution_contacts_phone_clean_idx / idx_ec_lower_remote_jid
-- têm EXPRESSÕES DIFERENTES e uso real (28k/5.7k/1.2k scans).

ANALYZE evo.media_download_queue;
ANALYZE evo.evolution_connection_history;
ANALYZE zapp.agent_stats;
ANALYZE zapp.csat_responses;
ANALYZE zapp.queue_positions;
ANALYZE zapp.scheduled_messages;
