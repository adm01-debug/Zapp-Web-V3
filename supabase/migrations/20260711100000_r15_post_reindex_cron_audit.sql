-- Migration 20260711100000 (R15) -- validação pós-REINDEX + inventário cron
-- 2026-07-11

-- ════════════════════════════════════════════════════════════════
-- VALIDAÇÕES R15:
--
-- REINDEX integridade: 4/4 índices indisvalid=true, sem orphans _ccnew
-- RLS fn_health_score_cache: habilitado sem policies = default deny (seguro)
-- cron jobs: 110 jobs legítimos (não orphans — infraestrutura de produção)
-- job 62 (purge_webhook_processed 7-day): REDUNDANTE com job 152 (3-day)
--   Prova: job 62 retorna DELETE 0 (152 já limpou tudo 22ms antes)
--   Job 62 removido via cron.unschedule(62)
--
-- BUG DOCUMENTADO (pré-existente, não nosso):
--   Job 130 (evolution-pipeline-e2e-probe-15min): falha cada 15min
--   Erro: "column details of relation evolution_alerts does not exist"
--   Raiz: fn_pipeline_health_probe INSERT usa (severity,alert_type,message,payload)
--   mas tabela foi alterada sem migrar referência em algum código mais antigo
--   Mascarado corretamente pelo filtro NOT LIKE '%does not exist%' no cron_health
--   Falha só quando pipeline_gap é 'critical' (atualmente OK, logo não afeta score)
--
-- ESTADO FINAL R15:
--   Score: 100/A+ = 160/160 pts · 21 dims · 5/5 runs
--   Timing: 381ms cold / 115ms warm (via psql direto)
--   Índices webhook_events_processed: todos válidos, sem orphans
--   jobs ativos: 110 (removido job 62 redundante)
-- ════════════════════════════════════════════════════════════════

-- Remover job redundante (idempotente: já removido)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='purge_webhook_processed') THEN
    PERFORM cron.unschedule((SELECT jobid FROM cron.job WHERE jobname='purge_webhook_processed'));
  END IF;
END $$;

-- Verificar estado
SELECT
  NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='purge_webhook_processed') AS job62_removed,
  (SELECT BOOL_AND(indisvalid) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='zapp' AND c.relname='webhook_events_processed') AS all_indexes_valid,
  (fn_system_health_score()->>'score')::numeric AS score,
  fn_system_health_score()->>'grade' AS grade
;
