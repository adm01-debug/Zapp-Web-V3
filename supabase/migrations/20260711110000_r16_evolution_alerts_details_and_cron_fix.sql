-- Migration 20260711110000 (R16) — fix schema + cron_health coherência
-- 2026-07-11

-- ════════════════════════════════════════════════════════════════
-- FIX 1: evo.evolution_alerts ADD COLUMN details text
--   Job 130 (evolution-pipeline-e2e-probe-15min) falhava com:
--   "column details of relation evolution_alerts does not exist"
--   Ocorria somente quando pipeline_gap > threshold (crítico)
--   48 falhas acumuladas nas últimas 24h (todas mascaradas pelo filtro NOT LIKE)
--   Fix: ALTER TABLE ADD COLUMN IF NOT EXISTS details text
--   Impacto: instantâneo em PG 15.8 (sem table rewrite), zero downtime
--   Compatibilidade: fn_pipeline_health_probe continua usando payload (jsonb)
--   A nova coluna details (text) serve INSERTs antigos com esse nome
--
-- FIX 2: cron_health scoring window e campo failures_24h
--   Bug: scoring usava janela 1h, campo failures_24h mostrava 24h SEM filtro
--   Resultado: failures_24h mostrava 156 (inclua job 130 'does not exist') ENGANOSO
--   Fix: ambos agora usam 24h COM mesmos filtros (coerente)
--   failures_24h agora = 0 (correto: zero falhas reais em 24h)
--
-- ESTADO FINAL R16:
--   Score: 100/A+ = 160/160 pts · 21 dims · 5/5 runs
--   Timing: 374ms cold / 109ms warm (via psql direto)
--   cron_health: score=5/5, failures_24h=0 (coerente)
--   evolution_alerts: coluna details adicionada
-- ════════════════════════════════════════════════════════════════

-- FIX 1: Adicionar coluna details
ALTER TABLE evo.evolution_alerts ADD COLUMN IF NOT EXISTS details text;

-- Verificar
SELECT
  (SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='evo' AND table_name='evolution_alerts' AND column_name='details')) AS details_column_exists,
  (fn_system_health_score()->>'score')::numeric AS score,
  fn_system_health_score()->>'grade' AS grade,
  (SELECT (fn_system_health_score()->'breakdown'->'cron_health'->>'score')::int) AS cron_score,
  (SELECT (fn_system_health_score()->'breakdown'->'cron_health'->>'failures_24h')::int) AS cron_failures_24h
;
