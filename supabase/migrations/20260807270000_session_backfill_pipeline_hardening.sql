-- Migration: 20260807270000_session_backfill_pipeline_hardening
-- Session: 2026-08-07 pipeline hardening
-- All statements are idempotent.

-- 1. fn_pipeline_health_probe: threshold 20->90min (B2B)
CREATE OR REPLACE FUNCTION evo.fn_pipeline_health_probe()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = evo, pg_catalog AS $$
DECLARE
  v_gap_min NUMERIC; v_last_msg_at TIMESTAMPTZ; v_msg_count_1h INTEGER;
  v_probe_status TEXT; v_pipeline_status zapp.evolution_pipeline_status;
  v_detail TEXT; v_alerts_open INTEGER; v_now_brt TIMESTAMPTZ;
  v_dow INTEGER; v_hour_brt INTEGER; v_business_hours BOOLEAN;
  v_is_weekend BOOLEAN; v_crit_threshold INTEGER;
  v_warn_threshold INTEGER; v_fast_threshold INTEGER;
BEGIN
  SELECT MAX(created_at), COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '1 hour')
  INTO v_last_msg_at, v_msg_count_1h FROM evo.evolution_messages;
  v_gap_min := EXTRACT(EPOCH FROM (NOW()-COALESCE(v_last_msg_at,NOW()-INTERVAL '9999 minutes')))/60;
  SELECT COUNT(*) INTO v_alerts_open FROM evo.evolution_alerts
  WHERE severity IN ('critical','high') AND resolved_at IS NULL;
  v_now_brt := NOW() AT TIME ZONE 'America/Sao_Paulo';
  v_dow := EXTRACT(DOW FROM v_now_brt);
  v_hour_brt := EXTRACT(HOUR FROM v_now_brt);
  v_is_weekend := (v_dow=0 OR v_dow=6);
  v_business_hours := NOT v_is_weekend AND (v_hour_brt BETWEEN 8 AND 19);
  IF v_business_hours THEN
    v_crit_threshold:=90; v_warn_threshold:=30; v_fast_threshold:=15;
  ELSIF v_is_weekend THEN
    v_crit_threshold:=1440; v_warn_threshold:=480; v_fast_threshold:=240;
  ELSE
    v_crit_threshold:=120; v_warn_threshold:=45; v_fast_threshold:=20;
  END IF;
  IF v_gap_min>v_crit_threshold THEN
    v_probe_status:='critical'; v_pipeline_status:='critical';
    v_detail:=format('GAP CRITICO: %s min',ROUND(v_gap_min));
  ELSIF v_gap_min>v_warn_threshold THEN
    v_probe_status:='warn'; v_pipeline_status:='degraded_webhook';
    v_detail:=format('GAP elevado: %s min',ROUND(v_gap_min));
  ELSE
    v_probe_status:='ok'; v_pipeline_status:='healthy';
    v_detail:=format('OK. Gap: %s min',ROUND(v_gap_min));
  END IF;
  INSERT INTO evo.evolution_pipeline_health_log(
    checked_at, pipeline_status, baileys_health, gap_inbound_min,
    detail, probe_status, instance_name, unroutable_count,
    webhook_events_1h, alerts_critical_open, notes
  ) VALUES (NOW(), v_pipeline_status,
    CASE WHEN v_gap_min<v_warn_threshold THEN 'connected' ELSE 'check_required' END,
    v_gap_min, v_detail, v_probe_status, 'wpp2', 0, v_msg_count_1h, v_alerts_open,
    format('probe-15min|crit=%s|biz=%s',v_crit_threshold,v_business_hours));
  RETURN jsonb_build_object('status',v_probe_status,'gap_min',ROUND(v_gap_min),
    'crit_threshold',v_crit_threshold);
END;
$$;

-- 2. fn_check_401_rate: fix generated column 'resolved' in INSERT
CREATE OR REPLACE FUNCTION evo.fn_check_401_rate()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path=evo,pg_catalog AS $$
DECLARE v_rate_1h BIGINT; v_threshold CONSTANT INT:=500;
BEGIN
  SELECT COALESCE(SUM("count"),0) INTO v_rate_1h
  FROM evo.evolution_traefik_401_stats WHERE collected_at>now()-interval '1 hour';
  IF v_rate_1h>v_threshold THEN
    INSERT INTO evo.evolution_alerts(alert_type,severity,title,message,payload)
    VALUES('high_401_rate','high','401 rate elevada',
      format('Detectados %s hits 401/hora',v_rate_1h),
      jsonb_build_object('hits_1h',v_rate_1h,'threshold',v_threshold))
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE evo.evolution_alerts SET resolved_at=now(),
      resolved_by='fn_check_401_rate: normalizada'
    WHERE alert_type='high_401_rate' AND resolved_at IS NULL
      AND created_at<now()-interval '1 hour';
  END IF;
END;
$$;

-- 3. fn_check_ack_stall: fix generated column
CREATE OR REPLACE FUNCTION evo.fn_check_ack_stall()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path=evo,pg_catalog AS $$
DECLARE v_sent_24h BIGINT; v_acked_24h BIGINT; v_stall_mins INT;
BEGIN
  SELECT count(*) INTO v_sent_24h FROM evo.evolution_messages_wpp2
  WHERE from_me AND created_at>now()-interval '24h' AND status='sent';
  SELECT count(*) INTO v_acked_24h FROM evo.evolution_messages_wpp2
  WHERE from_me AND created_at>now()-interval '24h' AND status IN('delivered','read','played');
  v_stall_mins:=EXTRACT(EPOCH FROM(now()-(
    SELECT MAX(updated_at) FROM evo.evolution_messages_wpp2 WHERE from_me AND status='sent')))/60;
  IF v_sent_24h>0 AND v_stall_mins>60 THEN
    INSERT INTO evo.evolution_alerts(alert_type,severity,title,message,payload)
    VALUES('ack_stall','high','ACK stall',
      format('Msgs sent sem ack ha %s min',ROUND(v_stall_mins)),
      jsonb_build_object('stall_min',v_stall_mins))
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE evo.evolution_alerts SET resolved_at=now(),resolved_by='fn_check_ack_stall: ok'
    WHERE alert_type='ack_stall' AND resolved_at IS NULL
      AND created_at<now()-interval '30 minutes';
  END IF;
END;
$$;

-- 4. fn_evict_media_cache: nova funcao (48h TTL / 20MB cap)
CREATE OR REPLACE FUNCTION zapp.fn_evict_media_cache(
  p_max_age_hours INT DEFAULT 48, p_max_total_mb NUMERIC DEFAULT 20)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path=zapp,pg_catalog AS $$
DECLARE v_deleted_age INT; v_deleted_size INT; v_mb_before NUMERIC; v_mb_after NUMERIC;
BEGIN
  DELETE FROM zapp.media_cache
  WHERE accessed_at<NOW()-(p_max_age_hours||' hours')::INTERVAL;
  GET DIAGNOSTICS v_deleted_age=ROW_COUNT;
  SELECT ROUND(SUM(OCTET_LENGTH(storage_path::TEXT))/1024.0/1024.0,2)
  INTO v_mb_before FROM zapp.media_cache;
  IF COALESCE(v_mb_before,0)>p_max_total_mb THEN
    WITH ranked AS(SELECT file_hash,
      SUM(OCTET_LENGTH(storage_path::TEXT)/1024.0/1024.0)
        OVER(ORDER BY accessed_at DESC) AS cmb
      FROM zapp.media_cache)
    DELETE FROM zapp.media_cache
    WHERE file_hash IN(SELECT file_hash FROM ranked WHERE cmb>p_max_total_mb);
    GET DIAGNOSTICS v_deleted_size=ROW_COUNT;
  ELSE v_deleted_size:=0; END IF;
  SELECT ROUND(COALESCE(SUM(OCTET_LENGTH(storage_path::TEXT))/1024.0/1024.0,0),2)
  INTO v_mb_after FROM zapp.media_cache;
  RETURN jsonb_build_object('deleted_age',v_deleted_age,'deleted_size',v_deleted_size,
    'freed_mb',COALESCE(v_mb_before,0)-v_mb_after);
END;
$$;

-- 5. fn_auto_ban_401_abusers
CREATE OR REPLACE FUNCTION evo.fn_auto_ban_401_abusers(
  p_threshold INT DEFAULT 200, p_window_minutes INT DEFAULT 60)
RETURNS TABLE(ip TEXT, hits BIGINT, action TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=evo,pg_catalog AS $$
BEGIN
  RETURN QUERY
  SELECT SPLIT_PART(s.client_host,'"',1)::TEXT, COUNT(*),
    CASE WHEN COUNT(*)>=p_threshold THEN 'BAN_RECOMMENDED'
         WHEN COUNT(*)>=p_threshold/2 THEN 'WARN' ELSE 'OK' END
  FROM evo.evolution_traefik_401_stats s
  WHERE s.collected_at>NOW()-(p_window_minutes||' minutes')::INTERVAL
  GROUP BY SPLIT_PART(s.client_host,'"',1)
  HAVING COUNT(*)>=p_threshold/2 ORDER BY 2 DESC;
END;
$$;

-- 6. instance_registry: add 'connecting' to connection_status
ALTER TABLE zapp.instance_registry
  DROP CONSTRAINT IF EXISTS instance_registry_connection_status_check;
ALTER TABLE zapp.instance_registry
  ADD CONSTRAINT instance_registry_connection_status_check
  CHECK(connection_status IS NULL OR connection_status=ANY(ARRAY[
    'connected','disconnected','qr_pending','error',
    'connecting','reconnecting','degraded']));

-- 7. RLS service_only policies
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polname='service_only'
    AND polrelid='evo.evolution_traefik_401_stats'::regclass) THEN
    CREATE POLICY "service_only" ON evo.evolution_traefik_401_stats
      FOR ALL TO service_role USING(true) WITH CHECK(true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polname='service_only'
    AND polrelid='zapp.cron_inventory'::regclass) THEN
    CREATE POLICY "service_only" ON zapp.cron_inventory
      FOR ALL TO service_role USING(true) WITH CHECK(true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polname='service_only'
    AND polrelid='zapp.ai_function_metrics'::regclass) THEN
    CREATE POLICY "service_only" ON zapp.ai_function_metrics
      FOR ALL TO service_role USING(true) WITH CHECK(true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polname='service_only'
    AND polrelid='zapp.processed_requests'::regclass) THEN
    CREATE POLICY "service_only" ON zapp.processed_requests
      FOR ALL TO service_role USING(true) WITH CHECK(true);
  END IF;
END $$;

-- 8. Cron adjustments
UPDATE cron.job SET active=false WHERE jobname='alert-consumer-halt';
UPDATE cron.job SET active=true  WHERE jobname='wpp2-session-expiry-watchdog';
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='media_cache_eviction_daily') THEN
    PERFORM cron.schedule('media_cache_eviction_daily','0 6 * * *',
      'SELECT zapp.fn_evict_media_cache(48,20)');
  END IF;
END $$;

-- 9. feature_flags: ensure anon SELECT
DO $$ BEGIN
  IF NOT has_table_privilege('anon','zapp.feature_flags','SELECT') THEN
    GRANT SELECT ON zapp.feature_flags TO anon;
  END IF;
END $$;
