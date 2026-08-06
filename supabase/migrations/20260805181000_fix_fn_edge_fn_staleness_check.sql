-- Fix do job 123 (weekly-edge-fn-freshness): ops.fn_edge_fn_staleness_check
-- Bug: format('edge_function_registry desatualizado há %.0f dias', v_days_stale)
--   -> PostgreSQL rejeita especificador printf-style "%.0f" em format()
--   -> erro "unrecognized format() type specifier" QUANDO há função stale (>7d)
--   -> alerta de edge_function_registry stale silenciado (falso-negativo estrutural)
-- Evidência do erro: cron.job_run_details jobid=123 runid=603605 (2026-08-03 12:00 UTC) status=failed
-- Fix: %s + round(v_days_stale::numeric, 0) (especificador %s é válido em format())
-- Aplicado de facto no DB em 2026-08-05 via ALTER FUNCTION manual (drift); esta migration
-- versionada alinha repo x DB e registra o fix em supabase_migrations.schema_migrations.

CREATE OR REPLACE FUNCTION ops.fn_edge_fn_staleness_check()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ops, evo, zapp, public, pg_catalog
AS $function$
DECLARE
  v_last_seen      timestamptz;
  v_days_stale     numeric;
  v_active_count   int;
  v_no_hash_count  int;
  v_result         jsonb;
BEGIN
  SELECT
    max(last_seen_at),
    count(*) FILTER (WHERE is_active),
    count(*) FILTER (WHERE is_active AND fn_hash_sha256 IS NULL)
  INTO v_last_seen, v_active_count, v_no_hash_count
  FROM ops.edge_function_registry;

  v_days_stale := EXTRACT(epoch FROM (now() - v_last_seen)) / 86400.0;

  v_result := jsonb_build_object(
    'last_seen_at',    v_last_seen,
    'days_stale',      round(v_days_stale::numeric, 1),
    'active_count',    v_active_count,
    'no_hash_count',   v_no_hash_count,
    'status',          CASE
                         WHEN v_days_stale > 14 THEN 'CRITICAL'
                         WHEN v_days_stale > 7  THEN 'WARN'
                         ELSE 'OK'
                       END,
    'checked_at',      now()
  );

  -- Criar alerta se stale > 7 dias
  IF v_days_stale > 7 THEN
    INSERT INTO zapp.webhook_health_alerts(alert_type, severity, title, details)
    VALUES (
      'edge_fn_registry_stale',
      CASE WHEN v_days_stale > 14 THEN 'critical' ELSE 'high' END,
      format('edge_function_registry desatualizado há %s dias', round(v_days_stale::numeric, 0)),
      jsonb_build_object(
        'last_seen_at', v_last_seen,
        'days_stale', round(v_days_stale::numeric, 1),
        'active_functions', v_active_count,
        'action_required', 'Rodar: ops.fn_edge_function_snapshot(ARRAY[...], NULL) via Portainer',
        'runbook', 'docs/RUNBOOK_EDGE_FN_SNAPSHOT.md'
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_result;
END;
$function$;
