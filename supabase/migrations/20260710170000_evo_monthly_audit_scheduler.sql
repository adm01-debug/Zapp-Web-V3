-- ============================================================================
-- Monthly Audit Scheduler (E10-06)
-- Auditoria 2026-07-10
--
-- Problema: nenhuma auditoria mensal automatizada do pipeline evo —
-- sem histórico de tendências de saúde, volume de mensagens ou estado
-- dos consumidores ao longo do tempo.
--
-- Solução:
--   1. Tabela evo.evolution_monthly_audit_log — armazena snapshot mensal
--   2. Função evo.fn_monthly_evo_audit() — coleta métricas e persiste
--   3. pg_cron job 'monthly-evo-audit' — todo dia 1 às 06:00 UTC
--
-- Métricas capturadas:
--   - Volume de mensagens do mês anterior (total/inbound/outbound)
--   - Saúde do pipeline nos últimos 30 dias (ok/warn/critical + uptime %)
--   - Alertas abertos (critical/high)
--   - Consumidores com rotation_needed=true
--
-- Aplicada ao vivo via MCP em 2026-07-10. Primeiro run verificado:
--   Junho 2026 — 4.760 msgs, 100% uptime, 0 alertas, 4 rotações pendentes.
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION +
--   cron.unschedule (IF EXISTS) + cron.schedule.
-- ============================================================================

-- 1. Log table
CREATE TABLE IF NOT EXISTS evo.evolution_monthly_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  audit_month   DATE NOT NULL,
  report        JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_monthly_audit_month UNIQUE (audit_month)
);

COMMENT ON TABLE evo.evolution_monthly_audit_log IS
  'Monthly automated health/audit snapshot of the evo pipeline — produced by fn_monthly_evo_audit() via pg_cron on day 1 of each month.';

-- 2. Audit function
CREATE OR REPLACE FUNCTION evo.fn_monthly_evo_audit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
DECLARE
  v_month_start   DATE    := date_trunc('month', now() - INTERVAL '1 month')::date;
  v_month_end     DATE    := date_trunc('month', now())::date;
  v_msg_volume    BIGINT;
  v_msg_inbound   BIGINT;
  v_msg_outbound  BIGINT;
  v_alerts_crit   INT;
  v_alerts_high   INT;
  v_rotation_due  INT;
  v_health_ok     INT;
  v_health_warn   INT;
  v_health_crit   INT;
  v_result        JSONB;
BEGIN
  -- Message volume for the completed month
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE NOT COALESCE(from_me, false)),
    COUNT(*) FILTER (WHERE COALESCE(from_me, false))
  INTO v_msg_volume, v_msg_inbound, v_msg_outbound
  FROM evo.evolution_messages_wpp2
  WHERE created_at >= v_month_start AND created_at < v_month_end;

  -- Open critical/high alerts
  SELECT
    COUNT(*) FILTER (WHERE severity = 'critical'),
    COUNT(*) FILTER (WHERE severity = 'high')
  INTO v_alerts_crit, v_alerts_high
  FROM evo.evolution_alerts
  WHERE resolved_at IS NULL AND resolved = false;

  -- Consumers requiring key rotation
  SELECT COUNT(*) INTO v_rotation_due
  FROM evo.evolution_api_consumers
  WHERE rotation_needed = true AND status = 'active';

  -- Pipeline health probe summary for last 30 days
  SELECT
    COUNT(*) FILTER (WHERE probe_status = 'ok'),
    COUNT(*) FILTER (WHERE probe_status = 'warn'),
    COUNT(*) FILTER (WHERE probe_status = 'critical')
  INTO v_health_ok, v_health_warn, v_health_crit
  FROM evo.evolution_pipeline_health_log
  WHERE checked_at >= now() - INTERVAL '30 days';

  v_result := jsonb_build_object(
    'audit_month',         v_month_start,
    'generated_at',        now(),
    'messages', jsonb_build_object(
      'total',    v_msg_volume,
      'inbound',  v_msg_inbound,
      'outbound', v_msg_outbound,
      'period',   v_month_start || ' to ' || v_month_end
    ),
    'pipeline_health_30d', jsonb_build_object(
      'probes_ok',       v_health_ok,
      'probes_warn',     v_health_warn,
      'probes_critical', v_health_crit,
      'uptime_pct',      CASE WHEN (v_health_ok + v_health_warn + v_health_crit) > 0
                           THEN ROUND(100.0 * v_health_ok / (v_health_ok + v_health_warn + v_health_crit), 2)
                           ELSE NULL END
    ),
    'open_alerts', jsonb_build_object(
      'critical', v_alerts_crit,
      'high',     v_alerts_high
    ),
    'consumer_registry', jsonb_build_object(
      'rotation_needed_count', v_rotation_due
    )
  );

  -- Persist snapshot (upsert by month)
  INSERT INTO evo.evolution_monthly_audit_log (audit_month, report)
  VALUES (v_month_start, v_result)
  ON CONFLICT (audit_month) DO UPDATE SET
    report     = EXCLUDED.report,
    created_at = now();

  RETURN v_result;
END;
$$;

-- 3. pg_cron job — idempotent: unschedule old if exists, then re-schedule
SELECT cron.unschedule('monthly-evo-audit') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'monthly-evo-audit'
);

SELECT cron.schedule(
  'monthly-evo-audit',
  '0 6 1 * *',
  'SELECT evo.fn_monthly_evo_audit();'
);
