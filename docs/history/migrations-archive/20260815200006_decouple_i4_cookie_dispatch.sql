-- ============================================================
-- Migration: decouple_i4_cookie_dispatch
-- Objetivo: eliminar 4 URLs hardcoded de terceiros em zapp.fn_cookie_probe_dispatch
--           (lusha v3, lusha v2, leadcontact, linkedin), resolvendo-as via
--           ops.fn_get_vault_secret(...) com fallback para os literais atuais.
-- Etapa: I4 (pg_net / desacoplamento de URLs de infra)
-- Data: 2026-08-15
-- Nota: idempotente — CREATE OR REPLACE (corpo completo, apenas construção de URL alterada).
-- ============================================================

CREATE OR REPLACE FUNCTION zapp.fn_cookie_probe_dispatch()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'net'
AS $function$
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
    SELECT net.http_get(
      url := v_lusha_v3_url || '/v3/contacts/prospecting/filters/departments',
      headers := jsonb_build_object(
        'api_key', v_lusha_token,
        'Accept', 'application/json',
        'User-Agent', 'Mozilla/5.0'),
      timeout_milliseconds := 6000
    ) INTO v_req_lusha;
    INSERT INTO zapp.cookie_probe_pending(servico,request_id,dispatched_at,probe_version,probe_auth)
    VALUES('lusha',v_req_lusha,now(),'v3','apikey')
    ON CONFLICT (servico) DO UPDATE SET request_id=EXCLUDED.request_id,dispatched_at=EXCLUDED.dispatched_at,probe_version='v3',probe_auth='apikey';
    v_fired := v_fired+1;
  ELSIF length(coalesce(v_lusha_cookie,'')) > 20 THEN
    -- V2: GET dashboard-services.lusha.com/v2 com Cookie JWT (modo atual)
    v_lusha_mode := 'v2_cookie';
    SELECT net.http_get(
      url := v_lusha_v2_url || '/v2/filters/companyName?text=PROBE',
      headers := jsonb_build_object(
        'Cookie',v_lusha_cookie,'Origin','https://dashboard.lusha.com',
        'Referer','https://dashboard.lusha.com/','Accept','application/json',
        'User-Agent','Mozilla/5.0 (Windows NT 10.0; Win64; x64)'),
      timeout_milliseconds := 6000
    ) INTO v_req_lusha;
    INSERT INTO zapp.cookie_probe_pending(servico,request_id,dispatched_at,probe_version,probe_auth)
    VALUES('lusha',v_req_lusha,now(),'v2','cookie')
    ON CONFLICT (servico) DO UPDATE SET request_id=EXCLUDED.request_id,dispatched_at=EXCLUDED.dispatched_at,probe_version='v2',probe_auth='cookie';
    v_fired := v_fired+1;
  END IF;

  -- █ LEADCONTACT probe — Bearer primary, SESSION fallback
  IF length(coalesce(v_lc_token,'')) > 10 OR length(coalesce(v_lc_cookie,'')) > 10 THEN
    v_lc_auth := CASE WHEN length(coalesce(v_lc_token,'')) > 10 THEN 'bearer' ELSE 'cookie' END;
    SELECT net.http_post(
      url := v_lc_url || '/api/auth/check_login',
      body := '{}'::jsonb,
      headers := CASE
        WHEN length(coalesce(v_lc_token,'')) > 10
        THEN jsonb_build_object(
          'Authorization','Bearer '||v_lc_token,'Content-Type','application/json',
          'Origin','chrome-extension://imhlnhlbiencamnbpigopiibddajimep','User-Agent','Mozilla/5.0')
        ELSE jsonb_build_object(
          'Cookie',v_lc_cookie,'Content-Type','application/json',
          'Origin','chrome-extension://imhlnhlbiencamnbpigopiibddajimep','User-Agent','Mozilla/5.0')
      END,
      timeout_milliseconds := 6000
    ) INTO v_req_lc;
    INSERT INTO zapp.cookie_probe_pending(servico,request_id,dispatched_at,probe_version,probe_auth)
    VALUES('leadcontact',v_req_lc,now(),'v1',v_lc_auth)
    ON CONFLICT (servico) DO UPDATE SET request_id=EXCLUDED.request_id,dispatched_at=EXCLUDED.dispatched_at,probe_auth=EXCLUDED.probe_auth;
    v_fired := v_fired+1;
  END IF;

  -- █ LINKEDIN probe — inalterado (cookie morto, circuit aberto, monitor)
  IF length(coalesce(v_li_cookie,'')) > 20 THEN
    SELECT net.http_get(
      url := v_li_url || '/voyager/api/me',
      headers := jsonb_build_object(
        'Cookie',v_li_cookie,'csrf-token',coalesce(v_li_csrf,''),
        'Accept','application/vnd.linkedin.normalized+json+2.1',
        'x-restli-protocol-version','2.0.0','User-Agent','Mozilla/5.0 (Windows NT 10.0; Win64; x64)'),
      timeout_milliseconds := 6000
    ) INTO v_req_li;
    INSERT INTO zapp.cookie_probe_pending(servico,request_id,dispatched_at,probe_version,probe_auth)
    VALUES('linkedin',v_req_li,now(),'v1','cookie')
    ON CONFLICT (servico) DO UPDATE SET request_id=EXCLUDED.request_id,dispatched_at=EXCLUDED.dispatched_at;
    v_fired := v_fired+1;
  END IF;

  RETURN jsonb_build_object(
    'phase','dispatch','fired',v_fired,
    'lusha_mode',v_lusha_mode,'lc_auth',v_lc_auth,
    'req_ids',jsonb_build_object('lusha',v_req_lusha,'leadcontact',v_req_lc,'linkedin',v_req_li),
    'dispatched_at',now());
END;
$function$;
