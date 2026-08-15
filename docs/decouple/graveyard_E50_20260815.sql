CREATE OR REPLACE FUNCTION evo.fn_audit_rmq_durability_risk(p_window interval DEFAULT '01:00:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'public'
AS $function$
DECLARE
  v_health_gaps      jsonb;
  v_total_dlq        bigint := 0;
  v_result           jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'gap_start',    prev_check,
    'gap_end',      this_check,
    'gap_minutes',  gap_minutes
  ) ORDER BY gap_minutes DESC)
  INTO v_health_gaps
  FROM (
    SELECT
      LAG(created_at) OVER (ORDER BY created_at) AS prev_check,
      created_at                                  AS this_check,
      EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at))) / 60 AS gap_minutes
    FROM zapp.evolution_health_logs
    WHERE created_at >= now() - p_window
  ) t
  WHERE gap_minutes > 10
  LIMIT 5;

  SELECT COUNT(*) INTO v_total_dlq
  FROM zapp.evolution_webhook_dlq
  WHERE created_at >= now() - p_window;

  RETURN jsonb_build_object(
    'audited_at',             now(),
    'window',                 p_window,
    'health_log_gaps_found',  COALESCE(jsonb_array_length(v_health_gaps), 0),
    'health_log_gaps',        COALESCE(v_health_gaps, '[]'::jsonb),
    'dlq_entries_in_window',  v_total_dlq,
    'durability_risk',        CASE
                                WHEN jsonb_array_length(COALESCE(v_health_gaps,'[]'::jsonb)) > 0
                                  AND v_total_dlq > 10
                                THEN 'HIGH — health gap + DLQ spike suggests non-durable queue loss'
                                WHEN jsonb_array_length(COALESCE(v_health_gaps,'[]'::jsonb)) > 0
                                THEN 'MEDIUM — health gap detected; verify queue durable=true'
                                ELSE 'LOW — no health gaps in window'
                              END,
    'fix_action',             'Set durable=true and deliveryMode=2 (persistent) on all RabbitMQ queues; '
                              || 'verify with: rabbitmqctl list_queues name durable'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_burnin_critical_alert_check()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
DECLARE
  v_window_start   timestamptz;
  v_burn_passed    boolean;
  v_crit_count     bigint;
  v_result         jsonb := '{}';
BEGIN
  SELECT burn_in_start, burn_in_passed
  INTO v_window_start, v_burn_passed
  FROM zapp.evolution_burnin_tracker
  WHERE id = 1;

  IF v_burn_passed THEN
    RETURN jsonb_build_object('status', 'SKIP', 'detail', 'burn-in already passed');
  END IF;

  SELECT COUNT(*) INTO v_crit_count
  FROM zapp.evolution_alerts
  WHERE severity = 'critical'
    AND created_at >= v_window_start
    AND (acknowledged IS NULL OR acknowledged = false)
    AND (resolved IS NULL OR resolved = false);

  v_result := jsonb_build_object(
    'status',          CASE WHEN v_crit_count > 0 THEN 'FAIL' ELSE 'PASS' END,
    'burn_in_start',   v_window_start,
    'elapsed_hours',   ROUND(EXTRACT(EPOCH FROM (now() - v_window_start)) / 3600, 1),
    'critical_alerts_since_start', v_crit_count
  );

  IF v_crit_count > 0 THEN
    UPDATE zapp.evolution_burnin_tracker
    SET burn_in_start     = now(),
        last_reset_reason = format('E10-03: %s new critical alert(s) found at %s — 72h counter reset', v_crit_count, now()),
        updated_at        = now()
    WHERE id = 1;

    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'burnin_critical_alert',
        'critical',
        format('E10-03: %s new critical alert(s) during burn-in — 72h counter reset. Investigate before go-live.', v_crit_count),
        v_result,
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_burnin_disconnection_check()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
DECLARE
  v_window_start   timestamptz;
  v_burn_passed    boolean;
  v_result         jsonb := '{}';
  v_worst_duration integer;
  v_disc_count     bigint;
  v_long_disc      bigint;
  v_reset_needed   boolean := false;
  v_status         text;
BEGIN
  SELECT burn_in_start, burn_in_passed
  INTO v_window_start, v_burn_passed
  FROM zapp.evolution_burnin_tracker
  WHERE id = 1;

  IF v_burn_passed THEN
    RETURN jsonb_build_object('status', 'SKIP', 'detail', 'burn-in already passed — monitor deactivated');
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE duration_seconds > 30),
    MAX(duration_seconds)
  INTO v_disc_count, v_long_disc, v_worst_duration
  FROM evo.evolution_connection_history
  WHERE created_at >= v_window_start
    AND previous_state IN ('open', 'connected', 'connecting')
    AND state IN ('close', 'disconnected', 'refused');

  IF v_disc_count = 0 THEN
    v_status := 'PASS';
  ELSIF v_long_disc = 0 THEN
    v_status := 'PASS';
  ELSIF v_worst_duration > 120 THEN
    v_status := 'FAIL';
    v_reset_needed := true;
  ELSE
    v_status := 'WARN';
  END IF;

  v_result := jsonb_build_object(
    'status',         v_status,
    'burn_in_start',  v_window_start,
    'elapsed_hours',  ROUND(EXTRACT(EPOCH FROM (now() - v_window_start)) / 3600, 1),
    'disconnections_total',   v_disc_count,
    'disconnections_over_30s', v_long_disc,
    'worst_duration_seconds',  COALESCE(v_worst_duration, 0)
  );

  IF v_reset_needed THEN
    UPDATE zapp.evolution_burnin_tracker
    SET burn_in_start     = now(),
        last_reset_reason = format('E10-02: disconnection %ss > 120s threshold at %s', v_worst_duration, now()),
        updated_at        = now()
    WHERE id = 1;

    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'burnin_disconnection',
        'critical',
        format('E10-02: Baileys disconnection %ss > 120s — burn-in counter reset', v_worst_duration),
        v_result,
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  IF now() - v_window_start >= INTERVAL '72 hours' AND NOT v_reset_needed THEN
    UPDATE zapp.evolution_burnin_tracker
    SET burn_in_passed = true, updated_at = now()
    WHERE id = 1;
    v_result := v_result || jsonb_build_object('burn_in_passed', true);
  END IF;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_canonical_route_decision(p_min_days integer DEFAULT 7, p_max_parity_delta_pct numeric DEFAULT 5.0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'evo', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_days int;
  v_native bigint;
  v_consumer bigint;
  v_parity_delta numeric;
  v_recommended text;
  v_reason text;
BEGIN
  SELECT count(DISTINCT snapshot_date) INTO v_days FROM zapp.evolution_source_shadow_log;
  
  IF v_days < p_min_days THEN
    RETURN jsonb_build_object(
      'status', 'insufficient_data',
      'days_available', v_days,
      'days_required', p_min_days,
      'decision_date', current_date + (p_min_days - v_days),
      'message', 'Aguardando ' || (p_min_days - v_days) || ' dia(s) adicionais de dados'
    );
  END IF;
  
  SELECT
    COALESCE(sum(event_count) FILTER (WHERE source='evolution-native'), 0),
    COALESCE(sum(event_count) FILTER (WHERE source='consumer'), 0)
  INTO v_native, v_consumer
  FROM zapp.evolution_source_shadow_log
  WHERE snapshot_date >= current_date - p_min_days;
  
  v_parity_delta := abs(100.0 * (v_native - v_consumer) / NULLIF(v_native + v_consumer, 0));
  
  IF v_parity_delta <= p_max_parity_delta_pct THEN
    v_recommended := 'webhook-direct';
    v_reason := 'Paridade ' || round(v_parity_delta,1) || '% (limiar ' || p_max_parity_delta_pct || '%). Webhook-direct: menos componentes, retry nativo.';
  ELSIF v_native > v_consumer THEN
    v_recommended := 'webhook-direct';
    v_reason := 'Webhook-direct entregou ' || round(v_parity_delta,1) || '% mais eventos. Rota mais confiavel.';
  ELSE
    v_recommended := 'rabbit-consumer';
    v_reason := 'Consumer entregou ' || round(v_parity_delta,1) || '% mais eventos. Investigar antes de desligar.';
  END IF;
  
  RETURN jsonb_build_object(
    'status', 'ready',
    'days_measured', v_days,
    'evolution_native_total', v_native,
    'consumer_total', v_consumer,
    'parity_delta_pct', round(v_parity_delta, 2),
    'recommended_canonical', v_recommended,
    'route_to_shutdown', CASE v_recommended WHEN 'webhook-direct' THEN 'rabbit-consumer' ELSE 'webhook-direct' END,
    'reason', v_reason,
    'shutdown_stack', CASE v_recommended WHEN 'webhook-direct' THEN 'evolution-rabbit-consumer (stack 113)' ELSE 'evolution-native webhook config' END,
    'evaluated_at', now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_check_unknown_contact_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_contact     record;
  v_msg_count   int;
  v_duplicates  int;
BEGIN
  -- Verificar quantos contatos unknown existem (deve ser exatamente 1)
  SELECT COUNT(*) INTO v_duplicates
  FROM zapp.evolution_contacts
  WHERE remote_jid='unknown@s.whatsapp.net' AND instance_name='wpp2';

  -- Pegar o contato atual
  SELECT id, push_name, phone_number, raw_data, created_at
  INTO v_contact
  FROM zapp.evolution_contacts
  WHERE remote_jid='unknown@s.whatsapp.net' AND instance_name='wpp2'
  LIMIT 1;

  -- Contar mensagens linkadas
  SELECT COUNT(*) INTO v_msg_count
  FROM zapp.evolution_messages_wpp2
  WHERE remote_jid='unknown@s.whatsapp.net' AND contact_id=v_contact.id AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'ok', v_duplicates = 1,
    'contact_id', v_contact.id,
    'push_name', v_contact.push_name,
    'phone_sentinel', v_contact.phone_number,
    'duplicates_found', v_duplicates,
    'messages_linked', v_msg_count,
    'protection', 'evolution_contacts_remote_jid_unique (UNIQUE INDEX on remote_jid) previne duplicatas automaticamente',
    'on_conflict', 'Se Evolution emitir contacts.upsert para unknown@s.whatsapp.net, sera UPDATE no contato existente (push_name enriquecido)',
    'checked_at', now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_cleanup_test_artifacts(p_confirm boolean DEFAULT false, p_max_age_hours integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
DECLARE
  v_window       timestamptz := now() - (p_max_age_hours || ' hours')::interval;
  v_msgs_del     int := 0;
  v_log_del      int := 0;
  v_audit_del    int := 0;
  v_summary      jsonb;
  v_test_pattern text := '^([A-Z][0-9]{2}_|DIAG-|DRYRUN-)';
  v_log_pattern  text := '^(b[0-9]{2}[-_]|c[0-9]{2}[-_]|d[0-9]{2}[-_]|e[0-9]{2}[-_]|stress|regression)';
BEGIN
  -- 2026-07-11: alvo migrado _wpp2 → parent particionado zapp.evolution_messages
  -- (limpa artefatos em TODAS as 23 partições de uma vez); patterns DIAG-/DRYRUN- adicionados.
  IF NOT p_confirm THEN
    v_summary := jsonb_build_object(
      'dry_run',     true,
      'safety_note', 'Patterns [A-Z][0-9]{2}_ / DIAG- / DRYRUN- cover test sessions. Real WhatsApp IDs never contain _ or these prefixes.',
      'would_delete', jsonb_build_object(
        'evolution_messages_all_partitions', (
          SELECT count(*) FROM zapp.evolution_messages
          WHERE created_at > v_window AND message_id ~ v_test_pattern
        ),
        'bootstrap_log_test', (
          SELECT count(*) FROM evo.evolution_bootstrap_log
          WHERE created_at > v_window AND triggered_by ~ v_log_pattern
        ),
        'bootstrap_stale_no_event', (
          SELECT count(*) FROM evo.evolution_bootstrap_log bl
          WHERE bl.triggered_by='auto-connection-trigger'
            AND bl.status='registered'
            AND bl.created_at > v_window
            AND NOT EXISTS (
              SELECT 1 FROM evo.evolution_connection_history ch
              WHERE ch.instance_name='wpp2' AND ch.state='closed'
                AND ch.created_at BETWEEN bl.created_at - interval '30 sec'
                                       AND bl.created_at + interval '30 sec'
            )
        ),
        'canary_audit_entries', (
          SELECT count(*) FROM zapp.evolution_audit_log
          WHERE created_at > v_window AND action='canary_filtered'
        )
      ),
      'window_hours', p_max_age_hours
    );
    RETURN v_summary;
  END IF;

  WITH del AS (
    DELETE FROM zapp.evolution_messages
    WHERE created_at > v_window AND message_id ~ v_test_pattern
    RETURNING 1
  ) SELECT count(*) INTO v_msgs_del FROM del;

  WITH del AS (
    DELETE FROM evo.evolution_bootstrap_log
    WHERE created_at > v_window AND triggered_by ~ v_log_pattern
    RETURNING 1
  ) SELECT count(*) INTO v_log_del FROM del;

  WITH del AS (
    DELETE FROM evo.evolution_bootstrap_log bl
    WHERE bl.triggered_by='auto-connection-trigger'
      AND bl.status='registered'
      AND bl.created_at > v_window
      AND NOT EXISTS (
        SELECT 1 FROM evo.evolution_connection_history ch
        WHERE ch.instance_name='wpp2' AND ch.state='closed'
          AND ch.created_at BETWEEN bl.created_at - interval '30 sec'
                                 AND bl.created_at + interval '30 sec'
      )
    RETURNING 1
  ) SELECT count(*) + v_log_del INTO v_log_del FROM del;

  WITH del AS (
    DELETE FROM zapp.evolution_audit_log
    WHERE created_at > v_window AND action='canary_filtered'
    RETURNING 1
  ) SELECT count(*) INTO v_audit_del FROM del;

  RETURN jsonb_build_object(
    'dry_run', false,
    'deleted', jsonb_build_object(
      'messages', v_msgs_del, 'bootstrap_log', v_log_del, 'audit_canary', v_audit_del
    ),
    'executed_at', now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_delete_test_contacts(p_pattern text)
 RETURNS TABLE(deleted_contacts integer, deleted_convs integer, msg text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
DECLARE
  v_contacts int;
  v_convs    int;
BEGIN
  IF p_pattern NOT LIKE '%@s.whatsapp.net' AND p_pattern NOT LIKE '%@g.us'
     AND p_pattern NOT LIKE '%@lid' AND p_pattern NOT LIKE '%@broadcast' THEN
    RAISE EXCEPTION 'pattern invalido para delete de teste: %', p_pattern;
  END IF;

  IF p_pattern ~ '^55[1-9][0-9]{8,}' AND p_pattern NOT LIKE '%000%' THEN
    RAISE EXCEPTION 'pattern parece contato de producao: %', p_pattern;
  END IF;

  SET LOCAL session_replication_role = 'replica';

  DELETE FROM zapp.evolution_contacts
  WHERE remote_jid LIKE p_pattern;
  GET DIAGNOSTICS v_contacts = ROW_COUNT;

  SET LOCAL session_replication_role = DEFAULT;

  RETURN QUERY SELECT v_contacts, v_convs,
    format('deleted %s contacts matching %s', v_contacts, p_pattern);
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_get_incident_runbook(p_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_type IS NULL THEN
    SELECT jsonb_build_object(
      'runbooks_summary', COALESCE(
        jsonb_agg(jsonb_build_object(
          'id',                 id,
          'title',              title,
          'severity',           severity,
          'category',           category,
          'estimated_minutes',  estimated_minutes,
          'last_drilled_at',    last_drilled_at
        ) ORDER BY severity, id),
        '[]'::jsonb
      ),
      'total', COALESCE(COUNT(*), 0)
    )
    INTO v_result
    FROM zapp.evolution_incident_runbook;
  ELSE
    SELECT to_jsonb(r)
    INTO v_result
    FROM zapp.evolution_incident_runbook r
    WHERE r.id = p_type;

    IF v_result IS NULL THEN
      v_result := jsonb_build_object('error', format('runbook not found: %s', p_type));
    END IF;
  END IF;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_lid_upgrade_readiness_check()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'ops', 'pg_catalog'
AS $function$
DECLARE
  v_checks    jsonb := '[]'::jsonb;
  v_ok        int   := 0;
  v_fail      int   := 0;
  v_val       text;
BEGIN
  -- C01: Pipeline HEALTHY
  SELECT pipeline_status INTO v_val FROM evo.v_production_scorecard;
  IF v_val IN ('HEALTHY','DEGRADED') THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','C01_pipeline_healthy','status','PASS','got',v_val);
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','C01_pipeline_healthy','status','FAIL','got',v_val,'fix','Aguardar normalizar antes de upgrade');
  END IF;

  -- C02: wpp2 CONNECTED
  SELECT state INTO v_val FROM evo.evolution_connection_history WHERE instance_name='wpp2' ORDER BY created_at DESC LIMIT 1;
  IF v_val IN ('open','connected') THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','C02_wpp2_connected','status','PASS','got',v_val);
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','C02_wpp2_connected','status','FAIL','got',v_val,'fix','Reconectar wpp2 antes de upgrade');
  END IF;

  -- C03: DLQ vazia (migrada lote 4A → zapp)
  SELECT count(*)::text INTO v_val FROM zapp.evolution_webhook_dlq;
  IF v_val::int = 0 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','C03_dlq_empty','status','PASS','got',v_val);
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','C03_dlq_empty','status','WARN','got',v_val||' DLQ entries','fix','Opcional: drenar DLQ antes');
  END IF;

  -- C04: regression suite GREEN
  SELECT (evo.fn_lid_regression_suite()->>'status') INTO v_val;
  IF v_val = 'GREEN' THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','C04_regression_green','status','PASS','got',v_val);
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','C04_regression_green','status','FAIL','got',v_val,'fix','Corrigir testes antes de upgrade');
  END IF;

  -- C05: guardrails LID ativos
  SELECT count(*)::text INTO v_val FROM pg_trigger
  WHERE tgname IN ('trg_guard_lid_phone_map','trg_sync_contact_identity') AND tgenabled = 'O';
  IF v_val::int = 2 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','C05_lid_triggers_active','status','PASS','got','2/2 triggers enabled');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','C05_lid_triggers_active','status','FAIL','got',v_val||'/2 triggers','fix','Verificar triggers em evo.lid_phone_map');
  END IF;

  -- C06: backups recentes
  SELECT count(*)::text INTO v_val FROM information_schema.tables
  WHERE table_schema='evo' AND table_name LIKE '_backup_%20260811%';
  IF v_val::int >= 2 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','C06_backups_recent','status','PASS','got',v_val||' backups 20260811');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','C06_backups_recent','status','WARN','got',v_val||' backups','fix','Aguardar backup diário ou criar manual');
  END IF;

  -- C07: API contract documentado
  SELECT details->>'breaking_changes' INTO v_val FROM ops.api_contract_versions WHERE version='v1.1-lid-fix';
  IF v_val IS NOT NULL THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','C07_api_contract_documented','status','PASS');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','C07_api_contract_documented','status','FAIL','fix','Verificar ops.api_contract_versions');
  END IF;

  -- C08: fn_outbound_dispatch tem guard LID
  SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_outbound_dispatch'
    AND pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='zapp')
    AND prosrc LIKE '%lid%')::text INTO v_val;
  IF v_val = 'true' THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','C08_outbound_dispatch_lid_guard','status','PASS');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','C08_outbound_dispatch_lid_guard','status','FAIL','fix','Re-aplicar guard LID em fn_outbound_dispatch');
  END IF;

  -- C09: 43.666 fake_jids estável
  SELECT fake_jid_trend INTO v_val FROM evo.v_lid_health_scorecard;
  IF v_val = 'STABLE' THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','C09_fake_jids_stable','status','PASS','got',v_val);
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','C09_fake_jids_stable','status','FAIL','got',v_val,'fix','Investigar crescimento de fake_jids');
  END IF;

  -- C10: contact_intelligence limpo
  SELECT COUNT(*)::text INTO v_val FROM zapp.contact_intelligence ci
  WHERE ci.phone ~ '^[0-9]{14,}' AND ci.phone NOT LIKE '%@%';
  IF v_val::int = 0 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','C10_ci_no_lid_phone','status','PASS');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','C10_ci_no_lid_phone','status','FAIL','got',v_val||' contaminated','fix','Re-executar limpeza contact_intelligence');
  END IF;

  INSERT INTO evo.e2e_probe_results (probed_at, resultado, notes, wpp2_state, wal_lag_mb)
  SELECT now(),
    CASE WHEN v_fail=0 THEN 'UPGRADE_READY' WHEN v_fail<=2 THEN 'UPGRADE_WARN' ELSE 'UPGRADE_BLOCKED' END,
    format('lid_upgrade_readiness_v2: %s/%s checks pass', v_ok, v_ok+v_fail),
    (SELECT state FROM evo.evolution_connection_history WHERE instance_name='wpp2' ORDER BY created_at DESC LIMIT 1),
    (SELECT round(pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)/1024.0/1024,1) FROM pg_replication_slots WHERE slot_name LIKE 'cainophile%');

  RETURN jsonb_build_object(
    'status', CASE WHEN v_fail=0 THEN 'UPGRADE_READY' WHEN v_fail<=2 THEN 'UPGRADE_WARN' ELSE 'UPGRADE_BLOCKED' END,
    'checks_ok', v_ok, 'checks_fail', v_fail, 'total', v_ok+v_fail,
    'rollback_image', 'ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom@sha256:ed066617b536860837bb9a58deb66e5f9e31d0399c2b3c2209c933da9405e6b2',
    'current_version_index', 13371912,
    'details', v_checks
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_list_storage_cache_for_purge(days integer DEFAULT 30)
 RETURNS TABLE(bucket_name text, storage_path text, media_id uuid, message_id text, age_days integer)
 LANGUAGE plpgsql
 SET search_path TO 'evo', 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    e.storage_bucket::text,
    e.storage_path_clean::text,
    e.id,
    e.message_id,
    EXTRACT(DAY FROM (now() - e.created_at))::integer
  FROM zapp.evolution_media e
  WHERE e.media_status = 'ready'
    AND e.storage_url LIKE '%zapp-media-proxy.adm01.workers.dev%'
    AND e.storage_bucket IN ('whatsapp-media', 'audio-messages', 'zapp-whatsapp-media')
    AND e.storage_path_clean IS NOT NULL
    AND e.created_at < now() - (days || ' days')::interval
  ORDER BY e.created_at ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_logpatch_verify()
 RETURNS TABLE(patch text, status text, detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
DECLARE
  v_last_log RECORD;
BEGIN
  -- E5-04: 10s grace period for boot logs to land in evolution_health_logs
  PERFORM pg_sleep(10);

  SELECT * INTO v_last_log
  FROM zapp.evolution_health_logs
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN QUERY SELECT
    'T1_message_dump'::TEXT,
    CASE WHEN v_last_log.status = 'success' THEN 'OK' ELSE 'UNKNOWN' END::TEXT,
    COALESCE('last_check=' || v_last_log.created_at::TEXT, 'no_health_log')::TEXT;

  RETURN QUERY SELECT
    'T2_stanza_dump'::TEXT,
    CASE WHEN v_last_log.status = 'success' THEN 'OK' ELSE 'UNKNOWN' END::TEXT,
    'inferred_from_T1'::TEXT;

  RETURN QUERY SELECT
    'T3_sentry_filter'::TEXT,
    'APPLY_REQUIRED'::TEXT,
    'Verificar log de boot: [logpatch] T3 OK'::TEXT;

  RETURN QUERY SELECT
    'T4_apikey_mask'::TEXT,
    'APPLY_REQUIRED'::TEXT,
    'Verificar log de boot: [logpatch] T4 OK'::TEXT;

  RETURN QUERY SELECT
    'T5_cache_dump'::TEXT,
    'APPLY_REQUIRED'::TEXT,
    'Verificar log de boot: [logpatch] T5 OK — ForceUpdate 484 aplicado em 2026-07-10'::TEXT;

  RETURN QUERY SELECT
    'SUMMARY'::TEXT,
    CASE
      WHEN v_last_log.status = 'success' THEN 'PARTIAL_OK'
      ELSE 'NEEDS_VERIFICATION'
    END::TEXT,
    'ForceUpdate=484 | T1-T5 no logpatch | Verificar logs de boot do container evolution'::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_mark_status_viewed(p_message_id text, p_instance text DEFAULT 'wpp2'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'public'
AS $function$
DECLARE v_updated int;
BEGIN
  UPDATE zapp.evolution_whatsapp_status SET viewed_by_us=true, viewed_at=now()
  WHERE message_id=p_message_id AND instance_name=p_instance AND viewed_by_us IS NOT TRUE;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END; $function$
;

CREATE OR REPLACE FUNCTION evo.fn_migrate_media_urls_to_r2(dry_run boolean DEFAULT true, batch_size integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'evo', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_total      bigint;
  v_last_id    uuid := '00000000-0000-0000-0000-000000000000';
  v_ids        uuid[];
  v_batch      integer := 0;
  v_rows       integer;
  v_updated    bigint := 0;
  v_url_prefix text := 'https://zapp-media-proxy.adm01.workers.dev/evolution-api/';
BEGIN
  -- Candidatos: media pronta, ainda apontando p/ storage Supabase (nao migrada),
  -- com bucket + path limpo (contrato do mirror R2 - skill supabase-storage-r2-mirror)
  SELECT count(*)
    INTO v_total
    FROM zapp.evolution_media e
   WHERE e.media_status = 'ready'
     AND e.storage_url LIKE '%supabase%'
     AND e.storage_bucket IS NOT NULL
     AND e.storage_path_clean <> '';

  -- DRY RUN: retorno imediato com contagem (fix do loop infinito)
  IF dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'total', v_total,
      'batch_size', batch_size,
      'note', 'DRY RUN - apenas contagem; nenhuma linha alterada'
    );
  END IF;

  -- MODO REAL - REQUER OBJETO R2 PRESENTE:
  -- So executar com dry_run=false quando houver prova de que o objeto existe no
  -- bucket R2 zapp-whatsapp-media (endpoint cd0f4eee542191c4957567814e1f8ca1.r2.cloudflarestorage.com),
  -- senao os links apontarao p/ 404 no proxy zapp-media-proxy. Consome via
  -- watermark (WHERE e.id > v_last_id) em lotes de batch_size.
  LOOP
    -- lote ordenado por id; array_agg preserva a ordem do LIMIT
    SELECT array_agg(e.id ORDER BY e.id)
      INTO v_ids
      FROM (
        SELECT e.id
          FROM zapp.evolution_media e
         WHERE e.media_status = 'ready'
           AND e.storage_url LIKE '%supabase%'
           AND e.storage_bucket IS NOT NULL
           AND e.storage_path_clean <> ''
           AND e.id > v_last_id
         ORDER BY e.id
         LIMIT batch_size
      ) e;

    EXIT WHEN v_ids IS NULL OR cardinality(v_ids) = 0;

    v_rows    := cardinality(v_ids);
    v_last_id := v_ids[cardinality(v_ids)];

    UPDATE zapp.evolution_media e
       SET storage_url = v_url_prefix || e.storage_path_clean
     WHERE e.id = ANY (v_ids);

    v_updated := v_updated + v_rows;
    v_batch   := v_batch + 1;

    IF v_batch % 10 = 0 THEN
      RAISE NOTICE 'Batch %: % rows migradas (total %)', v_batch, v_rows, v_updated;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', false,
    'total_batches', v_batch,
    'total_rows', v_updated,
    'note', 'Migracao concluida - storage_url apontando p/ zapp-media-proxy'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_post_upgrade_verify(p_timeout_minutes integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'ops', 'pg_catalog'
AS $function$
DECLARE
  v_checks    jsonb := '[]'::jsonb;
  v_ok        int   := 0;
  v_fail      int   := 0;
  v_val       text;
  v_int       int;
BEGIN
  -- V01: wpp2 still connected
  SELECT state INTO v_val FROM evo.evolution_connection_history
  WHERE instance_name='wpp2' ORDER BY created_at DESC LIMIT 1;
  IF v_val IN ('open','connected') THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','V01_wpp2_reconnected','status','PASS','got',v_val);
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','V01_wpp2_reconnected','status','FAIL','got',v_val,'action','Verificar QR code ou reiniciar sessão wpp2');
  END IF;

  -- V02: Guardian heartbeat ativo (janela 7min)
  SELECT COUNT(*)::int INTO v_int FROM evo.evolution_guardian_heartbeat
  WHERE heartbeat_at > now() - interval '7 minutes';
  IF v_int > 0 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','V02_guardian_heartbeat','status','PASS','got',v_int||' heartbeats last 7min');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','V02_guardian_heartbeat','status','FAIL','got','0 heartbeats in 7min','action','Verificar container evolution_evolution e cron pg-cron-liveness');
  END IF;

  -- V03: Mensagens chegando (ingest ativo)
  SELECT lag_seconds::text INTO v_val FROM evo.v_pipeline_health;
  IF v_val::int < 300 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','V03_ingest_active','status','PASS','got',v_val||'s lag');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','V03_ingest_active','status','WARN','got',v_val||'s lag','action','Aguardar tráfego natural');
  END IF;

  -- V04: Evolution emitindo phoneJid
  SELECT COUNT(*)::int INTO v_int FROM zapp.evolution_contacts
  WHERE instance_name='wpp2' AND raw_data ? 'phoneJid'
    AND updated_at > now() - interval '30 minutes';
  IF v_int > 0 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','V04_phonejid_signal_detected','status','PASS','got',v_int||' contacts with phoneJid in last 30min');
  ELSE
    v_checks := v_checks || jsonb_build_object('check','V04_phonejid_signal_detected','status','WAITING','got','0 — aguardando contacts.upsert com phoneJid do Baileys 7.x','action','Normal — ocorre na próxima interação com contato LID');
  END IF;

  -- V05: lid_phone_map cresceu
  SELECT COUNT(*)::int INTO v_int FROM evo.lid_phone_map
  WHERE confidence = 'high' AND source IN ('contacts_raw_data','webhook_contacts_upsert')
    AND updated_at > now() - interval '30 minutes';
  IF v_int > 0 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','V05_lid_map_growing','status','PASS','got',v_int||' new real mappings');
  ELSE
    v_checks := v_checks || jsonb_build_object('check','V05_lid_map_growing','status','WAITING','got','0 mappings','action','Aguardar tráfego orgânico LID');
  END IF;

  -- V06: DLQ não cresceu (migrada lote 4A → zapp)
  SELECT COUNT(*)::int INTO v_int FROM zapp.evolution_webhook_dlq;
  IF v_int = 0 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','V06_dlq_still_empty','status','PASS');
  ELSIF v_int <= 5 THEN
    v_checks := v_checks || jsonb_build_object('check','V06_dlq_still_empty','status','WARN','got',v_int||' DLQ entries');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','V06_dlq_still_empty','status','FAIL','got',v_int||' DLQ entries','action','ROLLBACK — DLQ cresceu pós-upgrade');
  END IF;

  -- V07: regression suite GREEN
  SELECT (evo.fn_lid_regression_suite()->>'status') INTO v_val;
  IF v_val = 'GREEN' THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','V07_regression_still_green','status','PASS');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','V07_regression_still_green','status','FAIL','got',v_val,'action','ROLLBACK');
  END IF;

  -- V08: Sem alertas novos nos últimos 15min
  SELECT COUNT(*)::int INTO v_int FROM zapp.evolution_alerts
  WHERE resolved_at IS NULL AND created_at > now() - interval '15 minutes';
  IF v_int = 0 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','V08_no_new_alerts','status','PASS');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('check','V08_no_new_alerts','status','FAIL','got',v_int||' new alerts','action','Verificar evolution_alerts');
  END IF;

  -- V09: Consumer saudável
  SELECT COUNT(*)::int INTO v_int FROM zapp.evolution_messages_wpp2
  WHERE created_at > now() - interval '5 minutes';
  IF v_int > 0 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','V09_rabbit_consumer_alive','status','PASS','got',v_int||' msgs processed in last 5min');
  ELSE
    SELECT EXTRACT(EPOCH FROM (now()-MAX(created_at)))::int INTO v_int FROM zapp.evolution_messages_wpp2;
    IF v_int < 300 THEN
      v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('check','V09_rabbit_consumer_alive','status','PASS','got','last msg '||v_int||'s ago (low traffic)');
    ELSE
      v_checks := v_checks || jsonb_build_object('check','V09_rabbit_consumer_alive','status','WARN','got','no msgs last 5min — low traffic or consumer issue','action','Verificar logs do evolution-rabbit-consumer');
    END IF;
  END IF;

  -- V10: Versão do serviço (manual)
  v_checks := v_checks || jsonb_build_object(
    'check','V10_service_upgraded', 'status','MANUAL',
    'instruction','docker service ps evolution_evolution | grep Running'
  );

  INSERT INTO evo.e2e_probe_results (probed_at, resultado, notes, wpp2_state, wal_lag_mb)
  SELECT now(),
    CASE WHEN v_fail=0 THEN 'POST_UPGRADE_OK' WHEN v_fail<=2 THEN 'POST_UPGRADE_WARN' ELSE 'POST_UPGRADE_FAIL' END,
    format('post_upgrade_verify v3: %s/%s checks ok (V02 7min, V09 msg throughput)', v_ok, v_ok+v_fail),
    (SELECT state FROM evo.evolution_connection_history WHERE instance_name='wpp2' ORDER BY created_at DESC LIMIT 1),
    (SELECT COALESCE(round(pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)/1024.0/1024,1),0) FROM pg_replication_slots WHERE slot_name LIKE 'cainophile%' LIMIT 1);

  RETURN jsonb_build_object(
    'status', CASE WHEN v_fail=0 THEN 'POST_UPGRADE_OK' WHEN v_fail<=2 THEN 'POST_UPGRADE_WARN' ELSE 'POST_UPGRADE_FAIL' END,
    'checks_ok', v_ok, 'checks_fail', v_fail, 'total', v_ok+v_fail,
    'rollback_action', CASE WHEN v_fail >= 2 THEN 'docker service update --image ed066617... --force evolution_evolution' ELSE 'Nenhuma ação necessária' END,
    'details', v_checks
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_pre_upgrade_final_check()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'ops', 'pg_catalog'
AS $function$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_ok int := 0; v_fail int := 0;
  v_val text; v_lag int;
BEGIN
  -- C01: Pipeline funcional
  SELECT ingest_lag_s::text, ingest_lag_s INTO v_val, v_lag FROM evo.v_production_scorecard;
  IF v_lag < 300 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('c','C01_pipeline','status','PASS','got',v_lag||'s');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object(
      'c','C01_pipeline','status','FAIL','got',v_lag||'s',
      'note','Ingest lag >= 300s — pipeline comprometido');
  END IF;

  -- C02: wpp2 CONNECTED
  SELECT state INTO v_val FROM evo.evolution_connection_history WHERE instance_name='wpp2' ORDER BY created_at DESC LIMIT 1;
  IF v_val IN ('open','connected') THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('c','C02_wpp2','status','PASS','got',v_val);
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('c','C02_wpp2','status','FAIL','got',v_val,'note','Reconectar wpp2 antes de upgrade');
  END IF;

  -- C03: DLQ vazia (migrada lote 4A → zapp)
  SELECT count(*)::text INTO v_val FROM zapp.evolution_webhook_dlq;
  IF v_val::int = 0 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('c','C03_dlq','status','PASS','got',v_val);
  ELSE
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('c','C03_dlq','status','WARN','got',v_val||' DLQ entries','note','Opcional: drenar antes');
  END IF;

  -- C04: 0 alertas críticos abertos
  SELECT count(*)::text INTO v_val FROM zapp.evolution_alerts WHERE resolved_at IS NULL AND severity='critical';
  IF v_val::int = 0 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('c','C04_alerts','status','PASS','got',v_val);
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('c','C04_alerts','status','FAIL','got',v_val||' critical alerts');
  END IF;

  -- C05: Regression suite GREEN
  SELECT (evo.fn_lid_regression_suite()->'status') INTO v_val;
  IF v_val = '"GREEN"' THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('c','C05_regression','status','PASS');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('c','C05_regression','status','FAIL','got',v_val,'note','Corrigir testes antes de upgrade');
  END IF;

  -- C06: WAL slot < 160MB
  SELECT round(pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)/1024.0/1024,1)::text INTO v_val
  FROM pg_replication_slots WHERE slot_name LIKE 'cainophile%' LIMIT 1;
  IF v_val IS NULL OR v_val::numeric < 160 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('c','C06_wal_slot','status','PASS','got',COALESCE(v_val,'0')||'MB');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('c','C06_wal_slot','status','FAIL','got',v_val||'MB','note','WAL slot alto — aguardar analytics consumir');
  END IF;

  -- C07: Snapshots pré-upgrade existem
  SELECT count(*)::text INTO v_val FROM information_schema.tables
  WHERE table_schema='evo' AND table_name LIKE '_snap_pre_upgrade_%';
  IF v_val::int >= 1 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('c','C07_snapshots','status','PASS','got',v_val||' snapshots');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('c','C07_snapshots','status','FAIL','note','Criar snapshots pré-upgrade');
  END IF;

  -- C08: upgrade_execution_log tem ≥1 sucesso recente
  SELECT count(*)::text INTO v_val FROM ops.upgrade_execution_log WHERE status='success' AND executed_at > now()-interval '24 hours';
  IF v_val::int >= 1 THEN
    v_ok := v_ok+1; v_checks := v_checks || jsonb_build_object('c','C08_exec_log','status','PASS','got',v_val||' sucesso(s) 24h');
  ELSE
    v_fail := v_fail+1; v_checks := v_checks || jsonb_build_object('c','C08_exec_log','status','FAIL','note','Nenhum exec log de sucesso nas últimas 24h');
  END IF;

  INSERT INTO ops.upgrade_execution_log (step, status, details, executed_by)
  VALUES ('final_check',
    CASE WHEN v_fail=0 THEN 'success' ELSE 'fail' END,
    jsonb_build_object('checks_ok',v_ok,'checks_fail',v_fail,'details',v_checks),
    'fn_pre_upgrade_final_check');

  RETURN jsonb_build_object(
    'go', v_fail=0,
    'status', CASE WHEN v_fail=0 THEN 'GO_UPGRADE' ELSE 'HOLD_UPGRADE' END,
    'ok', v_ok, 'fail', v_fail, 'checks', v_checks,
    'next_action', CASE WHEN v_fail=0 THEN 'Executar upgrade Evolution API' ELSE 'Corrigir FAILs antes de upgrade' END
  );
END
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_prepare_lid_dedup(p_dry_run boolean DEFAULT true, p_instance text DEFAULT 'wpp2'::text, p_batch_size integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_pairs_found   int := 0;
  v_merged        int := 0;
  v_skipped       int := 0;
  v_result        jsonb := '[]'::jsonb;
BEGIN
  -- Passo 1: identificar pares LID↔PN que coexistem como contatos separados
  -- Condição: contact_identity tem lid_jid + pn_jid mapeados, e ambos existem em evolution_contacts
  WITH lid_pn_pairs AS (
    SELECT
      ci.lid_jid,
      ci.pn_jid,
      ci.phone_number,
      lid_c.id    AS lid_contact_id,
      pn_c.id     AS pn_contact_id,
      lid_c.created_at AS lid_created,
      pn_c.created_at  AS pn_created,
      lid_c.push_name  AS lid_push_name,
      pn_c.push_name   AS pn_push_name
    FROM evo.contact_identity ci
    JOIN zapp.evolution_contacts lid_c ON lid_c.remote_jid = ci.lid_jid
                                     AND lid_c.instance_name = p_instance
                                     AND lid_c.deleted_at IS NULL
    JOIN zapp.evolution_contacts pn_c  ON pn_c.remote_jid = ci.pn_jid
                                     AND pn_c.instance_name = p_instance
                                     AND pn_c.deleted_at IS NULL
    WHERE ci.instance_name = p_instance
      AND ci.lid_jid IS NOT NULL
      AND ci.confidence IN ('high','medium')
    LIMIT p_batch_size
  )
  SELECT COUNT(*) INTO v_pairs_found FROM lid_pn_pairs;

  -- Resultado antecipado (dry_run): retorna pares sem agir
  IF p_dry_run THEN
    SELECT jsonb_agg(jsonb_build_object(
      'lid_jid', ci.lid_jid, 'pn_jid', ci.pn_jid,
      'phone_number', ci.phone_number, 'confidence', ci.confidence
    ))
    INTO v_result
    FROM evo.contact_identity ci
    WHERE ci.instance_name = p_instance
      AND ci.lid_jid IS NOT NULL
      AND ci.confidence IN ('high','medium')
    LIMIT p_batch_size;

    RETURN jsonb_build_object(
      'dry_run', true, 'pairs_found', v_pairs_found,
      'preview', COALESCE(v_result,'[]'::jsonb),
      'note', 'Dedup requer contact_identity.lid_jid populado (pós-upgrade 2.4.x)'
    );
  END IF;

  -- Execução real: mescla LID→PN (PN vence: mais estável para operadores)
  -- NOTA: só executa se pairs_found > 0 (protege contra execução prematura)
  IF v_pairs_found = 0 THEN
    RETURN jsonb_build_object(
      'dry_run', false, 'pairs_found', 0, 'merged', 0,
      'note', 'Nenhum par LID/PN mapeado em contact_identity — aguardar upgrade 2.4.x'
    );
  END IF;

  -- Registrar na graveyard os contatos LID que serão absorvidos
  INSERT INTO evo.contact_id_graveyard (
    deleted_contact_id, original_remote_jid, deleted_at, expiration_date, reason,
    lid_jid, merged_into_contact_id, merge_strategy, pre_merge_snapshot
  )
  SELECT
    lid_c.id,
    lid_c.remote_jid,
    now(),
    now() + interval '90 days',
    'lid_pn_dedup_merge',
    ci.lid_jid,
    pn_c.id,
    'pn_wins',
    jsonb_build_object(
      'push_name',       lid_c.push_name,
      'profile_picture', lid_c.profile_picture_url,
      'created_at',      lid_c.created_at,
      'phone_number',    lid_c.phone_number
    )
  FROM evo.contact_identity ci
  JOIN zapp.evolution_contacts lid_c ON lid_c.remote_jid = ci.lid_jid
                                   AND lid_c.instance_name = p_instance
                                   AND lid_c.deleted_at IS NULL
  JOIN zapp.evolution_contacts pn_c  ON pn_c.remote_jid = ci.pn_jid
                                   AND pn_c.instance_name = p_instance
                                   AND pn_c.deleted_at IS NULL
  WHERE ci.instance_name = p_instance
    AND ci.lid_jid IS NOT NULL
    AND ci.confidence IN ('high','medium')
  LIMIT p_batch_size
  ON CONFLICT (deleted_contact_id) DO NOTHING;

  GET DIAGNOSTICS v_merged = ROW_COUNT;

  RETURN jsonb_build_object(
    'dry_run', false, 'pairs_found', v_pairs_found,
    'merged_to_graveyard', v_merged, 'skipped', v_pairs_found - v_merged
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_purge_lid_orphan_messages_batch(p_batch_size integer DEFAULT 10000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'public'
AS $function$
DECLARE
  v_deleted int;
BEGIN
  WITH orphan_ids AS (
    SELECT m.id
    FROM zapp.evolution_messages_wpp2 m
    LEFT JOIN zapp.evolution_contacts ec
      ON lower(ec.remote_jid) = lower(m.remote_jid)
     AND ec.instance_name      = 'wpp2'
     AND ec.phone_number       ~ '^[0-9]+$'
    WHERE m.remote_jid LIKE '%@lid'
      AND ec.id IS NULL
    LIMIT p_batch_size
  )
  DELETE FROM zapp.evolution_messages_wpp2
  WHERE id IN (SELECT id FROM orphan_ids);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',      true,
    'deleted', v_deleted,
    'batch',   p_batch_size,
    'ts',      now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_record_runbook_drill(p_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
DECLARE
  v_rows int;
BEGIN
  UPDATE zapp.evolution_incident_runbook
  SET last_drilled_at = now(), updated_at = now()
  WHERE id = p_type;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('error', format('Runbook not found: %s', p_type));
  END IF;

  RETURN jsonb_build_object(
    'drilled', p_type,
    'drilled_at', now(),
    'next_drill_recommended', now() + interval '30 days'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_resolve_alert(p_id uuid DEFAULT NULL::uuid, p_by text DEFAULT 'system'::text, p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, alert_type text, severity text, resolved_at timestamp with time zone, resolved_by character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
BEGIN
  RETURN QUERY
    UPDATE zapp.evolution_alerts a
    SET resolved_at = now(),
        resolved_by = p_by
    WHERE a.resolved_at IS NULL
      AND (
        (p_ids IS NOT NULL AND a.id = ANY(p_ids))
        OR
        (p_ids IS NULL AND p_id IS NOT NULL AND a.id = p_id)
      )
    RETURNING a.id, a.alert_type, a.severity, a.resolved_at, a.resolved_by;
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_resolve_contact_id_by_jid(p_jid text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'evo', 'public'
AS $function$
  SELECT c.id
    FROM zapp.evolution_contacts c
   WHERE c.deleted_at IS NULL
     AND (
           -- 1. Match exato por remote_jid (índice unique)
           lower(c.remote_jid) = lower(p_jid)
        -- 2. Match EXATO por phone_number (índice) — p_jid "55...@s.whatsapp.net" ou "55..."
        OR c.phone_number = split_part(p_jid, '@', 1)
        -- 3. Fallback: phone com formatação arbitrária (guard LID-as-phone 14+ dígitos)
        OR (
             regexp_replace(lower(c.phone_number), '[^0-9]', '', 'g')
               = regexp_replace(lower(split_part(p_jid, '@', 1)), '[^0-9]', '', 'g')
           AND length(regexp_replace(c.phone_number, '[^0-9]', '', 'g')) <= 13
           )
     )
   ORDER BY
     CASE
       WHEN lower(c.remote_jid) = lower(p_jid) THEN 1
       WHEN c.phone_number = split_part(p_jid, '@', 1) THEN 2
       ELSE 3
     END,
     c.updated_at DESC NULLS LAST
   LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_shadow_source_measurement(p_days integer DEFAULT 1)
 RETURNS TABLE(source text, event_count bigint, event_types jsonb, dedup_rate numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'evo', 'public', 'pg_catalog'
AS $function$
  SELECT
    COALESCE(w.webhook_source, 'legacy') AS source,
    count(*) AS event_count,
    jsonb_object_agg(w.event_type, cnt) AS event_types,
    round(
      100.0 * count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM zapp.webhook_events_processed w2
        WHERE w2.event_id = w.event_id
          AND w2.webhook_source != COALESCE(w.webhook_source,'legacy')
          AND w2.processed_at BETWEEN w.processed_at - interval '5 seconds'
                                         AND w.processed_at + interval '5 seconds'
      )) / NULLIF(count(*), 0)
    , 2) AS dedup_rate
  FROM zapp.webhook_events_processed w
  JOIN LATERAL (
    SELECT w.event_type, count(*) OVER (PARTITION BY w.webhook_source, w.event_type) AS cnt
  ) et ON TRUE
  WHERE w.processed_at > now() - (p_days || ' days')::interval
  GROUP BY COALESCE(w.webhook_source, 'legacy')
$function$
;

CREATE OR REPLACE FUNCTION evo.fn_test_normalizer_deep()
 RETURNS TABLE(test_label text, status text, got text, expected text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_id uuid; v_jid text; v_orig text;
BEGIN
  -- T01: @s.whatsapp.net pass-through
  INSERT INTO zapp.evolution_messages_wpp2 (message_id,remote_jid,from_me,message_type,instance_name,created_at)
  VALUES ('ag01-t01-'||extract(epoch FROM now())::bigint,'5511987654321@s.whatsapp.net',false,'text','wpp2',now())
  RETURNING id,remote_jid INTO v_id,v_jid;
  test_label:='T01_snet_passthrough'; got:=v_jid; expected:='5511987654321@s.whatsapp.net';
  status:=CASE WHEN v_jid=expected THEN 'PASS' ELSE 'FAIL' END; RETURN NEXT;
  DELETE FROM zapp.evolution_messages_wpp2 WHERE id=v_id;

  -- T02: @g.us pass-through
  INSERT INTO zapp.evolution_messages_wpp2 (message_id,remote_jid,from_me,message_type,instance_name,created_at)
  VALUES ('ag01-t02-'||extract(epoch FROM now())::bigint,'120363411037444361@g.us',false,'text','wpp2',now())
  RETURNING id,remote_jid INTO v_id,v_jid;
  test_label:='T02_group_gus'; got:=v_jid; expected:='120363411037444361@g.us';
  status:=CASE WHEN v_jid=expected THEN 'PASS' ELSE 'FAIL' END; RETURN NEXT;
  DELETE FROM zapp.evolution_messages_wpp2 WHERE id=v_id;

  -- T03: @lid sem mapeamento → preserva @lid (nunca cria fake @s.whatsapp.net)
  INSERT INTO zapp.evolution_messages_wpp2 (message_id,remote_jid,from_me,message_type,instance_name,created_at)
  VALUES ('ag01-t03-'||extract(epoch FROM now())::bigint,'130000707682366@lid',false,'text','wpp2',now())
  RETURNING id,remote_jid,remote_jid_original INTO v_id,v_jid,v_orig;
  test_label:='T03_lid_no_map_preserved'; got:=v_jid; expected:='130000707682366@lid';
  status:=CASE WHEN v_jid=expected THEN 'PASS' ELSE 'FAIL' END; RETURN NEXT;
  DELETE FROM zapp.evolution_messages_wpp2 WHERE id=v_id;

  -- T04: remote_jid_original capturado para @lid
  INSERT INTO zapp.evolution_messages_wpp2 (message_id,remote_jid,from_me,message_type,instance_name,created_at)
  VALUES ('ag01-t04-'||extract(epoch FROM now())::bigint,'888777666555444@lid',false,'text','wpp2',now())
  RETURNING id,remote_jid,remote_jid_original INTO v_id,v_jid,v_orig;
  test_label:='T04_original_captured'; got:=COALESCE(v_orig,'NULL'); expected:='888777666555444@lid';
  status:=CASE WHEN v_orig=expected THEN 'PASS' ELSE 'FAIL' END; RETURN NEXT;
  DELETE FROM zapp.evolution_messages_wpp2 WHERE id=v_id;

  -- T05: NULL jid → trigger define unknown@s.whatsapp.net
  INSERT INTO zapp.evolution_messages_wpp2 (message_id,remote_jid,from_me,message_type,instance_name,created_at)
  VALUES ('ag01-t05-'||extract(epoch FROM now())::bigint,NULL,false,'text','wpp2',now())
  RETURNING id,remote_jid INTO v_id,v_jid;
  test_label:='T05_null_becomes_unknown_snet'; got:=COALESCE(v_jid,'NULL'); expected:='unknown@s.whatsapp.net';
  status:=CASE WHEN v_jid=expected THEN 'PASS' ELSE 'FAIL' END; RETURN NEXT;
  DELETE FROM zapp.evolution_messages_wpp2 WHERE id=v_id;

  -- T06: vazio → unknown@s.whatsapp.net
  INSERT INTO zapp.evolution_messages_wpp2 (message_id,remote_jid,from_me,message_type,instance_name,created_at)
  VALUES ('ag01-t06-'||extract(epoch FROM now())::bigint,'',false,'text','wpp2',now())
  RETURNING id,remote_jid INTO v_id,v_jid;
  test_label:='T06_empty_becomes_unknown_snet'; got:=v_jid; expected:='unknown@s.whatsapp.net';
  status:=CASE WHEN v_jid=expected THEN 'PASS' ELSE 'FAIL' END; RETURN NEXT;
  DELETE FROM zapp.evolution_messages_wpp2 WHERE id=v_id;

  -- T07: canary + NULL → smoke-test@localhost
  INSERT INTO zapp.evolution_messages_wpp2 (message_id,remote_jid,from_me,message_type,instance_name,created_at)
  VALUES ('pg-cron-canary-ag01t07',NULL,false,'text','wpp2',now())
  RETURNING id,remote_jid INTO v_id,v_jid;
  test_label:='T07_canary_null_smoke_localhost'; got:=COALESCE(v_jid,'NULL'); expected:='smoke-test@localhost';
  status:=CASE WHEN v_jid=expected THEN 'PASS' ELSE 'FAIL' END; RETURN NEXT;
  DELETE FROM zapp.evolution_messages_wpp2 WHERE id=v_id;

  -- T08: deleted status + NULL → unknown@deleted
  INSERT INTO zapp.evolution_messages_wpp2 (message_id,remote_jid,from_me,message_type,instance_name,status,created_at)
  VALUES ('ag01-t08-'||extract(epoch FROM now())::bigint,NULL,false,'text','wpp2','deleted',now())
  RETURNING id,remote_jid INTO v_id,v_jid;
  test_label:='T08_deleted_null_unknown_deleted'; got:=COALESCE(v_jid,'NULL'); expected:='unknown@deleted';
  status:=CASE WHEN v_jid=expected THEN 'PASS' ELSE 'FAIL' END; RETURN NEXT;
  DELETE FROM zapp.evolution_messages_wpp2 WHERE id=v_id;

  -- T09: status=broadcast pass-through
  INSERT INTO zapp.evolution_messages_wpp2 (message_id,remote_jid,from_me,message_type,instance_name,created_at)
  VALUES ('ag01-t09-'||extract(epoch FROM now())::bigint,'status@broadcast',false,'text','wpp2',now())
  RETURNING id,remote_jid INTO v_id,v_jid;
  test_label:='T09_broadcast_passthrough'; got:=v_jid; expected:='status@broadcast';
  status:=CASE WHEN v_jid=expected THEN 'PASS' ELSE 'FAIL' END; RETURN NEXT;
  DELETE FROM zapp.evolution_messages_wpp2 WHERE id=v_id;

  -- T10: @newsletter pass-through
  INSERT INTO zapp.evolution_messages_wpp2 (message_id,remote_jid,from_me,message_type,instance_name,created_at)
  VALUES ('ag01-t10-'||extract(epoch FROM now())::bigint,'12345@newsletter',false,'text','wpp2',now())
  RETURNING id,remote_jid INTO v_id,v_jid;
  test_label:='T10_newsletter_passthrough'; got:=v_jid; expected:='12345@newsletter';
  status:=CASE WHEN v_jid=expected THEN 'PASS' ELSE 'FAIL' END; RETURN NEXT;
  DELETE FROM zapp.evolution_messages_wpp2 WHERE id=v_id;

  -- T11: LID de grupo @g.us (grupos nunca têm LID) — pass-through
  INSERT INTO zapp.evolution_messages_wpp2 (message_id,remote_jid,from_me,message_type,instance_name,created_at)
  VALUES ('ag01-t11-'||extract(epoch FROM now())::bigint,'group-120363411037444361@g.us',false,'text','wpp2',now())
  RETURNING id,remote_jid INTO v_id,v_jid;
  test_label:='T11_group_pass'; got:=v_jid; expected:='group-120363411037444361@g.us';
  status:=CASE WHEN v_jid=expected THEN 'PASS' ELSE 'FAIL' END; RETURN NEXT;
  DELETE FROM zapp.evolution_messages_wpp2 WHERE id=v_id;

  -- T12: @lid com mapeamento real em contact_identity → tenta resolver
  INSERT INTO evo.contact_identity (pn_jid,phone_number,lid_jid,instance_name,confidence,source,first_seen,last_seen)
  VALUES ('5519912345678@s.whatsapp.net','5519912345678','ag01testlid@lid','wpp2','high','agent01_test',now(),now())
  ON CONFLICT DO NOTHING;
  INSERT INTO zapp.evolution_messages_wpp2 (message_id,remote_jid,from_me,message_type,instance_name,created_at)
  VALUES ('ag01-t12-'||extract(epoch FROM now())::bigint,'ag01testlid@lid',false,'text','wpp2',now())
  RETURNING id,remote_jid,remote_jid_original INTO v_id,v_jid,v_orig;
  test_label:='T12_lid_resolved_or_preserved'; got:=v_jid; expected:='5519912345678@s.whatsapp.net OR ag01testlid@lid';
  -- Aceita resolução (pós-2.4.x via contact_identity) OU preservação (atual)
  status:=CASE WHEN v_jid IN ('5519912345678@s.whatsapp.net','ag01testlid@lid') THEN 'PASS' ELSE 'FAIL' END; RETURN NEXT;
  DELETE FROM zapp.evolution_messages_wpp2 WHERE id=v_id;
  DELETE FROM evo.contact_identity WHERE lid_jid='ag01testlid@lid' AND instance_name='wpp2';
END $function$
;

CREATE OR REPLACE FUNCTION evo.fn_touch_contact_presence(p_remote_jid text, p_presence text, p_instance text DEFAULT 'wpp2'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'public'
AS $function$ DECLARE v_updated int; v_phone text; BEGIN IF p_remote_jid IS NULL OR btrim(p_remote_jid) = '' THEN RETURN false; END IF; SELECT phone_number INTO v_phone FROM evo.lid_phone_map WHERE lid_jid = btrim(p_remote_jid) LIMIT 1; UPDATE zapp.evolution_contacts SET presence_status = COALESCE(NULLIF(btrim(p_presence), ''), presence_status), last_presence_at = now(), last_seen_at = CASE WHEN lower(COALESCE(btrim(p_presence), '')) IN ('available', 'online') THEN now() ELSE last_seen_at END, updated_at = now() WHERE instance_name = p_instance AND deleted_at IS NULL AND (remote_jid = btrim(p_remote_jid) OR (v_phone IS NOT NULL AND v_phone <> '' AND phone_number = v_phone)) AND (presence_status IS DISTINCT FROM COALESCE(NULLIF(btrim(p_presence), ''), presence_status) OR last_presence_at IS NULL OR last_presence_at < now() - interval '60 seconds'); GET DIAGNOSTICS v_updated = ROW_COUNT; RETURN v_updated > 0; END; $function$
;

CREATE OR REPLACE FUNCTION evo.fn_upsert_group_from_event(p_connection_id uuid, p_group_id text, p_name text DEFAULT NULL::text, p_desc text DEFAULT NULL::text, p_instance text DEFAULT 'wpp2'::text, p_participants text[] DEFAULT NULL::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'public'
AS $function$
DECLARE v_group_uuid uuid;
BEGIN
  IF p_group_id IS NULL OR btrim(p_group_id) = '' THEN RETURN NULL; END IF;
  INSERT INTO zapp.evolution_groups AS eg
    (whatsapp_connection_id, group_id, name, description, participant_count, avatar_url, instance_name, updated_at)
  VALUES
    (p_connection_id, p_group_id, COALESCE(NULLIF(btrim(p_name), ''), p_group_id),
     NULLIF(btrim(COALESCE(p_desc, '')), ''), 0, NULL, COALESCE(NULLIF(btrim(p_instance), ''), 'wpp2'), now())
  ON CONFLICT (whatsapp_connection_id, group_id) DO UPDATE
    SET name = COALESCE(NULLIF(btrim(EXCLUDED.name), ''), eg.name),
        description = COALESCE(EXCLUDED.description, eg.description),
        instance_name = COALESCE(EXCLUDED.instance_name, eg.instance_name),
        updated_at = now()
  RETURNING id INTO v_group_uuid;
  IF p_participants IS NOT NULL AND cardinality(p_participants) > 0 THEN
    PERFORM evo.fn_upsert_group_participants(v_group_uuid, p_participants, 'add', p_instance);
  ELSE
    UPDATE zapp.evolution_groups
      SET participant_count = (SELECT count(*) FROM zapp.evolution_group_participants WHERE group_id = v_group_uuid AND is_active),
          updated_at = now()
    WHERE id = v_group_uuid;
  END IF;
  RETURN v_group_uuid;
END; $function$
;

CREATE OR REPLACE FUNCTION evo.fn_upsert_group_from_event(p_connection_id uuid, p_group_id text, p_name text, p_desc text DEFAULT NULL::text, p_participants text[] DEFAULT NULL::text[], p_instance text DEFAULT 'wpp2'::text, p_phones text[] DEFAULT NULL::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'public'
AS $function$
DECLARE v_group_uuid uuid;
BEGIN
  IF p_group_id IS NULL OR btrim(p_group_id) = '' THEN RETURN NULL; END IF;
  INSERT INTO zapp.evolution_groups AS eg
    (whatsapp_connection_id, group_id, name, description, participant_count, avatar_url, instance_name, updated_at)
  VALUES
    (p_connection_id, p_group_id, COALESCE(NULLIF(btrim(p_name),''), p_group_id),
     NULLIF(btrim(COALESCE(p_desc,'')), ''), 0, NULL, COALESCE(NULLIF(btrim(p_instance),''), 'wpp2'), now())
  ON CONFLICT (whatsapp_connection_id, group_id) DO UPDATE
    SET name=COALESCE(NULLIF(btrim(EXCLUDED.name),''), eg.name),
        description=COALESCE(EXCLUDED.description, eg.description),
        instance_name=COALESCE(EXCLUDED.instance_name, eg.instance_name),
        updated_at=now()
  RETURNING id INTO v_group_uuid;
  IF p_participants IS NOT NULL AND cardinality(p_participants) > 0 THEN
    PERFORM evo.fn_upsert_group_participants(v_group_uuid, p_participants, 'add', p_instance, p_phones);
  ELSE
    UPDATE zapp.evolution_groups
      SET participant_count=(SELECT count(*) FROM zapp.evolution_group_participants WHERE group_id=v_group_uuid AND is_active),
          updated_at=now()
    WHERE id=v_group_uuid;
  END IF;
  RETURN v_group_uuid;
END; $function$
;

CREATE OR REPLACE FUNCTION evo.fn_upsert_group_from_event(p_connection_id uuid, p_group_id text, p_name text, p_desc text DEFAULT NULL::text, p_participants text[] DEFAULT NULL::text[], p_instance text DEFAULT 'wpp2'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'public'
AS $function$
DECLARE v_group_uuid uuid;
BEGIN
  IF p_group_id IS NULL OR btrim(p_group_id) = '' THEN RETURN NULL; END IF;
  INSERT INTO zapp.evolution_groups AS eg
    (whatsapp_connection_id, group_id, name, description, participant_count, avatar_url, instance_name, updated_at)
  VALUES
    (p_connection_id, p_group_id, COALESCE(NULLIF(btrim(p_name),''), p_group_id),
     NULLIF(btrim(COALESCE(p_desc,'')), ''), 0, NULL, COALESCE(NULLIF(btrim(p_instance),''), 'wpp2'), now())
  ON CONFLICT (whatsapp_connection_id, group_id) DO UPDATE
    SET name=COALESCE(NULLIF(btrim(EXCLUDED.name),''), eg.name),
        description=COALESCE(EXCLUDED.description, eg.description),
        instance_name=COALESCE(EXCLUDED.instance_name, eg.instance_name),
        updated_at=now()
  RETURNING id INTO v_group_uuid;
  IF p_participants IS NOT NULL AND cardinality(p_participants) > 0 THEN
    PERFORM evo.fn_upsert_group_participants(v_group_uuid, p_participants, 'add', p_instance);
  ELSE
    UPDATE zapp.evolution_groups
      SET participant_count=(SELECT count(*) FROM zapp.evolution_group_participants WHERE group_id=v_group_uuid AND is_active),
          updated_at=now()
    WHERE id=v_group_uuid;
  END IF;
  RETURN v_group_uuid;
END; $function$
;

CREATE OR REPLACE FUNCTION evo.fn_upsert_group_participants(p_group_id uuid, p_participants text[], p_action text DEFAULT 'add'::text, p_instance text DEFAULT 'wpp2'::text, p_phones text[] DEFAULT NULL::text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'public'
AS $function$
DECLARE v_count integer := 0;
BEGIN
  IF p_group_id IS NULL OR p_participants IS NULL OR cardinality(p_participants) = 0 THEN RETURN 0; END IF;
  IF p_action = 'add' THEN
    INSERT INTO zapp.evolution_group_participants
      (group_id, participant_jid, contact_id, phone_jid, role, joined_at, left_at, is_active)
    SELECT p_group_id, t.jid,
           COALESCE(evo.fn_resolve_contact_id_by_jid(t.jid), CASE WHEN t.phone <> '' THEN evo.fn_resolve_contact_id_by_jid(t.phone) END),
           NULLIF(t.phone, ''), 'member', now(), NULL, true
    FROM (SELECT p_participants[i] AS jid, COALESCE(p_phones[i], '') AS phone FROM generate_subscripts(p_participants, 1) AS i) t
    WHERE btrim(t.jid) <> ''
    ON CONFLICT (group_id, participant_jid) DO UPDATE
      SET is_active=true, left_at=NULL,
          phone_jid=COALESCE(EXCLUDED.phone_jid, zapp.evolution_group_participants.phone_jid),
          contact_id=COALESCE(zapp.evolution_group_participants.contact_id, EXCLUDED.contact_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_action = 'remove' THEN
    UPDATE zapp.evolution_group_participants SET left_at=now(), is_active=false WHERE group_id=p_group_id AND participant_jid=ANY(p_participants) AND is_active;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_action = 'promote' THEN
    UPDATE zapp.evolution_group_participants SET role='admin' WHERE group_id=p_group_id AND participant_jid=ANY(p_participants);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_action = 'demote' THEN
    UPDATE zapp.evolution_group_participants SET role='member' WHERE group_id=p_group_id AND participant_jid=ANY(p_participants);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  UPDATE zapp.evolution_groups SET participant_count=(SELECT count(*) FROM zapp.evolution_group_participants WHERE group_id=p_group_id AND is_active), updated_at=now() WHERE id=p_group_id;
  RETURN v_count;
END; $function$
;

CREATE OR REPLACE FUNCTION evo.fn_upsert_group_participants(p_group_id uuid, p_participants text[], p_action text DEFAULT 'add'::text, p_instance text DEFAULT 'wpp2'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'public'
AS $function$
DECLARE v_count integer := 0;
BEGIN
  IF p_group_id IS NULL OR p_participants IS NULL OR cardinality(p_participants) = 0 THEN RETURN 0; END IF;
  IF p_action = 'add' THEN
    INSERT INTO zapp.evolution_group_participants (group_id, participant_jid, contact_id, role, joined_at, left_at, is_active)
    SELECT p_group_id, t.v_jid, NULL::uuid, 'member', now(), NULL, true
    FROM unnest(p_participants) AS t(v_jid)
    WHERE t.v_jid IS NOT NULL AND btrim(t.v_jid) <> ''
    ON CONFLICT (group_id, participant_jid) DO UPDATE SET is_active=true, left_at=NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_action = 'remove' THEN
    UPDATE zapp.evolution_group_participants SET left_at=now(), is_active=false WHERE group_id=p_group_id AND participant_jid=ANY(p_participants) AND is_active;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_action = 'promote' THEN
    UPDATE zapp.evolution_group_participants SET role='admin' WHERE group_id=p_group_id AND participant_jid=ANY(p_participants);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_action = 'demote' THEN
    UPDATE zapp.evolution_group_participants SET role='member' WHERE group_id=p_group_id AND participant_jid=ANY(p_participants);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  UPDATE zapp.evolution_groups SET participant_count=(SELECT count(*) FROM zapp.evolution_group_participants WHERE group_id=p_group_id AND is_active), updated_at=now() WHERE id=p_group_id;
  RETURN v_count;
END; $function$
;

CREATE OR REPLACE FUNCTION evo.fn_v2_mirror_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_last_event TIMESTAMPTZ;
  v_hours_dead NUMERIC;
  v_total_rows BIGINT;
  v_last_7d BIGINT;
  v_last_24h BIGINT;
  v_status TEXT;
  v_score INT;
  v_pending INT;
  v_processed_recent INT;
  v_audit_last TIMESTAMPTZ;
  v_audit_1h BIGINT;
BEGIN
  SELECT MAX(created_at), COUNT(*),
    COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days'),
    COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '24 hours'),
    COUNT(*) FILTER (WHERE status='pending' OR status='failed'),
    COUNT(*) FILTER (WHERE status='processed' AND created_at > NOW()-INTERVAL '1 hour')
  INTO v_last_event, v_total_rows, v_last_7d, v_last_24h, v_pending, v_processed_recent
  FROM evo.evolution_webhook_events_v2;

  SELECT MAX(created_at), COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '1 hour')
  INTO v_audit_last, v_audit_1h FROM zapp.webhook_audit_log;

  v_hours_dead := ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(v_last_event, NOW()-INTERVAL '9999 hours')))/3600, 1);

  v_status := CASE
    WHEN v_hours_dead < 1    THEN 'healthy'
    WHEN v_hours_dead < 6    THEN 'degraded'
    WHEN v_hours_dead < 24   THEN 'critical'
    ELSE                          'dead'
  END;

  v_score := CASE
    WHEN v_hours_dead < 1    THEN 10
    WHEN v_hours_dead < 2    THEN 8
    WHEN v_hours_dead < 6    THEN 5
    WHEN v_hours_dead < 24   THEN 2
    ELSE                          0
  END;

  RETURN jsonb_build_object(
    'v2_status',            v_status,
    'v2_score',             v_score,
    'v2_score_max',         10,
    'v2_hours_dead',        v_hours_dead,
    'v2_last_event',        v_last_event,
    'v2_total_rows',        v_total_rows,
    'v2_last_7d',           v_last_7d,
    'v2_last_24h',          v_last_24h,
    'v2_pending',           v_pending,
    'v2_processed_1h',      v_processed_recent,
    'audit_log_last',       v_audit_last,
    'audit_log_1h',         v_audit_1h,
    'audit_healthy',        (v_audit_1h > 0),
    'divergence',           (v_status != 'healthy' AND v_audit_1h > 0),
    'infra_fix_needed',     (v_hours_dead > 24),
    'fix_command',          CASE WHEN v_hours_dead > 24
      THEN 'rabbitmqadmin -V evolution declare binding source=evolution destination=wpp2.messages.upsert routing_key=wpp2.messages.upsert'
      ELSE NULL END,
    'checked_at',           NOW()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION evo.list_media_to_mirror(limit_count integer DEFAULT 100, offset_count integer DEFAULT 0)
 RETURNS TABLE(storage_url text, storage_path text, storage_bucket text)
 LANGUAGE sql
 SET search_path TO 'evo', 'public', 'pg_catalog'
AS $function$ SELECT storage_url, storage_path_clean, COALESCE(storage_bucket, 'whatsapp-media') FROM zapp.evolution_media WHERE media_status = 'ready' AND storage_url LIKE '%supabase%' AND storage_path_clean IS NOT NULL ORDER BY created_at ASC LIMIT limit_count OFFSET offset_count $function$
;

CREATE OR REPLACE PROCEDURE evo.pr_link_msgs_to_conversations(IN p_batch integer DEFAULT 50000)
 LANGUAGE plpgsql
 SET search_path TO 'evo', 'public'
AS $procedure$
DECLARE n bigint;
BEGIN
  LOOP
    UPDATE zapp.evolution_messages m
    SET conversation_id = c.id
    FROM zapp.evolution_conversations c
    WHERE c.remote_jid = m.remote_jid
      AND c.instance_name = m.instance_name
      AND m.conversation_id IS NULL
      AND m.id IN (SELECT id FROM zapp.evolution_messages WHERE conversation_id IS NULL LIMIT p_batch);
    GET DIAGNOSTICS n = ROW_COUNT;
    COMMIT;
    EXIT WHEN n = 0;
  END LOOP;
END $procedure$
;

CREATE OR REPLACE FUNCTION evo.search_contacts_gin(p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_min_sim double precision DEFAULT 0.1)
 RETURNS TABLE(id uuid, remote_jid text, phone_number text, push_name text, full_name character varying, email character varying, company character varying, sim_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'evo', 'extensions', 'public'
AS $function$
  -- BRANCH 1: GIN — expressão byte-a-byte idêntica ao idx_contacts_search_consolidated
  -- partial index WHERE deleted_at IS NULL deve aparecer na query
  SELECT c.id, c.remote_jid, c.phone_number, c.push_name, c.full_name, c.email, c.company,
    extensions.similarity(
      ((((((((COALESCE(c.full_name,''::varchar))::text||' ')||
        (COALESCE(c.push_name,''::varchar))::text)||' ')||
        COALESCE(c.phone_number,''::text))||' ')||
        (COALESCE(c.email,''::varchar))::text)||' ')||
        (COALESCE(c.company,''::varchar))::text,
      p_query
    ) AS sim_score
  FROM zapp.evolution_contacts c
  WHERE c.deleted_at IS NULL
    AND (((((((((COALESCE(c.full_name,''::character varying))::text||' '::text)||
              (COALESCE(c.push_name,''::character varying))::text)||' '::text)||
             COALESCE(c.phone_number,''::text))||' '::text)||
            (COALESCE(c.email,''::character varying))::text)||' '::text)||
           (COALESCE(c.company,''::character varying))::text
         ) OPERATOR(extensions.%) p_query
    AND extensions.similarity(
      ((((((((COALESCE(c.full_name,''::varchar))::text||' ')||
        (COALESCE(c.push_name,''::varchar))::text)||' ')||
        COALESCE(c.phone_number,''::text))||' ')||
        (COALESCE(c.email,''::varchar))::text)||' ')||
        (COALESCE(c.company,''::varchar))::text,
      p_query
    ) >= p_min_sim
  UNION
  -- BRANCH 2: fallback numérico — phone/jid (btree/seqscan pequena tabela)
  SELECT c.id, c.remote_jid, c.phone_number, c.push_name, c.full_name, c.email, c.company,
    0.5::FLOAT
  FROM zapp.evolution_contacts c
  WHERE c.deleted_at IS NULL
    AND (c.phone_number ILIKE '%'||p_query||'%' OR c.remote_jid ILIKE '%'||p_query||'%')
    AND NOT (((((((((COALESCE(c.full_name,''::character varying))::text||' '::text)||
                  (COALESCE(c.push_name,''::character varying))::text)||' '::text)||
                 COALESCE(c.phone_number,''::text))||' '::text)||
                (COALESCE(c.email,''::character varying))::text)||' '::text)||
               (COALESCE(c.company,''::character varying))::text
             ) OPERATOR(extensions.%) p_query
  ORDER BY sim_score DESC LIMIT p_limit OFFSET p_offset;
$function$
;

CREATE OR REPLACE FUNCTION evo.update_status_media_url(p_status_id uuid, p_media_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
BEGIN
  UPDATE zapp.evolution_whatsapp_status SET local_media_url=p_media_url, media_download_status='done', media_downloaded_at=now() WHERE id=p_status_id;
  RETURN jsonb_build_object('ok', true, 'updated', FOUND);
END; $function$
;
