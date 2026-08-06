-- =====================================================================
-- (incluído do merge com main — idempotente)
-- CREATE TABLE ops.disk_orphans
-- ============================================================================
-- Tipo: DDL
--
-- CONTEXTO:
--   Catálogo de volumes Docker órfãos detectados pelo script de monitoramento
--   de disco. Um volume é "órfão" quando não está montado em nenhum serviço
--   ativo. O collector popula esta tabela; o operador revisa (reviewed_at)
--   e aprova deleção (deleted_at).
--
--   volume_name é PK porque um volume Docker tem nome único no daemon.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ops.disk_orphans (
  volume_name   text         NOT NULL,
  size_str      text,
  detected_at   timestamptz           DEFAULT now(),
  reviewed_at   timestamptz,
  deleted_at    timestamptz,

  CONSTRAINT disk_orphans_pkey PRIMARY KEY (volume_name)
);

REVOKE ALL ON TABLE ops.disk_orphans FROM PUBLIC, anon;
GRANT SELECT ON TABLE ops.disk_orphans TO authenticated;
GRANT ALL ON TABLE ops.disk_orphans TO service_role, postgres;
=======
-- Item 65 da auditoria infra (AG-EX-01): autovacuum per-table (substitui cron disk-tables-vacuum-weekly job 231)
ALTER TABLE ops.disk_orphans SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_vacuum_threshold=100, autovacuum_analyze_scale_factor=0.02);
