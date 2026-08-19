-- ============================================================================
-- ag_ex19: KPI watchdogs — uptime wpp2 + cron inventory (estrutura base)
-- ============================================================================
-- Tipo: DDL
--
-- CONTEXTO (agente ex19 — episódio de watchdogs KPI):
--   Estrutura base para os watchdogs de KPI do episódio ex19:
--     - evo.fn_wpp2_uptime_kpi: calcula KPI de uptime da instância wpp2
--     - zapp.cron_inventory: catálogo de todos os cron jobs com metadados
--       de propósito, SLA e status
--
--   O cron job 'evo-wpp2-uptime-kpi' executa a cada 15 min e registra
--   a métrica de uptime no sistema de KPI.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Tabela de inventário de cron jobs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS zapp.cron_inventory (
  jobid       integer      NOT NULL,
  jobname     text         NOT NULL,
  owner       text         NOT NULL DEFAULT 'time-plataforma',
  purpose     text,
  sla         text,
  status      text         NOT NULL DEFAULT 'mantido',
  replaced_by integer,
  nota        text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cron_inventory_pkey PRIMARY KEY (jobid),
  CONSTRAINT cron_inventory_jobname_key UNIQUE (jobname)
);

REVOKE ALL ON TABLE zapp.cron_inventory FROM PUBLIC, anon;
GRANT SELECT ON TABLE zapp.cron_inventory TO authenticated;
GRANT ALL ON TABLE zapp.cron_inventory TO service_role, postgres;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Cron job — KPI de uptime wpp2 (a cada 15 min)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('evo-wpp2-uptime-kpi')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evo-wpp2-uptime-kpi');

SELECT cron.schedule(
  'evo-wpp2-uptime-kpi',
  '6,21,36,51 * * * *',
  'SELECT evo.fn_wpp2_uptime_kpi()'
);
