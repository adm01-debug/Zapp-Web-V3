-- Migration: 20260711_vacuum_crons_and_purge_coverage
-- Autor: Claude (auditoria 2026-07-11)
-- Descricao: Item 8 e Item 10 do plano de auditoria exaustiva

-- ============================================================
-- ITEM 8: Adicionar _audit_outbound_trap ao cleanup_event_tables
-- ============================================================
-- Executado via portainer_exec_container no banco Evolution PG14 (d57ea852943c)
-- A funcao cleanup_event_tables no banco public do PG14 foi atualizada para
-- incluir _audit_outbound_trap (occurred_at, retencao 30 dias, igual _baileys_error_events)
--
-- Resultado do purge imediato:
--   _swarm_guardian_events:   0 deletados (nenhum > 7 dias)
--   evolution_webhook_events: 0 deletados (nenhum > 14 dias)
--   _baileys_error_events:    0 deletados (nenhum > 30 dias, tabela com 6 dias de dados)
--   _audit_outbound_trap:  8317 deletados (> 30 dias, entre 01/05 e 11/06/2026)
-- VACUUM ANALYZE _audit_outbound_trap executado apos purge
--
-- Cobertura completa de retencao no banco Evolution PG14 (via evolution-db-purge stack):
--   _audit_destructive:       90 dias (via purge script step 6)
--   _swarm_guardian_events:    7 dias (via cleanup_event_tables)
--   evolution_webhook_events: 14 dias (via cleanup_event_tables)
--   _baileys_error_events:    30 dias (via cleanup_event_tables)
--   _audit_outbound_trap:     30 dias (via cleanup_event_tables - ADICIONADO AGORA)
--   warroom_alerts:           30 dias (via cleanup_old_warroom_alerts)
--   Message:                  90 dias (via purge script step 1)
--   MessageUpdate:            30 dias (via purge script step 2)
--   IsOnWhatsapp:             90 dias (via purge script step 5)

-- DDL da funcao atualizada (para referencia - execucao foi no banco PG14):
-- CREATE OR REPLACE FUNCTION public.cleanup_event_tables(
--   p_guardian_days integer DEFAULT 7,
--   p_webhook_days  integer DEFAULT 14,
--   p_baileys_days  integer DEFAULT 30,
--   p_dry_run       boolean DEFAULT false
-- ) RETURNS TABLE(tabela text, candidatos bigint, deletados bigint)
-- [... inclui _audit_outbound_trap com occurred_at e p_baileys_days como retencao ...]

-- ============================================================
-- ITEM 10: Crons de VACUUM para tabelas sem autovacuum efetivo
-- ============================================================
-- Executado via supabase_db_query no banco Supabase (PostgreSQL 15.8)
-- Problema: 3 tabelas do schema evo sem autovacuum efetivo (n_dead_tup elevado, last_autovacuum=null)
--   evolution_instance_credentials: 96% dead tuples (resolvido por VACUUM manual no item 3)
--   evolution_burnin_tracker:       88% dead tuples (resolvido por VACUUM manual no item 3)
--   evolution_pipeline_health_log:  19% dead tuples (resolvido por VACUUM manual no item 3)
-- Solucao: adicionar crons dedicados para garantir limpeza diaria

SELECT cron.schedule(
  'vacuum-burnin-tracker-daily',
  '12 2 * * *',
  'VACUUM ANALYZE evo.evolution_burnin_tracker'
);

SELECT cron.schedule(
  'vacuum-pipeline-health-log-daily',
  '7 2 * * *',
  'VACUUM ANALYZE evo.evolution_pipeline_health_log'
);

SELECT cron.schedule(
  'vacuum-instance-credentials-daily',
  '9 2 * * *',
  'VACUUM ANALYZE evo.evolution_instance_credentials'
);

-- Verificacao pos-criacao:
-- SELECT jobname, schedule, command, active FROM cron.job
-- WHERE jobname IN ('vacuum-burnin-tracker-daily','vacuum-pipeline-health-log-daily','vacuum-instance-credentials-daily')
-- ORDER BY schedule;
-- Resultado esperado: 3 rows, active=true, horarios: 02:07, 02:09, 02:12 UTC

-- Nota: Esses crons rodam como single-statement VACUUM (correto para pg_cron)
-- Multi-statement VACUUM falha porque pg_cron wraps em transacao
-- Single-statement VACUUM nao roda dentro de transacao - comportamento correto
