-- ============================================================================
-- REPLAY CONVERGENTE — materializado retroativamente em 2026-08-16 a partir de
-- supabase_migrations.schema_migrations (version=20260815250013), sem arquivo
-- correspondente neste repo. Ver convencao completa em 20260815250008_*.sql.
--
-- Fonte: docs/decouple/E62_REPOINT_LOG.md. Corpos: pg_get_functiondef em
-- producao 2026-08-15 pos-Lote5.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Escritoras de I2 repontadas para evo.rpc_boundary_* (8)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION zapp.fn_upsert_lid_identity(p_lid_jid text, p_pn_jid text DEFAULT NULL::text, p_phone_number text DEFAULT NULL::text, p_confidence text DEFAULT 'medium'::text, p_source text DEFAULT 'usync'::text, p_raw jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo,zapp'
AS $function$
BEGIN
  PERFORM evo.rpc_boundary_upsert_lid_identity(p_lid_jid, p_pn_jid, p_phone_number, p_confidence, p_source, p_raw);
END $function$;

-- LACUNA: fn_mirror_to_webhook_events_v2 foi reescrita nesta migration para um
-- delegate de 1 linha ("corpo vira delegate 1-linha p/ rpc_boundary_mirror_event",
-- E62_REPOINT_LOG.md item 1) e dropada em 20260815250014 (achado: fn orfa, sem
-- trigger vinculado — mirror v1->v2, view v1 nao existe mais). Nem o corpo
-- delegate nem o corpo pre-repoint sobrevivem em pg_get_functiondef; nao
-- reproduzidos aqui para nao inventar. Ver LOTE4_FASE2_LOG.md, "Drops de
-- codigo morto".

CREATE OR REPLACE FUNCTION zapp.zapp_isonwa_pull(p_limit integer DEFAULT 20)
 RETURNS TABLE(remote_jid text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT r.remote_jid FROM evo.rpc_boundary_isonwa_pull(p_limit) r;
END $function$;

-- Parte evo via rpc_boundary_isonwa_mark; updates em zapp.evolution_contacts mantidos inline
CREATE OR REPLACE FUNCTION zapp.zapp_isonwa_mark(p_jids text[], p_ok_jids text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public'
AS $function$
DECLARE v_now timestamptz := now(); v_done int;
BEGIN
  v_done := evo.rpc_boundary_isonwa_mark(p_jids);
  IF p_ok_jids IS NOT NULL AND cardinality(p_ok_jids) > 0 THEN
    UPDATE zapp.evolution_contacts SET is_on_whatsapp = true, whatsapp_checked_at = v_now WHERE remote_jid = ANY (p_ok_jids) AND is_on_whatsapp IS NOT TRUE;
    UPDATE zapp.evolution_contacts SET whatsapp_checked_at = v_now WHERE remote_jid = ANY (p_jids) AND whatsapp_checked_at IS NULL;
  END IF;
  RETURN jsonb_build_object('done', v_done);
END $function$;

-- SELECT/DELETE em evolution_alert_cooldown -> cooldown_get/cooldown_clear
CREATE OR REPLACE FUNCTION zapp.fn_check_evolution_jid_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo'
AS $function$
DECLARE
  v_window_min int:=15; v_volume_min int:=50; v_alert_key text:='evo_jid_completeness';
  v_total int; v_sem_jid int; v_pct numeric; v_severity text;
  v_was_alerting boolean:=false; v_last_severity text;
  v_title text; v_message text; v_kpi_data jsonb; v_dispatch jsonb; v_status text;
  v_now timestamptz:=now();
BEGIN
  SELECT count(*), count(*) FILTER(WHERE remote_jid IS NULL OR remote_jid='')
    INTO v_total, v_sem_jid
    FROM zapp.evolution_messages
    WHERE created_at >= v_now - make_interval(mins=>v_window_min)
      AND message_id NOT LIKE 'smoke-%' AND message_id NOT LIKE 'TEST-%'
      AND message_id NOT LIKE 'hotfix-test-%' AND message_id NOT LIKE 'e2e-%';
  v_pct := CASE WHEN v_total=0 THEN 0 ELSE round(100.0*v_sem_jid/v_total,2) END;
  v_severity := CASE WHEN v_total<v_volume_min THEN 'info' WHEN v_pct>=20 THEN 'critical' WHEN v_pct>=5 THEN 'error' WHEN v_pct>=1 THEN 'warning' ELSE 'info' END;
  v_last_severity := evo.rpc_boundary_cooldown_get(v_alert_key);
  v_was_alerting := v_last_severity IS NOT NULL AND zapp.fn_severity_rank(v_last_severity)>=1;
  v_kpi_data := jsonb_build_object('window_min',v_window_min,'total_msgs',v_total,'msgs_sem_jid',v_sem_jid,'pct_sem_jid',v_pct,'volume_min',v_volume_min,'volume_ok',v_total>=v_volume_min,'checked_at',v_now,'previous_severity',v_last_severity,'source_table','zapp.evolution_messages');
  v_status := CASE WHEN v_total<v_volume_min THEN 'low_volume_skip' WHEN v_severity='info' AND v_was_alerting THEN 'recovered' WHEN v_severity='info' THEN 'healthy' ELSE 'alerting' END;
  IF v_status='low_volume_skip' THEN RETURN jsonb_build_object('action','skip','reason','low_volume','kpi',v_kpi_data); END IF;
  IF v_status='healthy' THEN RETURN jsonb_build_object('action','noop','reason','healthy','kpi',v_kpi_data); END IF;
  IF v_status='recovered' THEN
    v_title:='OK Pipeline JID recuperado';
    v_message:=format(E'JID completeness voltou ao normal.\n- Total msgs: %s\n- Sem JID: %s\n- Pct: %s%%',v_total,v_sem_jid,v_pct);
    PERFORM evo.rpc_boundary_cooldown_clear(v_alert_key);
    v_dispatch:=zapp.fn_send_bitrix_alert(p_alert_key:=v_alert_key||'_recovery',p_severity:='info',p_title:=v_title,p_message:=v_message,p_payload:=v_kpi_data,p_force_send:=true);
    RETURN jsonb_build_object('action','recovery_sent','kpi',v_kpi_data,'dispatch',v_dispatch);
  END IF;
  v_title:=format('Pipeline JID: %s',upper(v_severity));
  v_message:=format(E'Degradacao no JID.\n- Janela: %s min\n- Total msgs: %s\n- Sem JID: %s\n- Pct: %s%%',v_window_min,v_total,v_sem_jid,v_pct);
  v_dispatch:=zapp.fn_send_bitrix_alert(p_alert_key:=v_alert_key,p_severity:=v_severity,p_title:=v_title,p_message:=v_message,p_payload:=v_kpi_data);
  RETURN jsonb_build_object('action','alerted','kpi',v_kpi_data,'dispatch',v_dispatch);
END $function$;

-- Blocos 3+7 (tabelas evo) -> rpc_boundary_scrub_secret
CREATE OR REPLACE FUNCTION zapp.fn_purge_api_key_from_logs(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_redacted CONSTANT text := '[REDACTED-E3-04]';
  v_result   jsonb     := '{}';
  v_n        bigint;
BEGIN
  IF p_key IS NULL OR length(p_key) < 16 THEN
    RAISE EXCEPTION 'E3-04: p_key must be >= 16 characters to prevent accidental mass-redaction';
  END IF;

  UPDATE archive._audit_whatsapp_connections_2026_05_04
    SET api_key = v_redacted
    WHERE api_key = p_key;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_result := v_result || jsonb_build_object('archive._audit_connections.api_key', v_n); END IF;

  UPDATE cron.job_run_details
    SET command        = replace(command,        p_key, v_redacted),
        return_message = replace(return_message, p_key, v_redacted)
    WHERE command        LIKE '%' || p_key || '%'
       OR return_message LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_result := v_result || jsonb_build_object('cron.job_run_details', v_n); END IF;

  -- tabelas evo via contrato (rpc_boundary_scrub_secret): bootstrap_log + webhook_events_v2
  v_result := v_result || COALESCE((evo.rpc_boundary_scrub_secret(p_key))->'detail', '{}'::jsonb);

  UPDATE zapp.evolution_audit_log
    SET old_values = CASE WHEN old_values::text LIKE '%' || p_key || '%'
                          THEN replace(old_values::text, p_key, v_redacted)::jsonb
                          ELSE old_values END,
        new_values = CASE WHEN new_values::text LIKE '%' || p_key || '%'
                          THEN replace(new_values::text, p_key, v_redacted)::jsonb
                          ELSE new_values END,
        metadata   = CASE WHEN metadata::text LIKE '%' || p_key || '%'
                          THEN replace(metadata::text, p_key, v_redacted)::jsonb
                          ELSE metadata END
    WHERE old_values::text LIKE '%' || p_key || '%'
       OR new_values::text LIKE '%' || p_key || '%'
       OR metadata::text   LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_result := v_result || jsonb_build_object('zapp.evolution_audit_log', v_n); END IF;

  UPDATE zapp.evolution_health_logs
    SET error_message = replace(error_message, p_key, v_redacted),
        metadata = CASE WHEN metadata::text LIKE '%' || p_key || '%'
                        THEN replace(metadata::text, p_key, v_redacted)::jsonb
                        ELSE metadata END
    WHERE error_message LIKE '%' || p_key || '%'
       OR metadata::text LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_result := v_result || jsonb_build_object('zapp.evolution_health_logs', v_n); END IF;

  UPDATE zapp.evolution_webhook_dlq
    SET payload = CASE WHEN payload::text LIKE '%' || p_key || '%'
                       THEN replace(payload::text, p_key, v_redacted)::jsonb
                       ELSE payload END,
        raw_payload   = replace(raw_payload,   p_key, v_redacted),
        error_message = replace(error_message, p_key, v_redacted)
    WHERE payload::text   LIKE '%' || p_key || '%'
       OR raw_payload     LIKE '%' || p_key || '%'
       OR error_message   LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_result := v_result || jsonb_build_object('zapp.evolution_webhook_dlq', v_n); END IF;

  UPDATE ops.ddl_audit
    SET query = replace(query, p_key, v_redacted)
    WHERE query LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_result := v_result || jsonb_build_object('ops.ddl_audit', v_n); END IF;

  UPDATE zapp.webhook_audit_log
    SET request_body = CASE WHEN request_body::text LIKE '%' || p_key || '%'
                            THEN replace(request_body::text, p_key, v_redacted)::jsonb
                            ELSE request_body END,
        response_body = CASE WHEN response_body::text LIKE '%' || p_key || '%'
                             THEN replace(response_body::text, p_key, v_redacted)::jsonb
                             ELSE response_body END,
        error_message = replace(error_message, p_key, v_redacted)
    WHERE request_body::text  LIKE '%' || p_key || '%'
       OR response_body::text LIKE '%' || p_key || '%'
       OR error_message       LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_result := v_result || jsonb_build_object('zapp.webhook_audit_log', v_n); END IF;

  UPDATE zapp.provider_message_log
    SET request_body = CASE WHEN request_body::text LIKE '%' || p_key || '%'
                            THEN replace(request_body::text, p_key, v_redacted)::jsonb
                            ELSE request_body END,
        response_body = CASE WHEN response_body::text LIKE '%' || p_key || '%'
                             THEN replace(response_body::text, p_key, v_redacted)::jsonb
                             ELSE response_body END,
        payload = CASE WHEN payload::text LIKE '%' || p_key || '%'
                       THEN replace(payload::text, p_key, v_redacted)::jsonb
                       ELSE payload END,
        error_message = replace(error_message, p_key, v_redacted)
    WHERE request_body::text  LIKE '%' || p_key || '%'
       OR response_body::text LIKE '%' || p_key || '%'
       OR payload::text       LIKE '%' || p_key || '%'
       OR error_message       LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_result := v_result || jsonb_build_object('zapp.provider_message_log', v_n); END IF;

  UPDATE zapp.system_logs
    SET message  = replace(message, p_key, v_redacted),
        metadata = CASE WHEN metadata::text LIKE '%' || p_key || '%'
                        THEN replace(metadata::text, p_key, v_redacted)::jsonb
                        ELSE metadata END
    WHERE message        LIKE '%' || p_key || '%'
       OR metadata::text LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_result := v_result || jsonb_build_object('zapp.system_logs', v_n); END IF;

  RETURN jsonb_build_object(
    'purged_at',      now(),
    'key_prefix',     left(p_key, 4) || repeat('*', GREATEST(0, length(p_key) - 4)),
    'tables_hit',     (SELECT count(*)::int FROM jsonb_object_keys(v_result)),
    'detail',         v_result
  );
END $function$;

-- net.http_get + INSERT direto -> ops.fn_provider_call('GET','/instance/fetchInstances') + rpc_boundary_reconcile_enqueue
CREATE OR REPLACE FUNCTION zapp.fn_reconcile_dispatch()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
AS $function$
DECLARE v_req_id bigint;
BEGIN
  v_req_id := ops.fn_provider_call('GET', '/instance/fetchInstances', NULL, 8000);
  PERFORM evo.rpc_boundary_reconcile_enqueue(v_req_id);
  RETURN v_req_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[fn_reconcile_dispatch] erro: %', SQLERRM;
  RETURN NULL;
END $function$;

-- RPC nova: pendentes via rpc_boundary_reconcile_pending(50); STABLE, grant zapp_writer
CREATE OR REPLACE FUNCTION evo.rpc_boundary_reconcile_pending(p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint, request_id bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY SELECT j.id, j.request_id FROM evo.evolution_reconcile_jobs j
  WHERE j.applied_at IS NULL AND j.dispatched_at < now()-interval '2 seconds'
  ORDER BY j.dispatched_at LIMIT GREATEST(1, LEAST(COALESCE(p_limit,50), 200));
END $function$;

REVOKE ALL ON FUNCTION evo.rpc_boundary_reconcile_pending(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_reconcile_pending(integer) TO zapp_writer;

-- Loop de pendentes -> rpc_boundary_reconcile_pending(50); 4 UPDATEs -> rpc_boundary_reconcile_apply
CREATE OR REPLACE FUNCTION zapp.fn_reconcile_apply()
 RETURNS TABLE(request_id bigint, instance_name text, action text, old_status text, new_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp, evo, extensions, pg_catalog'
AS $function$
DECLARE
  v_job record; v_content text; v_body jsonb; v_http int; v_inst jsonb;
  v_db_status text; v_evo_raw text; v_evo_status text; v_phone text; v_owner text;
  v_evo_id text; v_action text; v_results jsonb := '[]'::jsonb;
  v_matched_name text;
  v_db_disconnected_at timestamptz;
  v_debounced boolean;
  v_best_status_per_phone JSONB := '{}'::jsonb;
  v_priority int; v_best_priority int;
BEGIN
  PERFORM set_config('app.reconcile_source','cron_reconcile', true);
  FOR v_job IN
    SELECT * FROM evo.rpc_boundary_reconcile_pending(50)
  LOOP
    SELECT r.status_code, r.content INTO v_http, v_content FROM net._http_response r WHERE r.id=v_job.request_id;
    IF v_http IS NULL THEN CONTINUE; END IF;
    IF v_http<>200 OR v_content IS NULL OR left(ltrim(v_content),1)<>'[' THEN
      PERFORM evo.rpc_boundary_reconcile_apply(v_job.id, v_http,
        jsonb_build_object('error','http_or_body_invalid','http',v_http,'body_sample',left(coalesce(v_content,'<null>'),120)));
      CONTINUE;
    END IF;
    BEGIN v_body:=v_content::jsonb;
    EXCEPTION WHEN others THEN
      PERFORM evo.rpc_boundary_reconcile_apply(v_job.id, v_http,
        jsonb_build_object('error','json_parse_failed','http',v_http,'body_sample',left(v_content,120)));
      CONTINUE;
    END;
    IF jsonb_typeof(v_body)<>'array' THEN
      PERFORM evo.rpc_boundary_reconcile_apply(v_job.id, v_http,
        jsonb_build_object('error','body_not_array','http',v_http));
      CONTINUE;
    END IF;

    v_best_status_per_phone := '{}'::jsonb;

    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_body) LOOP
      v_evo_raw   := v_inst->>'connectionStatus';
      v_owner     := v_inst->>'ownerJid';
      v_phone     := split_part(COALESCE(v_owner,''),'@',1);
      v_evo_status := CASE v_evo_raw WHEN 'open' THEN 'connected' WHEN 'connecting' THEN 'connecting' WHEN 'close' THEN 'disconnected' ELSE 'disconnected' END;
      v_priority   := CASE v_evo_status WHEN 'connected' THEN 4 WHEN 'connecting' THEN 3 WHEN 'disconnected' THEN 2 ELSE 1 END;

      IF v_phone IS NOT NULL AND v_phone!='' THEN
        v_best_priority := COALESCE((v_best_status_per_phone->>v_phone)::int, 0);
        IF v_priority > v_best_priority THEN
          v_best_status_per_phone := jsonb_set(v_best_status_per_phone, ARRAY[v_phone], to_jsonb(v_priority));
        END IF;
      END IF;
    END LOOP;

    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_body) LOOP
      v_evo_raw    := v_inst->>'connectionStatus';
      v_owner      := v_inst->>'ownerJid';
      v_evo_id     := v_inst->>'id';
      v_phone      := split_part(COALESCE(v_owner,''),'@',1);
      v_evo_status := CASE v_evo_raw WHEN 'open' THEN 'connected' WHEN 'connecting' THEN 'connecting' WHEN 'close' THEN 'disconnected' ELSE 'disconnected' END;
      v_priority   := CASE v_evo_status WHEN 'connected' THEN 4 WHEN 'connecting' THEN 3 WHEN 'disconnected' THEN 2 ELSE 1 END;

      SELECT wc.instance_name, wc.status, wc.disconnected_at INTO v_matched_name, v_db_status, v_db_disconnected_at
      FROM zapp.whatsapp_connections wc WHERE wc.instance_name=(v_inst->>'name');

      IF NOT FOUND AND v_phone IS NOT NULL AND v_phone!='' THEN
        SELECT wc.instance_name, wc.status, wc.disconnected_at INTO v_matched_name, v_db_status, v_db_disconnected_at
        FROM zapp.whatsapp_connections wc
        WHERE wc.phone_number=v_phone AND wc.is_active=true LIMIT 1;
      END IF;

      -- FIX 2026-07-05 (sessao 6): mesmo debounce de fn_apply_connection_update. Reduz a
      -- prioridade tambem (3, igual 'connecting' genuino) para que o guard de prioridade
      -- abaixo continue funcionando sem caso especial: um 'open' debounced perde
      -- corretamente para outra entrada do mesmo telefone que reportou 'connected' de
      -- verdade no mesmo lote.
      v_debounced := false;
      IF v_matched_name IS NOT NULL AND v_evo_status = 'connected'
         AND v_db_disconnected_at IS NOT NULL
         AND v_db_disconnected_at > now() - interval '10 minutes' THEN
        v_evo_status := 'connecting';
        v_priority := 3;
        v_debounced := true;
      END IF;

      IF v_matched_name IS NULL THEN
        v_action := 'skip_not_in_db';
      ELSE
        v_best_priority := COALESCE((v_best_status_per_phone->>v_phone)::int, 0);
        IF v_priority < v_best_priority THEN
          v_action := 'skip_lower_priority';
        ELSIF v_db_status IS DISTINCT FROM v_evo_status THEN
          UPDATE zapp.whatsapp_connections wc SET
            status=v_evo_status,
            instance_id=v_evo_id,
            phone_number=COALESCE(NULLIF(v_phone,''), wc.phone_number),
            owner_jid=COALESCE(v_owner, wc.owner_jid),
            health_status=CASE v_evo_status WHEN 'connected' THEN 'ok' WHEN 'connecting' THEN 'degraded' WHEN 'disconnected' THEN 'error' ELSE 'unknown' END,
            health_reason=CASE
                            WHEN v_debounced THEN format('reconcile: evo_state=%s debounced (disconnected_at=%s < 10min ago)', v_evo_raw, v_db_disconnected_at)
                            WHEN v_evo_status='connected' THEN NULL
                            ELSE format('reconcile: evo_state=%s (evo_name=%s)', v_evo_raw, v_inst->>'name') END,
            last_health_check=now(),
            last_connected_at=CASE WHEN v_evo_status='connected' THEN now() ELSE wc.last_connected_at END,
            updated_at=now()
          WHERE wc.instance_name=v_matched_name;
          v_action := CASE WHEN v_matched_name!=(v_inst->>'name') THEN 'updated_via_phone_match' ELSE 'updated' END;
        ELSE
          -- R14 (2026-07-11): self-heal de health no ramo no_change (mesma correcao de fn_apply_connection_update)
          UPDATE zapp.whatsapp_connections wc SET last_health_check=now(), instance_id=v_evo_id,
            health_status=CASE WHEN v_evo_status='connected' AND NOT v_debounced AND wc.health_status IS DISTINCT FROM 'ok' THEN 'ok' ELSE wc.health_status END,
            health_reason=CASE WHEN v_evo_status='connected' AND NOT v_debounced AND wc.health_status IS DISTINCT FROM 'ok' THEN NULL ELSE wc.health_reason END
          WHERE wc.instance_name=v_matched_name;
          v_action := 'no_change';
        END IF;
      END IF;

      v_results := v_results || jsonb_build_object('instance',COALESCE(v_matched_name,v_inst->>'name'),'evo_name',v_inst->>'name','action',v_action,'old',v_db_status,'new',v_evo_status,'debounced',v_debounced);
      request_id := v_job.request_id; instance_name := COALESCE(v_matched_name,v_inst->>'name'); action := v_action; old_status := v_db_status; new_status := v_evo_status;
      RETURN NEXT;
      v_matched_name := NULL; v_db_status := NULL; v_db_disconnected_at := NULL;
    END LOOP;

    PERFORM evo.rpc_boundary_reconcile_apply(v_job.id, v_http, v_results);
    v_results := '[]'::jsonb;
  END LOOP;
  RETURN;
END $function$;

-- ---------------------------------------------------------------------------
-- 2. Lote 3 de moves evo->zapp (5 fns; triggers seguem o oid, sem rebind)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION zapp.fn_touch_contact_last_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$ BEGIN UPDATE zapp.evolution_contacts SET last_message_at = NEW.created_at, total_messages = COALESCE(total_messages,0)+1 WHERE remote_jid = NEW.remote_jid AND deleted_at IS NULL; RETURN NEW; EXCEPTION WHEN OTHERS THEN RETURN NEW; END $function$;

DROP FUNCTION IF EXISTS evo.fn_touch_contact_last_message();

CREATE OR REPLACE FUNCTION zapp.fn_sync_status_from_messages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE v_cid uuid;
BEGIN
  IF NEW.remote_jid != 'status@broadcast' THEN RETURN NEW; END IF;
  SELECT id INTO v_cid FROM zapp.evolution_contacts WHERE push_name=NEW.push_name AND instance_name=NEW.instance_name LIMIT 1;
  INSERT INTO zapp.evolution_whatsapp_status(id,instance_name,participant_jid,participant_name,contact_id,message_id,message_type,content,media_url,media_mimetype,posted_at,created_at)
  VALUES(gen_random_uuid(),NEW.instance_name,'status@broadcast',NEW.push_name,v_cid,NEW.message_id,NEW.message_type,NEW.content,NEW.media_url,NEW.media_mimetype,NEW.created_at,now())
  ON CONFLICT(message_id) DO NOTHING;
  RETURN NEW;
END; $function$;

DROP FUNCTION IF EXISTS evo.fn_sync_status_from_messages();

-- 3 bindings (evolution_messages, evolution_messages_default, evolution_messages_wpp2)
CREATE OR REPLACE FUNCTION zapp.fn_filter_canary_messages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
BEGIN
  -- Padrão exato: "wd-canary " seguido de 1+ dígitos (epoch unix do watchdog-canary v1)
  IF NEW.content ~ '^wd-canary [0-9]+$' THEN
    -- Logar para auditoria usando colunas corretas de evolution_audit_log
    BEGIN
      INSERT INTO zapp.evolution_audit_log (
        action, entity_type, entity_id, new_values, metadata, performed_by, created_at
      ) VALUES (
        'canary_filtered',
        'evolution_messages_wpp2',
        gen_random_uuid(),  -- uuid sintético (message_id é text)
        jsonb_build_object(
          'message_id', NEW.message_id,
          'content', NEW.content,
          'from_me', NEW.from_me,
          'remote_jid', NEW.remote_jid
        ),
        jsonb_build_object('filtered_at', now(), 'push_name', NEW.push_name),
        'watchdog-canary',
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      -- Falha de log não deve bloquear o filter
      NULL;
    END;

    -- Bloquear INSERT silenciosamente (RETURN NULL = não insere)
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_filter_canary_messages();

-- Cron 146 repontado
CREATE OR REPLACE FUNCTION zapp.fn_flag_poison_messages()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_flagged    bigint := 0;
  v_total_dlq  bigint;
  v_result     jsonb;
BEGIN
  UPDATE zapp.evolution_webhook_dlq
  SET status = 'poison'
  WHERE status = 'pending'
    AND retry_count >= max_retries;

  GET DIAGNOSTICS v_flagged = ROW_COUNT;

  SELECT COUNT(*) INTO v_total_dlq FROM zapp.evolution_webhook_dlq;

  v_result := jsonb_build_object(
    'checked_at',      now(),
    'newly_flagged',   v_flagged,
    'total_dlq_rows',  v_total_dlq
  );

  IF v_flagged > 0 THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'dlq_poison_messages',
        'high',
        format('E8-03: %s poison message(s) flagged in evolution_webhook_dlq — consumer restart loop prevented', v_flagged),
        v_result,
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN v_result;
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_flag_poison_messages();

SELECT cron.alter_job(146, command => 'SELECT zapp.fn_flag_poison_messages()');

-- Cron 495 repontado
CREATE OR REPLACE FUNCTION zapp.fn_checar_inbound_zerado()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_upserts  bigint;
  v_janela   interval := '1 hour';
  v_cooldown interval := '6 hours';
  v_ja_alertou boolean := false;
  v_hora_local int;
  v_silencio   boolean := false;
BEGIN
  SELECT count(*) INTO v_upserts
  FROM zapp.webhook_events_processed
  WHERE event_type = 'messages.upsert'
    AND processed_at > now() - v_janela;

  -- Janela de silêncio comercial (19:00-07:59 BRT):
  -- Tráfego cai para < 30 msgs/h após 18h BRT (padrão histórico confirmado).
  -- Antes era 23:00-06:59; ampliado em 2026-08-13 após auditoria de falsos positivos.
  SELECT extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo')::int INTO v_hora_local;
  IF v_hora_local >= 19 OR v_hora_local < 8 THEN
    v_silencio := true;
  END IF;

  IF v_upserts = 0 AND NOT v_silencio THEN
    SELECT EXISTS (
      SELECT 1 FROM zapp.evolution_alerts
      WHERE alert_type = 'ingestion_zero_inbound'
        AND created_at > now() - v_cooldown
    ) INTO v_ja_alertou;

    IF NOT v_ja_alertou THEN
      INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
      VALUES (
        'ingestion_zero_inbound',
        'high',
        'Inbound zerado ha mais de 1h — pipeline pode estar parado',
        format(
          'Nenhum evento messages.upsert registrado em zapp.webhook_events_processed na ultima hora (janela %s). '
          'Horario comercial: verificar pipeline inbound: consumer, edge evolution-webhook, view public.evolution_messages.',
          v_janela::text
        ),
        jsonb_build_object(
          'upserts_ultima_hora', v_upserts,
          'janela', v_janela::text,
          'fonte', 'zapp.webhook_events_processed',
          'cooldown', v_cooldown::text,
          'silencio_comercial', v_silencio,
          'hora_brt', v_hora_local,
          'janela_silencio', '19:00-07:59 BRT',
          'detectado_em', now()
        )
      );
    END IF;
  ELSIF v_upserts > 0 THEN
    -- Tráfego voltou: auto-resolve alertas abertos deste tipo
    UPDATE zapp.evolution_alerts
    SET resolved_at = now(), resolved_by = 'fn_checar_inbound_zerado'
    WHERE alert_type = 'ingestion_zero_inbound'
      AND resolved_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'upserts_ultima_hora', v_upserts,
    'silencio_comercial', v_silencio,
    'hora_brt', v_hora_local,
    'alerta_emitido', (v_upserts = 0 AND NOT v_ja_alertou AND NOT v_silencio)
  );
END
$function$;

DROP FUNCTION IF EXISTS evo.fn_checar_inbound_zerado();

SELECT cron.alter_job(495, command => 'SELECT zapp.fn_checar_inbound_zerado()');

-- ---------------------------------------------------------------------------
-- 3. I8 = 0 — ops.fn_notify_critical_alerts v7 (canal WhatsApp via fn_provider_call)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ops.fn_notify_critical_alerts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops', 'zapp', 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_cfg        record;
  v_alert      record;
  v_resend_key text;
  v_resend_url text;
  v_ext_url    text;
  v_sent       int := 0;
  v_conn_ok    boolean := false;
BEGIN
  SELECT * INTO v_cfg FROM ops.notification_config WHERE id=1 AND enabled;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'reason','config_ausente_ou_desabilitada');
  END IF;

  SELECT decrypted_secret INTO v_resend_key FROM vault.decrypted_secrets WHERE name='resend_api_key';
  SELECT decrypted_secret INTO v_ext_url FROM vault.decrypted_secrets WHERE name='external_notification_url';
  v_resend_url := COALESCE(ops.fn_get_vault_secret('resend_api_url'), 'https://api.resend.com');

  -- Verificar se wpp2 esta conectado (guard de sessao)
  SELECT (wc.status='connected' AND wc.updated_at > now()-interval '10 minutes')
  INTO v_conn_ok
  FROM zapp.whatsapp_connections wc
  WHERE wc.instance_name = coalesce(v_cfg.instance,'wpp2')
  LIMIT 1;

  FOR v_alert IN
    SELECT * FROM ops.pending_critical_alerts
    WHERE notified_at IS NULL
    ORDER BY created_at
    LIMIT 5
  LOOP
    -- Canal WhatsApp (via porta unica ops.fn_provider_call — E85)
    IF coalesce(v_conn_ok, false) THEN
      PERFORM ops.fn_provider_call('POST', '/message/sendText/'||v_cfg.instance,
        jsonb_build_object(
          'number', v_cfg.target_jid,
          'text',   chr(128680)||' *ALERTA CRITICO ZAPP WEBB*'||chr(10)||chr(10)
                    ||'*'||coalesce(v_alert.title,v_alert.alert_type)||'*'||chr(10)
                    ||coalesce(v_alert.message,'')||chr(10)||chr(10)
                    ||chr(9200)||' '||to_char(v_alert.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI')
                    ||chr(10)||'#'||v_alert.alert_type),
        5000);
    END IF;

    -- Canal webhook externo
    IF v_ext_url IS NOT NULL AND v_ext_url <> '' THEN
      PERFORM net.http_post(
        url     := v_ext_url,
        headers := jsonb_build_object('Content-Type','application/json'),
        body    := jsonb_build_object(
          'severity',   'critical',
          'alert_type', v_alert.alert_type,
          'message',    coalesce(v_alert.message,''),
          'title',      coalesce(v_alert.title,v_alert.alert_type),
          'created_at', v_alert.created_at::text,
          'source',     'fn_notify_critical_alerts_v7'),
        params  := '{}',
        timeout_milliseconds := 5000
      );
    END IF;

    -- Canal email Resend
    IF v_resend_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_resend_url || '/emails',
        headers := jsonb_build_object('Authorization','Bearer '||v_resend_key,'Content-Type','application/json'),
        body    := jsonb_build_object(
          'from',    'AtomicaBR Alertas <alertas@promobrindes.com.br>',
          'to',      ARRAY['ti@promobrindes.com.br'],
          'subject', chr(128680)||' [CRITICO] '||coalesce(v_alert.title,v_alert.alert_type),
          'html',    '<div style="font-family:Arial,sans-serif">'
                     ||'<div style="background:#c0392b;padding:16px;border-radius:6px 6px 0 0">'
                     ||'<h2 style="color:#fff;margin:0">Alerta Critico ZAP WEBB</h2></div>'
                     ||'<div style="padding:20px;border:1px solid #ddd">'
                     ||'<p><b>Tipo:</b> '||coalesce(v_alert.alert_type,'?')||'</p>'
                     ||'<p><b>Titulo:</b> '||coalesce(v_alert.title,'?')||'</p>'
                     ||'<p><b>Mensagem:</b><br>'||replace(coalesce(v_alert.message,'?'),chr(10),'<br>')||'</p>'
                     ||'<hr><p style="color:#999;font-size:12px">'
                     ||to_char(v_alert.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI:SS')
                     ||' BRT — ops.fn_notify_critical_alerts v7</p></div></div>'),
        params  := '{}',
        timeout_milliseconds := 10000
      );
    END IF;

    -- Marcar como notificado na VIEW (propaga para zapp.evolution_alerts)
    UPDATE ops.pending_critical_alerts
    SET notified_at = now()
    WHERE id = v_alert.id;

    v_sent := v_sent + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',           true,
    'sent',         v_sent,
    'wpp_session',  v_conn_ok,
    'triple_channel', true,
    'version',      'v7-provider-call-20260815'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok',false,'error',SQLERRM,'version','v7');
END $function$;
