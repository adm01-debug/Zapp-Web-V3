-- =====================================================================
-- (incluído do merge com main — idempotente)
-- CREATE TABLE evo.evolution_bootstrap_log + VACUUM cron
-- ============================================================================
-- Tipo: DDL + pg_cron
--
-- CONTEXTO:
--   Tabela criada para registrar execuções do bootstrap de instâncias
--   Evolution API (wpp2 e demais instâncias). Cada vez que uma instância
--   é reinicializada ou reconectada, o processo de bootstrap registra
--   quais configurações foram aplicadas, quantos eventos rabbitmq foram
--   registrados e o status final.
--
--   O cron job vacuum-bootstrap-log-daily executa VACUUM ANALYZE diário
--   para manter as estatísticas atualizadas (a tabela recebe INSERTs
--   esporádicos mas é consultada frequentemente pelo dashboard de instâncias).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Criar tabela
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS evo.evolution_bootstrap_log (
  id              uuid         NOT NULL DEFAULT gen_random_uuid(),
  instance_name   text         NOT NULL,
  instance_id     text         NOT NULL,
  triggered_by    text                  DEFAULT 'manual',
  settings_applied jsonb,
  rabbitmq_events_count integer,
  status          text                  DEFAULT 'ok',
  notes           text,
  created_at      timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT evolution_bootstrap_log_pkey PRIMARY KEY (id)
);

-- Index para consultas por instância (dashboard de histórico de boots)
CREATE INDEX IF NOT EXISTS idx_ebl_instance_created
  ON evo.evolution_bootstrap_log (instance_name, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Permissões
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE evo.evolution_bootstrap_log FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE evo.evolution_bootstrap_log TO authenticated;
GRANT ALL ON TABLE evo.evolution_bootstrap_log TO service_role, postgres;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Cron job — VACUUM ANALYZE diário
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('vacuum-bootstrap-log-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vacuum-bootstrap-log-daily');

SELECT cron.schedule(
  'vacuum-bootstrap-log-daily',
  '16 2 * * *',
  'VACUUM ANALYZE evo.evolution_bootstrap_log'
);
-- =======
-- Item 65 da auditoria infra (AG-EX-01): autovacuum per-table (substitui cron vacuum-bootstrap-log-daily job 135)
ALTER TABLE evo.evolution_bootstrap_log SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_vacuum_threshold=100, autovacuum_analyze_scale_factor=0.02, autovacuum_analyze_threshold=50);
