-- ============================================================
-- 20260819155921_reconcile_repo_db_backfill.sql
-- Reconciliacao repo x DB (plano MIGRATIONS_CLEANUP 100 etapas, Fase 4)
-- Objetos ORFAOS aplicados no DB e sem arquivo no repo, extraidos do
-- snapshot do rebuild (scripts/decouple/snapshots/zapp_schema_snapshot.sql).
-- Regra 5 AGENTS.md: corpo = o que JA roda no DB (nunca reintroduzir bug).
-- Idempotente (CREATE OR REPLACE / IF NOT EXISTS); no-op no DB vivo.
-- Registrada no schema_migrations como aplicada (BACKFILL-RECORD).
-- Gerado por Hermes em 20260819155921.
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
CREATE OR REPLACE FUNCTION zapp.fn_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp', 'pg_catalog'
    AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION zapp.get_contacts_360_batch(p_phones text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp', 'auth', 'extensions'
    AS $$ DECLARE v_phone text; v_contact_record jsonb; v_workspace_id uuid; v_phone_results jsonb[] := ARRAY[]::jsonb[]; BEGIN IF auth.uid() IS NOT NULL THEN SELECT workspace_id INTO v_workspace_id FROM zapp.workspace_members WHERE user_id = auth.uid() LIMIT 1; IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF; END IF; FOREACH v_phone IN ARRAY p_phones LOOP SELECT jsonb_build_object('contact', CASE WHEN c.id IS NOT NULL THEN row_to_json(c) ELSE NULL END, 'conversation_id', (SELECT ec.id FROM zapp.evolution_conversations ec WHERE (ec.remote_jid = v_phone OR ec.remote_jid = (replace(v_phone, '@s.whatsapp.net', '') || '@s.whatsapp.net')) ORDER BY ec.created_at DESC LIMIT 1), 'phone', v_phone, 'found', c.id IS NOT NULL) INTO v_contact_record FROM zapp.contacts c WHERE (c.phone = v_phone OR c.phone = replace(v_phone, '@s.whatsapp.net', '') OR (v_phone || '@s.whatsapp.net') = c.phone) AND (v_workspace_id IS NULL OR c.workspace_id = v_workspace_id) LIMIT 1; IF v_contact_record IS NULL THEN v_contact_record := jsonb_build_object('contact', NULL, 'conversation_id', NULL, 'phone', v_phone, 'found', false); END IF; v_phone_results := array_append(v_phone_results, v_contact_record); END LOOP; RETURN jsonb_build_object('results', array_to_json(v_phone_results), 'count', COALESCE(array_length(v_phone_results, 1), 0)); END; $$;
CREATE OR REPLACE FUNCTION zapp.is_instance_paused(p_instance text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'zapp', 'monitoring'
    AS $$ SELECT EXISTS ( SELECT 1 FROM zapp.instance_processing_pauses WHERE instance_name = p_instance AND paused_until > now() ); $$;
CREATE OR REPLACE FUNCTION zapp.messages_update_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp'
    AS $$
DECLARE
  v_status     text;
  v_deleted_at timestamptz;
BEGIN
  v_status := CASE
    WHEN NEW.status IS NOT DISTINCT FROM OLD.status                                        THEN OLD.status
    WHEN NEW.status IN ('sending', 'retrying', 'queued', 'processing', 'scheduled')        THEN 'pending'
    WHEN NEW.status IN ('failed_auth', 'failed_retries', 'error')                          THEN 'failed'
    WHEN NEW.status IS NULL OR NEW.status = ''                                             THEN OLD.status
    WHEN NEW.status NOT IN ('received','sent','delivered','read','deleted','pending','played','failed')
                                                                                            THEN 'pending'
    ELSE NEW.status
  END;
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
CREATE INDEX IF NOT EXISTS idx_dispatch_errors_created ON zapp.dispatch_error_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esa_contact_id ON zapp.evolution_sentiment_analysis USING btree (contact_id) WHERE (contact_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_esa_created_at ON zapp.evolution_sentiment_analysis USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esa_remote_jid ON zapp.evolution_sentiment_analysis USING btree (remote_jid);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_log_processed_at ON zapp.webhook_audit_log USING btree (created_at DESC) WHERE (status = 'processed'::text);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_log_success_at ON zapp.webhook_audit_log USING btree (created_at DESC) WHERE (status = 'success'::text);
  CREATE POLICY auth_secure_70 ON zapp.hmac_selftest_audit FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$pol1015$;
  CREATE POLICY auth_secure_70_select ON zapp.hmac_selftest_audit FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
EXCEPTION WHEN duplicate_object THEN NULL;
END
$pol1016$;
  CREATE POLICY evo_creds_service_role_only ON zapp.evolution_instance_credentials TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$pol1169$;
  CREATE TYPE zapp.warroom_alert_type AS ENUM (
    'info',
    'warning',
    'critical',
    'sla_breach'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$typ16$;
CREATE TABLE IF NOT EXISTS zapp.conversation_transfers (
ALTER TABLE zapp.conversation_transfers ENABLE ROW LEVEL SECURITY;
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
CREATE TABLE IF NOT EXISTS zapp.evolution_instance_credentials (
ALTER TABLE zapp.evolution_instance_credentials ENABLE ROW LEVEL SECURITY;
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
CREATE TABLE IF NOT EXISTS zapp.transfer_comments (
ALTER TABLE zapp.transfer_comments ENABLE ROW LEVEL SECURITY;
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transfer_id uuid NOT NULL,
    author_name text NOT NULL,
    author_instance text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_id uuid NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS zapp.warroom_alerts (
ALTER TABLE zapp.warroom_alerts ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE zapp.whatsapp_connections ENABLE ROW LEVEL SECURITY;
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
