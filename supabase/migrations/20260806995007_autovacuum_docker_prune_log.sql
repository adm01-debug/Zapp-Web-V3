-- =====================================================================
-- (incluído do merge com main — idempotente)
-- CREATE TABLE ops.docker_prune_log + VACUUM semanal de todas ops.*
-- ============================================================================
-- Tipo: DDL + pg_cron
--
-- CONTEXTO:
--   Log de operações docker prune executadas pelo sistema de gestão de disco.
--   Registra o tipo de operação (image prune, volume prune, etc.) e quantos
--   bytes foram liberados. Permite auditoria e cálculo de eficiência da
--   estratégia de limpeza automática.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ops.docker_prune_log (
  id              bigint       NOT NULL DEFAULT nextval('ops.docker_prune_log_id_seq'),
  ts              timestamptz  NOT NULL DEFAULT now(),
  operation       text         NOT NULL,
  reclaimed_bytes bigint,

  CONSTRAINT docker_prune_log_pkey PRIMARY KEY (id)
);

-- Criar a sequência separadamente (idempotente)
DO $$
BEGIN
  CREATE SEQUENCE IF NOT EXISTS ops.docker_prune_log_id_seq
    START WITH 1 INCREMENT BY 1 NO MAXVALUE CACHE 1;
  ALTER TABLE ops.docker_prune_log
    ALTER COLUMN id SET DEFAULT nextval('ops.docker_prune_log_id_seq');
EXCEPTION WHEN others THEN
  NULL;
END;
$$;

REVOKE ALL ON TABLE ops.docker_prune_log FROM PUBLIC, anon;
GRANT SELECT ON TABLE ops.docker_prune_log TO authenticated;
GRANT ALL ON TABLE ops.docker_prune_log TO service_role, postgres;
GRANT USAGE, SELECT ON SEQUENCE ops.docker_prune_log_id_seq TO service_role, postgres;

-- ─────────────────────────────────────────────────────────────────────────────
-- Cron de VACUUM semanal em todas as tabelas ops.*
-- (Registrado aqui porque esta é a última tabela ops.* a ser criada)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('disk-tables-vacuum-weekly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'disk-tables-vacuum-weekly');

SELECT cron.schedule(
  'disk-tables-vacuum-weekly',
  '0 2 * * 0',
  $$VACUUM ANALYZE ops.disk_actions_queue, ops.paused_services, ops.alert_cooldown, ops.docker_prune_log, ops.disk_orphans$$
);
-- =======
-- Item 65 da auditoria infra (AG-EX-01): autovacuum per-table (substitui cron disk-tables-vacuum-weekly job 231)
ALTER TABLE ops.docker_prune_log SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_vacuum_threshold=100, autovacuum_analyze_scale_factor=0.02);
