-- Runbook-2 (05/08/2026): Drop idx_audit_table + autovacuum _baileys_error_events (C-5/C-6)
-- ===========================================================================
-- Sync repo x DB: aplicados diretamente no banco pelos agentes do runbook-2
-- em 05/08/2026 SEM cobertura versionada.
--   C-5: DROP INDEX idx_audit_table (índice da tabela _audit_destructive) —
--        já dropado; verificado ausente em pg_indexes (2026-08-06).
--   C-6: ALTER TABLE _baileys_error_events SET (autovacuum_vacuum_scale_factor=0.05,
--        autovacuum_analyze_scale_factor=0.05, autovacuum_vacuum_threshold=1000).
--
-- Observação de estado (2026-08-06): nem _audit_destructive nem
-- _baileys_error_events existem mais no banco canônico (pg_class/pg_tables
-- vazios em todos os schemas — tabelas efêmeras de auditoria/erros da
-- Evolution, criadas e removidas fora do fluxo de migrations; nenhum CREATE
-- TABLE para elas existe no repo). A migration é, portanto, documental e
-- defensiva:
--   * DROP INDEX IF EXISTS — no-op se ausente (estado atual);
--   * ALTER TABLE ... SET em DO block com guarda to_regclass — no-op se a
--     tabela não existir; se alguém recriar a tabela no futuro, os parâmetros
--     de autovacuum são aplicados (idempotente por construção).
-- ===========================================================================

DROP INDEX IF EXISTS idx_audit_table;

DO $do$
BEGIN
  IF to_regclass('public._baileys_error_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public._baileys_error_events SET (
      autovacuum_vacuum_scale_factor  = 0.05,
      autovacuum_analyze_scale_factor = 0.05,
      autovacuum_vacuum_threshold     = 1000
    )';
  END IF;
END
$do$;
