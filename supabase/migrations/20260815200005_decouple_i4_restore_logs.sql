-- ============================================================
-- Migration: decouple_i4_restore_logs
-- Objetivo: eliminar URL hardcoded do Portainer em zapp.fn_collect_restore_logs,
--           passando a resolvê-la via ops.fn_get_vault_secret('portainer_api_url')
--           com fallback para o literal atual.
-- Etapa: I4 (pg_net / desacoplamento de URLs de infra)
-- Data: 2026-08-15
-- Nota: idempotente — CREATE OR REPLACE (corpo completo, apenas construção de URL alterada).
-- ============================================================

CREATE OR REPLACE FUNCTION zapp.fn_collect_restore_logs(p_container_name text DEFAULT 'restore-validate-validator-1'::text, p_endpoint_id integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_api_key text;
  v_portainer_url text;
  v_containers_req_id bigint;
  v_containers_response jsonb;
  v_container_id text;
  v_logs_req_id bigint;
  v_logs_response text;
  v_ingest jsonb;
BEGIN
  v_portainer_url := COALESCE(ops.fn_get_vault_secret('portainer_api_url'), 'https://portainer.atomicabr.com.br');

  SELECT decrypted_secret INTO v_api_key
  FROM vault.decrypted_secrets
  WHERE name = 'portainer_api_key' LIMIT 1;

  IF v_api_key IS NULL THEN
    RETURN jsonb_build_object('status','standby','reason','portainer_api_key_not_in_vault');
  END IF;

  SELECT net.http_get(
    url := v_portainer_url || '/api/endpoints/' || p_endpoint_id || '/docker/containers/json?all=true&filters=' ||
           replace(replace(jsonb_build_object('name', jsonb_build_array(p_container_name))::text, '"', '%22'), ' ', ''),
    headers := jsonb_build_object('X-API-Key', v_api_key),
    timeout_milliseconds := 10000
  ) INTO v_containers_req_id;

  FOR i IN 1..16 LOOP
    PERFORM pg_sleep(0.5);
    SELECT (content::jsonb) INTO v_containers_response
    FROM net._http_response
    WHERE id = v_containers_req_id AND status_code IS NOT NULL LIMIT 1;
    EXIT WHEN v_containers_response IS NOT NULL;
  END LOOP;

  IF v_containers_response IS NULL OR jsonb_array_length(v_containers_response) = 0 THEN
    RETURN jsonb_build_object('status','no_container_found','container_name', p_container_name);
  END IF;

  v_container_id := v_containers_response->0->>'Id';

  SELECT net.http_get(
    url := v_portainer_url || '/api/endpoints/' || p_endpoint_id || '/docker/containers/' || v_container_id ||
           '/logs?stdout=true&stderr=true&tail=500',
    headers := jsonb_build_object('X-API-Key', v_api_key),
    timeout_milliseconds := 15000
  ) INTO v_logs_req_id;

  FOR i IN 1..30 LOOP
    PERFORM pg_sleep(0.5);
    SELECT content INTO v_logs_response
    FROM net._http_response
    WHERE id = v_logs_req_id AND status_code IS NOT NULL LIMIT 1;
    EXIT WHEN v_logs_response IS NOT NULL;
  END LOOP;

  IF v_logs_response IS NULL THEN
    RETURN jsonb_build_object('status','timeout_reading_logs');
  END IF;

  v_logs_response := regexp_replace(v_logs_response, E'[\\x00-\\x08\\x0B-\\x1F]', '', 'g');
  v_ingest := zapp.fn_ingest_restore_logs_from_text(v_logs_response);

  RETURN jsonb_build_object('status','ok','container_id', v_container_id,'logs_bytes', length(v_logs_response),'ingest', v_ingest);
END;
$function$;
