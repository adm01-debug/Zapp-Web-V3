-- =============================================================================
-- E32 — zapp.fn_collect_restore_logs (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: substituir as duas chamadas net.http_get diretas por ops.pg_net_get()
-- para corrigir a violação do invariante I4.
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_collect_restore_logs(
  p_container_name text,
  p_endpoint_id    integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = zapp, evo, monitoring, ops, public
AS $$
DECLARE
  v_portainer_url   text;
  v_api_key         text;
  v_containers_req  bigint;
  v_logs_req        bigint;
  v_container_id    text;
BEGIN
  v_portainer_url := ops.fn_get_vault_secret('portainer_api_url');
  v_api_key       := ops.fn_get_vault_secret('portainer_api_key');

  IF v_portainer_url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'portainer_api_url ausente no vault');
  END IF;

  -- Busca lista de containers
  v_containers_req := ops.pg_net_get(
    p_url     := v_portainer_url
                 || '/api/endpoints/' || p_endpoint_id
                 || '/docker/containers/json?all=true&filters='
                 || urlencode('{"name":["' || p_container_name || '"]}'),
    p_headers := jsonb_build_object('X-API-Key', v_api_key),
    p_timeout_ms := 10000
  );

  -- Aguarda resposta para obter container_id (simplificado: usa nome diretamente)
  v_container_id := p_container_name;

  -- Busca logs do container
  v_logs_req := ops.pg_net_get(
    p_url     := v_portainer_url
                 || '/api/endpoints/' || p_endpoint_id
                 || '/docker/containers/' || v_container_id
                 || '/logs?stdout=true&stderr=true&tail=500',
    p_headers := jsonb_build_object('X-API-Key', v_api_key),
    p_timeout_ms := 15000
  );

  RETURN jsonb_build_object(
    'ok',              true,
    'containers_req',  v_containers_req,
    'logs_req',        v_logs_req,
    'container',       p_container_name,
    'endpoint_id',     p_endpoint_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION zapp.fn_collect_restore_logs IS
  'Coleta logs de container via Portainer API. '
  'E32 (2026-08-15): 2x net.http_get substituidos por ops.pg_net_get (invariante I4).';
