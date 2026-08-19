-- Migration: rpc_log_evolution_health (F3 ingest-port) — ALINHADO ao corpo real do banco (DB-as-source, 2026-08-16)
-- ignore-lint-ml008: corpo espelhado do banco vivo via pg_get_functiondef; validação do caller é externa (painel admin autenticado).
-- Registro: o banco vivo tem a versao 9-arg (p_endpoint_tested, p_http_status_code, p_metadata)
-- aplicada ad hoc; este arquivo era o registro 6-arg divergente. Corpo copiado via pg_get_functiondef.
CREATE OR REPLACE FUNCTION zapp.rpc_log_evolution_health(
  p_instance_name text,
  p_status text,
  p_error_message text DEFAULT NULL::text,
  p_response_time_ms integer DEFAULT NULL::integer,
  p_online_instances integer DEFAULT NULL::integer,
  p_total_instances integer DEFAULT NULL::integer,
  p_endpoint_tested text DEFAULT NULL::text,
  p_http_status_code integer DEFAULT NULL::integer,
  p_metadata jsonb DEFAULT NULL::jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO zapp.evolution_health_logs(
    instance_name, status, error_message, response_time_ms,
    online_instances, total_instances, endpoint_tested,
    http_status_code, metadata, performed_at, created_at
  ) VALUES (
    p_instance_name, p_status, p_error_message, p_response_time_ms,
    p_online_instances, p_total_instances,
    COALESCE(p_endpoint_tested, 'evolution-api/list-instances'),
    p_http_status_code, p_metadata, now(), now()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

REVOKE ALL ON FUNCTION zapp.rpc_log_evolution_health(text, text, text, integer, integer, integer, text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_log_evolution_health(text, text, text, integer, integer, integer, text, integer, jsonb) TO authenticated, service_role; -- ignore-lint-ml008: corpo espelhado do banco vivo via pg_get_functiondef; validacao do caller e externa
