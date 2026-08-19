-- =============================================================================
-- E35 — zapp.fn_escalate_critical_alerts (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: substituir net.http_post direto por ops.pg_net_post() (invariante I4).
-- Adicional: substituir bloco EXCEPTION de vault por ops.fn_get_vault_secret().
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_escalate_critical_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = zapp, evo, ops, public
AS $$
DECLARE
  v_url     text;
  v_alerts  jsonb;
  v_count   int;
  v_req     bigint;
BEGIN
  SELECT count(*),
         jsonb_agg(jsonb_build_object(
           'tipo',   alert_type,
           'sev',    severity,
           'msg',    message,
           'quando', created_at
         ) ORDER BY created_at DESC)
    INTO v_count, v_alerts
  FROM zapp.evolution_alerts
  WHERE coalesce(acknowledged, false) = false
    AND escalated_at IS NULL
    AND severity = 'critical';

  IF v_count = 0 THEN
    RETURN jsonb_build_object('escalated', 0, 'reason', 'sem alertas criticos novos');
  END IF;

  v_url := ops.fn_get_vault_secret('alerts_webhook_url');

  IF v_url IS NULL OR v_url = '' THEN
    UPDATE zapp.evolution_alerts
       SET escalated_at = now()
     WHERE coalesce(acknowledged, false) = false
       AND escalated_at IS NULL
       AND severity = 'critical';
    RETURN jsonb_build_object(
      'escalated', v_count,
      'delivered', false,
      'reason',    'configure vault.alerts_webhook_url para entregar'
    );
  END IF;

  v_req := ops.pg_net_post(
    p_url        := v_url,
    p_headers    := jsonb_build_object('Content-Type', 'application/json'),
    p_body       := jsonb_build_object(
      'source',   'supabase-evolution-watchdog',
      'severity', 'critical',
      'count',    v_count,
      'alerts',   v_alerts,
      'at',       now()
    ),
    p_timeout_ms := 8000
  );

  UPDATE zapp.evolution_alerts
     SET escalated_at = now()
   WHERE coalesce(acknowledged, false) = false
     AND escalated_at IS NULL
     AND severity = 'critical';

  RETURN jsonb_build_object(
    'escalated',      v_count,
    'delivered',      true,
    'net_request_id', v_req
  );
END;
$$;

COMMENT ON FUNCTION zapp.fn_escalate_critical_alerts IS
  'Escala alertas criticos via webhook configuravel no vault. '
  'E35 (2026-08-15): net.http_post → ops.pg_net_post; vault EXCEPTION → ops.fn_get_vault_secret (invariante I4). '
  'Acesso restrito: search_path=zapp,evo,ops,public.';
