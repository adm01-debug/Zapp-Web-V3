-- =====================================================================
-- Migração: Índices de performance em evo.evolution_messages_wpp2
-- Data: 2026-07-15
-- Alvo: Supabase Self-Hosted (supabase.atomicabr.com.br)
-- Aplicar como: DBA via psql direto na VPS
-- Estratégia: CREATE INDEX CONCURRENTLY (fora de transação) — sem lock de tabela
-- =====================================================================
--
-- Contexto: evolution_messages_wpp2 tem 41.045 linhas e 51 MB.
-- Queries mais frequentes do app:
--   1. Últimas N mensagens por (instance_name, remote_jid) — Inbox
--   2. Mensagens pendentes/falhadas por instance_name — DLQ retry
--   3. Range temporal por partição — Analytics
--
-- ATENÇÃO: rodar cada CREATE INDEX individualmente, fora de bloco BEGIN/COMMIT.
-- Verificar com pg_stat_progress_create_index enquanto executa.
-- =====================================================================

-- 1) Ordem cronológica por instância (Inbox scroll)
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_evo_msg_wpp2_instance_ts_desc
  ON evo.evolution_messages_wpp2 (instance_name, "timestamp" DESC);

-- 2) Ordem cronológica por conversa (abrir chat)
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_evo_msg_wpp2_remote_ts_desc
  ON evo.evolution_messages_wpp2 (remote_jid, "timestamp" DESC);

-- 3) Fila de retry — apenas registros pendentes/falhados (parcial, super leve)
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_evo_msg_wpp2_retry_partial
  ON evo.evolution_messages_wpp2 (instance_name, "timestamp")
  WHERE status IN ('pending', 'failed', 'error');

-- 4) BRIN para range temporal em tabela crescente (barato, ideal p/ analytics)
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_evo_msg_wpp2_ts_brin
  ON evo.evolution_messages_wpp2 USING BRIN ("timestamp")
  WITH (pages_per_range = 32);

-- 5) Lookup direto por message_id (idempotência de webhook)
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_evo_msg_wpp2_message_id
  ON evo.evolution_messages_wpp2 (message_id)
  WHERE message_id IS NOT NULL;

-- =====================================================================
-- Índices análogos para outras partições de evolution_messages
-- (aplicar somente se as partições existirem no ambiente alvo)
-- =====================================================================

-- CREATE INDEX CONCURRENTLY IF NOT EXISTS
--   idx_evo_msg_comercial01_instance_ts
--   ON evo.evolution_messages_comercial_01 (instance_name, "timestamp" DESC);

-- =====================================================================
-- Validação pós-migração
-- =====================================================================
-- Rodar após criação de todos os índices:
--
-- ANALYZE evo.evolution_messages_wpp2;
--
-- SELECT indexname, pg_size_pretty(pg_relation_size(indexrelid)) AS size
--   FROM pg_indexes i
--   JOIN pg_class c ON c.relname = i.indexname
--  WHERE schemaname = 'evo'
--    AND tablename  = 'evolution_messages_wpp2'
--  ORDER BY pg_relation_size(indexrelid) DESC;
--
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM evo.evolution_messages_wpp2
--  WHERE instance_name = 'wpp2' AND remote_jid = '5511999999999@s.whatsapp.net'
--  ORDER BY "timestamp" DESC LIMIT 50;
--
-- Esperado: Index Scan em idx_evo_msg_wpp2_remote_ts_desc, custo < 1ms.
-- =====================================================================
