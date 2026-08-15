-- =============================================================================
-- I4/W1 — zapp.fn_check_license_heartbeat (Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: eliminar a URL hardcoded da Evolution API desta função (o endpoint
-- /license/status), resolvendo a URL base via ops.fn_evo_url_v2() (vault
-- evolution_api_url) com o mesmo literal de hoje como fallback. O resolver é
-- chamado QUALIFICADO (ops.fn_evo_url_v2) porque o search_path da função é
-- 'zapp', 'evo', 'public' — sem o schema 'ops'.
--
-- Etapa I4 (onda pg_net). Data: 2026-08-15.
-- Idempotente — CREATE OR REPLACE. Nenhuma outra mudança: o mecanismo
-- pg_sleep(7) + net._http_response foi preservado intacto.
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_check_license_heartbeat()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_http_code int;
  v_body      text;
  v_status    text;
  v_falhas    int;
  v_license_url text;
BEGIN
  v_license_url := COALESCE(ops.fn_evo_url_v2(), 'https://evolution.atomicabr.com.br') || '/license/status';
  PERFORM net.http_get(v_license_url);
  PERFORM pg_sleep(7);

  SELECT status_code, content::text
  INTO v_http_code, v_body
  FROM net._http_response
  WHERE created > now() - interval '30 seconds'
  ORDER BY id DESC
  LIMIT 1;

  v_status := CASE
    WHEN v_http_code = 200 AND (v_body ~ '"ok"\s*:\s*true' OR v_body ~ '"status"\s*:\s*"active"') THEN 'active'
    WHEN v_http_code = 200 AND v_body !~ '"status"' AND v_body ~ '"ok"\s*:\s*true' THEN 'active'
    ELSE COALESCE(v_body, 'sem_resposta')
  END;

  INSERT INTO zapp.license_heartbeat_log (checked_at, status, http_code, raw)
  VALUES (now(), v_status, COALESCE(v_http_code, 0), left(COALESCE(v_body, ''), 500));

  IF v_status <> 'active' OR v_http_code IS DISTINCT FROM 200 THEN
    SELECT count(*) INTO v_falhas
    FROM zapp.license_heartbeat_log
    WHERE checked_at > now() - interval '1 hour' AND status <> 'active';

    IF v_falhas >= 3 THEN
      INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload, created_at)
      SELECT 'license_heartbeat', 'critical', 'License Evolution INATIVA',
        'Heartbeat falhou ' || v_falhas || 'x/hora. HTTP=' ||
        COALESCE(v_http_code::text,'NULL') || ' status=' || left(COALESCE(v_status,'?'),100),
        jsonb_build_object('http_code',v_http_code,'status',v_status,'raw',left(COALESCE(v_body,''),500)), now()
      WHERE NOT EXISTS (
        SELECT 1 FROM zapp.evolution_alerts ea2
        WHERE ea2.alert_type = 'license_heartbeat'
          AND ea2.resolved_at IS NULL AND ea2.created_at > now() - interval '2 hours'
      );
    END IF;
  END IF;

  RETURN v_status;
END;
$function$;
