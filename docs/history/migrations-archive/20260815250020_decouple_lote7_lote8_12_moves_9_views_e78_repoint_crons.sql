-- ============================================================================
-- REPLAY CONVERGENTE — materializado retroativamente em 2026-08-16 a partir de
-- supabase_migrations.schema_migrations (version=20260815250020), sem arquivo
-- correspondente neste repo. Ver convencao completa em 20260815250008_*.sql.
--
-- Fonte: docs/decouple/LOTE6_7_8_LOG.md ("Lotes 7+8 — 12 moves + 9 views E78
-- novas"). Padrao: monitoria de dominio zapp move para zapp lendo evo por
-- views public.evo_* (security_invoker=on); fns SECURITY DEFINER owner
-- postgres tornam a ACL trivial. Definicoes: pg_get_functiondef / pg_get_viewdef
-- em producao 2026-08-15/16 (fonte de verdade).
--
-- Grants das 9 views: information_schema.role_table_grants mostra SELECT para
-- authenticated/dyad_reader/metabase_reader/om_reader/service_role e CRUD
-- completo para postgres/service_role/authenticated em todas as 9 views —
-- identico ao padrao ja observado nas demais views public.evo_* deste banco
-- (privilegios padrao de schema public, nao GRANTs especificos desta
-- migration). Nao ha REVOKE explicito aqui (diferente do E78 minimo em
-- 20260815250011_*.sql, que endurece ACL para authenticated/service_role) —
-- este lote nao fez esse hardening.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 9 views novas public.evo_* (leitura evo -> zapp para as fns movidas abaixo)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.evo_traefik_401_stats
WITH (security_invoker = on) AS
SELECT
  evolution_traefik_401_stats.id,
  evolution_traefik_401_stats.collected_at,
  evolution_traefik_401_stats.host,
  evolution_traefik_401_stats.path,
  evolution_traefik_401_stats.status,
  evolution_traefik_401_stats.client_host,
  evolution_traefik_401_stats.count
FROM evo.evolution_traefik_401_stats;

CREATE OR REPLACE VIEW public.evo_guardian_heartbeat
WITH (security_invoker = on) AS
SELECT
  evolution_guardian_heartbeat.id,
  evolution_guardian_heartbeat.service_name,
  evolution_guardian_heartbeat.heartbeat_at,
  evolution_guardian_heartbeat.cycles_since_last,
  evolution_guardian_heartbeat.details
FROM evo.evolution_guardian_heartbeat;

CREATE OR REPLACE VIEW public.evo_lid_health_scorecard
WITH (security_invoker = on) AS
SELECT
  v_lid_health_scorecard.fake_jids_historical,
  v_lid_health_scorecard.fake_jids_canary,
  v_lid_health_scorecard.map_real_entries,
  v_lid_health_scorecard.map_invalid,
  v_lid_health_scorecard.lid_contacts,
  v_lid_health_scorecard.contacts_with_phonejid,
  v_lid_health_scorecard.fake_jid_trend,
  v_lid_health_scorecard.delta_last_hour,
  v_lid_health_scorecard.contact_identity_total,
  v_lid_health_scorecard.contact_identity_pn,
  v_lid_health_scorecard.contact_identity_lid,
  v_lid_health_scorecard.contacts_real_phone,
  v_lid_health_scorecard.contacts_lid_phone_contaminated,
  v_lid_health_scorecard.lid_coverage_pct,
  v_lid_health_scorecard.coverage_goal_met,
  v_lid_health_scorecard.lid_contacts_wpp2,
  v_lid_health_scorecard.lid_health_score,
  v_lid_health_scorecard.lid_status,
  v_lid_health_scorecard.checked_at,
  v_lid_health_scorecard.usync_count,
  v_lid_health_scorecard.contacts_sync_count,
  v_lid_health_scorecard.converged_48h,
  v_lid_health_scorecard.phonejid_signal
FROM v_lid_health_scorecard;

CREATE OR REPLACE VIEW public.evo_ack_loss_candidates
WITH (security_invoker = on) AS
SELECT
  v_ack_loss_candidates.id,
  v_ack_loss_candidates.event_type,
  v_ack_loss_candidates.instance_name,
  v_ack_loss_candidates.remote_jid,
  v_ack_loss_candidates.status,
  v_ack_loss_candidates.retry_count,
  v_ack_loss_candidates.error_message,
  v_ack_loss_candidates.created_at,
  v_ack_loss_candidates.queue_name,
  v_ack_loss_candidates.failure_category,
  v_ack_loss_candidates.likely_lost,
  v_ack_loss_candidates.retry_exhausted
FROM v_ack_loss_candidates;

CREATE OR REPLACE VIEW public.evo_ghost_conversations
WITH (security_invoker = on) AS
SELECT
  v_ghost_conversations.conversation_id,
  v_ghost_conversations.remote_jid,
  v_ghost_conversations.phone_candidate,
  v_ghost_conversations.created_at,
  v_ghost_conversations.last_message_at,
  v_ghost_conversations.unread_count,
  v_ghost_conversations.msgs_sem_contato,
  v_ghost_conversations.msgs_recebidas,
  v_ghost_conversations.instance_name
FROM v_ghost_conversations;

CREATE OR REPLACE VIEW public.evo_bootstrap_coverage_monitor
WITH (security_invoker = on) AS
SELECT
  v_bootstrap_coverage_monitor.bootstrap_invalid_count,
  v_bootstrap_coverage_monitor.high_map_count,
  v_bootstrap_coverage_monitor.covered_count,
  v_bootstrap_coverage_monitor.lid_contacts_total,
  v_bootstrap_coverage_monitor.organic_phonejid_events,
  v_bootstrap_coverage_monitor.coverage_pct,
  v_bootstrap_coverage_monitor.potential_if_all_matched_pct,
  v_bootstrap_coverage_monitor.phase,
  v_bootstrap_coverage_monitor.upgrade_readiness,
  v_bootstrap_coverage_monitor.checked_at
FROM v_bootstrap_coverage_monitor;

CREATE OR REPLACE VIEW public.evo_pipeline_health_log
WITH (security_invoker = on) AS
SELECT
  evolution_pipeline_health_log.id,
  evolution_pipeline_health_log.checked_at,
  evolution_pipeline_health_log.pipeline_status,
  evolution_pipeline_health_log.baileys_health,
  evolution_pipeline_health_log.baileys_severity,
  evolution_pipeline_health_log.webhook_processed_pct,
  evolution_pipeline_health_log.webhook_avg_ms,
  evolution_pipeline_health_log.webhook_events_15min,
  evolution_pipeline_health_log.webhook_events_1h,
  evolution_pipeline_health_log.queue_pending_now,
  evolution_pipeline_health_log.queue_failed_24h,
  evolution_pipeline_health_log.queue_sent_24h,
  evolution_pipeline_health_log.alerts_critical_open,
  evolution_pipeline_health_log.alerts_unresolved,
  evolution_pipeline_health_log.gap_inbound_min,
  evolution_pipeline_health_log.detail,
  evolution_pipeline_health_log.snapshot,
  evolution_pipeline_health_log.created_at,
  evolution_pipeline_health_log.probe_latency_ms,
  evolution_pipeline_health_log.probe_status,
  evolution_pipeline_health_log.instance_name,
  evolution_pipeline_health_log.consumer_ok_count,
  evolution_pipeline_health_log.consumer_filas,
  evolution_pipeline_health_log.evo_state,
  evolution_pipeline_health_log.unroutable_count,
  evolution_pipeline_health_log.notes
FROM evo.evolution_pipeline_health_log;

CREATE OR REPLACE VIEW public.evo_bootstrap_log
WITH (security_invoker = on) AS
SELECT
  evolution_bootstrap_log.id,
  evolution_bootstrap_log.instance_name,
  evolution_bootstrap_log.instance_id,
  evolution_bootstrap_log.triggered_by,
  evolution_bootstrap_log.settings_applied,
  evolution_bootstrap_log.rabbitmq_events_count,
  evolution_bootstrap_log.status,
  evolution_bootstrap_log.notes,
  evolution_bootstrap_log.created_at
FROM evo.evolution_bootstrap_log;

CREATE OR REPLACE VIEW public.evo_media_download_queue
WITH (security_invoker = on) AS
SELECT
  media_download_queue.id,
  media_download_queue.message_id,
  media_download_queue.message_uuid,
  media_download_queue.remote_jid,
  media_download_queue.instance_name,
  media_download_queue.media_type,
  media_download_queue.media_key,
  media_download_queue.direct_path,
  media_download_queue.mimetype,
  media_download_queue.file_length,
  media_download_queue.status,
  media_download_queue.download_url,
  media_download_queue.storage_path,
  media_download_queue.retry_count,
  media_download_queue.max_retries,
  media_download_queue.error_message,
  media_download_queue.priority,
  media_download_queue.created_at,
  media_download_queue.processed_at,
  media_download_queue.scan_status,
  media_download_queue.scan_result,
  media_download_queue.scanned_at,
  media_download_queue.next_retry_at,
  media_download_queue.jitter_ms,
  media_download_queue.worker_id,
  media_download_queue.locked_at,
  media_download_queue.media_status_target
FROM evo.media_download_queue;

-- ---------------------------------------------------------------------------
-- Lote 7 — 4 moves evo->zapp (leitura via views E78 acima)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION zapp.fn_check_401_rate()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_rate_1h  BIGINT;
  v_threshold CONSTANT INT := 500;
BEGIN
  SELECT COALESCE(SUM("count"),0) INTO v_rate_1h
  FROM public.evo_traefik_401_stats
  WHERE collected_at > now() - interval '1 hour';

  IF v_rate_1h > v_threshold THEN
    INSERT INTO zapp.evolution_alerts
      (alert_type, severity, title, message, payload)
    VALUES
      ('high_401_rate', 'high', '401 rate elevada na Evolution API',
       format('Detectados %s hits 401 na ultima hora', v_rate_1h),
       jsonb_build_object('hits_1h', v_rate_1h, 'threshold', v_threshold))
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE zapp.evolution_alerts
    SET resolved_at = now(), resolved_by = 'fn_check_401_rate: rate normalizada'
    WHERE alert_type = 'high_401_rate'
      AND resolved_at IS NULL
      AND created_at < now() - interval '1 hour';
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_check_401_rate();

CREATE OR REPLACE FUNCTION zapp.fn_check_v04_phonejid_arrived()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_count INT;
  v_open_alert BOOLEAN;
BEGIN
  SELECT contacts_with_phonejid::int INTO v_count FROM public.evo_lid_health_scorecard;
  IF v_count > 0 THEN
    SELECT EXISTS(SELECT 1 FROM zapp.evolution_alerts WHERE alert_type='v04_phonejid_arrived' AND resolved_at IS NULL) INTO v_open_alert;
    IF NOT v_open_alert THEN
      INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
      VALUES ('v04_phonejid_arrived', 'medium',
        '[V04] PhoneJid chegou! ' || v_count || ' contatos',
        'Evolution 2.4.x Baileys 7.x emitiu phoneJid. Coverage pode crescer!',
        jsonb_build_object('contacts_with_phonejid', v_count, 'detected_at', now()));
    END IF;
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_check_v04_phonejid_arrived();

-- homonima zapp.fn_auto_resolve_alerts(integer) pre-existente e outra coisa
-- (acknowledge de alertas velhos) — NAO faz parte deste move, mantida intacta.
CREATE OR REPLACE FUNCTION zapp.fn_auto_resolve_alerts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $function$
BEGIN
  -- Auto-resolver alertas de saturação de conexão se abaixou
  UPDATE zapp.evolution_alerts
  SET resolved_at = now(), resolved_by = 'auto_resolve_cron'
  WHERE alert_type = 'connection_saturation'
    AND resolved IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1 FROM pg_stat_activity
      WHERE backend_type='client backend'
      HAVING count(*) > 0.8 * current_setting('max_connections')::int
    );

  -- Auto-resolver alertas de 401 se taxa caiu
  UPDATE zapp.evolution_alerts
  SET resolved_at = now(), resolved_by = 'auto_resolve_cron'
  WHERE alert_type = 'high_401_rate'
    AND resolved IS NOT TRUE
    AND created_at < now() - interval '1 hour'
    AND NOT EXISTS (
      SELECT 1 FROM public.evo_traefik_401_stats
      WHERE collected_at > now()-interval '1 hour'
      HAVING sum("count") > 500
    );

  -- Auto-resolver alertas de DDL churn se passou 2h sem novo
  UPDATE zapp.evolution_alerts
  SET resolved_at = now(), resolved_by = 'auto_resolve_cron'
  WHERE alert_type = 'ddl_policy_churn'
    AND resolved IS NOT TRUE
    AND created_at < now() - interval '2 hours';
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_auto_resolve_alerts();

CREATE OR REPLACE FUNCTION zapp.fn_check_guardian_alive()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_last_hb timestamptz;
  v_gap_min int;
  v_dedup   int;
BEGIN
  -- Checar AMBAS as tabelas de heartbeat (guardian pode escrever em qualquer uma)
  SELECT GREATEST(
    (SELECT max(heartbeat_at) FROM public.evo_guardian_heartbeat WHERE service_name='swarm-task-guardian'),
    (SELECT max(heartbeat_at) FROM zapp.evolution_guardian_heartbeat WHERE service_name='swarm-task-guardian')
  ) INTO v_last_hb;

  v_gap_min := EXTRACT(EPOCH FROM (now() - COALESCE(v_last_hb, now() - interval '999 minutes')))::int / 60;

  IF v_gap_min > 15 THEN
    -- Dedup: nao inserir se ja existe alerta aberto nos ultimos 2h
    SELECT count(*) INTO v_dedup
    FROM zapp.evolution_alerts
    WHERE alert_type='guardian_heartbeat_missing'
      AND (resolved_at IS NULL OR resolved_at > now() - interval '2 hours')
      AND created_at > now() - interval '2 hours';

    IF v_dedup = 0 THEN
      INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message)
      VALUES (
        'guardian_heartbeat_missing',
        'critical',
        'swarm-task-guardian sem heartbeat',
        format('Guardian sem heartbeat em AMBAS tabelas ha %s min (ultimo: %s). Verificar: docker service ps swarm-task-guardian_swarm-task-guardian. Se container rodando, verificar dblink password/config.',
               v_gap_min, COALESCE(v_last_hb::text, 'NUNCA'))
      );
      RAISE WARNING 'GUARDIAN ALERT: sem heartbeat ha % min (ultimo: %)', v_gap_min, v_last_hb;
    ELSE
      RAISE NOTICE 'Guardian alert ja existe, dedup ok (gap=% min)', v_gap_min;
    END IF;
  ELSE
    -- Guardian ok: resolver alertas antigos se gap voltou a zero
    UPDATE zapp.evolution_alerts
    SET resolved_at = now()
    WHERE alert_type='guardian_heartbeat_missing'
      AND resolved_at IS NULL;
    RAISE NOTICE 'Guardian ok: gap=% min (ultimo hb: %)', v_gap_min, v_last_hb;
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_check_guardian_alive();

-- ---------------------------------------------------------------------------
-- Lote 8 — 8 moves evo->zapp (leitura via views E78 acima)
-- ---------------------------------------------------------------------------

-- ref evo.evolution_ip_watch era so TEXTO de log (tabela removida 2026-08-06);
-- string ajustada, sem dependencia funcional na tabela.
CREATE OR REPLACE FUNCTION zapp.fn_detect_401_bursts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
  v_count_log      int := 0;
  v_count_ipwatch  int := 0;
  v_count_health   int := 0;
  v_total          int;
  v_ipwatch_total  bigint := 0;
  v_monitoring_gap boolean := true;
  v_already_burst  boolean;
  v_already_gap    boolean;
  v_already_hunt   boolean;
  v_alert_fired    boolean := false;
  v_gap_detail     text;
BEGIN
  SELECT count(*)::int INTO v_count_log
  FROM zapp.webhook_audit_log
  WHERE status_code = 401 AND created_at > now() - interval '15min';

  SELECT count(*)::int INTO v_count_health
  FROM zapp.webhook_health_alerts
  WHERE alert_type = 'sentry_401_feed' AND created_at > now() - interval '15min';

  v_total := v_count_log + v_count_ipwatch + v_count_health;

  v_gap_detail :=
    'BLIND: evolution_ip_watch removida em 2026-08-06 (fantasma, 0 linhas, sem trigger). ' ||
    'webhook_audit_log captures edge-fn rejections only, not Evolution API 401s. ' ||
    'Burst detection remains DB-blind until log pipeline is wired.';

  SELECT EXISTS(
    SELECT 1 FROM zapp.warroom_alerts
    WHERE source = 'fn_detect_401_bursts' AND alert_type = 'critical'
      AND created_at > now() - interval '30min'
  ) INTO v_already_burst;

  SELECT EXISTS(
    SELECT 1 FROM zapp.warroom_alerts
    WHERE source = 'fn_detect_401_bursts' AND alert_type = 'warning'
      AND created_at > now() - interval '6h'
  ) INTO v_already_gap;

  -- FIX v5: dedup por TITLE (v4 usava message LIKE que nunca batia -> spam a cada 15min)
  SELECT EXISTS(
    SELECT 1 FROM zapp.warroom_alerts
    WHERE source = 'fn_detect_401_bursts' AND alert_type = 'info'
      AND title LIKE '%stale_api_key_hunt%'
      AND created_at > now() - interval '24h'
  ) INTO v_already_hunt;

  IF v_total >= 3 AND NOT v_already_burst THEN
    INSERT INTO zapp.warroom_alerts (alert_type, title, message, source)
    VALUES (
      'critical',
      format('🚨 401 BURST: %s signals em 15min', v_total),
      format(
        'Sources: webhook_audit_log=%s | evolution_ip_watch=%s (removida 2026-08-06) | health_alerts=%s '
        '— Verificar imediatamente. Chave atual: vault evolution_api_key (md5 0d658c199f7945a2b960a0a22ab5efa6).',
        v_count_log, v_count_ipwatch, v_count_health
      ),
      'fn_detect_401_bursts'
    );
    v_alert_fired := true;

  ELSIF v_monitoring_gap AND NOT v_already_gap THEN
    INSERT INTO zapp.warroom_alerts (alert_type, title, message, source)
    VALUES (
      'warning',
      '⚠️ 401 DETECTION BLIND: pipeline VPS→DB inativo',
      'evolution_ip_watch removida em 2026-08-06 (era fantasma: 0 linhas). ' ||
      'Ação: configurar Traefik access log → Supabase API. ' ||
      'Sentry recebe 401s (logpatch T3 corrigido em 2026-07-12).',
      'fn_detect_401_bursts'
    );
    v_alert_fired := true;
  END IF;

  IF NOT v_already_hunt THEN
    INSERT INTO zapp.warroom_alerts (alert_type, title, message, source)
    VALUES (
      'info',
      '🔍 OBS-2 stale_api_key_hunt: encontre o consumer com chave velha',
      'A Evolution API gera ~1 × 401 a cada 5 min de um consumer com apikey obsoleta. ' ||
      'Chave atual: vault evolution_api_key (md5 0d658c199f7945a2b960a0a22ab5efa6). ' ||
      'CHECKLIST: n8n credenciais → docker service env → secrets swarm → Sentry 401s. ' ||
      'Ref: AUDITORIA_EVO_API_2026-07-12.md OBS-2.',
      'fn_detect_401_bursts'
    );
    v_alert_fired := true;
  END IF;

  RETURN jsonb_build_object(
    'ok',             true,
    'count_15min',    v_total,
    'alert_fired',    v_alert_fired,
    'sources', jsonb_build_object(
      'webhook_audit_log_401',  v_count_log,
      'evolution_ip_watch_401', v_count_ipwatch,
      'health_alerts_401',      v_count_health
    ),
    'monitoring_gap',        v_monitoring_gap,
    'monitoring_gap_detail', v_gap_detail,
    'version', 'v5-fix-dedup-title-2026-08-14'
  );
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_detect_401_bursts();

CREATE OR REPLACE FUNCTION zapp.fn_detect_ack_loss_gap(p_window interval DEFAULT '00:30:00'::interval, p_dlq_threshold integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
  v_total_dlq_msg      bigint := 0;
  v_db_timeout_count   bigint := 0;
  v_db_error_count     bigint := 0;
  v_likely_lost_count  bigint := 0;
  v_retry_exhausted    bigint := 0;
  v_dlq_growth_rate    numeric;
  v_prev_window_count  bigint := 0;
  v_result             jsonb;
  v_status             text;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE failure_category = 'db_write_timeout'),
    COUNT(*) FILTER (WHERE failure_category IN ('db_write_timeout', 'db_write_error')),
    COUNT(*) FILTER (WHERE likely_lost),
    COUNT(*) FILTER (WHERE retry_exhausted)
  INTO
    v_total_dlq_msg,
    v_db_timeout_count,
    v_db_error_count,
    v_likely_lost_count,
    v_retry_exhausted
  FROM public.evo_ack_loss_candidates
  WHERE created_at >= now() - p_window;

  SELECT COUNT(*)
  INTO v_prev_window_count
  FROM public.evo_ack_loss_candidates
  WHERE created_at >= now() - (p_window * 2)
    AND created_at <  now() - p_window;

  v_dlq_growth_rate := CASE
    WHEN v_prev_window_count = 0 AND v_total_dlq_msg > 0 THEN 999.0
    WHEN v_prev_window_count = 0 THEN 0.0
    ELSE round(((v_total_dlq_msg::numeric / v_prev_window_count) - 1) * 100, 1)
  END;

  v_status := CASE
    WHEN v_likely_lost_count > 0 OR v_db_timeout_count >= p_dlq_threshold THEN 'CRITICAL'
    WHEN v_db_error_count > 0    OR v_total_dlq_msg > 0                   THEN 'WARN'
    ELSE 'OK'
  END;

  IF v_likely_lost_count > 0 THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'ack_loss_gap',
        'critical',
        format('E8-06: ACK-loss CRITICAL — %s likely-lost messages (ACKed, DB write failed, no retry)',
          v_likely_lost_count),
        jsonb_build_object(
          'likely_lost_count',    v_likely_lost_count,
          'db_timeout_count',     v_db_timeout_count,
          'db_error_count',       v_db_error_count,
          'retry_exhausted',      v_retry_exhausted,
          'total_dlq_msg',        v_total_dlq_msg,
          'window',               p_window,
          'dlq_growth_rate_pct',  v_dlq_growth_rate,
          'root_cause',           'Consumer ACKs RabbitMQ before Supabase INSERT confirmed',
          'fix_action',           'ACK only after INSERT returns success — consumer code change required'
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;

  ELSIF v_db_timeout_count >= p_dlq_threshold THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'ack_loss_gap',
        'high',
        format('E8-06: ACK-loss WARN — %s DB-timeout DLQ entries in %s (threshold: %s)',
          v_db_timeout_count, p_window, p_dlq_threshold),
        jsonb_build_object(
          'db_timeout_count',     v_db_timeout_count,
          'db_error_count',       v_db_error_count,
          'total_dlq_msg',        v_total_dlq_msg,
          'window',               p_window,
          'dlq_growth_rate_pct',  v_dlq_growth_rate,
          'root_cause',           'Consumer ACKs RabbitMQ before Supabase INSERT confirmed',
          'fix_action',           'ACK only after INSERT returns success — consumer code change required'
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  v_result := jsonb_build_object(
    'checked_at',           now(),
    'window',               p_window,
    'status',               v_status,
    'total_dlq_msg',        v_total_dlq_msg,
    'db_timeout_count',     v_db_timeout_count,
    'db_error_count',       v_db_error_count,
    'likely_lost_count',    v_likely_lost_count,
    'retry_exhausted',      v_retry_exhausted,
    'dlq_growth_rate_pct',  v_dlq_growth_rate,
    'threshold',            p_dlq_threshold,
    'root_cause',           'Consumer ACKs RabbitMQ before Supabase INSERT confirmed (at-most-once)',
    'fix_action',           'ACK only AFTER INSERT confirmed — consumer code change required'
  );

  RETURN v_result;
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_detect_ack_loss_gap(interval,integer);

CREATE OR REPLACE FUNCTION zapp.fn_detect_swarm_task_duplication()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
  v_heartbeat_window   CONSTANT interval := '5 minutes';
  v_heartbeat_max_ok   CONSTANT int      := 2;
  v_open_window        CONSTANT interval := '60 seconds';

  v_burst_count        int := 0;
  v_double_open_count  int := 0;
  r                    record;
BEGIN
  FOR r IN
    SELECT
      service_name,
      COUNT(*) AS hb_count,
      MIN(heartbeat_at) AS first_hb,
      MAX(heartbeat_at) AS last_hb
    FROM public.evo_guardian_heartbeat
    WHERE heartbeat_at >= now() - v_heartbeat_window
    GROUP BY service_name
    HAVING COUNT(*) > v_heartbeat_max_ok
    ORDER BY hb_count DESC
  LOOP
    v_burst_count := v_burst_count + 1;

    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'swarm_task_duplicate',
        'critical',
        format('E1-07: Swarm duplicate suspected — service "%s" sent %s heartbeats in 5min (max_ok=%s)',
          r.service_name, r.hb_count, v_heartbeat_max_ok),
        jsonb_build_object(
          'service_name',   r.service_name,
          'hb_count_5min',  r.hb_count,
          'max_ok',         v_heartbeat_max_ok,
          'first_hb',       r.first_hb,
          'last_hb',        r.last_hb,
          'detection',      'heartbeat_burst'
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  FOR r IN
    WITH opens AS (
      SELECT
        instance_name,
        created_at,
        LAG(created_at) OVER (PARTITION BY instance_name ORDER BY created_at) AS prev_open_at
      FROM public.evo_connection_history
      WHERE state = 'open'
        AND created_at >= now() - interval '10 minutes'
    )
    SELECT
      instance_name,
      prev_open_at,
      created_at AS this_open_at,
      EXTRACT(EPOCH FROM (created_at - prev_open_at))::int AS gap_seconds
    FROM opens
    WHERE prev_open_at IS NOT NULL
      AND (created_at - prev_open_at) <= v_open_window
    ORDER BY gap_seconds ASC
  LOOP
    v_double_open_count := v_double_open_count + 1;

    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'swarm_task_duplicate',
        'critical',
        format('E1-07: Baileys double-open on "%s" — two OPEN events %ss apart (window: %ss)',
          r.instance_name, r.gap_seconds, EXTRACT(EPOCH FROM v_open_window)::int),
        jsonb_build_object(
          'instance_name', r.instance_name,
          'first_open',    r.prev_open_at,
          'second_open',   r.this_open_at,
          'gap_seconds',   r.gap_seconds,
          'detection',     'double_open'
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  RETURN jsonb_build_object(
    'checked_at',             now(),
    'heartbeat_bursts_found', v_burst_count,
    'double_opens_found',     v_double_open_count,
    'total_detections',       v_burst_count + v_double_open_count,
    'status',                 CASE
                                WHEN (v_burst_count + v_double_open_count) > 0 THEN 'CRITICAL'
                                ELSE 'PASS'
                              END
  );
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_detect_swarm_task_duplication();

CREATE OR REPLACE FUNCTION zapp.fn_alert_ghost_conversations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'ops', 'pg_catalog'
AS $function$ DECLARE v_count int; v_threshold int:=500; v_payload jsonb; BEGIN SELECT count(*) INTO v_count FROM zapp.evolution_conversations cv WHERE cv.contact_id IS NULL AND cv.remote_jid LIKE '%@s.whatsapp.net' AND cv.last_message_at > now()-interval'30 days'; IF EXISTS (SELECT 1 FROM zapp.evolution_alerts WHERE alert_type='ghost_conversations' AND created_at > now()-interval'24 hours' AND resolved_at IS NULL) THEN RETURN 0; END IF; IF v_count < v_threshold THEN UPDATE zapp.evolution_alerts SET resolved_at=now(), resolved_by='cron-auto-ghost' WHERE alert_type='ghost_conversations' AND resolved_at IS NULL; RETURN 0; END IF; v_payload:=jsonb_build_object('ghost_count',v_count,'threshold',v_threshold,'check_at',now(),'root_cause','Contatos sem registro no CRM (pre-importacao ou deletados)','instruction','Ver public.evo_ghost_conversations. Importar via UI Zapp Webb ou aguardar Baileys.','trend','Decrescente: mai=178 JIDs, jun=159, jul=90, ago=12 (normal)'); INSERT INTO zapp.evolution_alerts (alert_type,severity,title,message,payload) VALUES ('ghost_conversations','warning',format('%s conversas sem contato (limite: %s)',v_count,v_threshold),format('v_ghost_conversations retornou %s conversas (30d) sem contact_id. Acima de %s. Importar contatos via UI.',v_count,v_threshold),v_payload); RETURN v_count; END; $function$;

DROP FUNCTION IF EXISTS evo.fn_alert_ghost_conversations();

CREATE OR REPLACE FUNCTION zapp.fn_bootstrap_coverage_hourly_check()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'ops', 'pg_catalog'
AS $function$
DECLARE
  v_coverage        numeric;
  v_organic         bigint;
  v_high_count      bigint;
  v_covered         bigint;
  v_lid_total       bigint;
  v_phase           text;
  v_alert_exists    boolean;
BEGIN
  -- Ler estado atual do monitor
  SELECT coverage_pct, organic_phonejid_events, high_map_count, covered_count, lid_contacts_total, phase
  INTO v_coverage, v_organic, v_high_count, v_covered, v_lid_total, v_phase
  FROM public.evo_bootstrap_coverage_monitor LIMIT 1;

  -- Registrar snapshot no upgrade_execution_log para histórico
  INSERT INTO ops.upgrade_execution_log (step, status, details, executed_by)
  VALUES ('bootstrap_coverage_snapshot', 'success',
    jsonb_build_object(
      'coverage_pct', v_coverage,
      'covered', v_covered,
      'lid_total', v_lid_total,
      'high_map_count', v_high_count,
      'organic_events', v_organic,
      'phase', v_phase
    ), 'fn_bootstrap_coverage_hourly_check');

  -- Alerta se p10 (50%) atingido e alerta ainda nao existe
  IF v_coverage >= 50 THEN
    SELECT EXISTS(
      SELECT 1 FROM zapp.evolution_alerts
      WHERE alert_type='lid_p10_coverage_reached' AND resolved_at IS NULL
    ) INTO v_alert_exists;
    IF NOT v_alert_exists THEN
      INSERT INTO zapp.evolution_alerts (severity, alert_type, title, message, payload)
      VALUES ('medium', 'lid_p10_coverage_reached',
        'LID Coverage atingiu 50% — p10 DESBLOQUEADO',
        format('coverage=%.1f%% (%s/%s contacts mapeados). Cron 488 vai atualizar steps_done.', v_coverage, v_covered, v_lid_total),
        jsonb_build_object('coverage_pct', v_coverage, 'covered', v_covered, 'lid_total', v_lid_total, 'organic_events', v_organic));
    END IF;
  END IF;

  -- Alerta se p11 (90%) atingido e alerta ainda nao existe
  IF v_coverage >= 90 THEN
    SELECT EXISTS(
      SELECT 1 FROM zapp.evolution_alerts
      WHERE alert_type='lid_p11_coverage_reached' AND resolved_at IS NULL
    ) INTO v_alert_exists;
    IF NOT v_alert_exists THEN
      INSERT INTO zapp.evolution_alerts (severity, alert_type, title, message, payload)
      VALUES ('high', 'lid_p11_coverage_reached',
        'LID Coverage atingiu 90% — p10+p11 DESBLOQUEADOS',
        format('coverage=%.1f%%. Steps 49/50 e 50/50 agora ativos.', v_coverage),
        jsonb_build_object('coverage_pct', v_coverage, 'covered', v_covered, 'lid_total', v_lid_total));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'coverage_pct', v_coverage,
    'covered', v_covered,
    'lid_total', v_lid_total,
    'organic_events', v_organic,
    'phase', v_phase,
    'checked_at', now()
  );
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_bootstrap_coverage_hourly_check();

CREATE OR REPLACE FUNCTION zapp.fn_monthly_evo_audit()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
  v_month_start   DATE    := date_trunc('month', now() - INTERVAL '1 month')::date;
  v_month_end     DATE    := date_trunc('month', now())::date;
  v_msg_volume    BIGINT;
  v_msg_inbound   BIGINT;
  v_msg_outbound  BIGINT;
  v_alerts_crit   INT;
  v_alerts_high   INT;
  v_rotation_due  INT;
  v_health_ok     INT;
  v_health_warn   INT;
  v_health_crit   INT;
  v_result        JSONB;
BEGIN
  -- Message volume for the completed month
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE NOT COALESCE(from_me, false)),
    COUNT(*) FILTER (WHERE COALESCE(from_me, false))
  INTO v_msg_volume, v_msg_inbound, v_msg_outbound
  FROM zapp.evolution_messages
  WHERE created_at >= v_month_start AND created_at < v_month_end;

  -- Open critical/high alerts
  SELECT
    COUNT(*) FILTER (WHERE severity = 'critical'),
    COUNT(*) FILTER (WHERE severity = 'high')
  INTO v_alerts_crit, v_alerts_high
  FROM zapp.evolution_alerts
  WHERE resolved_at IS NULL AND resolved = false;

  -- Consumers with rotation needed
  SELECT COUNT(*) INTO v_rotation_due
  FROM zapp.evolution_api_consumers
  WHERE rotation_needed = true AND status = 'active';

  -- Pipeline health log summary for last 30 days
  SELECT
    COUNT(*) FILTER (WHERE probe_status = 'ok'),
    COUNT(*) FILTER (WHERE probe_status = 'warn'),
    COUNT(*) FILTER (WHERE probe_status = 'critical')
  INTO v_health_ok, v_health_warn, v_health_crit
  FROM public.evo_pipeline_health_log
  WHERE checked_at >= now() - INTERVAL '30 days';

  v_result := jsonb_build_object(
    'audit_month',         v_month_start,
    'generated_at',        now(),
    'messages', jsonb_build_object(
      'total',    v_msg_volume,
      'inbound',  v_msg_inbound,
      'outbound', v_msg_outbound,
      'period',   v_month_start || ' to ' || v_month_end
    ),
    'pipeline_health_30d', jsonb_build_object(
      'probes_ok',       v_health_ok,
      'probes_warn',     v_health_warn,
      'probes_critical', v_health_crit,
      'uptime_pct',      CASE WHEN (v_health_ok + v_health_warn + v_health_crit) > 0
                           THEN ROUND(100.0 * v_health_ok / (v_health_ok + v_health_warn + v_health_crit), 2)
                           ELSE NULL END
    ),
    'open_alerts', jsonb_build_object(
      'critical', v_alerts_crit,
      'high',     v_alerts_high
    ),
    'consumer_registry', jsonb_build_object(
      'rotation_needed_count', v_rotation_due
    )
  );

  -- Persist to log table (upsert by month)
  INSERT INTO zapp.evolution_monthly_audit_log (audit_month, report)
  VALUES (v_month_start, v_result)
  ON CONFLICT (audit_month) DO UPDATE SET
    report     = EXCLUDED.report,
    created_at = now();

  RETURN v_result;
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_monthly_evo_audit();

CREATE OR REPLACE FUNCTION zapp.fn_cache_warmup_after_vacuum()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
  v_start timestamptz := now();
  v_counts jsonb := '{}';
  v_n bigint;
BEGIN
  -- Warm up the five key evo tables vacuumed nightly (02:01-02:21)
  SELECT COUNT(*) INTO v_n FROM zapp.evolution_messages_wpp2;
  v_counts := v_counts || jsonb_build_object('evolution_messages_wpp2', v_n);

  SELECT COUNT(*) INTO v_n FROM zapp.evolution_alerts WHERE resolved = false;
  v_counts := v_counts || jsonb_build_object('evolution_alerts_open', v_n);

  SELECT COUNT(*) INTO v_n FROM zapp.evolution_contacts WHERE deleted_at IS NULL;
  v_counts := v_counts || jsonb_build_object('evolution_contacts_active', v_n);

  SELECT COUNT(*) INTO v_n FROM public.evo_bootstrap_log;
  v_counts := v_counts || jsonb_build_object('evolution_bootstrap_log', v_n);

  SELECT COUNT(*) INTO v_n FROM public.evo_connection_history;
  v_counts := v_counts || jsonb_build_object('evolution_connection_history', v_n);

  -- Also warm up zapp.evolution_messages (partitioned parent — forces partition map into cache)
  SELECT COUNT(*) INTO v_n FROM zapp.evolution_messages WHERE created_at > now() - interval '7 days';
  v_counts := v_counts || jsonb_build_object('evolution_messages_7d', v_n);

  RETURN jsonb_build_object(
    'warmed_at', v_start,
    'duration_ms', EXTRACT(EPOCH FROM (now() - v_start)) * 1000,
    'counts', v_counts
  );
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_cache_warmup_after_vacuum();

CREATE OR REPLACE FUNCTION zapp.fn_run_media_health_alert()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $function$ DECLARE v_report RECORD; v_alert_count int := 0; v_alert_msg text := ''; BEGIN UPDATE zapp.warroom_alerts SET resolved_at=now(), resolved_reason='auto-resolve:healthcheck' WHERE source='media_pipeline' AND resolved_at IS NULL; SELECT (SELECT count(*) FROM public.evo_media_download_queue WHERE status='failed' AND processed_at > now()-interval '1 hour') AS failed_1h, (SELECT count(*) FROM public.evo_media_download_queue WHERE status='pending') AS pending, (SELECT count(*) FROM public.evo_media_download_queue WHERE status='processing' AND processed_at < now()-interval '15 minutes') AS stuck INTO v_report; IF v_report.failed_1h > 10 THEN v_alert_count := v_alert_count + 1; v_alert_msg := v_alert_msg || format('Falhas de download: %s na ultima hora. ', v_report.failed_1h); END IF; IF v_report.pending > 1000 THEN v_alert_count := v_alert_count + 1; v_alert_msg := v_alert_msg || format('Fila com %s pending. ', v_report.pending); END IF; IF v_report.stuck > 5 THEN v_alert_count := v_alert_count + 1; v_alert_msg := v_alert_msg || format('%s itens travados. ', v_report.stuck); END IF; IF v_alert_count > 0 THEN INSERT INTO zapp.warroom_alerts (source, severity, title, body) VALUES ('media_pipeline', CASE WHEN v_report.failed_1h > 20 THEN 'critical' ELSE 'warning' END, '[MEDIA] Pipeline degradado', v_alert_msg) ON CONFLICT DO NOTHING; END IF; END; $function$;

DROP FUNCTION IF EXISTS evo.fn_run_media_health_alert();

-- ---------------------------------------------------------------------------
-- Repoint dos 12 crons afetados (comandos exatos, confirmados em cron.job).
-- Smokes (LOTE6_7_8_LOG.md): 10 de 12 executadas sem excecao (monthly e
-- warmup validadas sintaticamente; rodam no proprio cron).
-- ---------------------------------------------------------------------------
SELECT cron.alter_job(295, command => 'SELECT zapp.fn_check_401_rate()');
SELECT cron.alter_job(486, command => 'SELECT zapp.fn_check_v04_phonejid_arrived()');
SELECT cron.alter_job(297, command => 'SELECT zapp.fn_auto_resolve_alerts()');
SELECT cron.alter_job(188, command => 'SELECT zapp.fn_check_guardian_alive()');
SELECT cron.alter_job(173, command => 'SELECT zapp.fn_detect_401_bursts()');
SELECT cron.alter_job(164, command => 'SELECT zapp.fn_detect_ack_loss_gap(''30 minutes''::interval, 5)');
SELECT cron.alter_job(160, command => 'SELECT zapp.fn_detect_swarm_task_duplication()');
SELECT cron.alter_job(498, command => 'SELECT zapp.fn_alert_ghost_conversations()');
SELECT cron.alter_job(500, command => 'SELECT zapp.fn_bootstrap_coverage_hourly_check()');
SELECT cron.alter_job(137, command => 'SELECT zapp.fn_monthly_evo_audit();');
SELECT cron.alter_job(139, command => 'SELECT zapp.fn_cache_warmup_after_vacuum()');
SELECT cron.alter_job(213, command => 'SELECT zapp.fn_run_media_health_alert()');
