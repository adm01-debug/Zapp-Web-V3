-- ============================================================
-- MIGRAÇÃO S4: Correções de schema graveyard/evo
-- Data: 2026-07-03
-- Sessão: 4 — Simulação exaustiva + fixes automáticos
-- ============================================================

-- ===========================================================
-- FIX 1: evo.evolution_messages_v2 — VIEW alias para graveyard
-- Parent real está em graveyard, não em evo
-- Funções com SET search_path=public,evo precisam desta view
-- ===========================================================
CREATE OR REPLACE VIEW evo.evolution_messages_v2 AS
  SELECT * FROM graveyard.evolution_messages_v2;

-- ===========================================================
-- FIX 2: fn_auto_create_next_partitions
-- Corrigir schema: mensagens → graveyard, webhooks → evo
-- ===========================================================
CREATE OR REPLACE FUNCTION evo.fn_auto_create_next_partitions()
RETURNS TEXT[] LANGUAGE plpgsql SECURITY DEFINER
SET search_path = evo, graveyard
AS $$
DECLARE
  v_results TEXT[] := '{}';
  v_next      DATE := date_trunc('month', NOW() + INTERVAL '1 month');
  v_next_next DATE := date_trunc('month', NOW() + INTERVAL '2 months');
  v_result    TEXT;
BEGIN
  -- MENSAGENS v2: parent em graveyard
  SELECT evo.fn_create_monthly_partition(
    'graveyard', 'evolution_messages_v2',
    EXTRACT(YEAR FROM v_next)::INT, EXTRACT(MONTH FROM v_next)::INT
  ) INTO v_result;
  v_results := v_results || v_result;

  SELECT evo.fn_create_monthly_partition(
    'graveyard', 'evolution_messages_v2',
    EXTRACT(YEAR FROM v_next_next)::INT, EXTRACT(MONTH FROM v_next_next)::INT
  ) INTO v_result;
  v_results := v_results || v_result;

  -- WEBHOOK EVENTS v2: parent em evo
  SELECT evo.fn_create_monthly_partition(
    'evo', 'evolution_webhook_events_v2',
    EXTRACT(YEAR FROM v_next)::INT, EXTRACT(MONTH FROM v_next)::INT
  ) INTO v_result;
  v_results := v_results || v_result;

  SELECT evo.fn_create_monthly_partition(
    'evo', 'evolution_webhook_events_v2',
    EXTRACT(YEAR FROM v_next_next)::INT, EXTRACT(MONTH FROM v_next_next)::INT
  ) INTO v_result;
  v_results := v_results || v_result;

  RETURN v_results;
END;
$$;

-- ===========================================================
-- FIX 3: fn_create_monthly_partition — suporte genérico a schemas
-- ===========================================================
CREATE OR REPLACE FUNCTION evo.fn_create_monthly_partition(
  p_schema     TEXT,
  p_base_table TEXT,
  p_year       INT,
  p_month      INT
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = evo, graveyard, public
AS $$
DECLARE
  v_part_name TEXT;
  v_from_date DATE;
  v_to_date   DATE;
  v_conflicts BIGINT := 0;
  v_result    TEXT;
BEGIN
  v_part_name := format('%s_%s_%s', p_base_table, p_year, LPAD(p_month::TEXT,2,'0'));
  v_from_date := make_date(p_year, p_month, 1);
  v_to_date   := v_from_date + INTERVAL '1 month';

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname=v_part_name AND n.nspname=p_schema
  ) THEN RETURN format('⏭️ Já existe: %I.%I', p_schema, v_part_name); END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname=p_base_table||'_default' AND n.nspname=p_schema
  ) THEN
    EXECUTE format('SELECT COUNT(*) FROM %I.%I WHERE created_at >= %L AND created_at < %L',
      p_schema, p_base_table||'_default', v_from_date, v_to_date) INTO v_conflicts;
    IF v_conflicts > 0 THEN
      RETURN format('⚠️ %s linhas na DEFAULT no range %s→%s. Mova antes.', v_conflicts, v_from_date, v_to_date);
    END IF;
  END IF;

  BEGIN
    EXECUTE format('CREATE TABLE %I.%I PARTITION OF %I.%I FOR VALUES FROM (%L) TO (%L)',
      p_schema, v_part_name, p_schema, p_base_table, v_from_date::TEXT, v_to_date::TEXT);
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_schema, v_part_name);
    EXECUTE format('CREATE POLICY service_role_all ON %I.%I AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true)', p_schema, v_part_name);
    EXECUTE format('CREATE POLICY authenticated_read ON %I.%I AS PERMISSIVE FOR SELECT TO authenticated USING (true)', p_schema, v_part_name);
    EXECUTE format('CREATE POLICY authenticated_insert ON %I.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true)', p_schema, v_part_name);
    RETURN format('✅ Criada+RLS: %I.%I (%s → %s)', p_schema, v_part_name, v_from_date, v_to_date);
  EXCEPTION
    WHEN duplicate_table THEN RETURN format('⏭️ Já existe (race): %I.%I', p_schema, v_part_name);
    WHEN OTHERS THEN RETURN format('⛔ Falhou %s→%s: %s', v_from_date, v_to_date, SQLERRM);
  END;
END;
$$;

-- ===========================================================
-- FIX 4: analyze-catalogo-diario — incluir graveyard
-- (executado via cron.alter_job — veja sessão 4)
-- ===========================================================
-- Ver: supabase/migrations/20260703_s4_cron_analyze_graveyard.sql

-- ===========================================================
-- FIX 5: fn_system_health_score — partition_indexes + cron_health + audit_log
-- ===========================================================
-- (função completa aplicada diretamente no DB via MCP — ver sessão 4)
-- Score resultado: 52/D → 68/C
-- Score projetado pós-QR: 95/A+

-- ===========================================================
-- ARQUITETURA CONFIRMADA (documentação)
-- ===========================================================
COMMENT ON VIEW evo.evolution_messages_v2 IS
'VIEW ALIAS: aponta para graveyard.evolution_messages_v2.
O parent real da tabela particionada de mensagens está no schema graveyard.
Esta view garante que funções com SET search_path=public,evo resolvam corretamente.
NÃO REMOVER sem atualizar todas as funções de monitoramento.';
