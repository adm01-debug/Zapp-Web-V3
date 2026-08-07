-- ============================================================================
-- AG-EX-03 — Drop de índices redundantes (prefixo) em partições vazias
-- Aplicado em produção via MCP em 2026-08-07.
-- ============================================================================
-- CONTEXTO (item 53 da auditoria infra — índices duplicados):
--   Análise de 214 índices em evo.evolution_contacts, evo.evolution_messages_*,
--   evo.evolution_webhook_events_v2 e zapp.webhook_events_processed:
--     0 duplicatas exatas (mesmas colunas + opclass + predicado).
--   Únicos redundantes ESTRITOS encontrados: 4 índices diretos btree(remote_jid)
--   em partições VAZIAS (reltuples=0) do parent evolution_messages, subsumidos
--   pelo filho herdado do parent idx_evo_msgs_remote_jid_created:
--     evolution_messages_<tenant>_remote_jid_created_at_idx (remote_jid, created_at DESC)
--   Mesma coluna líder, mesmo opclass btree, sem predicado → keeper cobre TODO
--   acesso do candidato. Não-UNIQUE, sem pg_constraint, sem refs no repo
--   (grep src/ + supabase/), sem refs em migrations (criados ad-hoc).
-- BACKUP/ROLLBACK (CREATE INDEX com a definição salva):
--   CREATE INDEX idx_compras_rjid     ON evo.evolution_messages_compras    USING btree (remote_jid);
--   CREATE INDEX idx_financeiro_rjid  ON evo.evolution_messages_financeiro USING btree (remote_jid);
--   CREATE INDEX idx_logistica_rjid   ON evo.evolution_messages_logistica  USING btree (remote_jid);
--   CREATE INDEX idx_marketing_rjid   ON evo.evolution_messages_marketing  USING btree (remote_jid);
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS evo.idx_compras_rjid;
DROP INDEX CONCURRENTLY IF EXISTS evo.idx_financeiro_rjid;
DROP INDEX CONCURRENTLY IF EXISTS evo.idx_logistica_rjid;
DROP INDEX CONCURRENTLY IF EXISTS evo.idx_marketing_rjid;
