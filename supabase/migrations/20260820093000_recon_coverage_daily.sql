-- 20260820093000 — recon_coverage_daily — REGISTRO RETROATIVO, NAO REAPLICAR
-- =============================================================================
-- Criada direto no banco em 2026-08-20 via MCP (onda paralela CP-2 do PLANO-100).
-- Este arquivo versiona o DDL real capturado do banco em 2026-08-20.
-- Nota de versao: a linha em schema_migrations foi registrada originalmente com
-- version='20260820093000_recon_coverage_daily' (nome embutido na versao);
-- normalizada para version='20260820093000' em 2026-08-20 (ver 20260820194000).
--
-- Rollback:
--   SELECT cron.unschedule('recon-coverage-daily');
--   DROP TABLE IF EXISTS evo.recon_coverage_daily;

CREATE TABLE IF NOT EXISTS evo.recon_coverage_daily (
  snapshot_date date NOT NULL PRIMARY KEY,
  coverage_pct numeric,
  msgs_source_24h bigint,
  msgs_mirror_24h bigint,
  missing_real_24h bigint,
  last_ingest_at timestamp with time zone,
  source text,
  captured_at timestamp with time zone DEFAULT now()
);

COMMENT ON TABLE evo.recon_coverage_daily IS 'Snapshot diario da cobertura do espelho evo vs fonte PG14 — grafico de CP-2 do PLANO-100. coverage_pct = mirror/source sobre janela movel 24h por message_id (via FDW fdw_evolution_message); alerta <99pct via rpc_boundary_raise_alert.';

-- Cron 543 — snapshot diario 04:30 UTC
SELECT cron.schedule('recon-coverage-daily', '30 4 * * *', 'SELECT evo.fn_recon_coverage_snapshot()');

-- Nota F-007: o indice extra idx_recon_coverage_daily_snapshot_date (redundante com a
-- PK em snapshot_date) foi criado junto com a tabela e DROPADO no mesmo dia
-- (ver 20260820192000_f007_extra_dup_idx_fk_indexes.sql).
