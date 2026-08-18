-- =============================================================================
-- TESTE DE CONTRATO E67 — SLA: consolidação e queries indexadas
-- =============================================================================
-- Contexto (campanha 100 etapas, E67, wt-h9):
--   • useSLAMetrics/useSLAHistory filtram `zapp.conversation_sla` por
--     `created_at >= <início do período>` + ORDER BY created_at — sem índice
--     em created_at → seq scan a cada fetch (dashboard SLA abre 2 queries).
--   • Migração de consolidação 20260818190000_etapa67_sla_consolidacao_queries.sql
--     adiciona idx_conversation_sla_created_at (IF NOT EXISTS) e DOCUMENTA o
--     estado de consolidação (duplicatas já removidas em ondas anteriores:
--     zapp.sla_policies DROP 20260807235500, public.sla_configs_v1 DROP
--     20260807000001, políticas RLS duplicadas em sla_history DROP
--     20260806970000; evo.v_kpi_overview definida 2x em migrations distintas
--     com corpo IDÊNTICO — CREATE OR REPLACE, sem objeto duplicado em runtime,
--     migrations aplicadas NÃO são editadas (imutabilidade)).
--
-- CONTRATO:
--   C1. Índice idx_conversation_sla_created_at existe em zapp.conversation_sla
--       (coluna created_at) → queries por período usam índice, sem seq scan.
--   C2. Objetos SLA canônicos seguem presentes (a consolidação NÃO dropou nada):
--       zapp.sla_configurations, zapp.sla_history, zapp.sla_violations,
--       zapp.conversation_sla, evo.v_kpi_overview.
--   C3. Índices pré-existentes de SLA seguem intactos:
--       idx_conversation_sla_contact, idx_zapp_conv_sla_config,
--       idx_sla_hist_alert, idx_slav_agent.
--
-- ESTADO RED ESPERADO (antes da migration E67): C1 falha (índice ausente).
-- DEPOIS da migration: GREEN total.
--
-- Como rodar (role postgres/supabase_admin):
--   psql "$SUPABASE_DB_URL" -f supabase/tests/test_etapa67_sla_consolidacao.sql
--   (ou SQL editor / MCP — DO block único, sem side effects).
-- =============================================================================
DO $$
DECLARE
  v_failures text[] := '{}';
  v_has_index boolean;
  v_missing_objects text[] := '{}';
  v_missing_idxs text[] := '{}';
  v_obj text;
  v_idx text;
BEGIN
  -- C1: índice de created_at (alvo da migração E67)
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'zapp'
      AND tablename  = 'conversation_sla'
      AND indexname  = 'idx_conversation_sla_created_at'
  ) INTO v_has_index;

  IF NOT v_has_index THEN
    v_failures := array_append(v_failures,
      'C1: índice zapp.idx_conversation_sla_created_at AUSENTE — queries SLA por período fazem seq scan');
  END IF;

  -- C2: objetos canônicos seguem presentes (nada foi dropado pela consolidação)
  FOREACH v_obj IN ARRAY ARRAY[
    'zapp.sla_configurations',
    'zapp.sla_history',
    'zapp.sla_violations',
    'zapp.conversation_sla'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = split_part(v_obj, '.', 1)
        AND c.relname = split_part(v_obj, '.', 2)
        AND c.relkind IN ('r', 'v', 'm', 'p')
    ) THEN
      v_missing_objects := array_append(v_missing_objects, v_obj);
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'v_kpi_overview' AND c.relkind = 'v'
  ) THEN
    v_missing_objects := array_append(v_missing_objects, 'evo.v_kpi_overview');
  END IF;

  IF array_length(v_missing_objects, 1) IS NOT NULL THEN
    v_failures := array_append(v_failures,
      'C2: objetos canônicos de SLA AUSENTES (consolidação dropou?): ' ||
      array_to_string(v_missing_objects, ', '));
  END IF;

  -- C3: índices pré-existentes intactos
  FOREACH v_idx IN ARRAY ARRAY[
    'idx_conversation_sla_contact',
    'idx_zapp_conv_sla_config',
    'idx_sla_hist_alert',
    'idx_slav_agent'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = v_idx
    ) THEN
      v_missing_idxs := array_append(v_missing_idxs, v_idx);
    END IF;
  END LOOP;

  IF array_length(v_missing_idxs, 1) IS NOT NULL THEN
    v_failures := array_append(v_failures,
      'C3: índices SLA pré-existentes AUSENTES: ' ||
      array_to_string(v_missing_idxs, ', '));
  END IF;

  IF array_length(v_failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'E67 SLA CONTRACT FAILED: %', array_to_string(v_failures, ' | ');
  END IF;

  RAISE NOTICE 'E67 SLA CONTRACT OK: índice created_at presente; objetos canônicos intactos';
END $$;
