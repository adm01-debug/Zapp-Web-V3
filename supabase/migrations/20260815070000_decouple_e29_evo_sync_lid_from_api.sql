-- =============================================================================
-- E29 — evo.fn_sync_lid_from_api (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: substituir ops.fn_evo_url/key (deprecated) por _v2 e substituir
-- net.http_get direto por ops.pg_net_get() em ambas as sobrecargas.
-- Corrige invariante I4 e substitui funções deprecadas (I1/I2 adjacente).
-- =============================================================================

-- Sobrecarga 1-arg
CREATE OR REPLACE FUNCTION evo.fn_sync_lid_from_api(p_instance text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = evo, ops, public, pg_catalog
AS $$
DECLARE
  v_url    text;
  v_key    text;
  v_req_id bigint;
BEGIN
  v_url := ops.fn_evo_url_v2();
  v_key := ops.fn_evo_key_v2();

  IF v_url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'evolution_api_url ausente');
  END IF;

  v_req_id := ops.pg_net_get(
    p_url     := v_url || '/contact/findContacts/' || p_instance,
    p_headers := jsonb_build_object(
                   'apikey',       COALESCE(v_key, ''),
                   'Content-Type', 'application/json'
                 ),
    p_params     := '{}',
    p_timeout_ms := 15000
  );

  RETURN jsonb_build_object(
    'ok',       true,
    'req_id',   v_req_id,
    'instance', p_instance,
    'provider', 'evolution'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',    false,
    'error', SQLERRM,
    'fn',    'fn_sync_lid_from_api'
  );
END;
$$;

COMMENT ON FUNCTION evo.fn_sync_lid_from_api(text) IS
  'Sincroniza LID de contatos via Evolution API (1 arg). '
  'E29 (2026-08-15): fn_evo_url/key → _v2; net.http_get → ops.pg_net_get (I4).';

-- Sobrecarga 2-args
CREATE OR REPLACE FUNCTION evo.fn_sync_lid_from_api(p_instance text, p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = evo, ops, public, pg_catalog
AS $$
DECLARE
  v_url    text;
  v_key    text;
  v_req_id bigint;
BEGIN
  v_url := ops.fn_evo_url_v2();
  v_key := ops.fn_evo_key_v2();

  IF v_url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'evolution_api_url ausente');
  END IF;

  v_req_id := ops.pg_net_get(
    p_url     := v_url || '/contact/findContacts/' || p_instance,
    p_headers := jsonb_build_object(
                   'apikey',       COALESCE(v_key, ''),
                   'Content-Type', 'application/json'
                 ),
    p_params     := '{}',
    p_timeout_ms := 15000
  );

  RETURN jsonb_build_object(
    'ok',       true,
    'req_id',   v_req_id,
    'instance', p_instance,
    'limit',    p_limit,
    'provider', 'evolution'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',    false,
    'error', SQLERRM,
    'fn',    'fn_sync_lid_from_api_2args'
  );
END;
$$;

COMMENT ON FUNCTION evo.fn_sync_lid_from_api(text, integer) IS
  'Sincroniza LID de contatos via Evolution API (2 args, com limite). '
  'E29 (2026-08-15): fn_evo_url/key → _v2; net.http_get → ops.pg_net_get (I4).';
