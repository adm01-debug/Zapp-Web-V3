-- F3 ingest-port: porta de entrada canonica para logs de saude da Evolution API.
-- evolution_health_logs continua em evo (Grupo B pendente, ainda nao migrada);
-- o front escrevia direto via .insert() (violacao) — agora passa pela RPC.
CREATE OR REPLACE FUNCTION zapp.rpc_log_evolution_health(
  p_instance_name text,
  p_status text,
  p_error_message text DEFAULT NULL,
  p_response_time_ms integer DEFAULT NULL,
  p_online_instances integer DEFAULT NULL,
  p_total_instances integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, evo, pg_catalog
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_instance_name IS NULL OR btrim(p_instance_name) = '' THEN
    RAISE EXCEPTION 'p_instance_name is required' USING ERRCODE = '22004';
  END IF;
  INSERT INTO evo.evolution_health_logs(
    instance_name, status, error_message, response_time_ms,
    online_instances, total_instances, performed_at, created_at
  ) VALUES (
    p_instance_name, p_status, p_error_message, p_response_time_ms,
    p_online_instances, p_total_instances, now(), now()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_log_evolution_health(text, text, text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_log_evolution_health(text, text, text, integer, integer, integer) TO authenticated, service_role;
