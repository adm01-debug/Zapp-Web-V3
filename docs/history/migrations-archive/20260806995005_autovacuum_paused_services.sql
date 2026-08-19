-- =====================================================================
-- (incluído do merge com main — idempotente)
-- CREATE TABLE ops.paused_services + VACUUM cron em lote
-- ============================================================================
-- Tipo: DDL + pg_cron
--
-- CONTEXTO:
--   Tabela de controle de serviços pausados pelo sistema de gestão de disco.
--   Quando o disco atinge threshold crítico, o orchestrator pode pausar
--   serviços não-essenciais (reduzir réplicas a 0) e registra aqui para
--   retomar depois. saved_replicas preserva a contagem original para o rollback.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ops.paused_services (
  service_id      text         NOT NULL,
  service_name    text,
  saved_replicas  integer               DEFAULT 1,
  tier            text         NOT NULL,
  reason          text,
  paused_at       timestamptz  NOT NULL DEFAULT now(),
  unpaused_at     timestamptz,

  CONSTRAINT paused_services_pkey PRIMARY KEY (service_id)
);

REVOKE ALL ON TABLE ops.paused_services FROM PUBLIC, anon;
GRANT SELECT ON TABLE ops.paused_services TO authenticated;
GRANT ALL ON TABLE ops.paused_services TO service_role, postgres;

-- Cron de VACUUM semanal (compartilhado com outros ops.* — ver 20260806995007)
-- O job principal de vacuum das tabelas ops é registrado em 20260806995007.
-- Aqui apenas garantimos que a tabela existe antes daquele cron ser criado.
-- Item 65 da auditoria infra (AG-EX-01): autovacuum per-table (substitui cron disk-tables-vacuum-weekly job 231)
ALTER TABLE ops.paused_services SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_vacuum_threshold=100, autovacuum_analyze_scale_factor=0.02);
