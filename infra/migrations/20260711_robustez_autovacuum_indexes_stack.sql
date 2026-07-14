-- Migration: 20260711_robustez_autovacuum_indexes_stack
-- Autor: Claude (auditoria exaustiva v2 — 2026-07-11)
-- Scope: Banco Supabase PostgreSQL 15.8

-- ============================================================
-- MELHORIA 1: autovacuum agressivo para evolution_pipeline_health_log
-- (gap da sessao anterior — burnin_tracker e instance_credentials ja tinham)
-- ============================================================
ALTER TABLE evo.evolution_pipeline_health_log SET (
  autovacuum_vacuum_scale_factor   = 0,
  autovacuum_vacuum_threshold      = 2,
  autovacuum_analyze_scale_factor  = 0,
  autovacuum_analyze_threshold     = 2
);

-- ============================================================
-- MELHORIA 2: autovacuum agressivo para 7 tabelas sem cobertura
-- Proporcional ao tamanho: grandes=0.01/50, medias=0/5-10, pequenas=0/2
-- ============================================================
-- Grandes (>10k rows): scale_factor=0.01 + threshold=50
ALTER TABLE evo.evolution_whatsapp_status SET (
  autovacuum_vacuum_scale_factor   = 0.01,
  autovacuum_vacuum_threshold      = 50,
  autovacuum_analyze_scale_factor  = 0.01,
  autovacuum_analyze_threshold     = 50
);
ALTER TABLE evo.evolution_conversations_wpp2 SET (
  autovacuum_vacuum_scale_factor   = 0.01,
  autovacuum_vacuum_threshold      = 50,
  autovacuum_analyze_scale_factor  = 0.01,
  autovacuum_analyze_threshold     = 50
);
ALTER TABLE evo.evolution_contacts SET (
  autovacuum_vacuum_scale_factor   = 0.01,
  autovacuum_vacuum_threshold      = 50,
  autovacuum_analyze_scale_factor  = 0.01,
  autovacuum_analyze_threshold     = 50
);
-- Medias (300-1k rows): scale_factor=0, threshold=5
ALTER TABLE evo.evolution_guardian_heartbeat SET (
  autovacuum_vacuum_scale_factor   = 0,
  autovacuum_vacuum_threshold      = 5,
  autovacuum_analyze_scale_factor  = 0,
  autovacuum_analyze_threshold     = 5
);
ALTER TABLE evo.evolution_reconcile_jobs SET (
  autovacuum_vacuum_scale_factor   = 0,
  autovacuum_vacuum_threshold      = 5,
  autovacuum_analyze_scale_factor  = 0,
  autovacuum_analyze_threshold     = 5
);
-- Pequenas (<100 rows): scale_factor=0, threshold=2
ALTER TABLE evo.vps_performance_snapshots SET (
  autovacuum_vacuum_scale_factor   = 0,
  autovacuum_vacuum_threshold      = 2,
  autovacuum_analyze_scale_factor  = 0,
  autovacuum_analyze_threshold     = 2
);
ALTER TABLE evo._secure_config SET (
  autovacuum_vacuum_scale_factor   = 0,
  autovacuum_vacuum_threshold      = 2,
  autovacuum_analyze_scale_factor  = 0,
  autovacuum_analyze_threshold     = 2
);
-- Media-grande (845 rows): scale_factor=0, threshold=10
ALTER TABLE evo.idx_usage_audit SET (
  autovacuum_vacuum_scale_factor   = 0,
  autovacuum_vacuum_threshold      = 10,
  autovacuum_analyze_scale_factor  = 0,
  autovacuum_analyze_threshold     = 10
);

-- ============================================================
-- MELHORIA 3: VACUUM ANALYZE imediato nas tabelas urgentes
-- (executado via portainer_exec_container no Supabase DB)
-- _secure_config: 50%->0%, evolution_reconcile_jobs: 5.26%->0%
-- evolution_guardian_heartbeat: 1.52%->0%
-- evolution_whatsapp_status, evolution_conversations_wpp2: first vacuum ever
-- vps_performance_snapshots: 2.78%->0%
-- ============================================================
-- VACUUM ANALYZE evo._secure_config;
-- VACUUM ANALYZE evo.evolution_reconcile_jobs;
-- VACUUM ANALYZE evo.evolution_guardian_heartbeat;
-- VACUUM ANALYZE evo.evolution_whatsapp_status;
-- VACUUM ANALYZE evo.evolution_conversations_wpp2;
-- VACUUM ANALYZE evo.vps_performance_snapshots;
-- (executado fora de transacao via portainer_exec_container bash loop)

-- ============================================================
-- MELHORIA 5: indice parcial em warroom_alerts para queries rapidas
-- (executado via portainer_exec_container — CREATE INDEX CONCURRENTLY)
-- ============================================================
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_warroom_alerts_unresolved
-- ON public.warroom_alerts (created_at DESC) WHERE resolved_at IS NULL;
-- Resultado: 32kB, parcial, apenas registros abertos (escasso)
-- Acelera: alertas ativos, cleanup queries, dedup checks

-- Para referencia (idempotente em ambiente limpo):
CREATE INDEX IF NOT EXISTS idx_warroom_alerts_unresolved
  ON public.warroom_alerts (created_at DESC)
  WHERE resolved_at IS NULL;

-- ============================================================
-- NOTAS:
-- MELHORIA 4: guardian_heartbeat autovacuum threshold=5 JA cobre (cima)
--   + cron guardian-heartbeat-sync roda a cada 5min (ja existia)
-- MELHORIA 6: fn_guardrails_check v2 JA corrigida (sabado=480min, diasuteis=60min)
--   O alerta de 11/07 foi pelo bug antigo (BETWEEN 1 AND 6 incluia sabado)
-- MELHORIA 7: consumer v18 ok=352, err=0, filas=17/17 — SAUDAVEL
-- MELHORIA 8: stack evolution aplicado via portainer_update_stack
--   Combinando melhor do spec atual (tr -d para secrets)
--   + melhorias do compose commitado (T3+makeBucket, T5a)
--   Patches verificados: T1 removed, T3+makeBucket ativo, T5a ativo,
--   API key via secret (sem plaintext env), evolution_app least-privilege
--   Container: 6e6f1fe8b28d, wpp2: state=open, isHealthy=true
-- MELHORIA 9: orphan ccnew indexes: ZERO encontrados
