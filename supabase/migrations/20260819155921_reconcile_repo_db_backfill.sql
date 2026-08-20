-- ============================================================
-- 20260819155921_reconcile_repo_db_backfill.sql
-- Reconciliacao repo x DB (plano MIGRATIONS_CLEANUP 100 etapas, Fase 4)
-- Objetos ORFAOS aplicados no DB e sem arquivo no repo, extraidos do
-- snapshot do rebuild (scripts/decouple/snapshots/zapp_schema_snapshot.sql).
-- Regra 5 AGENTS.md: corpo = o que JA roda no DB (nunca reintroduzir bug).
-- Idempotente (CREATE OR REPLACE / IF NOT EXISTS); no-op no DB vivo.
-- Registrada no schema_migrations como aplicada (BACKFILL-RECORD).
-- Gerado por Hermes em 20260819165500.
-- ============================================================

CREATE OR REPLACE FUNCTION zapp.fn_download_wa_status_media(p_batch_size integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp', 'public', 'pg_catalog'
    AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION zapp.fn_auto_resolve_baileys_alerts() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp', 'evo', 'monitoring'
    AS $$
DECLARE v integer;
BEGIN
  -- FIX 2026-07-05 (sessao 6): esta funcao acknowledgeava alertas 'baileys' apos 6h
  -- independente da severidade, diferente da politica da funcao irma
  -- fn_auto_resolve_alerts (que exclui severity='critical'). Um alerta critico de
  -- conexao (ex.: tipo contem 'baileys_disconnected') podia ser silenciado sem
  -- confirmacao — mesma classe de risco do S6-4 (alertas criticos fechados sem
  -- verificar o estado real). Agora tambem exclui 'critical'.
  UPDATE evolution_alerts SET acknowledged=true, acknowledged_at=now()
  WHERE acknowledged=false AND alert_type ILIKE '%baileys%' AND created_at < now()-interval '6 hours'
    AND severity NOT IN ('critical');
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION zapp.fn_purge_api_key_from_logs(p_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp', 'evo', 'public'
    AS $$
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
END $$;

CREATE OR REPLACE FUNCTION zapp.rpc_get_contact(p_contact_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'zapp'
    AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM zapp.fn_require_app_user();
  SELECT jsonb_build_object(
    'contact', to_jsonb(c.*),
    'deals', COALESCE((SELECT jsonb_agg(to_jsonb(d.*)) FROM zapp.evolution_deals d WHERE d.contact_id=c.id), '[]'),
    'recent_messages', COALESCE((SELECT jsonb_agg(to_jsonb(m.*)) FROM (SELECT * FROM zapp.evolution_messages WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 20) m), '[]'),
    'tasks', COALESCE((SELECT jsonb_agg(to_jsonb(t.*)) FROM zapp.evolution_tasks t WHERE t.contact_id=c.id AND t.status IN ('pending','in_progress')), '[]')
  ) INTO v_result FROM zapp.evolution_contacts c WHERE c.id=p_contact_id;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION zapp.fn_collect_restore_logs(p_container_name text DEFAULT 'restore-validate-validator-1'::text, p_endpoint_id integer DEFAULT 1) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp', 'monitoring'
    AS $$
DECLARE
  v_api_key text;
  v_portainer_url text;
  v_containers_req_id bigint;
  v_containers_response jsonb;
  v_container_id text;
  v_logs_req_id bigint;
  v_logs_response text;
  v_ingest jsonb;
BEGIN
  v_portainer_url := COALESCE(ops.fn_get_vault_secret('portainer_api_url'), 'https://portainer.atomicabr.com.br');

  SELECT decrypted_secret INTO v_api_key
  FROM vault.decrypted_secrets
  WHERE name = 'portainer_api_key' LIMIT 1;

  IF v_api_key IS NULL THEN
    RETURN jsonb_build_object('status','standby','reason','portainer_api_key_not_in_vault');
  END IF;

  SELECT net.http_get(
    url := v_portainer_url || '/api/endpoints/' || p_endpoint_id || '/docker/containers/json?all=true&filters=' ||
           replace(replace(jsonb_build_object('name', jsonb_build_array(p_container_name))::text, '"', '%22'), ' ', ''),
    headers := jsonb_build_object('X-API-Key', v_api_key),
    timeout_milliseconds := 10000
  ) INTO v_containers_req_id;

  FOR i IN 1..16 LOOP
    PERFORM pg_sleep(0.5);
    SELECT (content::jsonb) INTO v_containers_response
    FROM net._http_response
    WHERE id = v_containers_req_id AND status_code IS NOT NULL LIMIT 1;
    EXIT WHEN v_containers_response IS NOT NULL;
  END LOOP;

  IF v_containers_response IS NULL OR jsonb_array_length(v_containers_response) = 0 THEN
    RETURN jsonb_build_object('status','no_container_found','container_name', p_container_name);
  END IF;

  v_container_id := v_containers_response->0->>'Id';

  SELECT net.http_get(
    url := v_portainer_url || '/api/endpoints/' || p_endpoint_id || '/docker/containers/' || v_container_id ||
           '/logs?stdout=true&stderr=true&tail=500',
    headers := jsonb_build_object('X-API-Key', v_api_key),
    timeout_milliseconds := 15000
  ) INTO v_logs_req_id;

  FOR i IN 1..30 LOOP
    PERFORM pg_sleep(0.5);
    SELECT content INTO v_logs_response
    FROM net._http_response
    WHERE id = v_logs_req_id AND status_code IS NOT NULL LIMIT 1;
    EXIT WHEN v_logs_response IS NOT NULL;
  END LOOP;

  IF v_logs_response IS NULL THEN
    RETURN jsonb_build_object('status','timeout_reading_logs');
  END IF;

  v_logs_response := regexp_replace(v_logs_response, E'[\\x00-\\x08\\x0B-\\x1F]', '', 'g');
  v_ingest := zapp.fn_ingest_restore_logs_from_text(v_logs_response);

  RETURN jsonb_build_object('status','ok','container_id', v_container_id,'logs_bytes', length(v_logs_response),'ingest', v_ingest);
END;
$$;

CREATE OR REPLACE FUNCTION zapp.fn_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp', 'pg_catalog'
    AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;




CREATE OR REPLACE FUNCTION zapp.fn_severity_rank(p_severity text) RETURNS smallint
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'zapp', 'public', 'pg_catalog'
    AS $$ SELECT CASE lower(coalesce(p_severity, '')) WHEN 'info' THEN 0::smallint WHEN 'low' THEN 0::smallint WHEN 'warning' THEN 1::smallint WHEN 'warn' THEN 1::smallint WHEN 'medium' THEN 1::smallint WHEN 'error' THEN 2::smallint WHEN 'high' THEN 2::smallint WHEN 'critical' THEN 3::smallint WHEN 'crit' THEN 3::smallint ELSE 1::smallint END $$;

CREATE OR REPLACE FUNCTION zapp.is_instance_paused(p_instance text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'zapp', 'monitoring'
    AS $$ SELECT EXISTS ( SELECT 1 FROM zapp.instance_processing_pauses WHERE instance_name = p_instance AND paused_until > now() ); $$;




CREATE OR REPLACE FUNCTION zapp.is_ip_blocked(check_ip text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'zapp', 'monitoring'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM zapp.blocked_ips
    WHERE ip_address = check_ip
    AND (expires_at IS NULL OR expires_at > now())
  )
$$;




CREATE OR REPLACE FUNCTION zapp.is_ip_whitelisted(check_ip text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'zapp', 'monitoring'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM zapp.ip_whitelist
    WHERE ip_address = check_ip
  )
$$;




CREATE OR REPLACE FUNCTION zapp.is_manager_or_above(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'zapp', 'monitoring'
    AS $$ SELECT EXISTS ( SELECT 1 FROM zapp.user_roles WHERE user_id = _user_id AND role IN ('dev', 'admin', 'manager') ); $$;

CREATE OR REPLACE FUNCTION zapp.messages_update_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp'
    AS $$
DECLARE
  v_status     text;
  v_deleted_at timestamptz;
BEGIN
  -- messages_update_trigger v3 — INFRA-01 (+ FIX #6-DB-A + GAP-1 + BUG-1 + GAP-2)

  -- PASSO 1: Normalização de status
  v_status := CASE
    WHEN NEW.status IS NOT DISTINCT FROM OLD.status                                        THEN OLD.status
    WHEN NEW.status IN ('sending', 'retrying', 'queued', 'processing', 'scheduled')        THEN 'pending'
    WHEN NEW.status IN ('failed_auth', 'failed_retries', 'error')                          THEN 'failed'
    WHEN NEW.status IS NULL OR NEW.status = ''                                             THEN OLD.status
    WHEN NEW.status NOT IN ('received','sent','delivered','read','deleted','pending','played','failed')
                                                                                            THEN 'pending'
    ELSE NEW.status
  END;

  -- PASSO 2: Progression guard
  IF v_status IS DISTINCT FROM OLD.status THEN
    IF    OLD.status = 'deleted' THEN
      v_status := OLD.status;
    ELSIF OLD.status = 'read'      AND v_status NOT IN ('deleted','failed') THEN
      v_status := OLD.status;
    ELSIF OLD.status = 'played'    AND v_status IN ('received','pending','sent','delivered') THEN
      v_status := OLD.status;
    ELSIF OLD.status = 'delivered' AND v_status IN ('received','pending','sent') THEN
      v_status := OLD.status;
    ELSIF OLD.status = 'sent'      AND v_status IN ('received','pending') THEN
      v_status := OLD.status;
    END IF;
  END IF;

  -- PASSO 3: deleted_at automático
  v_deleted_at := CASE
    WHEN v_status = 'deleted' AND (OLD.status IS NULL OR OLD.status <> 'deleted') THEN now()
    ELSE NULL
  END;

  -- PASSO 4: Persistência com partition pruning via instance_name
  UPDATE zapp.evolution_messages SET
    is_read    = COALESCE(NEW.is_read, OLD.is_read),
    status     = v_status,
    status_at  = CASE
                   WHEN v_status IS DISTINCT FROM OLD.status THEN COALESCE(NEW.status_updated_at::timestamptz, now())
                   ELSE status_at
                 END,
    content    = CASE WHEN NEW.content IS DISTINCT FROM OLD.content THEN NEW.content ELSE content END,
    deleted_at = CASE
                   WHEN v_deleted_at IS NOT NULL                                                          THEN v_deleted_at
                   WHEN NEW.is_deleted = true AND (OLD.is_deleted IS NULL OR OLD.is_deleted = false)      THEN COALESCE(NEW.whatsapp_timestamp, now())
                   WHEN NEW.is_deleted = false                                                             THEN NULL
                   ELSE deleted_at
                 END,
    updated_at = now()
  WHERE id = OLD.id AND instance_name = OLD.instance_name;

  -- PASSO 5: Propagar v_status normalizado para RETURNING
  NEW.status := v_status;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION zapp.pause_instance(p_instance text, p_reason text, p_minutes integer DEFAULT 15, p_trigger_count integer DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp', 'monitoring'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT zapp.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  IF p_minutes <= 0 OR p_minutes > 1440 THEN
    RAISE EXCEPTION 'p_minutes must be between 1 and 1440';
  END IF;

  INSERT INTO zapp.instance_processing_pauses (
    instance_name, paused_until, reason, trigger_count, paused_by, auto_paused
  )
  VALUES (
    p_instance,
    now() + (p_minutes || ' minutes')::interval,
    COALESCE(NULLIF(trim(p_reason), ''), 'manual_pause'),
    GREATEST(0, COALESCE(p_trigger_count, 0)),
    auth.uid(),
    false
  )
  RETURNING id INTO v_id;

  INSERT INTO zapp.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'instance_paused',
    'instance_processing_pauses',
    v_id::text,
    jsonb_build_object(
      'instance', p_instance,
      'minutes', p_minutes,
      'reason', p_reason,
      'trigger_count', p_trigger_count
    )
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION zapp.rpc_backfill_messages_contact_id(p_instance_name text DEFAULT 'wpp2'::text, p_batch_size integer DEFAULT 5000, p_dry_run boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp'
    AS $$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_cap int := LEAST(p_batch_size, 20000);
  v_repaired bigint := 0;
  v_remaining bigint;
BEGIN
  PERFORM zapp.fn_require_app_user();

  IF NOT p_dry_run THEN
    WITH candidates AS (
      SELECT m.id FROM zapp.evolution_messages m
      WHERE m.instance_name = p_instance_name
        AND m.contact_id IS NULL
        AND m.remote_jid NOT LIKE '%@g.us'
        AND m.remote_jid NOT LIKE '%@broadcast'
        AND m.remote_jid NOT IN ('unknown@s.whatsapp.net','unknown@deleted')
        AND split_part(m.remote_jid,'@',1) NOT LIKE 'smoke%'
      LIMIT v_cap
      FOR UPDATE SKIP LOCKED
    ),
    contact_match AS (
      -- Match by remote_jid (exact)
      SELECT DISTINCT ON (m.id) m.id AS msg_id, c.id AS contact_id
      FROM candidates cand
      JOIN zapp.evolution_messages m ON m.id = cand.id
      JOIN zapp.evolution_contacts c
        ON c.instance_name = m.instance_name
       AND c.remote_jid = m.remote_jid
       AND c.deleted_at IS NULL
      UNION ALL
      -- Match by phone_number (normalized)
      SELECT DISTINCT ON (m.id) m.id, c.id
      FROM candidates cand
      JOIN zapp.evolution_messages m ON m.id = cand.id
      LEFT JOIN zapp.evolution_contacts c
        ON c.instance_name = m.instance_name
       AND c.phone_number = regexp_replace(split_part(m.remote_jid,'@',1), '\D','','g')
       AND c.deleted_at IS NULL
      WHERE c.id IS NOT NULL
    ),
    best_match AS (
      SELECT DISTINCT ON (msg_id) msg_id, contact_id
      FROM contact_match
      WHERE contact_id IS NOT NULL
      ORDER BY msg_id
    ),
    updated AS (
      UPDATE zapp.evolution_messages em
      SET contact_id = bm.contact_id
      FROM best_match bm
      WHERE em.id = bm.msg_id
        AND em.contact_id IS NULL
      RETURNING em.id
    )
    SELECT COUNT(*) INTO v_repaired FROM updated;
  ELSE
    SELECT COUNT(*) INTO v_repaired
    FROM (
      SELECT m.id FROM zapp.evolution_messages m
      WHERE m.instance_name = p_instance_name
        AND m.contact_id IS NULL
        AND m.remote_jid NOT LIKE '%@g.us'
      LIMIT v_cap
    ) sub;
  END IF;

  SELECT COUNT(*) INTO v_remaining
  FROM zapp.evolution_messages
  WHERE instance_name = p_instance_name
    AND contact_id IS NULL
    AND remote_jid NOT LIKE '%@g.us';

  RETURN jsonb_build_object(
    'repaired',          v_repaired,
    'remaining_estimate',v_remaining,
    'instance_name',     p_instance_name,
    'dry_run',           p_dry_run,
    'elapsed_ms',        EXTRACT(EPOCH FROM (clock_timestamp()-v_start))*1000
  );
END;
$$;

CREATE OR REPLACE FUNCTION zapp.rpc_list_transfers_paginated(p_status text DEFAULT NULL::text, p_priority integer DEFAULT NULL::integer, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, source_instance text, target_instance text, remote_jid text, contact_name text, status text, priority integer, transfer_type text, category text, reason text, from_agent_id uuid, to_agent_id uuid, sla_deadline timestamp with time zone, created_at timestamp with time zone, accepted_at timestamp with time zone, completed_at timestamp with time zone, total_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT t.id, t.source_instance, t.target_instance, t.remote_jid, t.contact_name,
         t.status, t.priority, t.transfer_type, t.category, t.reason,
         t.from_agent_id, t.to_agent_id, t.sla_deadline,
         t.created_at, t.accepted_at, t.completed_at,
         COUNT(*) OVER()::bigint AS total_count
  FROM zapp.conversation_transfers t
  WHERE (p_status IS NULL OR t.status = p_status)
    AND (p_priority IS NULL OR t.priority = p_priority)
    AND (p_from IS NULL OR t.created_at >= p_from)
    AND (p_to IS NULL OR t.created_at <= p_to)
  ORDER BY t.created_at DESC
  LIMIT COALESCE(p_limit, 50)
  OFFSET COALESCE(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION zapp.unpause_instance(p_instance text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp', 'monitoring'
    AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT zapp.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  UPDATE zapp.instance_processing_pauses
     SET paused_until = now(),
         updated_at = now()
   WHERE instance_name = p_instance
     AND paused_until > now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    INSERT INTO zapp.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'instance_unpaused',
      'instance_processing_pauses',
      p_instance,
      jsonb_build_object('instance', p_instance, 'cleared', v_count)
    );
  END IF;

  RETURN v_count;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_dispatch_errors_created ON zapp.dispatch_error_logs USING btree (created_at DESC);




CREATE INDEX IF NOT EXISTS idx_dlq_created ON zapp.evolution_webhook_dlq USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_esa_contact_id ON zapp.evolution_sentiment_analysis USING btree (contact_id) WHERE (contact_id IS NOT NULL);




CREATE INDEX IF NOT EXISTS idx_esa_created_at ON zapp.evolution_sentiment_analysis USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_esa_created_at ON zapp.evolution_sentiment_analysis USING btree (created_at DESC);




CREATE INDEX IF NOT EXISTS idx_esa_instance_name ON zapp.evolution_sentiment_analysis USING btree (instance_name);

CREATE INDEX IF NOT EXISTS idx_esa_remote_jid ON zapp.evolution_sentiment_analysis USING btree (remote_jid);




CREATE INDEX IF NOT EXISTS idx_esa_sentiment_urgency ON zapp.evolution_sentiment_analysis USING btree (sentiment, urgency) WHERE (requires_attention = true);

CREATE INDEX IF NOT EXISTS idx_webhook_audit_log_processed_at ON zapp.webhook_audit_log USING btree (created_at DESC) WHERE (status = 'processed'::text);




CREATE INDEX IF NOT EXISTS idx_webhook_audit_log_success_at ON zapp.webhook_audit_log USING btree (created_at DESC) WHERE (status = 'success'::text);

CREATE INDEX IF NOT EXISTS idx_webhook_audit_log_success_at ON zapp.webhook_audit_log USING btree (created_at DESC) WHERE (status = 'success'::text);




CREATE INDEX IF NOT EXISTS idx_webhook_audit_status_created ON zapp.webhook_audit_log USING btree (status, created_at DESC) WHERE (status IS NOT NULL);

  CREATE TYPE zapp.warroom_alert_type AS ENUM (
    'info',
    'warning',
    'critical',
    'sla_breach'
);

CREATE TABLE IF NOT EXISTS zapp.conversation_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_number text NOT NULL,
    source_instance text NOT NULL,
    source_conversation_id uuid,
    source_message_id uuid,
    source_operator text,
    target_instance text NOT NULL,
    target_conversation_id uuid,
    target_operator text,
    contact_id uuid,
    remote_jid text NOT NULL,
    contact_name text,
    transfer_type text DEFAULT 'internal'::text NOT NULL,
    category text,
    reason text NOT NULL,
    context_summary text,
    context_messages jsonb DEFAULT '[]'::jsonb,
    tags text[] DEFAULT '{}'::text[],
    status text DEFAULT 'pending'::text NOT NULL,
    priority integer DEFAULT 2 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    completed_at timestamp with time zone,
    expires_at timestamp with time zone,
    resolution_notes text,
    resolution_type text,
    from_agent_id uuid,
    to_agent_id uuid,
    from_queue_id uuid,
    to_queue_id uuid,
    sla_deadline timestamp with time zone,
    return_reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT conversation_transfers_category_check CHECK ((category = ANY (ARRAY['nf'::text, 'boleto'::text, 'rastreio'::text, 'arte'::text, 'gravacao'::text, 'duvida_tecnica'::text, 'reclamacao'::text, 'orcamento'::text, 'cotacao'::text, 'producao'::text, 'outro'::text]))),
    CONSTRAINT conversation_transfers_priority_check CHECK (((priority >= 1) AND (priority <= 4))),
    CONSTRAINT conversation_transfers_resolution_type_check CHECK ((resolution_type = ANY (ARRAY['resolved'::text, 'returned'::text, 'escalated'::text, 'cancelled'::text]))),
    CONSTRAINT conversation_transfers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'in_progress'::text, 'completed'::text, 'returned'::text, 'rejected'::text, 'expired'::text, 'cancelled'::text]))),
    CONSTRAINT conversation_transfers_transfer_type_check CHECK ((transfer_type = ANY (ARRAY['internal'::text, 'direct'::text])))
);

ALTER TABLE zapp.conversation_transfers ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS zapp.evolution_instance_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_name text NOT NULL,
    api_url text DEFAULT 'https://evolution.atomicabr.com.br'::text NOT NULL,
    api_key text NOT NULL,
    display_name text,
    department text,
    health_status text DEFAULT 'unknown'::text NOT NULL,
    last_health_check timestamp with time zone,
    online_instances integer,
    total_instances integer,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    connection_id uuid,
    instance_token text,
    webhook_url text,
    vault_secret_id uuid,
    CONSTRAINT chk_evo_cred_health CHECK ((health_status = ANY (ARRAY['healthy'::text, 'unhealthy'::text, 'unknown'::text, 'degraded'::text])))
)
WITH (autovacuum_vacuum_scale_factor='0', autovacuum_vacuum_threshold='2', autovacuum_analyze_scale_factor='0', autovacuum_analyze_threshold='2', autovacuum_freeze_max_age='50000000');

ALTER TABLE zapp.evolution_instance_credentials ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS zapp.transfer_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transfer_id uuid NOT NULL,
    author_name text NOT NULL,
    author_instance text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_id uuid NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE zapp.transfer_comments ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS zapp.warroom_alerts (
    alert_type zapp.warroom_alert_type NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    dismissed_by uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_read boolean DEFAULT false,
    message text NOT NULL,
    resolved_at timestamp with time zone,
    resolved_reason text,
    source text,
    title text NOT NULL,
    entity text,
    severity character varying(20) DEFAULT 'medium'::character varying
);

ALTER TABLE zapp.warroom_alerts ENABLE ROW LEVEL SECURITY;


CREATE OR REPLACE FUNCTION zapp.cleanup_old_evolution_retry_metrics() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp', 'monitoring'
    AS $$
BEGIN
  DELETE FROM zapp.evolution_retry_metrics
  WHERE created_at < now() - interval '30 days';
END;
$$;

CREATE OR REPLACE FUNCTION zapp.get_own_gmail_accounts() RETURNS SETOF email_app.gmail_accounts
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'zapp', 'monitoring'
    AS $$
  SELECT * FROM gmail_accounts WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE VIEW zapp.gmail_health_logs WITH (security_invoker='on') AS
 SELECT gmail_health_logs.id,
    gmail_health_logs."timestamp",
    gmail_health_logs.status,
    gmail_health_logs.operation,
    gmail_health_logs.resource,
    gmail_health_logs.request_id,
    gmail_health_logs.error_message,
    gmail_health_logs.metadata,
    gmail_health_logs.is_failure
   FROM email_app.gmail_health_logs;

CREATE OR REPLACE VIEW zapp.gmail_messages WITH (security_invoker='on') AS
 SELECT gmail_messages.id,
    gmail_messages.created_at,
    gmail_messages.updated_at,
    gmail_messages.account_id,
    gmail_messages.bcc_emails,
    gmail_messages.body_html,
    gmail_messages.body_plain,
    gmail_messages.cc_emails,
    gmail_messages.from_email,
    gmail_messages.from_name,
    gmail_messages.has_attachments,
    gmail_messages.internal_date,
    gmail_messages.is_draft,
    gmail_messages.is_read,
    gmail_messages.is_sent,
    gmail_messages.label_ids,
    gmail_messages.message_id,
    gmail_messages.snippet,
    gmail_messages.subject,
    gmail_messages.thread_id_ref,
    gmail_messages.to_emails
   FROM email_app.gmail_messages;

CREATE OR REPLACE VIEW zapp.gmail_threads WITH (security_invoker='on') AS
 SELECT gmail_threads.id,
    gmail_threads.created_at,
    gmail_threads.updated_at,
    gmail_threads.account_id,
    gmail_threads.assigned_agent_id,
    gmail_threads.first_reply_at,
    gmail_threads.frt_minutes,
    gmail_threads.is_important,
    gmail_threads.is_starred,
    gmail_threads.label_ids,
    gmail_threads.last_message_at,
    gmail_threads.message_count,
    gmail_threads.participant_emails,
    gmail_threads.priority,
    gmail_threads.sla_status,
    gmail_threads.snippet,
    gmail_threads.subject,
    gmail_threads.tags,
    gmail_threads.thread_id,
    gmail_threads.unread_count
   FROM email_app.gmail_threads;

CREATE TABLE IF NOT EXISTS zapp.whatsapp_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone_number text,
    instance_name text NOT NULL,
    instance_id text,
    api_url text NOT NULL,
    api_key text NOT NULL,
    status text DEFAULT 'disconnected'::text,
    qr_code text,
    qr_code_base64 text,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    webhook_url text,
    settings jsonb DEFAULT '{}'::jsonb,
    last_connected_at timestamp with time zone,
    connected_at timestamp with time zone,
    disconnected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    api_type text DEFAULT 'evolution'::text NOT NULL,
    battery_level integer,
    created_by uuid,
    degraded_at timestamp with time zone,
    farewell_enabled boolean DEFAULT false,
    farewell_message text,
    health_reason text,
    health_response_ms integer,
    health_status text DEFAULT 'unknown'::text,
    is_plugged boolean DEFAULT false NOT NULL,
    last_health_check timestamp with time zone,
    max_retries integer DEFAULT 5,
    owner_jid text,
    retry_count integer DEFAULT 0,
    routing_mode text DEFAULT 'manual'::text NOT NULL,
    auto_reconnect_enabled boolean DEFAULT true NOT NULL,
    loop_protection_active boolean DEFAULT false NOT NULL,
    max_reconnect_attempts integer DEFAULT 5 NOT NULL,
    reconnect_interval_seconds integer DEFAULT 30 NOT NULL,
    evo_instance_id text,
    CONSTRAINT whatsapp_connections_api_type_check CHECK ((api_type = ANY (ARRAY['evolution'::text, 'official'::text, 'cloud'::text]))),
    CONSTRAINT whatsapp_connections_health_status_check CHECK (((health_status IS NULL) OR (health_status = ANY (ARRAY['healthy'::text, 'ok'::text, 'provisioned'::text, 'degraded'::text, 'error'::text, 'unknown'::text, 'down'::text, 'offline'::text, 'disconnected'::text, 'timeout'::text])))),
    CONSTRAINT whatsapp_connections_instance_name_not_uuid CHECK ((instance_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text)),
    CONSTRAINT whatsapp_connections_routing_mode_check CHECK ((routing_mode = ANY (ARRAY['manual'::text, 'sticky'::text, 'rules'::text, 'round_robin'::text]))),
    CONSTRAINT whatsapp_connections_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'connecting'::text, 'qr_pending'::text, 'banned'::text, 'logged_out'::text])))
);

ALTER TABLE zapp.whatsapp_connections ENABLE ROW LEVEL SECURITY;

