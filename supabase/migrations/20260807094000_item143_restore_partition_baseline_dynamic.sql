-- ============================================================================
-- Cron: snapshot diário dinâmico de baseline de disco por partição (item 143)
-- ============================================================================
-- Tipo: pg_cron
--
-- CONTEXTO (item 143 do checklist de auditoria):
--   O snapshot diário de disco é gerado por uma query dinâmica que itera
--   sobre todas as partições de evo.evolution_messages e evo.evolution_conversations,
--   calcula o tamanho de cada partição e insere em ops.disk_baseline.
--
--   Isso permite rastrear crescimento por partição ao longo do tempo, detectar
--   partições anômalas (crescimento acelerado) e planejar capacity.
--
--   O cron usa um bloco DO com pg_catalog.pg_class para listar partições
--   dinamicamente (sem hardcode de nomes de partição).
--
-- NOTA (correção 2026-08-07): o SELECT cron.schedule(...) ON CONFLICT era
-- sintaxe inválida (ON CONFLICT só existe em INSERT) — o efeito foi aplicado
-- por DDL manual. Padrão idempotente da casa (canonical_squash):
-- unschedule condicional + schedule.
-- ============================================================================

SELECT cron.unschedule('disk-baseline-snapshot-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'disk-baseline-snapshot-daily');

SELECT cron.schedule(
  'disk-baseline-snapshot-daily',
  '0 1 * * *',
  $$
  WITH disk_info AS (
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      pg_total_relation_size(c.oid) AS total_bytes,
      pg_relation_size(c.oid) AS table_bytes,
      pg_indexes_size(c.oid) AS indexes_bytes
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('evo', 'zapp', 'ops')
      AND c.relkind IN ('r', 'p')  -- tabelas regulares e particionadas
      AND c.relname NOT LIKE 'pg_%'
  )
  INSERT INTO ops.disk_baseline (metric, value_bytes, meta)
  SELECT
    schema_name || '.' || table_name AS metric,
    total_bytes,
    jsonb_build_object(
      'table_bytes',   table_bytes,
      'indexes_bytes', indexes_bytes,
      'schema',        schema_name,
      'table',         table_name
    )
  FROM disk_info
  $$
);
