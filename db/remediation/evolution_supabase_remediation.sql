-- =====================================================================================
-- REMEDIAÇÃO — Evolution API / Supabase (PG15) — gerado 2026-07-03
-- Ref.: docs/EVOLUTION_API_AUDIT_2026-07-03.md
--
-- ⚠️  NADA AQUI RODA SOZINHO. Execute por SEÇÃO, revisando cada bloco.
--     Alvo: banco Supabase self-hosted (schemas evo / zapp / public). NÃO é o PG14 do Evolution.
--     Tiers por risco. Tier 3 exige janela de manutenção / decisão de design.
-- =====================================================================================


-- =====================================================================================
-- TIER 1 — SEGURO (sem locks relevantes). Pode rodar em produção.
-- =====================================================================================

-- 1.1 · ZAPP-03: estatísticas obsoletas sistêmicas (146/148 tabelas nunca analisadas).
--      Corrige planner (ex.: webhook_events_processed lê n_live_tup=7 vs 42.248 reais).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT format('%I.%I', schemaname, relname) AS t
           FROM pg_stat_user_tables WHERE schemaname = 'zapp'
  LOOP EXECUTE 'ANALYZE ' || r.t; END LOOP;
END $$;

-- 1.2 · PERF-05 / EVO-10: autovacuum mais agressivo nas tabelas quentes de alto churn.
ALTER TABLE evo.evolution_messages_wpp2
  SET (autovacuum_vacuum_scale_factor = 0.02,
       autovacuum_analyze_scale_factor = 0.01,
       autovacuum_vacuum_cost_limit = 2000);
ALTER TABLE zapp.webhook_events_processed
  SET (autovacuum_analyze_scale_factor = 0.02,
       autovacuum_vacuum_scale_factor = 0.05);

-- 1.3 · EVO-01 (higiene): remover policy morta anon_read no espelho evo.
--       (Verificação: anon não tem USAGE efetivo em evo; a policy é inerte. Remoção = higiene, não urgência.)
--       Confirme antes de rodar em massa:
--         SELECT schemaname, tablename, policyname FROM pg_policies
--         WHERE schemaname='evo' AND roles::text LIKE '%anon%';
-- DROP POLICY IF EXISTS anon_read ON evo.evolution_messages_wpp2;
-- DROP POLICY IF EXISTS anon_read ON evo.evolution_contacts;
-- DROP POLICY IF EXISTS anon_read ON evo.evolution_webhook_events_wpp2;
-- DROP POLICY IF EXISTS anon_read ON evo.evolution_alerts;

-- 1.4 · VACUUM (ANALYZE) inicial da tabela de 2 GB (fora de pico; não bloqueia leituras/escritas).
-- VACUUM (ANALYZE) evo.evolution_messages_wpp2;


-- =====================================================================================
-- TIER 2 — REVISAR + rodar com CONCURRENTLY (fora de transação; não bloqueia).
--          Rode um índice por vez. Confirme idx_scan real antes de dropar.
-- =====================================================================================

-- 2.1 · EVO-04: consolidar índices redundantes em evolution_messages_wpp2 (~250-300 MB).
--      Antes: SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
--             FROM pg_stat_user_indexes WHERE relname='evolution_messages_wpp2' ORDER BY 2;
--      Três índices cobrem (remote_jid, created_at DESC): manter idx_msgs_wpp2_jid_active (parcial), dropar os outros.
-- DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_messages_wpp2_remote_jid_created_at_idx;
-- DROP INDEX CONCURRENTLY IF EXISTS evo.idx_messages_wpp2_jid_date;
--      Dois índices só de created_at: manter o DESC (mais usado), dropar o ASC.
-- DROP INDEX CONCURRENTLY IF EXISTS evo.idx_evo_wpp2_created_at_btree;
--      Índices com idx_scan=0 (confirmar antes):
-- DROP INDEX CONCURRENTLY IF EXISTS evo.idx_msgs_wpp2_starred;

-- 2.2 · ZAPP-05: índices de cobertura para FKs sem índice (evita seq scan da filha em delete/update do pai).
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

-- 2.3 · ZAPP-02: views executando como owner (postgres) ignoram RLS das tabelas base.
ALTER VIEW zapp.messages                   SET (security_invoker = on);
ALTER VIEW zapp.whatsapp_connections       SET (security_invoker = on);
ALTER VIEW zapp.whatsapp_connections_safe  SET (security_invoker = on);
-- A view não-safe expõe api_key / qr_code_base64 — restrinja o acesso:
REVOKE ALL ON zapp.whatsapp_connections FROM authenticated;


-- =====================================================================================
-- TIER 3 — JANELA DE MANUTENÇÃO / DECISÃO DE DESIGN. Não aplique sem planejar.
-- =====================================================================================

-- 3.1 · PERF-02/03/08: tuning de memória/WAL/paralelismo (host 24 GB / 12 vCPU).
--      shared_buffers e max_connections/max_worker_processes exigem RESTART do container supabase_db.
-- ALTER SYSTEM SET shared_buffers = '6GB';
-- ALTER SYSTEM SET effective_cache_size = '16GB';
-- ALTER SYSTEM SET work_mem = '32MB';
-- ALTER SYSTEM SET maintenance_work_mem = '512MB';
-- ALTER SYSTEM SET autovacuum_work_mem = '256MB';
-- ALTER SYSTEM SET autovacuum_vacuum_cost_limit = 1500;
-- ALTER SYSTEM SET autovacuum_naptime = '30s';
-- ALTER SYSTEM SET max_wal_size = '4GB';
-- ALTER SYSTEM SET min_wal_size = '1GB';
-- ALTER SYSTEM SET max_connections = 200;          -- restart
-- ALTER SYSTEM SET max_worker_processes = 12;       -- restart
-- ALTER SYSTEM SET max_parallel_workers = 12;
-- SELECT pg_reload_conf();                          -- os que não são 'restart' aplicam já

-- 3.2 · PERF-01: Realtime — inspecione o slot lógico ANTES de qualquer ação.
-- SELECT slot_name, active, active_pid,
--        pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal
-- FROM pg_replication_slots;
-- SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname='supabase_realtime';
--   Se o slot 'cainophile_1benh40s' for órfão (sem consumidor legítimo):
-- SELECT pg_drop_replication_slot('cainophile_1benh40s');
--   Nunca publique tabelas de alto volume no realtime:
-- ALTER PUBLICATION supabase_realtime DROP TABLE evo.evolution_messages;      -- se presente/vazia
-- ALTER PUBLICATION supabase_realtime DROP TABLE evo.evolution_conversations; -- se presente/vazia

-- 3.3 · EVO-03: retenção do espelho evo (definir política — ex.: 18 meses).
--      SEM particionamento (lento, gera bloat — seguido de VACUUM):
-- DELETE FROM evo.evolution_messages_wpp2 WHERE created_at < now() - interval '18 months';
-- VACUUM (ANALYZE) evo.evolution_messages_wpp2;

-- 3.4 · EVO-02/03/04/06: modelo correto = tabela única particionada (substitui o "tabela por instância").
--      Migração planejada (validar em staging):
-- CREATE TABLE evo.evolution_messages (LIKE evo.evolution_messages_wpp2 INCLUDING ALL)
--   PARTITION BY LIST (instance_name);
-- ALTER TABLE evo.evolution_messages ATTACH PARTITION evo.evolution_messages_wpp2
--   FOR VALUES IN ('wpp2');
--   → depois: DROP das ~150 tabelas *_<inst> com 0 linhas e seus ~600 índices; retenção via DROP PARTITION.

-- 3.5 · ZAPP-01: modelo de tenancy (substituir RLS permissivo USING(true) por policies escopadas).
--      EXEMPLO para zapp.contatos (adapte a coluna de tenant ao seu modelo real):
-- DROP POLICY IF EXISTS auth_full_access ON zapp.contatos;
-- CREATE POLICY contatos_tenant_rw ON zapp.contatos FOR ALL TO authenticated
--   USING      (company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()))
--   WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
--      Repetir por tabela sensível. Garantir que o backend use service_role (nunca a anon/authenticated key no cliente).

-- 3.6 · EVO-06/07 (design): no modelo consolidado, PK = (id) uuid; dropar coluna morta raw_data.
-- ALTER TABLE evo.evolution_messages_wpp2 DROP COLUMN IF EXISTS raw_data;   -- 100% NULL
