-- ============================================================================
-- ops.disk_baseline table + collector guard + cron (item 89)
-- ============================================================================
-- Tipo: DDL + pg_cron
--
-- CONTEXTO (item 89 do checklist de auditoria):
--   ops.disk_baseline é a série temporal de métricas de disco do servidor.
--   O collector guard (ops.fn_host_disk_collector_guard) roda a cada 15 min
--   e verifica se o coletor de disco está ativo; se não houver snapshot nas
--   últimas 2h, dispara alerta no warroom.
--
--   ops.disk_baseline também alimenta o snapshot diário (ver item 143).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Tabela de linha de base de disco
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops.disk_baseline (
  ts           timestamptz  NOT NULL DEFAULT now(),
  metric       text         NOT NULL,
  value_bytes  bigint       NOT NULL,
  meta         jsonb,
  id           bigint       NOT NULL DEFAULT nextval('ops.disk_baseline_id_seq'),

  CONSTRAINT disk_baseline_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  CREATE SEQUENCE IF NOT EXISTS ops.disk_baseline_id_seq
    START WITH 1 INCREMENT BY 1 NO MAXVALUE CACHE 1;
  ALTER TABLE ops.disk_baseline
    ALTER COLUMN id SET DEFAULT nextval('ops.disk_baseline_id_seq');
EXCEPTION WHEN others THEN NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_db_metric_ts
  ON ops.disk_baseline (metric, ts DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Permissões
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE ops.disk_baseline FROM PUBLIC, anon;
GRANT SELECT ON TABLE ops.disk_baseline TO authenticated;
GRANT ALL ON TABLE ops.disk_baseline TO service_role, postgres;
GRANT USAGE, SELECT ON SEQUENCE ops.disk_baseline_id_seq TO service_role, postgres;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Cron jobs
-- ─────────────────────────────────────────────────────────────────────────────

-- Guard do collector — verifica se o coletor está ativo (a cada 15 min)
SELECT cron.schedule(
  'host-disk-collector-guard',
  '7,22,37,52 * * * *',
  'SELECT ops.fn_host_disk_collector_guard()'
) ON CONFLICT (jobname) DO NOTHING;

-- Prune semanal da série histórica (mantém últimos 90 dias)
SELECT cron.schedule(
  'disk-baseline-prune-weekly',
  '30 3 * * 0',
  'SELECT ops.prune_disk_baseline()'
) ON CONFLICT (jobname) DO NOTHING;
