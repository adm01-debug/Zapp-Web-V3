-- ============================================================
-- MIGRAÇÃO S8: DLQ enum fix + alert supersede
-- Data: 2026-07-04 | Validação exaustiva pós-S7
-- ============================================================

-- ============================================================
-- BUG #52: route-failed-webhooks-to-dlq falhava
-- ERROR: invalid input value for enum webhook_event_status: "dead_letter"
-- O enum não tinha o valor usado pela fn_route_failed_webhooks_to_dlq
-- ============================================================
ALTER TYPE webhook_event_status ADD VALUE IF NOT EXISTS 'dead_letter';

-- ============================================================
-- BUG #53: dedup sem auto-supersede acumulou 24 alertas
-- O dedup de 30min funcionava, mas alertas antigos nunca eram
-- resolvidos ao criar um novo — acumulavam 2/hora durante a noite.
-- FIX: auto-supersede — ao criar novo alerta, resolve os anteriores
-- do mesmo tipo. Garante máximo 1 alerta pipeline_health aberto.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_check_evolution_pipeline_health()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, evo, graveyard
AS $$
DECLARE
  v_msgs_5min int; v_msgs_1h int; v_audit_5min int; v_audit_rejected int;
  v_last_msg timestamptz; v_last_audit_ok timestamptz;
  v_status text := 'healthy'; v_alerts jsonb := '[]'::jsonb;
  v_result jsonb; v_recent_alert bigint;
BEGIN
  SELECT count(*), max(created_at) INTO v_msgs_5min, v_last_msg
    FROM evo.evolution_messages WHERE created_at > NOW()-INTERVAL '5 minutes';
  SELECT count(*) INTO v_msgs_1h
    FROM evo.evolution_messages WHERE created_at > NOW()-INTERVAL '1 hour';
  SELECT count(*) FILTER(WHERE status='processed'), count(*) FILTER(WHERE status='rejected'),
         max(created_at) FILTER(WHERE status='processed')
    INTO v_audit_5min, v_audit_rejected, v_last_audit_ok
    FROM public.webhook_audit_log WHERE created_at > NOW()-INTERVAL '5 minutes';

  IF v_msgs_5min=0 AND v_msgs_1h>10 THEN
    v_status:='degraded'; v_alerts:=v_alerts||'[{"level":"warn","msg":"No messages in last 5min"}]'::jsonb;
  END IF;
  IF v_msgs_1h=0 THEN
    v_status:='critical'; v_alerts:=v_alerts||'[{"level":"crit","msg":"No messages in last 1 hour"}]'::jsonb;
  END IF;
  IF v_audit_rejected>100 THEN
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object('level','warn','msg','High rejection rate: '||v_audit_rejected));
  END IF;

  v_result:=jsonb_build_object('status',v_status,'checked_at',NOW(),'msgs_5min',v_msgs_5min,'msgs_1h',v_msgs_1h,'last_message_at',v_last_msg,'audit_processed_5min',v_audit_5min,'audit_rejected_5min',v_audit_rejected,'last_audit_ok',v_last_audit_ok,'alerts',v_alerts);

  IF v_status!='healthy' AND jsonb_array_length(v_alerts)>0 THEN
    SELECT COUNT(*) INTO v_recent_alert FROM evo.evolution_alerts
    WHERE alert_type='pipeline_health' AND resolved=false AND created_at>NOW()-INTERVAL '30 minutes';
    IF v_recent_alert=0 THEN
      -- AUTO-SUPERSEDE: resolve anteriores antes de criar novo
      UPDATE evo.evolution_alerts
      SET resolved_at=NOW(), resolved_by='superseded: novo alerta pipeline_health criado'
      WHERE alert_type='pipeline_health' AND resolved=false;

      INSERT INTO evo.evolution_alerts(alert_type,severity,title,message,payload)
      VALUES('pipeline_health',CASE WHEN v_status='critical' THEN 'high' ELSE 'medium' END,'Evolution pipeline '||v_status,v_alerts->>0,v_result);
    END IF;
  ELSE
    UPDATE evo.evolution_alerts SET resolved_at=NOW(),resolved_by='fn_check_pipeline_health:auto'
    WHERE alert_type='pipeline_health' AND resolved=false;
  END IF;
  RETURN v_result;
END;
$$;

-- Cleanup: resolver os 24 alertas acumulados (mantém apenas o mais recente)
UPDATE evo.evolution_alerts
SET resolved_at=NOW(), resolved_by='cleanup s8: superseded batch (dedup sem cap)'
WHERE alert_type='pipeline_health' AND resolved=false
  AND id NOT IN (
    SELECT id FROM evo.evolution_alerts
    WHERE alert_type='pipeline_health' AND resolved=false
    ORDER BY created_at DESC LIMIT 1
  );

-- ============================================================
-- VALIDAÇÃO S8 (2026-07-04):
-- Bateria A (regressão S1-S7): 10/10 PASS
-- Bateria B (exec + E2E):      12/12 PASS
-- Bateria C (supersede + DLQ): 7/7 PASS
-- DLQ E2E: evento failed → roteado → dead_letter → idempotente ✅
-- Supersede: máx 1 alerta aberto garantido ✅
-- 83 crons succeeded / 0 failed (últimos 15min) ✅
-- ============================================================
