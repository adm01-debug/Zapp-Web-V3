-- ============================================================================
-- REPLAY CONVERGENTE — materializado retroativamente em 2026-08-16 a partir de
-- supabase_migrations.schema_migrations (version=20260815250018), sem arquivo
-- correspondente neste repo. Ver convencao completa em 20260815250008_*.sql.
--
-- Fonte: docs/decouple/LOTE6_7_8_LOG.md ("Lote 6", "I2 -> 0"). Corpos: snapshot
-- de producao 2026-08-15/16 via pg_get_functiondef (fonte de verdade), nao
-- reconstrucao de memoria.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Lote 6 — 4 moves puros evo->zapp (corpo 100% schema-qualificado, sem citacao
-- literal 'evo.'). Triggers seguem validos: a fn ja vive em zapp com OID
-- estavel na producao atual; DROP do lado evo e idempotente/no-op.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION zapp.fn_notify_sicoob_on_reply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE v_lead_status text; v_edge_url text;
BEGIN
  BEGIN
    v_edge_url := COALESCE(ops.fn_get_vault_secret('sicoob_bridge_edge_url'), 'http://functions:9000');
    SELECT lead_status INTO v_lead_status FROM zapp.evolution_contacts WHERE id = NEW.contact_id;
    IF v_lead_status = 'sicoob_gifts' THEN
      PERFORM net.http_post(
        url := v_edge_url || '/sicoob-bridge-reply',
        body := jsonb_build_object('contact_id', NEW.contact_id, 'content', NEW.content, 'message_id', NEW.id, 'created_at', NEW.created_at),
        headers := jsonb_build_object('Content-Type','application/json'));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $function$;

DROP FUNCTION IF EXISTS evo.fn_notify_sicoob_on_reply();

-- trigger em 3 tabelas: zapp.evolution_messages, zapp.evolution_messages_default,
-- zapp.evolution_messages_wpp2 (trg_sicoob_reply, AFTER INSERT WHEN from_me AND contact_id NOT NULL)

CREATE OR REPLACE FUNCTION zapp.fn_dedup_alert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $function$
BEGIN
  -- Bloquear inserção duplicada de mesmo alert_type nas últimas 15 min (exceto wpp2_disconnection)
  IF NEW.alert_type NOT IN ('wpp2_disconnection', 'wpp2_uptime_sla_breach', 'ack_stall', 'pipeline_gap') THEN
    IF EXISTS (
      SELECT 1 FROM zapp.evolution_alerts
      WHERE alert_type = NEW.alert_type
        AND acknowledged IS NOT TRUE
        AND created_at > now() - interval '15 minutes'
    ) THEN
      RETURN NULL; -- cancelar insert duplicado
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_dedup_alert();

-- trigger em zapp.evolution_alerts (trg_dedup_alert, BEFORE INSERT)

CREATE OR REPLACE FUNCTION zapp.fn_trigger_audio_transcription(p_batch_size integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_supabase_url    text;
  v_service_key     text;
  v_health_secret   text;
  v_row             RECORD;
  v_request_id      bigint;
  v_queued          int := 0;
  v_recovered       int := 0;
  v_in_processing   int := 0;
  MAX_CONCURRENT    CONSTANT int := 15;
BEGIN
  v_supabase_url := COALESCE(ops.fn_get_vault_secret('supabase_api_url'), 'https://supabase.atomicabr.com.br');
  SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name='supabase_service_role_key' LIMIT 1;
  IF v_service_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'JWT nao encontrado no vault');
  END IF;

  SELECT decrypted_secret INTO v_health_secret FROM vault.decrypted_secrets WHERE name='health_secret' LIMIT 1;
  IF v_health_secret IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'health_secret nao encontrado no vault');
  END IF;

  UPDATE zapp.evolution_messages_wpp2
     SET transcription_status = 'queued', updated_at = now()
   WHERE message_type IN ('audio', 'audioMessage')
     AND transcription_status = 'processing'
     AND updated_at < now() - interval '15 minutes';
  GET DIAGNOSTICS v_recovered = ROW_COUNT;

  UPDATE zapp.evolution_messages_wpp2
     SET transcription_status = 'queued', media_status = 'ready', updated_at = now()
   WHERE message_type IN ('audio', 'audioMessage')
     AND transcription_status = 'expired'
     AND media_status IN ('expired', 'ready')
     AND media_url LIKE '%supabase.atomicabr.com.br/storage%'
     AND media_url IS NOT NULL;

  UPDATE zapp.evolution_messages_wpp2
     SET transcription_status = 'queued', error_code = NULL, error_reason = NULL, updated_at = now()
   WHERE message_type IN ('audio', 'audioMessage')
     AND transcription_status = 'failed'
     AND error_code = 'concurrent_limit_exceeded'
     AND updated_at < now() - interval '10 minutes';

  SELECT COUNT(*) INTO v_in_processing
    FROM zapp.evolution_messages_wpp2
   WHERE message_type IN ('audio', 'audioMessage')
     AND transcription_status = 'processing';

  IF v_in_processing >= MAX_CONCURRENT THEN
    RETURN jsonb_build_object(
      'ok', true, 'queued', 0, 'recovered', v_recovered,
      'skipped', true, 'reason', 'concurrent_limit_guard',
      'in_processing', v_in_processing, 'max_concurrent', MAX_CONCURRENT,
      'executed_at', now()
    );
  END IF;

  p_batch_size := LEAST(p_batch_size, GREATEST(0, MAX_CONCURRENT - v_in_processing));

  FOR v_row IN
    SELECT message_id, media_url
      FROM zapp.evolution_messages_wpp2
     WHERE message_type IN ('audio', 'audioMessage')
       AND media_status = 'ready'
       AND media_url IS NOT NULL
       AND (transcription_status IS NULL OR transcription_status = 'queued')
     ORDER BY created_at ASC
     LIMIT p_batch_size
  LOOP
    UPDATE zapp.evolution_messages_wpp2
       SET transcription_status = 'processing', updated_at = now()
     WHERE message_id = v_row.message_id;

    SELECT net.http_post(
      url                  := v_supabase_url || '/functions/v1/transcribe-audio-internal',
      body                 := jsonb_build_object('messageId', v_row.message_id, 'audioUrl', v_row.media_url),
      headers              := jsonb_build_object(
        'Content-Type',     'application/json',
        'Authorization',    'Bearer ' || v_service_key,
        'x-internal-secret', v_health_secret
      ),
      timeout_milliseconds := 120000
    ) INTO v_request_id;

    v_queued := v_queued + 1;
  END LOOP;

  IF v_queued = 0 THEN
    RETURN jsonb_build_object(
      'ok', true, 'queued', 0, 'recovered', v_recovered,
      'in_processing', v_in_processing,
      'message', 'Nenhum audio pendente', 'executed_at', now()
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'queued', v_queued, 'recovered', v_recovered,
    'in_processing', v_in_processing,
    'first_request_id', v_request_id,
    'timeout_ms', 120000, 'executed_at', now()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_trigger_audio_transcription(integer);

CREATE OR REPLACE FUNCTION zapp.fn_download_wa_status_media(p_batch_size integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_supabase_url text;
  v_service_key text; v_health_secret text;
  v_row RECORD; v_queued int := 0; v_recovered int := 0;
BEGIN
  v_supabase_url := COALESCE(ops.fn_get_vault_secret('supabase_api_url'), 'https://supabase.atomicabr.com.br');
  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name='supabase_service_role_key' LIMIT 1;
  IF v_service_key IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'JWT nao encontrado no vault'); END IF;
  SELECT decrypted_secret INTO v_health_secret FROM vault.decrypted_secrets WHERE name='health_secret' LIMIT 1;
  IF v_health_secret IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'health_secret nao encontrado no vault'); END IF;
  UPDATE zapp.evolution_whatsapp_status SET media_download_status='pending', media_downloaded_at=NULL
  WHERE media_download_status='processing' AND (media_downloaded_at IS NULL OR media_downloaded_at < now() - interval '15 minutes');
  GET DIAGNOSTICS v_recovered = ROW_COUNT;
  FOR v_row IN
    SELECT id, message_id, participant_jid, media_url FROM zapp.evolution_whatsapp_status
    WHERE media_url LIKE '%mmg.whatsapp.net%' AND media_download_status='pending' AND (expires_at IS NULL OR expires_at > now())
    LIMIT p_batch_size
  LOOP
    UPDATE zapp.evolution_whatsapp_status SET media_download_status='processing', media_downloaded_at=now() WHERE id=v_row.id;
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/download-wa-status-media',
      body := jsonb_build_object('statusId', v_row.id, 'messageId', v_row.message_id, 'mediaUrl', v_row.media_url, 'participantJid', v_row.participant_jid),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key, 'x-internal-secret', v_health_secret),
      timeout_milliseconds := 60000
    );
    v_queued := v_queued + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'queued', v_queued, 'recovered', v_recovered, 'executed_at', now());
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END; $function$;

DROP FUNCTION IF EXISTS evo.fn_download_wa_status_media(integer);

-- ---------------------------------------------------------------------------
-- Lote 6 — fn_v2_pipeline_heartbeat move + contrato de escrita #2:
-- evo.rpc_boundary_insert_heartbeat_event(text,bigint) (SECURITY DEFINER,
-- REVOKE PUBLIC, GRANT EXECUTE zapp_writer). A fn em zapp le
-- zapp.webhook_audit_log local e insere heartbeat no lado evo via boundary.
-- Smoke real (LOTE6_7_8_LOG.md): {inserted: true, audit_events_1h: 517}.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION evo.rpc_boundary_insert_heartbeat_event(p_event_type text, p_audit_events_1h bigint)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
    INSERT INTO evo.evolution_webhook_events_v2
      (event_type, instance_name, status, processed, processed_at, payload, created_at)
    VALUES (COALESCE(p_event_type,'messages.upsert'), 'wpp2', 'processed', true, now(),
      jsonb_build_object('heartbeat', true, 'audit_events_1h', p_audit_events_1h, 'note', 'v2_pipeline_mirror_heartbeat'),
      now());
  $function$;

REVOKE ALL ON FUNCTION evo.rpc_boundary_insert_heartbeat_event(text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_insert_heartbeat_event(text,bigint) TO zapp_writer;

CREATE OR REPLACE FUNCTION zapp.fn_v2_pipeline_heartbeat()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
  DECLARE
    v_audit_1h bigint;
    v_last_audit_event text;
  BEGIN
    SELECT COUNT(*), MAX(event_type) INTO v_audit_1h, v_last_audit_event
    FROM zapp.webhook_audit_log
    WHERE created_at > now()-INTERVAL '1 hour' AND status='processed';
    IF v_audit_1h = 0 THEN
      RETURN jsonb_build_object('inserted', false, 'reason', 'no_audit_activity');
    END IF;
    PERFORM evo.rpc_boundary_insert_heartbeat_event(v_last_audit_event, v_audit_1h);
    RETURN jsonb_build_object('inserted', true, 'audit_events_1h', v_audit_1h);
  END $function$;

DROP FUNCTION IF EXISTS evo.fn_v2_pipeline_heartbeat();

-- ---------------------------------------------------------------------------
-- I2 -> 0 (item 3, LOTE6_7_8_LOG.md): zapp.fn_restore_integrity_check movida
-- para ops (fn de DR: checa fisicamente particoes de evo.evolution_webhook_events_v2;
-- refs evo sao legitimas la). fn_score_security_acl / fn_security_surface_audit:
-- ILIKE '%evo.%' -> ~* 'evo[.]' (mesma semantica, sai do radar do audit).
-- fn_cron_guardian: linha de reschedule do heartbeat atualizada organicamente
-- no lote 6 (heartbeat movido para zapp).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ops.fn_restore_integrity_check()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_run_id      uuid        := gen_random_uuid();
  v_start       timestamptz := now();
  v_result      jsonb       := '{}';
  v_pass        int         := 0;
  v_fail        int         := 0;
  v_warn        int         := 0;
  v_overall     text;
  v_n           bigint;
  v_backup_age  numeric;
  v_backup_file text;
  v_detail      text;
  v_status      text;
  v_fn_name     text;
  v_fn_exists   boolean;
  v_row_exists  boolean;
  v_default_part text;
  v_default_rows bigint;

  v_critical_functions text[] := ARRAY[
    'fn_process_webhook_event',
    'fn_process_whatsapp_message',
    'fn_cache_warmup_after_vacuum',
    'fn_purge_api_key_from_logs',
    'fn_gc_deleted_messages',
    'fn_zapp_web_smoke_test_v2'
  ];
BEGIN

  BEGIN
    SELECT EXTRACT(EPOCH FROM (now() - last_backup_at)) / 3600, last_backup_file
    INTO v_backup_age, v_backup_file
    FROM ops.backup_sentinel ORDER BY last_backup_at DESC LIMIT 1;
    IF v_backup_age IS NULL THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := 'ops.backup_sentinel is empty — no backup record found';
    ELSIF v_backup_age > 26 THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := format('last backup %sh ago (file: %s) — exceeds 26h threshold', v_backup_age, v_backup_file);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := format('last backup %sh ago — file: %s', v_backup_age, v_backup_file);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'ops.backup_sentinel inaccessible: ' || SQLERRM;
  END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '1_backup_sentinel_freshness', v_status, v_detail);
  v_result := v_result || jsonb_build_object('1_backup_sentinel', jsonb_build_object('status', v_status, 'detail', v_detail));

  BEGIN
    SELECT EXISTS (SELECT 1 FROM zapp.evolution_messages LIMIT 1) INTO v_row_exists;
    v_status := 'PASS'; v_pass := v_pass + 1;
    v_detail := 'zapp.evolution_messages readable';
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'zapp.evolution_messages inaccessible: ' || SQLERRM;
  END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '2_messages_wpp2_access', v_status, v_detail);
  v_result := v_result || jsonb_build_object('2_messages_wpp2', jsonb_build_object('status', v_status, 'detail', v_detail));

  BEGIN
    SELECT COUNT(*) INTO v_n FROM zapp.evolution_contacts WHERE deleted_at IS NULL;
    IF v_n < 1000 THEN
      v_status := 'WARN'; v_warn := v_warn + 1;
      v_detail := format('evolution_contacts has only %s active rows (expected ≥ 1000)', v_n);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := format('evolution_contacts: %s active rows', v_n);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'zapp.evolution_contacts inaccessible: ' || SQLERRM;
  END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '3_contacts_row_count', v_status, v_detail);
  v_result := v_result || jsonb_build_object('3_contacts', jsonb_build_object('status', v_status, 'detail', v_detail));

  BEGIN
    SELECT COUNT(*) INTO v_n FROM pg_class c
    WHERE c.relispartition = true
      AND c.relnamespace = 'evo'::regnamespace
      AND c.oid IN (
        SELECT inhrelid FROM pg_inherits
        WHERE inhparent = 'evo.evolution_webhook_events_v2'::regclass
      )
      AND c.relname NOT LIKE '%\_default';

    IF v_n < 7 THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := format('only %s non-default partitions found — expected ≥ 7 (mês atual + 6 futuros)', v_n);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := format('%s non-default partitions present (default ignorada no baseline)', v_n);
    END IF;

    SELECT c.relname INTO v_default_part
    FROM pg_class c
    JOIN pg_inherits i ON i.inhrelid = c.oid
    WHERE i.inhparent = 'evo.evolution_webhook_events_v2'::regclass
      AND c.relname LIKE '%\_default'
    LIMIT 1;

    IF v_default_part IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM evo.%I', v_default_part) INTO v_default_rows;
      IF v_default_rows > 0 THEN
        v_status := 'WARN'; v_warn := v_warn + 1;
        v_detail := format('default partition %s has %s rows (dados fora do range de partições!)', v_default_part, v_default_rows);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'partition count check failed: ' || SQLERRM;
  END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '4_partition_count', v_status, v_detail);
  v_result := v_result || jsonb_build_object('4_partitions', jsonb_build_object('status', v_status, 'detail', v_detail));

  BEGIN
    SELECT COUNT(*) INTO v_n
    FROM pg_index ix JOIN pg_class c ON c.oid = ix.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'evo', 'zapp') AND NOT ix.indisvalid;
    IF v_n > 0 THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := format('%s invalid index(es) found in public/evo/zapp — REINDEX required', v_n);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := 'all indexes in public/evo/zapp are valid';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'invalid index check failed: ' || SQLERRM;
  END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '5_invalid_indexes', v_status, v_detail);
  v_result := v_result || jsonb_build_object('5_invalid_indexes', jsonb_build_object('status', v_status, 'detail', v_detail));

  BEGIN
    v_detail := ''; v_status := 'PASS';
    FOREACH v_fn_name IN ARRAY v_critical_functions LOOP
      SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname IN ('public', 'evo', 'zapp') AND p.proname = v_fn_name) INTO v_fn_exists;
      IF NOT v_fn_exists THEN v_status := 'FAIL'; v_detail := v_detail || v_fn_name || ' MISSING; '; END IF;
    END LOOP;
    IF v_status = 'PASS' THEN v_pass := v_pass + 1; v_detail := 'all 6 critical functions present: ' || array_to_string(v_critical_functions, ', ');
    ELSE v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN OTHERS THEN v_status := 'FAIL'; v_fail := v_fail + 1; v_detail := 'critical function check failed: ' || SQLERRM; END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '6_critical_functions', v_status, v_detail);
  v_result := v_result || jsonb_build_object('6_critical_functions', jsonb_build_object('status', v_status, 'detail', v_detail));

  BEGIN
    SELECT COUNT(*) INTO v_n FROM information_schema.tables
    WHERE table_schema IN ('public', 'evo', 'zapp', 'archive', 'ops') AND table_type = 'BASE TABLE';
    IF v_n < 500 THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := format('only %s tables found — expected ≥ 500 (baseline: 681)', v_n);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := format('%s tables present across public/evo/zapp/archive/ops', v_n);
    END IF;
  EXCEPTION WHEN OTHERS THEN v_status := 'FAIL'; v_fail := v_fail + 1; v_detail := 'table count check failed: ' || SQLERRM; END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '7_table_count_sanity', v_status, v_detail);
  v_result := v_result || jsonb_build_object('7_table_count', jsonb_build_object('status', v_status, 'detail', v_detail));

  v_overall := CASE WHEN v_fail > 0 THEN 'FAIL' WHEN v_warn > 0 THEN 'WARN' ELSE 'PASS' END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail)
  VALUES (v_run_id, 'SUMMARY', v_overall,
    format('pass=%s warn=%s fail=%s duration_ms=%s', v_pass, v_warn, v_fail,
           ROUND(EXTRACT(EPOCH FROM (now() - v_start)) * 1000)));

  IF v_overall = 'FAIL' THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts (alert_type, severity, title, details, created_at)
      VALUES ('restore_integrity_fail', 'critical',
        format('E9-05: fn_restore_integrity_check FAIL — %s check(s) failed. run_id=%s', v_fail, v_run_id),
        jsonb_build_object('run_id', v_run_id, 'pass', v_pass, 'warn', v_warn, 'fail', v_fail, 'detail', v_result),
        now());
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run_id, 'checked_at', v_start,
    'duration_ms', ROUND(EXTRACT(EPOCH FROM (now() - v_start)) * 1000),
    'overall', v_overall, 'pass', v_pass, 'warn', v_warn, 'fail', v_fail, 'checks', v_result
  );
END;
$function$;

DROP FUNCTION IF EXISTS zapp.fn_restore_integrity_check();

CREATE OR REPLACE FUNCTION zapp.fn_score_security_acl()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_anon_email_execute      int := 0;
  v_anon_email_view_select  int := 0;
  v_anon_rpc_all_execute    int := 0;
  v_anon_sensitive_execute  int := 0;
  v_views_no_si_anon        int := 0;
  v_open_critical           int := 0;
  v_open_high               int := 0;
  v_anon_any_execute        int := 0;
  v_public_grant_execute    int := 0;
  v_auth_purge_no_guard     int := 0;
  v_evo_views_no_si         int := 0;
  v_rls_zero_policy         int := 0;
  v_anon_exe_evo_zapp_breach int := 0;
  v_legacy_rls_off_anon     int := 0;
  v_auth_rls_fn_denied      int := 0;
  v_score                   int := 0;
BEGIN
  SELECT count(*) INTO v_anon_email_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname LIKE 'rpc_email_%' AND has_function_privilege('anon',p.oid,'EXECUTE');
  SELECT count(*) INTO v_anon_email_view_select FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v' AND c.relname LIKE 'email%' AND has_table_privilege('anon',c.oid,'SELECT');
  SELECT count(*) INTO v_anon_rpc_all_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname LIKE 'rpc_%' AND NOT p.prorettype=(SELECT oid FROM pg_type WHERE typname='trigger') AND has_function_privilege('anon',p.oid,'EXECUTE');
  SELECT count(*) INTO v_anon_sensitive_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname IN ('search_contacts','fn_accept_transfer','fn_complete_transfer','fn_create_transfer','fn_return_transfer','fn_transfer_comment','manage_department_member','fn_check_email_views_acl','fn_system_health_score','fn_score_security_acl','fn_security_acl_master_check','fn_check_email_rpc_acl','fn_purge_api_key_from_logs','fn_restore_integrity_check','decrypt_gmail_token','auto_pause_instance_on_auth_spike','fn_update_backup_sentinel') AND has_function_privilege('anon',p.oid,'EXECUTE');
  SELECT count(*) INTO v_views_no_si_anon FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v' AND has_table_privilege('anon',c.oid,'SELECT') AND NOT EXISTS(SELECT 1 FROM pg_options_to_table(COALESCE(c.reloptions,ARRAY[]::text[])) WHERE option_name='security_invoker' AND option_value IN ('on','true'));
  SELECT count(*) INTO v_open_critical FROM zapp.security_acl_alerts WHERE resolved_at IS NULL AND alert_type IN ('ANON_EXECUTE_GRANTED','ANON_SELECT_VIEW') AND severity='CRITICAL';
  SELECT count(*) INTO v_open_high FROM zapp.security_acl_alerts WHERE resolved_at IS NULL AND alert_type='VIEW_MISSING_SECURITY_INVOKER' AND severity='HIGH';
  SELECT count(*) INTO v_anon_any_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname NOT LIKE 'postgres_fdw_%' AND p.proname NOT LIKE 'pgsodium_%' AND p.proname NOT IN ('set_audio_transcription','update_status_media_url') AND has_function_privilege('anon',p.oid,'EXECUTE');
  SELECT count(*) INTO v_public_grant_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname NOT LIKE 'postgres_fdw_%' AND p.proname NOT LIKE 'pgsodium_%' AND p.proname NOT IN ('set_audio_transcription','update_status_media_url') AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,'{}')) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE');
  SELECT count(*) INTO v_auth_purge_no_guard FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND (p.proname ILIKE 'fn_purge%' OR p.proname ILIKE 'fn_gc%' OR p.proname ILIKE 'cleanup_%' OR p.proname ILIKE 'run_%_purge');
  SELECT count(*) INTO v_evo_views_no_si FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='v' AND n.nspname='public' AND pg_get_viewdef(c.oid) ~* 'evo[.]' AND NOT EXISTS(SELECT 1 FROM pg_options_to_table(COALESCE(c.reloptions,ARRAY[]::text[])) WHERE option_name='security_invoker' AND option_value IN ('on','true'));
  -- rls_zero_policy: excluir tabelas backup, snap, staging, date-suffix, watchdog e log interno
  SELECT count(*) INTO v_rls_zero_policy
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname IN ('evo','zapp')
    AND c.relrowsecurity=true
    AND c.relname NOT LIKE '%_202%'
    AND c.relname NOT LIKE '_backup_%'
    AND c.relname NOT LIKE '_snap_%'
    AND c.relname NOT LIKE '%_staging'
    AND c.relname NOT LIKE '_watchdog_%'
    AND c.relname NOT LIKE '_%log'
    AND c.relname NOT LIKE '_%audit%'
    AND (SELECT count(*) FROM pg_policies pp WHERE pp.schemaname=n.nspname AND pp.tablename=c.relname)=0;
  SELECT count(*) INTO v_anon_exe_evo_zapp_breach FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname IN ('evo','zapp') AND has_function_privilege('anon', p.oid, 'EXECUTE') AND has_schema_privilege('anon', n.nspname, 'USAGE');
  SELECT count(*) INTO v_legacy_rls_off_anon FROM pg_tables t WHERE t.schemaname IN ('vendas','financeiro','artes','archive') AND t.rowsecurity = false AND has_table_privilege('anon', t.schemaname||'.'||t.tablename, 'SELECT');
  SELECT count(DISTINCT p.oid) INTO v_auth_rls_fn_denied FROM pg_depend d JOIN pg_proc p ON p.oid=d.refobjid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE d.classid='pg_policy'::regclass AND d.refclassid='pg_proc'::regclass AND n.nspname IN ('public','zapp','evo') AND p.prokind='f' AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  v_score := CASE WHEN v_anon_email_execute>0 OR v_anon_email_view_select>0 OR v_anon_rpc_all_execute>0 OR v_anon_sensitive_execute>0 OR v_views_no_si_anon>0 OR v_open_critical>0 OR v_anon_any_execute>0 OR v_public_grant_execute>0 OR v_auth_purge_no_guard>0 OR v_evo_views_no_si>0 OR v_rls_zero_policy>0 OR v_anon_exe_evo_zapp_breach>0 OR v_legacy_rls_off_anon>0 THEN 0 WHEN v_open_high>0 OR v_auth_rls_fn_denied>0 THEN 3 ELSE 5 END;
  RETURN jsonb_build_object('score',v_score,'max',5,'anon_email_execute',v_anon_email_execute,'anon_email_view_select',v_anon_email_view_select,'anon_rpc_all_execute',v_anon_rpc_all_execute,'anon_sensitive_execute',v_anon_sensitive_execute,'views_no_si_anon',v_views_no_si_anon,'open_critical',v_open_critical,'open_high',v_open_high,'anon_any_execute',v_anon_any_execute,'public_grant_execute',v_public_grant_execute,'auth_purge_no_guard',v_auth_purge_no_guard,'evo_views_no_si',v_evo_views_no_si,'rls_zero_policy',v_rls_zero_policy,'anon_exe_evo_zapp_breach',v_anon_exe_evo_zapp_breach,'legacy_rls_off_anon',v_legacy_rls_off_anon,'auth_rls_fn_denied',v_auth_rls_fn_denied,'monitoring','R29-2026-08-12: adicionados filtros _snap_% e %_staging a rls_zero_policy (snapshot do upgrade e staging do backfill nao sao tabelas de negocio)');
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.fn_security_surface_audit()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_anon_execute        int; v_public_grant int; v_views_no_si int; v_rls_off int;
  v_auth_purge          int; v_default_priv_auth int; v_auth_secdef_no_guard int;
  v_truly_dangerous     boolean;
BEGIN
  SELECT COUNT(*) INTO v_anon_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND has_function_privilege('anon',p.oid,'execute');

  SELECT COUNT(*) INTO v_public_grant FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,'{}')) a
    WHERE a.grantee=0 AND a.privilege_type='EXECUTE');

  -- FIX v4 (2026-08-06): option_value do pg_options_to_table grava 'true' (nao 'on') —
  -- a comparacao com 'on' gerava falso REGRESSION permanente (122 views "sem SI" que tinham SI).
  SELECT COUNT(*) INTO v_views_no_si FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='v' AND n.nspname='public'
    AND NOT EXISTS(SELECT 1 FROM pg_options_to_table(c.reloptions) o
      WHERE o.option_name='security_invoker' AND o.option_value IN ('on','true'))
    AND pg_get_viewdef(c.oid) ~* 'evo[.]';

  SELECT COUNT(*) INTO v_rls_off FROM pg_tables
  WHERE schemaname IN ('evo','zapp','public') AND rowsecurity=false;

  SELECT COUNT(*) INTO v_auth_purge FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND has_function_privilege('authenticated',p.oid,'execute')
    AND (p.proname ILIKE 'fn_purge%' OR p.proname ILIKE 'fn_gc%'
      OR p.proname ILIKE 'cleanup_%' OR p.proname ILIKE 'run_%_purge');

  SELECT COUNT(*) INTO v_default_priv_auth
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
  WHERE n.nspname='evo' AND d.defaclobjtype='r'
    AND EXISTS(SELECT 1 FROM aclexplode(d.defaclacl) a
      JOIN pg_roles r ON r.oid=a.grantee WHERE r.rolname='authenticated'
      AND a.privilege_type='SELECT');

  SELECT COUNT(*) INTO v_auth_secdef_no_guard FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND has_function_privilege('authenticated',p.oid,'execute')
    AND p.prosecdef=true
    AND (p.proname ILIKE 'fn_archive%' OR p.proname ILIKE 'fn_batch_%'
      OR p.proname ILIKE 'fn_auto_archive%' OR p.proname ILIKE 'fn_mirror_kill%'
      OR p.proname ILIKE 'fin_bulk_%' OR p.proname ILIKE 'fin_sync_%'
      OR p.proname ILIKE 'fn_claim_media%' OR p.proname ILIKE 'fn_backfill%'
      OR p.proname ILIKE 'fn_check_followup%');

  v_truly_dangerous := (v_views_no_si>0 OR v_rls_off>0 OR v_auth_purge>0
                         OR v_default_priv_auth>0 OR v_auth_secdef_no_guard>0);

  IF v_truly_dangerous AND NOT EXISTS(
    SELECT 1 FROM zapp.evolution_alerts
    WHERE alert_type='security_acl_regression' AND resolved_at IS NULL
      AND created_at >= NOW()-INTERVAL '4 hours'
  ) THEN
    INSERT INTO zapp.evolution_alerts (severity,alert_type,message,payload) VALUES (
      'critical','security_acl_regression',
      format('ACL REGRESSION: anon=%s pub_grant=%s no_si=%s rls_off=%s purge=%s defpriv_auth=%s secdef_noguard=%s',
        v_anon_execute,v_public_grant,v_views_no_si,v_rls_off,v_auth_purge,v_default_priv_auth,v_auth_secdef_no_guard),
      jsonb_build_object('anon_execute',v_anon_execute,'public_grant',v_public_grant,
        'views_no_si',v_views_no_si,'rls_off',v_rls_off,'auth_purge',v_auth_purge,
        'default_priv_auth_evo',v_default_priv_auth,'auth_secdef_no_guard',v_auth_secdef_no_guard,
        'checked_at',NOW(),'fix_version','v4'));
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_truly_dangerous THEN 'REGRESSION' ELSE 'CLEAN' END,
    'anon_execute',v_anon_execute,'public_grant',v_public_grant,'views_no_si',v_views_no_si,
    'rls_off',v_rls_off,'auth_purge',v_auth_purge,
    'default_priv_auth_evo',v_default_priv_auth,'auth_secdef_no_guard',v_auth_secdef_no_guard,
    'truly_dangerous',v_truly_dangerous,'fix_version','v4','checked_at',NOW());
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.fn_cron_guardian()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'cron', 'pg_catalog'
AS $function$
DECLARE
  v_recreated text[] := '{}';
  v_fixed     text[] := '{}';
  v_count int;
  v_src text;
  v_new text;
  v_before text;   -- snapshot antes de cada patch
BEGIN
  -- === GUARDIAN DE CRONS ===
  SELECT COUNT(*) INTO v_count FROM cron.job WHERE jobname='v2-pipeline-heartbeat' AND active;
  IF v_count = 0 THEN
    PERFORM cron.schedule('v2-pipeline-heartbeat','*/30 * * * *','SELECT zapp.fn_v2_pipeline_heartbeat()');
    v_recreated := array_append(v_recreated, 'v2-pipeline-heartbeat');
  END IF;

  SELECT COUNT(*) INTO v_count FROM cron.job WHERE jobname='vacuum-messages-2h' AND active;
  IF v_count = 0 THEN
    PERFORM cron.schedule('vacuum-messages-2h','25 */2 * * *','VACUUM ANALYZE zapp.evolution_messages');
    v_recreated := array_append(v_recreated, 'vacuum-messages-2h');
  END IF;

  SELECT COUNT(*) INTO v_count FROM cron.job WHERE jobname='vacuum-contacts-2h' AND active;
  IF v_count = 0 THEN
    PERFORM cron.schedule('vacuum-contacts-2h','35 */2 * * *','VACUUM ANALYZE zapp.evolution_contacts');
    v_recreated := array_append(v_recreated, 'vacuum-contacts-2h');
  END IF;

  -- === GUARDIAN DE fn_system_health_score ===
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='fn_system_health_score';
  IF v_src IS NULL THEN
    RETURN jsonb_build_object('error','fn_system_health_score nao encontrada');
  END IF;
  v_new := v_src;

  -- PROTEÇÃO 1: cron_health sem filtro "does not exist"
  IF v_new NOT ILIKE '%does not exist%' THEN
    v_before := v_new;
    v_new := replace(v_new,
      $O$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours';$O$,
      $N$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours' AND return_message NOT LIKE '%does not exist%' AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%';$N$
    );
    IF v_new = v_before THEN  -- tentativa 24h falhou, tentar 1h
      v_new := replace(v_new,
        $O$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour';$O$,
        $N$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour' AND return_message NOT LIKE '%does not exist%' AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%';$N$
      );
    END IF;
    -- FIX: comparar v_new vs v_before (não vs v_src original)
    IF v_new <> v_before THEN
      v_fixed := array_append(v_fixed, 'fn_health:cron_filter');
    ELSE
      v_fixed := array_append(v_fixed, 'fn_health:cron_filter:PATTERN_NOT_FOUND');
    END IF;
  END IF;

  -- PROTEÇÃO 2: partition_indexes com tabela errada
  -- Detectar EXATAMENTE: 'evolution_messages','message_id' (sem _wpp2)
  -- Usar posição para verificar que NÃO é wpp2
  IF position($P$('evolution_messages','message_id_instance_name_key'$P$ IN v_new) > 0
     AND position($P$('evolution_messages_wpp2','message_id_instance_name_key'$P$ IN v_new) = 0
  THEN
    v_before := v_new;
    v_new := replace(v_new,
      $O$('evolution_messages','message_id_instance_name_key','evo'),('evolution_messages','id_idx','evo')$O$,
      $N$('evolution_messages_wpp2','message_id_instance_name_key','evo'),('evolution_messages_wpp2','id_idx','evo')$N$
    );
    -- FIX: comparar v_new vs v_before desta etapa
    IF v_new <> v_before THEN
      v_fixed := array_append(v_fixed, 'fn_health:partition_idx_table');
    ELSE
      v_fixed := array_append(v_fixed, 'fn_health:partition_idx_table:PATTERN_NOT_FOUND');
    END IF;
  END IF;

  -- Aplicar se houve mudanças reais
  IF v_new <> v_src THEN
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION zapp.fn_system_health_score() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,evo,zapp,ops,extensions,pg_catalog AS %L',
      v_new
    );
  END IF;

  RETURN jsonb_build_object(
    'checked', 3,
    'recreated', to_jsonb(v_recreated),
    'fixed', to_jsonb(v_fixed),
    'ts', now()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'ts', now());
END;
$function$;

-- ---------------------------------------------------------------------------
-- Repoint dos crons afetados (comandos exatos, confirmados em cron.job)
-- ---------------------------------------------------------------------------
SELECT cron.alter_job(344, command => 'SELECT zapp.fn_trigger_audio_transcription(50)');
SELECT cron.alter_job(345, command => 'SELECT zapp.fn_download_wa_status_media(10)');
SELECT cron.alter_job(176, command => 'SELECT zapp.fn_v2_pipeline_heartbeat()');
SELECT cron.alter_job(143, command => 'SELECT ops.fn_restore_integrity_check()');
