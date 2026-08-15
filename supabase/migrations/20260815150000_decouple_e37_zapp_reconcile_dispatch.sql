-- =============================================================================
-- E37 — zapp.fn_reconcile_dispatch (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: substituir net.http_get direto por ops.pg_net_get() (invariante I4).
-- Adicional: ops.fn_evo_url() → ops.fn_evo_url_v2();
--            ops.fn_evo_key() → ops.fn_evo_key_v2() (deprecados).
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_reconcile_dispatch()
RETURNS bigint
LANGUAGE plpgsql
SET search_path = zapp, evo, ops, public, pg_catalog
AS $$
DECLARE
  v_url    text;
  v_key    text;
  v_req_id bigint;
BEGIN
  v_url := ops.fn_evo_url_v2();
  v_key := ops.fn_evo_key_v2();

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION '[fn_reconcile_dispatch] ops.fn_evo_url_v2 ou fn_evo_key_v2 retornou NULL';
  END IF;

  v_req_id := ops.pg_net_get(
    p_url        := v_url || '/instance/fetchInstances',
    p_headers    := jsonb_build_object(
      'apikey', v_key,
      'Accept', 'application/json'
    ),
    p_timeout_ms := 8000
  );

  INSERT INTO evo.evolution_reconcile_jobs (request_id)
  VALUES (v_req_id)
  ON CONFLICT (request_id) DO UPDATE SET dispatched_at = now();

  RETURN v_req_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[fn_reconcile_dispatch] erro: %', SQLERRM;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION zapp.fn_reconcile_dispatch IS
  'Despacha reconciliação de instâncias Evolution via pg_net assíncrono. '
  'E37 (2026-08-15): net.http_get → ops.pg_net_get; fn_evo_url/key → _v2 (invariante I4). '
  'Acesso restrito: search_path=zapp,evo,ops,public,pg_catalog.';
