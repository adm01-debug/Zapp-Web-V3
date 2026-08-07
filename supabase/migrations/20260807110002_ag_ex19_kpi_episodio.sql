-- ============================================================================
-- ag_ex19: função evo.fn_wpp2_uptime_kpi
-- ============================================================================
-- Tipo: DDL (função)
--
-- CONTEXTO:
--   Função de KPI de uptime da instância wpp2. Calcula a porcentagem de tempo
--   em que a instância estava conectada ('open') nas últimas 24 horas, com
--   base nos eventos de status recebidos via Evolution API.
--
--   Resultado inserido em ops.disk_baseline como métrica 'evo.wpp2.uptime_pct'
--   para série histórica e alertas de SLA.
--
--   Retorna jsonb com:
--     - uptime_pct: porcentagem de uptime (0-100)
--     - total_checks: quantidade de eventos analisados
--     - open_checks: quantidade de eventos com status 'open'
--     - window_hours: janela de análise (24h)
-- ============================================================================

CREATE OR REPLACE FUNCTION evo.fn_wpp2_uptime_kpi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'evo', 'zapp', 'ops', 'extensions'
AS $$
DECLARE
  v_total   integer;
  v_open    integer;
  v_uptime  numeric;
  v_result  jsonb;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'open')
  INTO v_total, v_open
  FROM evo.evolution_whatsapp_status
  WHERE instance_name = 'wpp2'
    AND created_at > now() - interval '24 hours';

  IF v_total = 0 THEN
    v_uptime := NULL;
  ELSE
    v_uptime := ROUND((v_open::numeric / v_total::numeric) * 100, 2);
  END IF;

  v_result := jsonb_build_object(
    'uptime_pct',    v_uptime,
    'total_checks',  v_total,
    'open_checks',   v_open,
    'window_hours',  24,
    'computed_at',   now()
  );

  -- Registrar na série histórica
  IF v_uptime IS NOT NULL THEN
    INSERT INTO ops.disk_baseline (metric, value_bytes, meta)
    VALUES (
      'evo.wpp2.uptime_pct',
      -- value_bytes = uptime * 100 (armazenar como integer × 100 para preservar decimais)
      (v_uptime * 100)::bigint,
      v_result
    );

    -- Alertar se uptime < 90% nas últimas 24h
    IF v_uptime < 90 THEN
      INSERT INTO zapp.warroom_alerts
        (alert_type, title, message, source, entity, severity)
      VALUES
        ('warning',
         format('wpp2 uptime abaixo de 90%% nas últimas 24h: %.1f%%', v_uptime),
         format('Total checks: %s | Open: %s | Uptime: %.2f%%',
                v_total, v_open, v_uptime),
         'evo-wpp2-uptime-kpi',
         'wpp2',
         CASE WHEN v_uptime < 75 THEN 'critical' ELSE 'high' END)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION evo.fn_wpp2_uptime_kpi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION evo.fn_wpp2_uptime_kpi() TO service_role, postgres;

COMMENT ON FUNCTION evo.fn_wpp2_uptime_kpi() IS
  'KPI de uptime da instância wpp2 nas últimas 24h. '
  'Executa via cron evo-wpp2-uptime-kpi a cada 15 min. '
  'Registra em ops.disk_baseline e dispara alerta se uptime < 90%%.';
