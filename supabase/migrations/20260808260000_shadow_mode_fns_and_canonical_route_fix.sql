-- Migration: shadow mode functions + canonical route decision (bug fix)
-- Sessão: auditoria-5-agentes 2026-08-08
-- A2/A5: fn_canonical_route_decision usava format(%.1f) inválido no PG → round()::text
-- A5: fn_shadow_snapshot_daily e fn_canonical_route_check_daily versionados pela 1ª vez

-- ============================================================
-- fn_canonical_route_decision (CORRIGIDO: format %.1f → round)
-- ============================================================
CREATE OR REPLACE FUNCTION evo.fn_canonical_route_decision(
  p_min_days int DEFAULT 7,
  p_max_parity_delta_pct numeric DEFAULT 5.0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_days int;
  v_native bigint;
  v_consumer bigint;
  v_parity_delta numeric;
  v_recommended text;
  v_reason text;
BEGIN
  SELECT count(DISTINCT snapshot_date) INTO v_days FROM evo.evolution_source_shadow_log;

  IF v_days < p_min_days THEN
    RETURN jsonb_build_object(
      'status', 'insufficient_data',
      'days_available', v_days,
      'days_required', p_min_days,
      'decision_date', current_date + (p_min_days - v_days),
      'message', 'Aguardando ' || (p_min_days - v_days) || ' dia(s) adicionais de dados'
    );
  END IF;

  SELECT
    COALESCE(sum(event_count) FILTER (WHERE source='evolution-native'), 0),
    COALESCE(sum(event_count) FILTER (WHERE source='consumer'), 0)
  INTO v_native, v_consumer
  FROM evo.evolution_source_shadow_log
  WHERE snapshot_date >= current_date - p_min_days;

  v_parity_delta := abs(100.0 * (v_native - v_consumer) / NULLIF(v_native + v_consumer, 0));

  IF v_parity_delta <= p_max_parity_delta_pct THEN
    v_recommended := 'webhook-direct';
    v_reason := 'Paridade ' || round(v_parity_delta,1) || '% (limiar ' || p_max_parity_delta_pct || '%). Webhook-direct: menos componentes, retry nativo.';
  ELSIF v_native > v_consumer THEN
    v_recommended := 'webhook-direct';
    v_reason := 'Webhook-direct entregou ' || round(v_parity_delta,1) || '% mais eventos. Rota mais confiavel.';
  ELSE
    v_recommended := 'rabbit-consumer';
    v_reason := 'Consumer entregou ' || round(v_parity_delta,1) || '% mais eventos. Investigar antes de desligar.';
  END IF;

  RETURN jsonb_build_object(
    'status', 'ready',
    'days_measured', v_days,
    'evolution_native_total', v_native,
    'consumer_total', v_consumer,
    'parity_delta_pct', round(v_parity_delta, 2),
    'recommended_canonical', v_recommended,
    'route_to_shutdown', CASE v_recommended WHEN 'webhook-direct' THEN 'rabbit-consumer' ELSE 'webhook-direct' END,
    'reason', v_reason,
    'shutdown_stack', CASE v_recommended WHEN 'webhook-direct' THEN 'evolution-rabbit-consumer (stack 113)' ELSE 'evolution-native webhook config' END,
    'evaluated_at', now()
  );
END;
$$;

-- ============================================================
-- fn_shadow_snapshot_daily
-- ============================================================
CREATE OR REPLACE FUNCTION evo.fn_shadow_snapshot_daily()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb := '{}';
  r RECORD;
BEGIN
  DELETE FROM evo.evolution_source_shadow_log WHERE snapshot_date = current_date;

  FOR r IN
    SELECT
      COALESCE(webhook_source, 'legacy') AS source,
      count(*) AS event_count,
      jsonb_object_agg(DISTINCT event_type, 1) AS event_types
    FROM zapp.webhook_events_processed
    WHERE processed_at > now() - interval '24 hours'
    GROUP BY COALESCE(webhook_source, 'legacy')
  LOOP
    INSERT INTO evo.evolution_source_shadow_log(snapshot_date, window_days, source, event_count, event_types)
    VALUES (current_date, 1, r.source, r.event_count, r.event_types);
    v_result := v_result || jsonb_build_object(r.source, r.event_count);
  END LOOP;

  RETURN v_result || jsonb_build_object('snapshot_date', current_date);
END;
$$;

-- ============================================================
-- fn_canonical_route_check_daily
-- ============================================================
CREATE OR REPLACE FUNCTION evo.fn_canonical_route_check_daily()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := evo.fn_canonical_route_decision(7, 5.0);

  INSERT INTO evo.evolution_audit_log(action, entity_type, entity_id, performed_by, new_values)
  VALUES ('canonical_route_check', 'shadow_mode', gen_random_uuid(), 'fn_canonical_route_check_daily', v_result);

  IF v_result->>'status' = 'ready' THEN
    INSERT INTO zapp.warroom_alerts(alert_type, title, message, source, entity, severity)
    VALUES (
      'info',
      'Decisao de rota canonica disponivel',
      format('Rota recomendada: %s | Desligar: %s | Motivo: %s',
        v_result->>'recommended_canonical',
        v_result->>'route_to_shutdown',
        v_result->>'reason'),
      'fn_canonical_route_check_daily',
      'evo.evolution_source_shadow_log',
      'high'
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION evo.fn_canonical_route_decision IS
  'Decide rota canonica webhook-direct vs rabbit-consumer com base em shadow log.
   Fix 2026-08-08: substituiu format(%.1f) por round()::text (PG nao suporta %.1f em format()).';
