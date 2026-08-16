-- ============================================================================
-- REPLAY CONVERGENTE (nao historico byte-a-byte) — materializado retroativamente
-- em 2026-08-16 a partir do registro em supabase_migrations.schema_migrations
-- (version=20260815250008) que nao tinha arquivo correspondente neste repo.
--
-- Objetivo: DR reproduzivel — o estado final (fn em zapp.*, cron repontado)
-- e o que importa, nao a sequencia exata de comandos que rodou em producao.
-- Corpos de funcao sao snapshot de producao 2026-08-15 pos-Lote5, obtidos via
-- pg_get_functiondef (fonte de verdade), nao reconstrucao de memoria.
--
-- Fonte do que esta migration fez: docs/decouple/E59_E60_MOVE_LOG.md ("Lote 1").
-- O log original registra o DDL como duas etapas por fn
-- (ALTER FUNCTION evo.<fn> SET SCHEMA zapp; ALTER FUNCTION zapp.<fn> SET search_path)
-- porque a fn ja existia em evo. Para este arquivo ser auto-contido e
-- replayable sem depender do evo.<fn> pre-existente, usamos CREATE OR REPLACE
-- diretamente em zapp com o corpo atual (que ja contem o search_path final)
-- + DROP FUNCTION IF EXISTS do lado evo (convergente ao mesmo estado final).
-- ============================================================================

-- 8 fns de monitoria movidas evo -> zapp (criterio: corpo 100% schema-qualificado,
-- sem citacao literal 'evo.', sem trigger, exatamente 1 cron cada).

CREATE OR REPLACE FUNCTION zapp.fn_analytics_wal_watchdog()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$ DECLARE v_slot TEXT; v_lag_mb NUMERIC; v_flush_lag_mb NUMERIC; v_effective_mb NUMERIC; v_active BOOLEAN; v_trigger_mb CONSTANT NUMERIC := 150; v_frozen_trigger_mb CONSTANT NUMERIC := 150; v_high_trigger CONSTANT NUMERIC := 400; v_cooldown CONSTANT INTERVAL := '45 minutes'; v_last_open TIMESTAMPTZ; v_alert_exists BOOLEAN; v_flush_lsn pg_lsn; v_last_flush_lsn_str TEXT; v_frozen_minutes NUMERIC; BEGIN /* FIX-SLOT-ROTATION-2026-08-12: fecha alertas orfaos de slots dropados */ UPDATE zapp.evolution_alerts ea SET resolved_at=now(), resolved_by='fn_analytics_wal_watchdog:slot_dropped' WHERE ea.alert_type='wal_slot_analytics_restart' AND ea.resolved_at IS NULL AND (ea.payload->>'slot') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_replication_slots prs WHERE prs.slot_name=(ea.payload->>'slot')); SELECT slot_name, round(pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)/1024.0/1024,1), round(pg_wal_lsn_diff(pg_current_wal_lsn(),confirmed_flush_lsn)/1024.0/1024,1), active, confirmed_flush_lsn INTO v_slot, v_lag_mb, v_flush_lag_mb, v_active, v_flush_lsn FROM pg_replication_slots WHERE slot_name LIKE 'cainophile%' ORDER BY pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn) DESC LIMIT 1; IF v_slot IS NULL THEN RETURN jsonb_build_object('ok',true,'msg','sem slot cainophile'); END IF; v_effective_mb := GREATEST(v_lag_mb, v_flush_lag_mb); IF v_effective_mb <= v_trigger_mb THEN UPDATE zapp.evolution_alerts SET resolved_at=now(), resolved_by='fn_analytics_wal_watchdog:recovered' WHERE alert_type IN ('wal_slot_analytics_restart','wal_slot_high_lag') AND resolved_at IS NULL; RETURN jsonb_build_object('ok',true,'slot',v_slot,'effective_mb',v_effective_mb,'msg','abaixo do trigger — OK, alertas resolvidos'); END IF; SELECT MAX(created_at) INTO v_last_open FROM zapp.evolution_alerts WHERE alert_type='wal_slot_analytics_restart' AND resolved_at IS NULL AND created_at > NOW()-v_cooldown; IF v_last_open IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'slot',v_slot,'effective_mb',v_effective_mb,'msg','cooldown ativo (alerta aberto desde '||v_last_open::text||')'); END IF; SELECT EXISTS(SELECT 1 FROM zapp.evolution_alerts WHERE alert_type='wal_slot_analytics_restart' AND resolved_at IS NULL) INTO v_alert_exists; IF NOT v_alert_exists THEN INSERT INTO zapp.evolution_alerts (alert_type,severity,title,message,payload) VALUES ('wal_slot_analytics_restart', CASE WHEN v_effective_mb >= v_high_trigger THEN 'high' ELSE 'medium' END,'[WAL-WATCHDOG] Slot '||v_slot||' com '||v_effective_mb||'MB','Slot '||v_slot||' atingiu '||v_effective_mb||'MB. restart_lag='||v_lag_mb||'MB flush_lag='||v_flush_lag_mb||'MB',jsonb_build_object('slot',v_slot,'restart_mb',v_lag_mb,'flush_mb',v_flush_lag_mb,'effective_mb',v_effective_mb,'active',v_active,'checked_at',now(),'fix','NB7-s17: cooldown baseado em alertas ABERTOS','frozen_detection','NB8-audit-s15: flush_lag>150MB trigger added')); END IF; RETURN jsonb_build_object('ok',true,'action','alert_created_or_existing','slot',v_slot,'effective_mb',v_effective_mb,'msg','alerta criado/mantido — wal-slot-guard container deve agir'); END $function$;

DROP FUNCTION IF EXISTS evo.fn_analytics_wal_watchdog();

CREATE OR REPLACE FUNCTION zapp.fn_check_ack_stall()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_recent_total BIGINT;
  v_recent_stuck BIGINT;
  v_stall_mins   INT;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status='sent') INTO v_recent_total, v_recent_stuck
  FROM zapp.evolution_messages_wpp2 WHERE from_me AND created_at > now()-interval '2 hours';
  v_stall_mins := EXTRACT(EPOCH FROM (now() - COALESCE((SELECT MAX(updated_at) FROM zapp.evolution_messages_wpp2 WHERE from_me AND status='sent' AND created_at > now()-interval '2 hours'), now())))/60;
  IF v_recent_total >= 10 AND v_recent_stuck::numeric / NULLIF(v_recent_total,0) > 0.5 AND v_stall_mins > 30 THEN
    INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
    VALUES ('ack_stall', 'high', 'ACK stall detectado', format('%s/%s sends recentes (2h) travados em sent ha %s min', v_recent_stuck, v_recent_total, ROUND(v_stall_mins)), jsonb_build_object('recent_total', v_recent_total, 'recent_stuck', v_recent_stuck, 'stall_min', v_stall_mins))
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE zapp.evolution_alerts SET resolved_at = now(), resolved_by = 'fn_check_ack_stall: sem stall recente' WHERE alert_type = 'ack_stall' AND resolved_at IS NULL AND created_at < now() - interval '30 minutes';
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_check_ack_stall();

CREATE OR REPLACE FUNCTION zapp.fn_check_connection_saturation()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_active   INT;
  v_max      INT;
  v_pct      NUMERIC;
BEGIN
  SELECT count(*) INTO v_active FROM pg_stat_activity WHERE backend_type='client backend';
  v_max := current_setting('max_connections')::int;
  v_pct := (v_active::NUMERIC / v_max) * 100;

  IF v_pct > 80 THEN
    INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
    VALUES (
      'connection_saturation', 'critical',
      format('Saturação de conexões: %s%%', round(v_pct,1)),
      format('%s de %s conexões (>80%%). Risco de rejeição.', v_active, v_max),
      jsonb_build_object('active', v_active, 'max', v_max, 'pct', v_pct)
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_check_connection_saturation();

CREATE OR REPLACE FUNCTION zapp.fn_check_wal_slot_health()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_slot TEXT;
  v_lag_mb NUMERIC;
  v_active BOOLEAN;
  v_threshold_mb NUMERIC := 400;
  v_alert_id UUID;
BEGIN
  -- GUARD v2: Alerta se slot cainophile ausente (analytics OOM/restart)
  IF NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name LIKE 'cainophile%') THEN
    SELECT id INTO v_alert_id FROM zapp.evolution_alerts
      WHERE alert_type='wal_slot_absent' AND resolved_at IS NULL
        AND created_at > NOW()-INTERVAL '60 minutes' LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO zapp.evolution_alerts
        (alert_type, severity, title, message, payload)
      VALUES (
        'wal_slot_absent', 'high',
        '[WAL-ALERTA] Slot cainophile AUSENTE - analytics offline',
        'Nenhum replication slot cainophile% encontrado. Analytics pode estar reiniciando (causa provavel: OOM com limite 1GB). WAL nao sendo consumido. Verificar container supabase_analytics e considerar aumentar memory limit de volta para 2GB.',
        jsonb_build_object('checked_at',now(),'root_cause','analytics_oom_memory_limit_1gb','action','restart ou aumentar memory limit do servico supabase_analytics')
      );
    END IF;
  ELSE
    -- Auto-resolve alerta anterior se slot voltou
    UPDATE zapp.evolution_alerts
      SET resolved_at=now(), resolved_by='cron-wal-guardian'
    WHERE alert_type='wal_slot_absent' AND resolved_at IS NULL;
  END IF;

  -- Loop original: alerta se lag > threshold
  FOR v_slot, v_lag_mb, v_active IN
    SELECT slot_name,
           round(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)/1024.0/1024, 1),
           active
    FROM pg_replication_slots
    WHERE slot_name LIKE 'cainophile%'
  LOOP
    IF v_lag_mb > v_threshold_mb THEN
      SELECT id INTO v_alert_id FROM zapp.evolution_alerts
        WHERE alert_type = 'wal_slot_high_lag'
          AND resolved_at IS NULL
          AND created_at > NOW() - INTERVAL '30 minutes'
        LIMIT 1;
      IF NOT FOUND THEN
        INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message)
        VALUES (
          'wal_slot_high_lag', 'high',
          '[WAL-ALERTA] Slot ' || v_slot || ' retendo ' || v_lag_mb || ' MB',
          'Slot ' || v_slot || ' retendo ' || v_lag_mb || ' MB de WAL. active=' || v_active::text ||
          '. Limiar=' || v_threshold_mb || 'MB. Acao: reiniciar supabase_analytics se nao reduzir em 15min.'
        );
      END IF;
    END IF;
  END LOOP;
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_check_wal_slot_health();

CREATE OR REPLACE FUNCTION zapp.fn_detect_dedup_cap_failures(p_window interval DEFAULT '01:00:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_dedup_threshold  CONSTANT int := 3;
  v_total_dupes      bigint := 0;
  v_total_dup_rows   bigint := 0;
  v_worst_offenders  jsonb;
  v_result           jsonb;
  v_status           text;
BEGIN
  SELECT
    COUNT(DISTINCT message_id),
    SUM(cnt) - COUNT(DISTINCT message_id)
  INTO v_total_dupes, v_total_dup_rows
  FROM (
    SELECT message_id, COUNT(*) AS cnt
    FROM zapp.evolution_messages
    WHERE message_id IS NOT NULL
      AND created_at >= now() - p_window
    GROUP BY message_id
    HAVING COUNT(*) > 1
  ) t;

  SELECT jsonb_agg(jsonb_build_object(
    'message_id',  message_id,
    'count',       cnt,
    'first_seen',  first_seen,
    'last_seen',   last_seen
  ) ORDER BY cnt DESC)
  INTO v_worst_offenders
  FROM (
    SELECT
      message_id,
      COUNT(*)        AS cnt,
      MIN(created_at) AS first_seen,
      MAX(created_at) AS last_seen
    FROM zapp.evolution_messages
    WHERE message_id IS NOT NULL
      AND created_at >= now() - p_window
    GROUP BY message_id
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 5
  ) t;

  v_status := CASE
    WHEN v_total_dupes >= v_dedup_threshold THEN 'CRITICAL'
    WHEN v_total_dupes > 0                  THEN 'WARN'
    ELSE 'OK'
  END;

  IF v_status IN ('CRITICAL', 'WARN') THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'dedup_cap_failure',
        CASE WHEN v_status = 'CRITICAL' THEN 'critical' ELSE 'high' END,
        format('E8-01: Dedup failure — %s duplicate message_ids (%s extra rows) in %s',
          v_total_dupes, v_total_dup_rows, p_window),
        jsonb_build_object(
          'total_duplicate_ids', v_total_dupes,
          'total_extra_rows',    v_total_dup_rows,
          'window',              p_window,
          'worst_offenders',     COALESCE(v_worst_offenders, '[]'::jsonb),
          'root_cause',          'Consumer v2 Set has no TTL/max-size; grows until OOM or loses state on restart',
          'fix_action',          'Add LRU cap (max 10k entries) + TTL (5min) to consumer dedup Set'
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN jsonb_build_object(
    'checked_at',          now(),
    'window',              p_window,
    'status',              v_status,
    'total_duplicate_ids', v_total_dupes,
    'total_extra_rows',    COALESCE(v_total_dup_rows, 0),
    'worst_offenders',     COALESCE(v_worst_offenders, '[]'::jsonb),
    'threshold',           v_dedup_threshold,
    'root_cause',          'Consumer v2 Set has no TTL/max-size cap',
    'fix_action',          'Add LRU cap + TTL to dedup Set, or enforce UNIQUE on evolution_messages.message_id'
  );
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_detect_dedup_cap_failures(interval);

CREATE OR REPLACE FUNCTION zapp.fn_expire_whatsapp_media_urls(p_days_old integer DEFAULT 7, p_batch_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$ DECLARE v_updated integer; v_still_pending integer; BEGIN WITH to_expire AS (SELECT id FROM zapp.evolution_messages_wpp2 WHERE (media_url LIKE '%mmg.whatsapp.net%' OR media_url LIKE '%cdn.whatsapp.net%' OR media_url LIKE '%mmg.whatsapp.com%' OR media_url LIKE '%media.whatsapp.net%') AND (media_status IS NULL OR media_status NOT IN ('expired','ready')) AND created_at < NOW()-(p_days_old||' days')::interval LIMIT p_batch_limit) UPDATE zapp.evolution_messages_wpp2 em SET media_status='expired', updated_at=NOW() FROM to_expire t WHERE em.id=t.id; GET DIAGNOSTICS v_updated=ROW_COUNT; SELECT COUNT(*) INTO v_still_pending FROM zapp.evolution_messages_wpp2 WHERE (media_url LIKE '%mmg.whatsapp.net%' OR media_url LIKE '%cdn.whatsapp.net%' OR media_url LIKE '%mmg.whatsapp.com%') AND (media_status IS NULL OR media_status NOT IN ('expired','ready')) AND created_at < NOW()-(p_days_old||' days')::interval; RETURN jsonb_build_object('updated',v_updated,'still_pending',v_still_pending,'days_threshold',p_days_old,'executed_at',NOW()); END; $function$;

DROP FUNCTION IF EXISTS evo.fn_expire_whatsapp_media_urls(integer, integer);

CREATE OR REPLACE FUNCTION zapp.fn_handle_expired_r2_media()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$ DECLARE expired_count integer; BEGIN UPDATE zapp.evolution_messages_wpp2 SET media_url=NULL, media_status='expired', updated_at=now() WHERE media_url LIKE 'https://zapp-media-proxy%' AND message_type::text IN ('image','audio','ptt','video') AND created_at < now()-interval '180 days' AND deleted_at IS NULL; GET DIAGNOSTICS expired_count=ROW_COUNT; UPDATE zapp.evolution_messages_wpp2 SET media_url=NULL, media_status='expired', updated_at=now() WHERE media_url LIKE 'https://zapp-media-proxy%' AND message_type::text='document' AND created_at < now()-interval '365 days' AND deleted_at IS NULL; RETURN expired_count; END; $function$;

DROP FUNCTION IF EXISTS evo.fn_handle_expired_r2_media();

CREATE OR REPLACE FUNCTION zapp.fn_link_orphan_messages(p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE v_convs int; v_linked int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM zapp.evolution_messages WHERE conversation_id IS NULL LIMIT 1) THEN
    RETURN jsonb_build_object('conversas_criadas',0,'mensagens_ligadas',0,'early_exit',true);
  END IF;
  INSERT INTO zapp.evolution_conversations (remote_jid, instance_name, first_message_at, last_message_at, message_count, created_at, updated_at)
  SELECT remote_jid, instance_name, min(created_at), max(created_at), count(*), min(created_at), now()
  FROM zapp.evolution_messages
  WHERE conversation_id IS NULL AND remote_jid IS NOT NULL AND instance_name IS NOT NULL
  GROUP BY remote_jid, instance_name
  ON CONFLICT (remote_jid, instance_name) DO NOTHING;
  GET DIAGNOSTICS v_convs = ROW_COUNT;
  UPDATE zapp.evolution_messages m SET conversation_id = c.id
  FROM zapp.evolution_conversations c
  WHERE c.remote_jid = m.remote_jid AND c.instance_name = m.instance_name
    AND m.conversation_id IS NULL
    AND m.id IN (SELECT id FROM zapp.evolution_messages WHERE conversation_id IS NULL LIMIT p_limit);
  GET DIAGNOSTICS v_linked = ROW_COUNT;
  RETURN jsonb_build_object('conversas_criadas', v_convs, 'mensagens_ligadas', v_linked, 'early_exit', false);
END $function$;

DROP FUNCTION IF EXISTS evo.fn_link_orphan_messages(integer);

-- Repoint dos 8 crons para o novo endereco zapp.* (comandos exatos, confirmados em cron.job)
SELECT cron.alter_job(460, command => 'SELECT zapp.fn_analytics_wal_watchdog()');
SELECT cron.alter_job(296, command => 'SELECT zapp.fn_check_ack_stall()');
SELECT cron.alter_job(306, command => 'SELECT zapp.fn_check_connection_saturation()');
SELECT cron.alter_job(458, command => 'SELECT zapp.fn_check_wal_slot_health()');
SELECT cron.alter_job(168, command => 'SELECT zapp.fn_detect_dedup_cap_failures(''1 hour''::interval)');
SELECT cron.alter_job(217, command => 'SELECT zapp.fn_expire_whatsapp_media_urls(7, 500)');
SELECT cron.alter_job(12,  command => 'SELECT zapp.fn_handle_expired_r2_media()');
SELECT cron.alter_job(76,  command => 'SELECT zapp.fn_link_orphan_messages(10000)');
