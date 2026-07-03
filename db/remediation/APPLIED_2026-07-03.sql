-- =====================================================================================
-- APLICADO EM PRODUÇÃO — Supabase self-hosted PG15 (supabase.atomicabr.com.br) — 2026-07-03
-- Executado via MCP (supabase_db_query) + psql no container supabase_db (para CONCURRENTLY/VACUUM).
-- Ref.: docs/EVOLUTION_API_AUDIT_2026-07-03.md
--
-- Todas as mudanças abaixo FORAM APLICADAS e VERIFICADAS. Idempotentes (safe re-run).
-- Guard-rails usados: janela sem locks/tx longas; ON_ERROR_STOP; CONCURRENTLY; verificação pós-cada-passo.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1) TUNING (escopo de banco — reversível; aplica a novas conexões). [APLICADO]
--    Observação: o role `postgres` do Supabase NÃO é superuser → ALTER SYSTEM é negado.
--    Por isso os tunables foram aplicados via ALTER DATABASE (owner-level), não ALTER SYSTEM.
--    Global knobs (shared_buffers, WAL, autovacuum cost/naptime, max_connections) exigem
--    superuser + restart → ficam para a config do STACK supabase (não aplicados aqui).
-- -------------------------------------------------------------------------------------
ALTER DATABASE postgres SET effective_cache_size = '16GB';   -- era 3GB (planner subestimava cache)
ALTER DATABASE postgres SET work_mem             = '32MB';   -- era 16MB
ALTER DATABASE postgres SET maintenance_work_mem = '512MB';  -- era 256MB
-- Reversão: ALTER DATABASE postgres RESET effective_cache_size; (idem p/ os demais)

-- -------------------------------------------------------------------------------------
-- 2) AUTOVACUUM por tabela (tabelas quentes). [APLICADO]
-- -------------------------------------------------------------------------------------
ALTER TABLE evo.evolution_messages_wpp2 SET (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_cost_limit    = 2000);
ALTER TABLE zapp.webhook_events_processed SET (
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_scale_factor  = 0.05);

-- -------------------------------------------------------------------------------------
-- 3) ESTATÍSTICAS: ANALYZE de todas as 148 tabelas do zapp + VACUUM da partição de 2GB. [APLICADO]
--    Corrigiu estatística obsoleta sistêmica (146/148 nunca analisadas → 0).
--    Ex.: zapp.webhook_events_processed n_live_tup 7 → 42.248 (real).
-- -------------------------------------------------------------------------------------
-- (executado via: SELECT format('ANALYZE %I.%I;',schemaname,relname) FROM pg_stat_user_tables
--                 WHERE schemaname='zapp' \gexec  )
VACUUM (ANALYZE) evo.evolution_messages_wpp2;   -- 41.126 dead tuples → 0

-- -------------------------------------------------------------------------------------
-- 4) ÍNDICES DE FK FALTANTES no zapp — 12 criados CONCURRENTLY (todos VALID). [APLICADO]
--    (validado por SIM: exatamente 12 FKs single-col sem índice de cobertura.)
-- -------------------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ce_from_agent  ON zapp.conversation_events(from_agent_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ce_to_agent    ON zapp.conversation_events(to_agent_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ce_from_queue  ON zapp.conversation_events(from_queue_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ae_rule        ON zapp.automation_executions(rule_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cbe_flow       ON zapp.chatbot_executions(flow_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fe_sequence    ON zapp.followup_executions(sequence_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fs_sequence    ON zapp.followup_steps(sequence_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crr_queue      ON zapp.channel_routing_rules(queue_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_slah_resolved  ON zapp.sla_history(resolved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tbl_contact    ON zapp.talkx_blacklist(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tr_contact     ON zapp.talkx_recipients(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tc_created_by  ON zapp.team_conversations(created_by);

-- -------------------------------------------------------------------------------------
-- 5) CONSOLIDAÇÃO DE ÍNDICES em evo.evolution_messages_wpp2. [APLICADO — ~155MB recuperados]
--    CORREÇÃO IMPORTANTE vs auditoria inicial: a tabela É uma PARTIÇÃO de evo.evolution_messages
--    (LIST partitioning). Índices "particionados" (definidos no pai, propagam p/ partições) foram
--    PRESERVADOS; só os "standalone" duplicados criados direto na partição foram removidos.
--    remote_jid continua indexado pelo índice particionado (EXPLAIN confirmou Index Scan, sem seq scan).
-- -------------------------------------------------------------------------------------
DROP INDEX CONCURRENTLY IF EXISTS evo.idx_evo_wpp2_created_at_btree;   -- ASC, duplicado do DESC (idx_messages_wpp2_created_at)
DROP INDEX CONCURRENTLY IF EXISTS evo.idx_messages_wpp2_jid_date;      -- (remote_jid,created_at) duplicado do índice particionado
DROP INDEX CONCURRENTLY IF EXISTS evo.idx_msgs_wpp2_jid_active;        -- idem (removido no mesmo ciclo de manutenção)
-- Reversão (se necessário):
--   CREATE INDEX CONCURRENTLY idx_evo_wpp2_created_at_btree ON evo.evolution_messages_wpp2 (created_at);
--   CREATE INDEX CONCURRENTLY idx_messages_wpp2_jid_date ON evo.evolution_messages_wpp2 (remote_jid, created_at DESC) WHERE remote_jid IS NOT NULL;
--   CREATE INDEX CONCURRENTLY idx_msgs_wpp2_jid_active ON evo.evolution_messages_wpp2 (remote_jid, created_at DESC) WHERE deleted_at IS NULL;

-- -------------------------------------------------------------------------------------
-- 6) HARDENING: remoção de 7 policies anon INERTES no evo (anon não tem USAGE no schema). [APLICADO]
-- -------------------------------------------------------------------------------------
DROP POLICY IF EXISTS anon_read_dlq            ON evo.evolution_dlq;
DROP POLICY IF EXISTS anon_read                ON evo.evolution_messages_default;
DROP POLICY IF EXISTS anon_read                ON evo.evolution_messages_wpp2;
DROP POLICY IF EXISTS anon_read                ON evo.evolution_messages_wpp_pink_test;
DROP POLICY IF EXISTS reactions_anon_read      ON evo.evolution_reactions;
DROP POLICY IF EXISTS anon_read_webhook_events ON evo.evolution_webhook_events;
DROP POLICY IF EXISTS anon_read_webhook_events ON evo.evolution_webhook_events_v2;

-- =====================================================================================
-- RESULTADO VERIFICADO (2026-07-03):
--   banco 3439MB → 3285MB (−154MB) | wpp2 2084MB→1929MB, índices 862MB→707MB (15→12)
--   zapp: 12 índices FK novos (VALID) | tabelas sem ANALYZE 146→0 | webhook_events_processed 7→42.248
--   índices inválidos (evo+zapp+public): 0 | policies anon no evo: 0 | 0 locks/tx-longas durante execução
-- =====================================================================================

-- =====================================================================================
-- NÃO APLICADO (requer janela/superuser/infra/ação física — ver runbook do relatório):
--   - ALTER SYSTEM global: shared_buffers 6GB, max_connections, WAL, autovacuum cost/naptime  (config do stack + restart)
--   - security_invoker nas 3 views zapp.* (cadeia de views cross-schema p/ public.* — validar antes; risco de quebrar app)
--   - RLS "tenancy" no zapp: N/A — app é SINGLE-TENANT (não há coluna company_id/tenant_id). Fix real = restringir
--     emissão de token authenticated / policies por-usuário onde aplicável, não isolamento por empresa.
--   - Retenção do espelho evo: a tabela JÁ é particionada → usar DROP PARTITION por período (design), não DELETE.
--   - DROP COLUMN raw_data (100% NULL): validar que o consumer não referencia a coluna antes.
--   - Infra/físico: re-QR do wpp2, rotação da API key default, CORS allowlist, Redis AOF, reconciliar stack, deploy da edge fn.
-- =====================================================================================
