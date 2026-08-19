-- ============================================================================
-- Migration: wave2_perf_security
-- Data:      2026-08-05
-- Objetivo:  Onda 2 da auditoria 10 agentes — performance + segurança
--
-- 1. ÍNDICE event_type em evolution_webhook_events_v2 (Postgres #1 — seq scan 171M):
--    - evo.evolution_webhook_events_v2_2026_07 (partição quente, 10.856 seq scans/52%)
--    - evo.evolution_webhook_events_v2_default
--    Evidência: EXPLAIN ANALYZE pós-criação → Index Only Scan (45.736 rows via índice,
--    12ms) vs Seq Scan de 171M tuplas antes.
--
-- 2. TEMPLATE fn_create_monthly_partition corrigido:
--    - REMOVIDAS as políticas permissivas (authenticated_insert WITH CHECK (true),
--      authenticated_read USING (true), service_role_all FOR ALL TO PUBLIC) — partições
--      futuras nasciam com RLS aberto (falsificação de mensagens nas partições novas).
--      Agora: APENAS service_role_all FOR ALL TO service_role (fechado).
--    - ADICIONADO índice (event_type, status, created_at DESC) na criação da partição
--      (partições LIST não herdam índices do parent — o seq scan se repetiria a cada mês).
--
-- 3. Segurança Classe A (Segurança #2 — 51 SECDEF+DML sem guard):
--    REVOKE EXECUTE authenticated das RPCs edge/cron-only (zero callers no front):
--    - zapp.sicoob_outbox_claim(integer)          (fila bancária — só consumer)
--    - zapp.rpc_contract_inventory()              (CI/audit — só service_role)
--    - zapp.reassign_overloaded_agents(integer|)  (cron de redistribuição)
--    - zapp.reassign_absent_agents(integer)       (cron)
--    - zapp.log_assignment_change()               (trigger interno)
--
-- 4. Segurança Classe B — guards fail-closed (admin/supervisor):
--    - zapp.bulk_soft_delete_contacts(uuid[], text) — soft-delete em massa de QUALQUER
--      contato (qualquer authenticated podia apagar contatos de outros workspaces)
--    - zapp.rpc_run_full_test_suite() — insere em sts_troubleshooting_report/stress_test_metrics
--    Simulado em prod: usuário comum → 'permission denied: admin or supervisor required';
--    admin → passa.
--
-- ⚠️ EXECUÇÃO PARCIAL via SUPERUSER (supabase_admin) no container do banco:
--    - LEAKPROOF (#842) exige superuser — já aplicado.
--    - Índices e template exigiram owner/superuser — aplicados via psql supabase_admin.
--    - REVOKEs/guards aplicados via MCP (transactional) — 20260805120407 e 20260805120436.
-- ============================================================================

-- ── 1. Índices event_type ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS evolution_webhook_events_v2_2026_07_event_type_status_idx
  ON evo.evolution_webhook_events_v2_2026_07 (event_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS evolution_webhook_events_v2_default_event_type_status_idx
  ON evo.evolution_webhook_events_v2_default (event_type, status, created_at DESC);

-- ── 2. Template de partição mensal (fechado + índice) ───────────────────────
CREATE OR REPLACE FUNCTION evo.fn_create_monthly_partition(
  p_schema text, p_base_table text, p_year int, p_month int
) RETURNS text
LANGUAGE plpgsql
AS $fn$
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
  ) THEN
    RETURN format('⏭️ Já existe: %I.%I', p_schema, v_part_name);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname=p_base_table||'_default' AND n.nspname=p_schema
  ) THEN
    EXECUTE format(
      'SELECT COUNT(*) FROM %I.%I WHERE created_at >= %L AND created_at < %L',
      p_schema, p_base_table||'_default', v_from_date, v_to_date
    ) INTO v_conflicts;
    IF v_conflicts > 0 THEN
      RETURN format('⚠️ %s linhas na DEFAULT no range %s→%s. Mova antes de criar.', v_conflicts, v_from_date, v_to_date);
    END IF;
  END IF;

  BEGIN
    EXECUTE format(
      'CREATE TABLE %I.%I PARTITION OF %I.%I FOR VALUES FROM (%L) TO (%L)',
      p_schema, v_part_name, p_schema, p_base_table, v_from_date::TEXT, v_to_date::TEXT
    );

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_schema, v_part_name);

    -- FECHADO: apenas service_role (webhook usa service_role). Nada de PUBLIC/authenticated.
    EXECUTE format(
      'CREATE POLICY service_role_all ON %I.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
      p_schema, v_part_name
    );

    -- Índice do padrão de consulta (event_type + status + recência) — partições
    -- LIST não herdam índices do parent; sem isto o seq scan volta a cada mês.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (event_type, status, created_at DESC)',
      v_part_name || '_event_type_status_idx', p_schema, v_part_name
    );

    v_result := format('✅ Criada+RLS+idx: %I.%I (%s → %s)', p_schema, v_part_name, v_from_date, v_to_date);
    RETURN v_result;

  EXCEPTION
    WHEN duplicate_table THEN
      RETURN format('⏭️ Já existe (race): %I.%I', p_schema, v_part_name);
    WHEN OTHERS THEN
      RETURN format('⛔ Falhou %s→%s: %s', v_from_date, v_to_date, SQLERRM);
  END;
END;
$fn$;

-- ── 3. Classe A — REVOKE authenticated (edge/cron-only) ────────────────────
REVOKE EXECUTE ON FUNCTION zapp.sicoob_outbox_claim(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_contract_inventory() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.reassign_overloaded_agents(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.reassign_overloaded_agents() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.reassign_absent_agents(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.log_assignment_change() FROM authenticated;

-- ── 4. Classe B — guards fail-closed (aplicados via MCP; registro aqui) ─────
-- zapp.bulk_soft_delete_contacts(uuid[], text): guard is_admin_or_supervisor no topo
-- zapp.rpc_run_full_test_suite(): guard is_admin_or_supervisor no topo
-- (corpos completos aplicados em 20260805120436 — não duplicados aqui para
--  não divergir da versão com guard já em produção.)

-- ============================================================================
-- FIM — onda 2 (2026-08-05). Financeiro/artes/vendas: PENDENTE decisão de
-- produto (painel-financeiro compartilha role authenticated — não guardado às cegas).
-- ============================================================================
