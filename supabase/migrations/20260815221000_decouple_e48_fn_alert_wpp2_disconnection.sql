-- =============================================================================
-- E48 — zapp.fn_alert_wpp2_disconnection (Fase 3 — Isolamento I1)
-- =============================================================================
-- Objetivo: remover referências diretas a evo.evolution_alerts (invariante I1).
-- Substituição: evo.evolution_alerts → zapp.evo_alerts (view de contrato/alias)
-- Nota: zapp.evolution_alerts é tabela física — usar zapp.evo_alerts como alias.
-- search_path: ausente → zapp, pg_catalog
-- =============================================================================

-- Remove overload sem argumentos (legado)
DROP FUNCTION IF EXISTS zapp.fn_alert_wpp2_disconnection();

CREATE OR REPLACE FUNCTION zapp.fn_alert_wpp2_disconnection(
  p_instance_name text DEFAULT 'wpp2'
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = zapp, pg_catalog
AS $function$
DECLARE
  v_conn             record;
  v_min_disconnected numeric;
  v_already_alerted  boolean;
  v_alert_type       text;
BEGIN
  SELECT status, phone_number, last_connected_at, disconnected_at, instance_name, is_active
  INTO v_conn
  FROM zapp.whatsapp_connections
  WHERE instance_name = p_instance_name
  LIMIT 1;

  IF v_conn IS NULL OR v_conn.status = 'connected' THEN
    RETURN jsonb_build_object(
      'status',          'ok',
      'instance_name',   p_instance_name,
      'instance_status', COALESCE(v_conn.status, 'not_found')
    );
  END IF;

  v_min_disconnected := COALESCE(
    EXTRACT(EPOCH FROM (now() - GREATEST(v_conn.last_connected_at, v_conn.disconnected_at))) / 60,
    9999
  );

  IF v_min_disconnected < 30 THEN
    RETURN jsonb_build_object(
      'status',           'grace_period',
      'disconnected_min', round(v_min_disconnected::numeric, 1)
    );
  END IF;

  v_alert_type := p_instance_name || '_disconnection';

  SELECT EXISTS(
    SELECT 1 FROM zapp.evo_alerts
    WHERE alert_type = v_alert_type
      AND created_at > now() - INTERVAL '60 minutes'
      AND resolved_at IS NULL
  ) INTO v_already_alerted;

  IF v_already_alerted THEN
    RETURN jsonb_build_object(
      'status',           'already_alerted',
      'disconnected_min', round(v_min_disconnected::numeric, 1)
    );
  END IF;

  INSERT INTO zapp.evo_alerts (alert_type, severity, title, message, payload)
  VALUES (
    v_alert_type,
    CASE WHEN v_min_disconnected > 120 THEN 'critical' ELSE 'high' END,
    format('%s DESCONECTADO — Rescan QR necessario', p_instance_name),
    format(
      'Instancia %s (%s) desconectada ha %s minutos. Acesse o manager para reconectar.',
      p_instance_name,
      v_conn.phone_number,
      round(v_min_disconnected)::text
    ),
    jsonb_build_object(
      'instance',         p_instance_name,
      'phone',            v_conn.phone_number,
      'disconnected_min', round(v_min_disconnected::numeric, 1),
      'action_required',  'QR_SCAN',
      'url',              'https://evolution.atomicabr.com.br/manager'
    )
  );

  RETURN jsonb_build_object(
    'status',           'alert_created',
    'severity',         CASE WHEN v_min_disconnected > 120 THEN 'critical' ELSE 'high' END,
    'disconnected_min', round(v_min_disconnected::numeric, 1)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'ts', now());
END;
$function$;

COMMENT ON FUNCTION zapp.fn_alert_wpp2_disconnection IS
  'Alerta de desconexão WA via view de contrato zapp.evo_alerts. '
  'E48 (2026-08-15): evo.evolution_alerts → zapp.evo_alerts (invariante I1). '
  'Acesso restrito: search_path=zapp,pg_catalog.';
