-- ============================================================================
-- REPLAY CONVERGENTE — materializado retroativamente em 2026-08-16 a partir de
-- supabase_migrations.schema_migrations (version=20260815250012), sem arquivo
-- correspondente neste repo. Ver convencao completa em 20260815250008_*.sql.
--
-- Fonte: docs/decouple/CONTRACT_SURFACE_V1.md ("RPCs de contrato", "E54").
-- Corpos: pg_get_functiondef em producao 2026-08-15 pos-Lote5. Grants: ACL
-- atual via aclexplode(proacl).
--
-- LACUNA: evo.rpc_boundary_mirror_event(jsonb) foi criada nesta migration e
-- dropada em 20260815250014 (mirror v1->v2 orfao, ver LOTE4_FASE2_LOG.md) —
-- corpo nao existe mais em producao, pg_get_functiondef nao pode reproduzi-lo.
-- Descricao funcional no log original: "ON CONFLICT (id,created_at) DO NOTHING",
-- espelhando INSERT que fn_mirror_to_webhook_events_v2 fazia antes do repoint
-- em 20260815250013. Nao reproduzido aqui para nao inventar corpo.
--
-- E54 (prova de isolamento): a bateria SET ROLE evo_writer/zapp_writer +
-- INSERT/UPDATE direto negados, e RPC permitida, foi validacao ad-hoc na
-- mesma transacao de producao (rollback ao final) — nao e DDL persistente,
-- por isso nao esta reproduzida como statement aqui. Ver CONTRACT_SURFACE_V1.md
-- secao "E54" para o roteiro exato.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- zapp-side: RPCs chamadas por evo, grant EXECUTE a evo_writer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION zapp.rpc_boundary_raise_alert(p_alert_type text, p_severity text, p_title text, p_message text, p_payload jsonb DEFAULT '{}'::jsonb, p_dedup_window interval DEFAULT '00:30:00'::interval)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM zapp.evolution_alerts WHERE alert_type=p_alert_type AND resolved_at IS NULL AND created_at > now()-p_dedup_window) THEN
    RETURN NULL;
  END IF;
  INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
  VALUES (p_alert_type, p_severity, p_title, p_message, coalesce(p_payload,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION zapp.rpc_boundary_resolve_alert(p_alert_type text, p_resolved_by text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE v_n integer;
BEGIN
  UPDATE zapp.evolution_alerts SET resolved_at=now(), resolved_by=p_resolved_by WHERE alert_type=p_alert_type AND resolved_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

-- Desvio do doc: sem p_instance — a fn original (evo.fn_touch_contact_last_message)
-- nao filtrava por instancia, por isso o contrato tambem nao filtra.
CREATE OR REPLACE FUNCTION zapp.rpc_boundary_touch_contact(p_remote_jid text, p_at timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
BEGIN
  UPDATE zapp.evolution_contacts SET last_message_at = p_at, total_messages = COALESCE(total_messages,0)+1 WHERE remote_jid = p_remote_jid AND deleted_at IS NULL;
END $function$;

CREATE OR REPLACE FUNCTION zapp.rpc_boundary_upsert_status(p_instance text, p_participant_name text, p_message_id text, p_message_type text, p_content text, p_media_url text, p_media_mimetype text, p_posted_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE v_cid uuid;
BEGIN
  SELECT id INTO v_cid FROM zapp.evolution_contacts WHERE push_name=p_participant_name AND instance_name=p_instance LIMIT 1;
  INSERT INTO zapp.evolution_whatsapp_status(id,instance_name,participant_jid,participant_name,contact_id,message_id,message_type,content,media_url,media_mimetype,posted_at,created_at)
  VALUES(gen_random_uuid(),p_instance,'status@broadcast',p_participant_name,v_cid,p_message_id,p_message_type,p_content,p_media_url,p_media_mimetype,p_posted_at,now())
  ON CONFLICT(message_id) DO NOTHING;
END $function$;

CREATE OR REPLACE FUNCTION zapp.rpc_boundary_log_audit(p_action text, p_entity_type text, p_new_values jsonb, p_metadata jsonb, p_performed_by text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
BEGIN
  INSERT INTO zapp.evolution_audit_log (action, entity_type, entity_id, new_values, metadata, performed_by, created_at)
  VALUES (p_action, p_entity_type, gen_random_uuid(), p_new_values, p_metadata, p_performed_by, now());
END $function$;

REVOKE ALL ON FUNCTION zapp.rpc_boundary_raise_alert(text, text, text, text, jsonb, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION zapp.rpc_boundary_resolve_alert(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION zapp.rpc_boundary_touch_contact(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION zapp.rpc_boundary_upsert_status(text, text, text, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION zapp.rpc_boundary_log_audit(text, text, jsonb, jsonb, text) FROM PUBLIC;

GRANT USAGE ON SCHEMA zapp TO evo_writer;
GRANT EXECUTE ON FUNCTION zapp.rpc_boundary_raise_alert(text, text, text, text, jsonb, interval) TO evo_writer;
GRANT EXECUTE ON FUNCTION zapp.rpc_boundary_resolve_alert(text, text) TO evo_writer;
GRANT EXECUTE ON FUNCTION zapp.rpc_boundary_touch_contact(text, timestamptz) TO evo_writer;
GRANT EXECUTE ON FUNCTION zapp.rpc_boundary_upsert_status(text, text, text, text, text, text, text, timestamptz) TO evo_writer;
GRANT EXECUTE ON FUNCTION zapp.rpc_boundary_log_audit(text, text, jsonb, jsonb, text) TO evo_writer;

-- ---------------------------------------------------------------------------
-- evo-side: RPCs chamadas por zapp, grant EXECUTE a zapp_writer
-- ---------------------------------------------------------------------------

-- LACUNA (ver nota no topo do arquivo): corpo original nao preservado.
-- CREATE FUNCTION evo.rpc_boundary_mirror_event(jsonb) RETURNS void ...
--   ON CONFLICT (id, created_at) DO NOTHING — dropada em 20260815250014.

-- NOTA: o corpo abaixo ja reflete o upsert (ON CONFLICT request_id DO UPDATE
-- dispatched_at) introduzido em 20260815250013 (E62) — pg_get_functiondef so
-- expoe o estado final de producao, sem o INSERT simples que precedeu o
-- upsert nesta migration original. Ver E62_REPOINT_LOG.md, secao 1
-- ("RPCs ajustadas/adicionadas").
CREATE OR REPLACE FUNCTION evo.rpc_boundary_reconcile_enqueue(p_request_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE v_id bigint;
BEGIN
  INSERT INTO evo.evolution_reconcile_jobs (request_id) VALUES (p_request_id)
  ON CONFLICT (request_id) DO UPDATE SET dispatched_at=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_reconcile_apply(p_id bigint, p_http_status integer, p_result jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
BEGIN
  UPDATE evo.evolution_reconcile_jobs SET applied_at=now(), http_status=p_http_status, result=p_result WHERE id=p_id;
END $function$;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_upsert_lid_identity(p_lid_jid text, p_pn_jid text, p_phone_number text, p_confidence text, p_source text, p_raw jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE v_instance text := 'wpp2';
BEGIN
  INSERT INTO evo.lid_phone_map (lid_jid, instance_name, phone_jid, phone_number, confidence, source, raw_signal)
  VALUES (p_lid_jid, v_instance, p_pn_jid, p_phone_number, p_confidence, p_source, p_raw)
  ON CONFLICT (lid_jid, instance_name) DO UPDATE SET
    phone_jid = COALESCE(EXCLUDED.phone_jid, evo.lid_phone_map.phone_jid),
    phone_number = COALESCE(EXCLUDED.phone_number, evo.lid_phone_map.phone_number),
    confidence = CASE WHEN evo.lid_phone_map.confidence = 'high' OR EXCLUDED.confidence IN ('none','bootstrap_invalid') THEN evo.lid_phone_map.confidence WHEN EXCLUDED.confidence = 'high' THEN 'high' WHEN evo.lid_phone_map.confidence = 'none' THEN EXCLUDED.confidence ELSE evo.lid_phone_map.confidence END,
    source = CASE WHEN EXCLUDED.confidence = 'high' AND evo.lid_phone_map.confidence <> 'high' THEN EXCLUDED.source ELSE evo.lid_phone_map.source END,
    raw_signal = COALESCE(EXCLUDED.raw_signal, evo.lid_phone_map.raw_signal),
    updated_at = now();
  INSERT INTO evo.contact_identity (lid_jid, pn_jid, phone_number, instance_name, confidence, source, raw_signal)
  VALUES (p_lid_jid, p_pn_jid, p_phone_number, v_instance, p_confidence, p_source, p_raw)
  ON CONFLICT (lid_jid, instance_name) DO UPDATE SET
    pn_jid = COALESCE(EXCLUDED.pn_jid, evo.contact_identity.pn_jid),
    phone_number = COALESCE(EXCLUDED.phone_number, evo.contact_identity.phone_number),
    confidence = CASE WHEN evo.contact_identity.confidence = 'high' OR EXCLUDED.confidence IN ('none','bootstrap_invalid') THEN evo.contact_identity.confidence WHEN EXCLUDED.confidence = 'high' THEN 'high' WHEN evo.contact_identity.confidence = 'none' THEN EXCLUDED.confidence ELSE evo.contact_identity.confidence END,
    source = CASE WHEN EXCLUDED.confidence = 'high' AND evo.contact_identity.confidence <> 'high' THEN EXCLUDED.source ELSE evo.contact_identity.source END,
    raw_signal = COALESCE(EXCLUDED.raw_signal, evo.contact_identity.raw_signal),
    last_seen = now();
END $function$;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_isonwa_pull(p_limit integer DEFAULT 20)
 RETURNS TABLE(remote_jid text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 20), 50));
BEGIN
  RETURN QUERY SELECT q.remote_jid FROM evo.evolution_whatsapp_check_queue q WHERE q.status = 'pending' ORDER BY q.created_at ASC LIMIT v_limit;
END $function$;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_isonwa_mark(p_jids text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE v_done int;
BEGIN
  UPDATE evo.evolution_whatsapp_check_queue SET status='done', checked_at=now() WHERE remote_jid = ANY (p_jids) AND status='pending';
  GET DIAGNOSTICS v_done = ROW_COUNT;
  RETURN v_done;
END $function$;

-- so as tabelas evo do purge: bootstrap_log + webhook_events_v2, guard len>=16
CREATE OR REPLACE FUNCTION evo.rpc_boundary_scrub_secret(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE v_redacted CONSTANT text := '[REDACTED-E3-04]'; v_result jsonb := '{}'; v_n bigint;
BEGIN
  IF p_key IS NULL OR length(p_key) < 16 THEN
    RAISE EXCEPTION 'p_key must be >= 16 characters to prevent accidental mass-redaction';
  END IF;
  UPDATE evo.evolution_bootstrap_log SET notes = replace(notes, p_key, v_redacted),
    settings_applied = CASE WHEN settings_applied::text LIKE '%' || p_key || '%' THEN replace(settings_applied::text, p_key, v_redacted)::jsonb ELSE settings_applied END
  WHERE notes LIKE '%' || p_key || '%' OR settings_applied::text LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_result := v_result || jsonb_build_object('evo.evolution_bootstrap_log', v_n); END IF;
  UPDATE evo.evolution_webhook_events_v2 SET payload = CASE WHEN payload::text LIKE '%' || p_key || '%' THEN replace(payload::text, p_key, v_redacted)::jsonb ELSE payload END,
    error_message = replace(error_message, p_key, v_redacted)
  WHERE payload::text LIKE '%' || p_key || '%' OR error_message LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_result := v_result || jsonb_build_object('evo.evolution_webhook_events_v2', v_n); END IF;
  RETURN jsonb_build_object('purged_at', now(), 'detail', v_result);
END $function$;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_cooldown_get(p_key text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$ SELECT last_severity FROM evo.evolution_alert_cooldown WHERE alert_key = p_key $function$;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_cooldown_clear(p_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE v_n integer;
BEGIN
  DELETE FROM evo.evolution_alert_cooldown WHERE alert_key = p_key;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

REVOKE ALL ON FUNCTION evo.rpc_boundary_reconcile_enqueue(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION evo.rpc_boundary_reconcile_apply(bigint, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION evo.rpc_boundary_upsert_lid_identity(text, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION evo.rpc_boundary_isonwa_pull(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION evo.rpc_boundary_isonwa_mark(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION evo.rpc_boundary_scrub_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION evo.rpc_boundary_cooldown_get(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION evo.rpc_boundary_cooldown_clear(text) FROM PUBLIC;

GRANT USAGE ON SCHEMA evo TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_reconcile_enqueue(bigint) TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_reconcile_apply(bigint, integer, jsonb) TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_upsert_lid_identity(text, text, text, text, text, jsonb) TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_isonwa_pull(integer) TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_isonwa_mark(text[]) TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_scrub_secret(text) TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_cooldown_get(text) TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_cooldown_clear(text) TO zapp_writer;
