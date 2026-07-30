-- ============================================================================
-- Evolution Pipeline Health Probe — SLO Adaptativos por Horário Comercial
-- Auditoria 2026-07-10 (item E8-05)
--
-- Problema: fn_pipeline_health_probe usava threshold fixo de 60 min crítico.
-- Com probe a cada 15 min, pior-caso de detecção era ~74 min durante horário
-- comercial — inaceitável para um sistema B2B de mensageria.
--
-- Solução: thresholds adaptativos baseados em horário comercial (BRT):
--   - Seg–Sex 08:00–19:59 BRT → critical=20 min, warn=10 min, fast=5 min
--   - Demais horários         → critical=60 min, warn=30 min, fast=15 min
-- Pior-caso de detecção em horário comercial: probe (15 min) + threshold (20 min) = ~35 min.
--
-- Aplicada ao vivo via MCP em 2026-07-10 e verificada (status=ok, gap_min=0).
-- Idempotente: CREATE OR REPLACE FUNCTION.
-- ============================================================================

CREATE OR REPLACE FUNCTION evo.fn_pipeline_health_probe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
DECLARE
  v_gap_min           NUMERIC;
  v_last_msg_at       TIMESTAMPTZ;
  v_msg_count_1h      INTEGER;
  v_probe_status      TEXT;
  v_pipeline_status   public.evolution_pipeline_status;
  v_detail            TEXT;
  v_alerts_open       INTEGER;
  v_now_brt           TIMESTAMPTZ;
  v_dow               INTEGER;   -- 0=Sunday..6=Saturday
  v_hour_brt          INTEGER;
  v_business_hours    BOOLEAN;
  v_crit_threshold    INTEGER;
  v_warn_threshold    INTEGER;
  v_fast_threshold    INTEGER;
BEGIN
  -- ── 1. Coleta métricas de mensagem ────────────────────────────────────────
  SELECT MAX(created_at),
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour')
  INTO v_last_msg_at, v_msg_count_1h
  FROM evo.evolution_messages_wpp2;

  v_gap_min := EXTRACT(EPOCH FROM (
    NOW() - COALESCE(v_last_msg_at, NOW() - INTERVAL '9999 minutes')
  )) / 60;

  SELECT COUNT(*) INTO v_alerts_open
  FROM evo.evolution_alerts
  WHERE severity IN ('critical','high') AND resolved_at IS NULL;

  -- ── 2. Thresholds adaptativos por horário comercial (BRT) ─────────────────
  v_now_brt       := NOW() AT TIME ZONE 'America/Sao_Paulo';
  v_dow           := EXTRACT(DOW FROM v_now_brt);    -- 0=Dom, 6=Sáb
  v_hour_brt      := EXTRACT(HOUR FROM v_now_brt);
  v_business_hours := (v_dow BETWEEN 1 AND 5) AND (v_hour_brt BETWEEN 8 AND 19);

  IF v_business_hours THEN
    -- Horário comercial: alertas rápidos (pior-caso com probe 15min = ~35 min)
    v_crit_threshold := 20;
    v_warn_threshold := 10;
    v_fast_threshold := 5;   -- info-level early warning
  ELSE
    -- Fora do horário: gaps mais longos são esperados
    v_crit_threshold := 60;
    v_warn_threshold := 30;
    v_fast_threshold := 15;
  END IF;

  -- ── 3. Avaliação do estado ─────────────────────────────────────────────────
  IF v_gap_min > v_crit_threshold THEN
    v_probe_status    := 'critical';
    v_pipeline_status := 'critical';
    v_detail := format(
      'GAP CRITICO: %s min sem mensagens (threshold=%s min, %s).',
      ROUND(v_gap_min), v_crit_threshold,
      CASE WHEN v_business_hours THEN 'horário comercial' ELSE 'fora do horário' END
    );
  ELSIF v_gap_min > v_warn_threshold THEN
    v_probe_status    := 'warn';
    v_pipeline_status := 'degraded_webhook';
    v_detail := format(
      'GAP elevado: %s min sem mensagens (warn=%s min, %s).',
      ROUND(v_gap_min), v_warn_threshold,
      CASE WHEN v_business_hours THEN 'horário comercial' ELSE 'fora do horário' END
    );
  ELSIF v_msg_count_1h = 0 AND v_gap_min > v_fast_threshold THEN
    v_probe_status    := 'warn';
    v_pipeline_status := 'warning';
    v_detail := format(
      'Sem mensagens na última hora. Gap: %s min (fast=%s min).',
      ROUND(v_gap_min), v_fast_threshold
    );
  ELSE
    v_probe_status    := 'ok';
    v_pipeline_status := 'healthy';
    v_detail := format(
      'Pipeline OK. Gap: %s min. Msgs/1h: %s. %s.',
      ROUND(v_gap_min), v_msg_count_1h,
      CASE WHEN v_business_hours THEN 'Horário comercial' ELSE 'Fora do horário' END
    );
  END IF;

  -- ── 4. Grava log de saúde ──────────────────────────────────────────────────
  INSERT INTO evo.evolution_pipeline_health_log
    (checked_at, pipeline_status, baileys_health, gap_inbound_min,
     detail, probe_status, instance_name, unroutable_count,
     webhook_events_1h, alerts_critical_open, notes)
  VALUES
    (NOW(), v_pipeline_status,
     CASE WHEN v_gap_min < v_warn_threshold THEN 'connected' ELSE 'check_required' END,
     v_gap_min, v_detail, v_probe_status, 'wpp2', 0,
     v_msg_count_1h, v_alerts_open,
     format('auto-probe-15min | biz_hours=%s | crit=%s warn=%s',
            v_business_hours, v_crit_threshold, v_warn_threshold));

  -- ── 5. Alerta crítico com cooldown de 30 min ──────────────────────────────
  IF v_probe_status = 'critical' THEN
    INSERT INTO evo.evolution_alerts (severity, alert_type, message, details)
    SELECT 'critical', 'pipeline_gap',
           format('GAP crítico: %s min sem mensagem (%s)',
                  ROUND(v_gap_min),
                  CASE WHEN v_business_hours THEN 'horário comercial' ELSE 'fora do horário' END),
           jsonb_build_object(
             'gap_min',         v_gap_min,
             'last_msg_at',     v_last_msg_at,
             'business_hours',  v_business_hours,
             'threshold_used',  v_crit_threshold
           )
    WHERE NOT EXISTS (
      SELECT 1 FROM evo.evolution_alerts
      WHERE alert_type = 'pipeline_gap' AND severity = 'critical'
        AND resolved_at IS NULL
        AND created_at >= NOW() - INTERVAL '30 minutes'
    );
  END IF;

  -- ── 6. Retorno ────────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'status',            v_probe_status,
    'gap_min',           ROUND(v_gap_min),
    'msgs_1h',           v_msg_count_1h,
    'alerts_open',       v_alerts_open,
    'pipeline_status',   v_pipeline_status::TEXT,
    'business_hours',    v_business_hours,
    'crit_threshold',    v_crit_threshold,
    'warn_threshold',    v_warn_threshold,
    'checked_at',        NOW()
  );
END;
$$;
