-- =============================================================================
-- E34 — zapp.fn_cookie_real_probe (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: substituir 3 chamadas net.http_get/net.http_post diretas
-- por ops.pg_net_get() e ops.pg_net_post() (invariante I4).
-- NOTA: as queries SELECT ... FROM net._http_response são mantidas inalteradas
-- — são consultas de tabela (polling assíncrono), NÃO chamadas HTTP diretas.
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_cookie_real_probe()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = zapp, ops, public
AS $$
DECLARE
  v_lusha_cookie TEXT;
  v_lc_cookie    TEXT;
  v_li_cookie    TEXT;
  v_li_csrf      TEXT;
  v_req_lusha    BIGINT;
  v_req_lc       BIGINT;
  v_req_li       BIGINT;
  v_total_reqs   INT := 0;
  v_done         INT;
  v_i            INT;
  v_status       INT;
  v_content      TEXT;
  v_healthy      BOOLEAN;
  v_started      TIMESTAMPTZ := clock_timestamp();
  v_lusha_v2_url TEXT;
  v_lc_url       TEXT;
  v_li_url       TEXT;
BEGIN
  v_lusha_v2_url := COALESCE(ops.fn_get_vault_secret('lusha_v2_api_url'), 'https://dashboard-services.lusha.com');
  v_lc_url := COALESCE(ops.fn_get_vault_secret('leadcontact_api_url'), 'https://api.leadcontact.ai');
  v_li_url := COALESCE(ops.fn_get_vault_secret('linkedin_api_url'), 'https://www.linkedin.com');

  SELECT cookie INTO v_lusha_cookie FROM zapp.cookies_config WHERE servico='lusha';
  SELECT cookie INTO v_lc_cookie    FROM zapp.cookies_config WHERE servico='leadcontact';
  SELECT cookie, csrf_token INTO v_li_cookie, v_li_csrf
    FROM zapp.cookies_config WHERE servico='linkedin';

  IF length(coalesce(v_lusha_cookie,'')) > 20 THEN
    v_req_lusha := ops.pg_net_get(
      p_url     := v_lusha_v2_url || '/v2/filters/companyName?text=PROBE',
      p_headers := jsonb_build_object(
        'Cookie',     v_lusha_cookie,
        'Origin',     'https://dashboard.lusha.com',
        'Referer',    'https://dashboard.lusha.com/',
        'Accept',     'application/json',
        'User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      ),
      p_timeout_ms := 6000
    );
    v_total_reqs := v_total_reqs + 1;
  END IF;

  IF length(coalesce(v_lc_cookie,'')) > 10 THEN
    v_req_lc := ops.pg_net_post(
      p_url     := v_lc_url || '/api/auth/check_login',
      p_body    := '{}'::jsonb,
      p_headers := jsonb_build_object(
        'Cookie',       v_lc_cookie,
        'Content-Type', 'application/json',
        'Origin',       'chrome-extension://imhlnhlbiencamnbpigopiibddajimep',
        'User-Agent',   'Mozilla/5.0'
      ),
      p_timeout_ms := 6000
    );
    v_total_reqs := v_total_reqs + 1;
  END IF;

  IF length(coalesce(v_li_cookie,'')) > 20 THEN
    v_req_li := ops.pg_net_get(
      p_url     := v_li_url || '/voyager/api/me',
      p_headers := jsonb_build_object(
        'Cookie',                    v_li_cookie,
        'csrf-token',                coalesce(v_li_csrf,''),
        'Accept',                    'application/vnd.linkedin.normalized+json+2.1',
        'x-restli-protocol-version', '2.0.0',
        'User-Agent',                'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      ),
      p_timeout_ms := 6000
    );
    v_total_reqs := v_total_reqs + 1;
  END IF;

  -- Polling assíncrono — net._http_response é tabela, NÃO é chamada HTTP
  v_i := 0;
  LOOP
    EXIT WHEN v_i >= 18;
    PERFORM pg_sleep(0.5);
    v_i := v_i + 1;

    SELECT count(*) INTO v_done
    FROM net._http_response
    WHERE id IN (v_req_lusha, v_req_lc, v_req_li)
      AND status_code IS NOT NULL;

    EXIT WHEN v_done >= v_total_reqs;
  END LOOP;

  IF v_req_lusha IS NOT NULL THEN
    SELECT r.status_code, left(r.content::text, 300)
      INTO v_status, v_content
    FROM net._http_response r WHERE r.id = v_req_lusha;

    v_healthy := coalesce(v_status,0) = 200;
    UPDATE zapp.cookies_config SET
      is_healthy           = v_healthy,
      health_status        = CASE coalesce(v_status,0)
                               WHEN 200 THEN 'healthy'
                               WHEN 401 THEN 'expired'
                               WHEN 403 THEN 'challenged'
                               WHEN 429 THEN 'rate_limited'
                               ELSE       'error' END,
      health_error         = format('real_probe v2 http=%s at %s | head=%s',
                               coalesce(v_status::text,'timeout'), now(),
                               left(coalesce(v_content,''),80)),
      last_health_check_at = now()
    WHERE servico = 'lusha';

    INSERT INTO zapp.cookie_probe_log (servico, http_status, response_preview, is_healthy, probe_ms)
    VALUES ('lusha', v_status, left(coalesce(v_content,''),200), v_healthy,
            (extract(epoch from clock_timestamp()-v_started)*1000)::int);

    PERFORM zapp.fn_circuit_record('lusha', v_healthy);
  END IF;

  IF v_req_lc IS NOT NULL THEN
    SELECT r.status_code, left(r.content::text, 300)
      INTO v_status, v_content
    FROM net._http_response r WHERE r.id = v_req_lc;

    BEGIN
      v_healthy := coalesce(v_status,0)=200
                   AND (v_content::jsonb->'data'->>'login')='true';
    EXCEPTION WHEN OTHERS THEN
      v_healthy := false;
    END;

    UPDATE zapp.cookies_config SET
      is_healthy           = v_healthy,
      health_status        = CASE
                               WHEN v_healthy               THEN 'healthy'
                               WHEN coalesce(v_status,0)=0  THEN 'error'
                               ELSE 'expired' END,
      health_error         = format('real_probe v2 http=%s login=%s at %s',
                               coalesce(v_status::text,'timeout'),
                               CASE WHEN v_healthy THEN 'true' ELSE 'false' END,
                               now()),
      last_health_check_at = now()
    WHERE servico = 'leadcontact';

    INSERT INTO zapp.cookie_probe_log (servico, http_status, response_preview, is_healthy, probe_ms)
    VALUES ('leadcontact', v_status, left(coalesce(v_content,''),200), v_healthy,
            (extract(epoch from clock_timestamp()-v_started)*1000)::int);

    PERFORM zapp.fn_circuit_record('leadcontact', v_healthy);
  END IF;

  IF v_req_li IS NOT NULL THEN
    SELECT r.status_code, left(r.content::text, 200)
      INTO v_status, v_content
    FROM net._http_response r WHERE r.id = v_req_li;

    v_healthy := coalesce(v_status,0) = 200;
    UPDATE zapp.cookies_config SET
      is_healthy           = v_healthy,
      health_status        = CASE coalesce(v_status,0)
                               WHEN 200 THEN 'healthy'
                               WHEN 302 THEN 'expired'
                               WHEN 400 THEN 'expired'
                               WHEN 403 THEN 'challenged'
                               WHEN 429 THEN 'rate_limited'
                               ELSE       'error' END,
      health_error         = format('real_probe v2 http=%s at %s',
                               coalesce(v_status::text,'timeout'), now()),
      last_health_check_at = now()
    WHERE servico = 'linkedin';

    INSERT INTO zapp.cookie_probe_log (servico, http_status, response_preview, is_healthy, probe_ms)
    VALUES ('linkedin', v_status, left(coalesce(v_content,''),200), v_healthy,
            (extract(epoch from clock_timestamp()-v_started)*1000)::int);

    PERFORM zapp.fn_circuit_record('linkedin', v_healthy);
  END IF;

  RETURN jsonb_build_object(
    'probed_at',       v_started,
    'duration_ms',     (extract(epoch from clock_timestamp()-v_started)*1000)::int,
    'requests_fired',  v_total_reqs,
    'iterations_used', v_i,
    'req_ids',         jsonb_build_object(
      'lusha', v_req_lusha, 'leadcontact', v_req_lc, 'linkedin', v_req_li
    )
  );
END;
$$;

COMMENT ON FUNCTION zapp.fn_cookie_real_probe IS
  'Probe síncrona com polling de status HTTP real para cookies de serviços. '
  'E34 (2026-08-15): 3x net.http_get/post → ops.pg_net_get/post (invariante I4). '
  'Acesso restrito: search_path=zapp,ops,public.';
