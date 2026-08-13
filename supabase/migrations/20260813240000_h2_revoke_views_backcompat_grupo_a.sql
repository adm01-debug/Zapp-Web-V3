-- Migration: [H2-COMPLEMENT] REVOKE escrita authenticated em views backcompat Grupo A (zapp)
-- Detectado em auditoria exaustiva 2026-08-13 23h BRT
--
-- Contexto: PR#1071 revogou INSERT/UPDATE/DELETE de authenticated nas TABELAS Grupo A em evo.
-- Porém existiam 25 views de backcompat em zapp apontando para essas tabelas (SECURITY INVOKER).
-- Os grants de escrita nas views não eram bypass efetivo (RLS da tabela base bloqueava em runtime),
-- mas violavam o princípio do menor privilégio e confundiam auditorias de segurança.
--
-- Verificado:
-- - Views são SECURITY INVOKER (opera como o caller, não como definer)
-- - Tabelas base em evo têm RLS ativo com policy service_role_only
-- - SELECT preservado (authenticated continua podendo ler via views)

REVOKE INSERT, UPDATE, DELETE ON
  zapp.evolution_alert_cooldown,
  zapp.evolution_backfill_audit,
  zapp.evolution_bootstrap_log,
  zapp.evolution_connection_history,
  zapp.evolution_guardian_heartbeat,
  zapp.evolution_instances,
  zapp.evolution_instances_public,
  zapp.evolution_pipeline_health_log,
  zapp.evolution_pipeline_history,
  zapp.evolution_reconcile_jobs,
  zapp.evolution_retention_log,
  zapp.evolution_webhook_events_v2,
  zapp.evolution_webhook_events_v2_2026_07,
  zapp.evolution_webhook_events_v2_2026_08,
  zapp.evolution_webhook_events_v2_2026_09,
  zapp.evolution_webhook_events_v2_2026_10,
  zapp.evolution_webhook_events_v2_2026_11,
  zapp.evolution_webhook_events_v2_2026_12,
  zapp.evolution_webhook_events_v2_2027_01,
  zapp.evolution_webhook_events_v2_2027_02,
  zapp.evolution_webhook_events_v2_2027_03,
  zapp.evolution_webhook_events_v2_2027_04,
  zapp.evolution_webhook_events_v2_2027_05,
  zapp.evolution_webhook_events_v2_2027_06,
  zapp.evolution_webhook_events_v2_default
FROM authenticated;
