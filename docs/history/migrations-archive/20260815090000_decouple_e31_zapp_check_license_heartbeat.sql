-- =============================================================================
-- E31 — zapp.fn_check_license_heartbeat (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: substituir net.http_get (chamada posicional) por ops.pg_net_get()
-- para corrigir a violação do invariante I4.
-- NOTA: a função original usa chamada posicional: net.http_get(v_license_url)
-- O wrapper ops.pg_net_get aceita URL como único argumento (demais têm DEFAULT).
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_check_license_heartbeat()
RETURNS text
LANGUAGE plpgsql
SET search_path = zapp, evo, ops, public
AS $$
DECLARE
  v_license_url text;
BEGIN
  v_license_url := COALESCE(
    ops.fn_evo_url_v2(),
    'https://evolution.atomicabr.com.br'
  ) || '/license/status';

  PERFORM ops.pg_net_get(v_license_url);

  RETURN 'heartbeat_ok';
EXCEPTION WHEN OTHERS THEN
  RETURN 'heartbeat_error: ' || SQLERRM;
END;
$$;

COMMENT ON FUNCTION zapp.fn_check_license_heartbeat IS
  'Verifica licença Evolution API via heartbeat HTTP. '
  'E31 (2026-08-15): net.http_get → ops.pg_net_get; fn_evo_url → _v2 (invariante I4).';
