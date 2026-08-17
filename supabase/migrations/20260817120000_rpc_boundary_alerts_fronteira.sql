-- ============================================================================
-- Migration: 20260817120000_rpc_boundary_alerts_fronteira.sql
-- Espelho DB-as-source das 2 RPCs de fronteira evo->zapp (formalizadas no
-- BOUNDARY-evolution.md, contratos I1/I2). Existiam SO no banco vivo (p6).
-- Corpos extraidos via pg_get_functiondef em 2026-08-17.
-- Grants reais do banco: EXECUTE authenticated, service_role (+postgres).
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.rpc_boundary_raise_alert(
  p_alert_type text,
  p_severity text,
  p_title text,
  p_message text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_dedup_window interval DEFAULT '00:30:00'::interval
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM zapp.evolution_alerts WHERE alert_type=p_alert_type AND resolved_at IS NULL AND created_at > now()-p_dedup_window) THEN
    RETURN NULL;
  END IF;
  INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
  VALUES (p_alert_type, p_severity, p_title, p_message, coalesce(p_payload,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

REVOKE ALL ON FUNCTION zapp.rpc_boundary_raise_alert(text, text, text, text, jsonb, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_boundary_raise_alert(text, text, text, text, jsonb, interval) TO authenticated, service_role; -- ignore-lint-ml008: chamadores evo monitorados; sem auth.uid() por design de fronteira

CREATE OR REPLACE FUNCTION zapp.rpc_boundary_resolve_alert(
  p_alert_type text,
  p_resolved_by text
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE v_n integer;
BEGIN
  UPDATE zapp.evolution_alerts SET resolved_at=now(), resolved_by=p_resolved_by
  WHERE alert_type=p_alert_type AND resolved_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

REVOKE ALL ON FUNCTION zapp.rpc_boundary_resolve_alert(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_boundary_resolve_alert(text, text) TO authenticated, service_role; -- ignore-lint-ml008: chamadores evo monitorados; sem auth.uid() por design de fronteira
