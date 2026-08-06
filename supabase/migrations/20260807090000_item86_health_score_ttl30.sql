-- ============================================================================
-- Health Score Cache + History tables + cron jobs (item 86)
-- ============================================================================
-- Tipo: DDL + pg_cron
--
-- CONTEXTO (item 86 do checklist de auditoria):
--   O RPC zapp.fn_system_health_score_cached é chamado pelo dashboard e por
--   alertas a cada minuto. Sem cache, cada chamada executa queries pesadas
--   contra múltiplas tabelas. A tabela fn_health_score_cache armazena o
--   resultado com TTL (padrão 30 min). fn_health_score_history registra
--   série histórica para trending.
--
--   Cron jobs:
--     - refresh-health-score-cache: a cada 30 min, força recompute com TTL=5
--     - purge-health-score-history: diariamente, remove history > 7 dias
--     - system-health-score: a cada hora (minuto 5), recompute cache TTL=30
--     - health_score_alert_hourly: a cada hora (minuto 45), dispara alerta
--       se health score < 70
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Criar tabelas de cache e histórico
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS zapp.fn_health_score_cache (
  id          integer      NOT NULL DEFAULT nextval('zapp.fn_health_score_cache_id_seq'),
  result      jsonb        NOT NULL,
  computed_at timestamptz  NOT NULL DEFAULT now(),
  compute_ms  integer,
  call_count  integer      NOT NULL DEFAULT 0,

  CONSTRAINT fn_health_score_cache_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  CREATE SEQUENCE IF NOT EXISTS zapp.fn_health_score_cache_id_seq
    START WITH 1 INCREMENT BY 1 NO MAXVALUE CACHE 1;
  ALTER TABLE zapp.fn_health_score_cache
    ALTER COLUMN id SET DEFAULT nextval('zapp.fn_health_score_cache_id_seq');
EXCEPTION WHEN others THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS zapp.fn_health_score_history (
  id          bigint       NOT NULL DEFAULT nextval('zapp.fn_health_score_history_id_seq'),
  result      jsonb        NOT NULL,
  computed_at timestamptz  NOT NULL DEFAULT now(),
  compute_ms  integer,

  CONSTRAINT fn_health_score_history_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  CREATE SEQUENCE IF NOT EXISTS zapp.fn_health_score_history_id_seq
    START WITH 1 INCREMENT BY 1 NO MAXVALUE CACHE 1;
  ALTER TABLE zapp.fn_health_score_history
    ALTER COLUMN id SET DEFAULT nextval('zapp.fn_health_score_history_id_seq');
EXCEPTION WHEN others THEN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Permissões
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE zapp.fn_health_score_cache FROM PUBLIC, anon;
GRANT SELECT ON TABLE zapp.fn_health_score_cache TO authenticated;
GRANT ALL ON TABLE zapp.fn_health_score_cache TO service_role, postgres;
GRANT USAGE, SELECT ON SEQUENCE zapp.fn_health_score_cache_id_seq TO service_role, postgres;

REVOKE ALL ON TABLE zapp.fn_health_score_history FROM PUBLIC, anon;
GRANT SELECT ON TABLE zapp.fn_health_score_history TO authenticated;
GRANT ALL ON TABLE zapp.fn_health_score_history TO service_role, postgres;
GRANT USAGE, SELECT ON SEQUENCE zapp.fn_health_score_history_id_seq TO service_role, postgres;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Cron jobs
-- ─────────────────────────────────────────────────────────────────────────────

-- Refresh cache a cada 30 min (forçado, TTL=5 para aceitar o recompute)
SELECT cron.schedule(
  'refresh-health-score-cache',
  '19,49 * * * *',
  'SELECT zapp.fn_system_health_score_cached(5, TRUE)'
) ON CONFLICT (jobname) DO NOTHING;

-- Purge de histórico > 7 dias
SELECT cron.schedule(
  'purge-health-score-history',
  '0 5 * * *',
  $$DELETE FROM zapp.fn_health_score_history WHERE computed_at < now() - interval '7 days'$$
) ON CONFLICT (jobname) DO NOTHING;

-- Recompute horário (minuto 5) — também serve de heartbeat do sistema de saúde
SELECT cron.schedule(
  'system-health-score',
  '5 * * * *',
  'SELECT zapp.fn_system_health_score_cached(30, TRUE)'
) ON CONFLICT (jobname) DO NOTHING;

-- Alerta horário (minuto 45) se score < 70
SELECT cron.schedule(
  'health_score_alert_hourly',
  '45 * * * *',
  'SELECT zapp.fn_alert_health_score_degraded(70)'
) ON CONFLICT (jobname) DO NOTHING;
