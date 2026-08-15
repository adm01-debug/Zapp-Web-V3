-- =============================================================================
-- E33 — zapp.fn_cookie_probe_dispatch (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: substituir 4 chamadas net.http_get/net.http_post diretas
-- por ops.pg_net_get() e ops.pg_net_post() (invariante I4).
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_cookie_probe_dispatch()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = zapp, ops, public
AS $$
DECLARE
  v_lusha_cookie  TEXT;
  v_lusha_token   TEXT;
  v_lc_cookie     TEXT;
  v_lc_token      TEXT;
  v_li_cookie     TEXT;
  v_li_csrf       TEXT;
  v_req_lusha     BIGINT;
  v_req_lc        BIGINT;
  v_req_li        BIGINT;
  v_fired         INT  := 0;
  v_lusha_mode    TEXT := 'v2_cookie';
  v_lc_auth       TEXT := 'none';
  v_lusha_v3_url  TEXT;
  v_lusha_v2_url  TEXT;
  v_lc_url        TEXT;
  v_li_url        TEXT;
BEGIN
  v_lusha_v3_url := COALESCE(ops.fn_get_vault_secret('lusha_v3_api_url'), 'https://api.lusha.com');
  v_lusha_v2_url := COALESCE(ops.fn_get_vault_secret('lusha_v2_api_url'), 'https://dashboard-services.lusha.com');
  v_lc_url := COALESCE(ops.fn_get_vault_secret('leadcontact_api_url'), 'https://api.leadcontact.ai');
  v_li_url := COALESCE(ops.fn_get_vault_secret('linkedin_api_url'), 'https://www.linkedin.com');
  SELECT cookie, token INTO v_lusha_cookie, v_lusha_token FROM zapp.cookies_config WHERE servico='lusha';
  SELECT cookie, token INTO v_lc_cookie, v_lc_token FROM zapp.cookies_config WHERE servico='leadcontact';
  SELECT cookie, csrf_token INTO v_li_cookie, v_li_csrf FROM zapp.cookies_config WHERE servico='linkedin';

  -- █ LUSHA probe — DUAL MODE: V3 (api_key) se token>=32 chars, else V2 (JWT cookie)
  IF length(coalesce(v_lusha_token,'')) >= 32 THEN
    -- V3: GET api.lusha.com/v3 com api_key header (sem cookie JWT)
    v_lusha_mode := 'v3_apikey';
    v_req_lusha := ops.pg_net_get(
      p_url     := v_lusha_v3_url || '/v3/contacts/prospecting/filters/departments',
      p_headers := jsonb_build_object(
        'api_key',    v_lusha_token,
        'Accept',     'application/json',
        'User-Agent', 'Mozilla/5.0'),
      p_timeout_ms := 6000
    );
    INSERT INTO zapp.cookie_probe_pending(servico,request_id,dispatched_at,probe_version,probe_auth)
    VALUES('lusha',v_req_lusha,now(),'v3','apikey')
    ON CONFLICT (servico) DO UPDATE SET request_id=EXCLUDED.request_id,dispatched_at=EXCLUDED.dispatched_at,probe_version='v3',probe_auth='apikey';
    v_fired := v_fired+1;
  ELSIF length(coalesce(v_lusha_cookie,'')) > 20 THEN
    -- V2: GET dashboard-services.lusha.com/v2 com Cookie JWT (modo atual)
    v_lusha_mode := 'v2_cookie';
    v_req_lusha := ops.pg_net_get(
      p_url     := v_lusha_v2_url || '/v2/filters/companyName?text=PROBE',
      p_headers := jsonb_build_object(
        'Cookie',     v_lusha_cookie,
        'Origin',     'https://dashboard.lusha.com',
        'Referer',    'https://dashboard.lusha.com/',
        'Accept',     'application/json',
        'User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'),
      p_timeout_ms := 6000
    );
    INSERT INTO zapp.cookie_probe_pending(servico,request_id,dispatched_at,probe_version,probe_auth)
    VALUES('lusha',v_req_lusha,now(),'v2','cookie')
    ON CONFLICT (servico) DO UPDATE SET request_id=EXCLUDED.request_id,dispatched_at=EXCLUDED.dispatched_at,probe_version='v2',probe_auth='cookie';
    v_fired := v_fired+1;
  END IF;

  -- █ LEADCONTACT probe — Bearer primary, SESSION fallback
  IF length(coalesce(v_lc_token,'')) > 10 OR length(coalesce(v_lc_cookie,'')) > 10 THEN
    v_lc_auth := CASE WHEN length(coalesce(v_lc_token,'')) > 10 THEN 'bearer' ELSE 'cookie' END;
    v_req_lc := ops.pg_net_post(
      p_url     := v_lc_url || '/api/auth/check_login',
      p_body    := '{}'::jsonb,
      p_headers := CASE
        WHEN length(coalesce(v_lc_token,'')) > 10
        THEN jsonb_build_object(
          'Authorization', 'Bearer ' || v_lc_token,
          'Content-Type',  'application/json',
          'Origin',        'chrome-extension://imhlnhlbiencamnbpigopiibddajimep',
          'User-Agent',    'Mozilla/5.0')
        ELSE jsonb_build_object(
          'Cookie',       v_lc_cookie,
          'Content-Type', 'application/json',
          'Origin',       'chrome-extension://imhlnhlbiencamnbpigopiibddajimep',
          'User-Agent',   'Mozilla/5.0')
      END,
      p_timeout_ms := 6000
    );
    INSERT INTO zapp.cookie_probe_pending(servico,request_id,dispatched_at,probe_version,probe_auth)
    VALUES('leadcontact',v_req_lc,now(),'v1',v_lc_auth)
    ON CONFLICT (servico) DO UPDATE SET request_id=EXCLUDED.request_id,dispatched_at=EXCLUDED.dispatched_at,probe_auth=EXCLUDED.probe_auth;
    v_fired := v_fired+1;
  END IF;

  -- █ LINKEDIN probe — inalterado (cookie morto, circuit aberto, monitor)
  IF length(coalesce(v_li_cookie,'')) > 20 THEN
    v_req_li := ops.pg_net_get(
      p_url     := v_li_url || '/voyager/api/me',
      p_headers := jsonb_build_object(
        'Cookie',                    v_li_cookie,
        'csrf-token',                coalesce(v_li_csrf,''),
        'Accept',                    'application/vnd.linkedin.normalized+json+2.1',
        'x-restli-protocol-version', '2.0.0',
        'User-Agent',                'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'),
      p_timeout_ms := 6000
    );
    INSERT INTO zapp.cookie_probe_pending(servico,request_id,dispatched_at,probe_version,probe_auth)
    VALUES('linkedin',v_req_li,now(),'v1','cookie')
    ON CONFLICT (servico) DO UPDATE SET request_id=EXCLUDED.request_id,dispatched_at=EXCLUDED.dispatched_at;
    v_fired := v_fired+1;
  END IF;

  RETURN jsonb_build_object(
    'phase',        'dispatch',
    'fired',        v_fired,
    'lusha_mode',   v_lusha_mode,
    'lc_auth',      v_lc_auth,
    'req_ids',      jsonb_build_object('lusha',v_req_lusha,'leadcontact',v_req_lc,'linkedin',v_req_li),
    'dispatched_at', now()
  );
END;
$$;

COMMENT ON FUNCTION zapp.fn_cookie_probe_dispatch IS
  'Despacha probes HTTP assíncronos para serviços de cookies (Lusha/LC/LinkedIn). '
  'E33 (2026-08-15): 4x net.http_get/post → ops.pg_net_get/post (invariante I4).';
