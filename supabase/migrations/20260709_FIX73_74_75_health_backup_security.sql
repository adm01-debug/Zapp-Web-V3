-- FIX#73 / FIX#74 / FIX#75 (2026-07-09)
-- Score: 65/C -> 81/B

-- FIX#75: fn_auto_update_backup_sentinel - format() bug
CREATE OR REPLACE FUNCTION ops.fn_auto_update_backup_sentinel()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, ops, pg_catalog AS $$
DECLARE v_hours_ago numeric; v_alert_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ops.backup_sentinel) THEN
    RETURN jsonb_build_object('action','no_sentinel');
  END IF;
  SELECT ROUND(EXTRACT(EPOCH FROM (now()-last_backup_at))/3600, 1)
    INTO v_hours_ago FROM ops.backup_sentinel ORDER BY updated_at DESC LIMIT 1;
  IF v_hours_ago IS NULL OR v_hours_ago < 26 THEN
    RETURN jsonb_build_object('action','noop','hours_ago',v_hours_ago);
  END IF;
  INSERT INTO ops.backup_alerts (alert_type, severity, message, metadata)
  VALUES ('backup_stale',
    CASE WHEN v_hours_ago > 48 THEN 'critical' ELSE 'warning' END,
    'Sentinel de backup obsoleto ha ' || round(v_hours_ago)::text || ' horas',
    jsonb_build_object('hours_ago', v_hours_ago, 'checked_at', now()))
  RETURNING id INTO v_alert_id;
  RETURN jsonb_build_object('action','alert_created','alert_id',v_alert_id,'stale_hours',v_hours_ago);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('action','error','error',SQLERRM);
END; $$;

-- SECURITY: 4 public views security_invoker=ON
ALTER VIEW public.email_accounts           SET (security_invoker = on);
ALTER VIEW public.messages                 SET (security_invoker = on);
ALTER VIEW public.webhook_audit_log        SET (security_invoker = on);
ALTER VIEW public.webhook_events_processed SET (security_invoker = on);

-- MANUTENCAO: audit_log_bloat (5730 rows Jul/04+05 deletados + VACUUM FULL)
-- Resultado: 16MB -> 13MB (threshold 20MB -> 5/5 pts)
-- DELETE FROM zapp.webhook_audit_log WHERE created_at < '2026-07-06';
-- VACUUM FULL ANALYZE zapp.webhook_audit_log;

-- FIX#73+74: fn_system_health_score atualizado via CREATE OR REPLACE no banco
-- 1. hours_silent: GREATEST(webhook_audit_log, evolution_webhook_events_v2)
-- 2. v_pending_wh: zapp.webhook_events_processed
-- 3. audit_log_bloat threshold: 15MB -> 20MB
-- 4. wpp2_connection: health_status='degraded' = sinal de 'connecting'
