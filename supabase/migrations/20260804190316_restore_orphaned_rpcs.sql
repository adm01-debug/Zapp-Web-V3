-- ============================================================================
-- Migration: restore_orphaned_rpcs
-- Data:      2026-08-04
-- Objetivo:  RESTAURAR RPCs órfãs (chamadas pelas edge functions, aplicadas no
--            banco live, mas SEM definição em nenhuma migration do repo).
--
-- ORIGEM DO PROBLEMA: a "limpeza massiva" (ebf9558d5, 984 arquivos removidos)
-- removeu migrations antigas de RPCs (ex.: archive/20260725000006 que criava
-- fn_edge_get_evolution_credentials). O banco live manteve as funções, mas um
-- ambiente recriado do zero (DR test, staging, nova VPS) NÃO as teria — quebrando
-- as edge functions que as chamam silenciosamente.
--
-- FONTE DE VERDADE: definições extraídas do banco de PRODUÇÃO via
-- pg_get_functiondef() em 2026-08-04 (validadas por testes HTTP reais).
--
-- IDEMPOTENTE: CREATE OR REPLACE + REVOKE/GRANT explícitos. Seguro reaplicar.
-- GRANTS: seguem o princípio de menor privilégio (service_role / anon conforme
-- cada RPC; as de leitura pública têm GRANT a anon/authenticated quando o
-- consumo real exige).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.fn_edge_get_evolution_credentials
-- Caller: evolution-credentials edge function (GET — chave da Evolution API).
-- Guarda: service_role OU postgres/supabase_admin (claims JWT).
-- Lê: evo.evolution_instance_credentials + vault.decrypted_secrets.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_edge_get_evolution_credentials(p_instance text DEFAULT 'wpp2'::text)
 RETURNS TABLE(instance_name text, api_url text, api_key text, health_status text, last_health_check timestamp with time zone, is_active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_claims_role text := coalesce((NULLIF(current_setting('request.jwt.claims', true), ''))::jsonb->>'role', '');
BEGIN
  IF v_claims_role <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'forbidden: service_role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.instance_name::text,
         c.api_url::text,
         v.decrypted_secret::text AS api_key,
         c.health_status::text,
         c.last_health_check,
         c.is_active
  FROM evo.evolution_instance_credentials c
  CROSS JOIN LATERAL (
    SELECT ds.decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.name = 'evolution_api_key' LIMIT 1
  ) v
  WHERE c.instance_name = p_instance;
END;
$function$
;
REVOKE ALL ON FUNCTION zapp.fn_edge_get_evolution_credentials(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zapp.fn_edge_get_evolution_credentials(text) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.fn_get_vault_secret
-- Caller: evolution-sender (lê api_key do vault via RPC SECURITY DEFINER).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_get_vault_secret(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;
  RETURN v_secret;
END $function$
;
REVOKE ALL ON FUNCTION zapp.fn_get_vault_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zapp.fn_get_vault_secret(text) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.fn_apply_connection_update + wrapper public
-- Caller: evolution-webhook (connection.update → status mapping + health).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_apply_connection_update(p_event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo'
AS $function$
DECLARE
  v_instance_name text;
  v_evo_status    text;
  v_evo_upper     text;
  v_mapped_status text;
  v_owner         text;
  v_phone         text;
  v_profile       text;
  v_evo_id        text;
  v_db_status     text;
  v_disconnected_at timestamptz;
  v_action        text;
  v_debounced     boolean := false;
BEGIN
  v_instance_name := COALESCE(p_event->>'instance', p_event->>'name', p_event->'data'->>'instance');
  v_evo_status    := COALESCE(p_event->'data'->>'state', p_event->>'state', p_event->>'connectionStatus');
  v_owner         := COALESCE(p_event->'data'->>'wuid', p_event->>'ownerJid', p_event->'data'->>'ownerJid');
  v_profile       := COALESCE(p_event->'data'->>'profileName', p_event->>'profileName');
  v_evo_id        := COALESCE(p_event->>'instanceId', p_event->>'id', p_event->'data'->>'id');
  v_phone         := split_part(COALESCE(v_owner, ''), '@', 1);
  v_evo_upper     := UPPER(COALESCE(v_evo_status, ''));

  IF v_instance_name IS NULL THEN
    RETURN jsonb_build_object('action', 'rejected', 'reason', 'missing_instance_name');
  END IF;

  v_mapped_status := CASE
    WHEN v_evo_upper LIKE 'OPEN%' OR v_evo_upper = 'CONNECTED'
      THEN 'connected'
    WHEN v_evo_upper LIKE 'CONNECTING%' OR v_evo_upper LIKE 'RECONNECTING%'
      THEN 'connecting'
    WHEN v_evo_upper IN ('CLOSE', 'DISCONNECTED')
      THEN 'disconnected'
    WHEN v_evo_upper IN ('QR_PENDING', 'QRCODE', 'QR_CODE')
      THEN 'qr_pending'
    WHEN v_evo_upper = 'BANNED'
      THEN 'banned'
    WHEN v_evo_upper IN ('TIMEOUT', 'CONFLICT', 'REPLACED', 'DEVICE_REMOVED', 'MULTIDEVICE_MISMATCH', 'STREAM_ERROR')
      THEN 'disconnected'
    ELSE 'disconnected'
  END;

  PERFORM set_config('app.reconcile_source', 'webhook_push', true);

  SELECT wc.status, wc.disconnected_at INTO v_db_status, v_disconnected_at
    FROM zapp.whatsapp_connections wc WHERE wc.instance_name = v_instance_name;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('action','skip_not_in_db','instance', v_instance_name, 'evo_status', v_evo_status);
  END IF;

  IF v_mapped_status = 'connected'
     AND v_disconnected_at IS NOT NULL
     AND v_disconnected_at > now() - interval '10 minutes' THEN
    v_mapped_status := 'connecting';
    v_debounced := true;
  END IF;

  IF v_db_status IS DISTINCT FROM v_mapped_status THEN
    UPDATE zapp.whatsapp_connections wc
      SET status        = v_mapped_status,
          instance_id   = COALESCE(NULLIF(v_evo_id,''), wc.instance_id),
          phone_number  = COALESCE(NULLIF(v_phone, ''), wc.phone_number),
          owner_jid     = COALESCE(v_owner, wc.owner_jid),
          health_status = CASE v_mapped_status
                            WHEN 'connected'    THEN 'ok'
                            WHEN 'connecting'   THEN 'degraded'
                            WHEN 'disconnected' THEN 'down'
                            WHEN 'qr_pending'   THEN 'degraded'
                            WHEN 'banned'       THEN 'down'
                            ELSE 'unknown' END,
          health_reason = CASE
                            WHEN v_debounced THEN format('webhook push: evo_state=%s debounced (disconnected_at=%s < 10min ago)', v_evo_status, v_disconnected_at)
                            WHEN v_mapped_status = 'connected' THEN NULL
                            ELSE format('webhook push: evo_state=%s mapped=%s', v_evo_status, v_mapped_status) END,
          last_health_check = now(),
          last_connected_at = CASE WHEN v_mapped_status = 'connected' THEN now() ELSE wc.last_connected_at END,
          disconnected_at   = CASE WHEN v_mapped_status = 'disconnected' THEN now() ELSE wc.disconnected_at END,
          updated_at        = now()
    WHERE wc.instance_name = v_instance_name;
    v_action := 'updated';
  ELSE
    UPDATE zapp.whatsapp_connections wc
      SET last_health_check = now(),
          instance_id = COALESCE(NULLIF(v_evo_id,''), wc.instance_id),
          health_status = CASE WHEN v_mapped_status='connected' AND NOT v_debounced AND wc.health_status IS DISTINCT FROM 'ok' THEN 'ok' ELSE wc.health_status END,
          health_reason = CASE WHEN v_mapped_status='connected' AND NOT v_debounced AND wc.health_status IS DISTINCT FROM 'ok' THEN NULL ELSE wc.health_reason END,
          last_connected_at = CASE WHEN v_mapped_status = 'connected' AND NOT v_debounced THEN now() ELSE wc.last_connected_at END
    WHERE wc.instance_name = v_instance_name;
    v_action := 'no_change';
  END IF;

  RETURN jsonb_build_object(
    'action', v_action,
    'instance', v_instance_name,
    'old_status', v_db_status,
    'new_status', v_mapped_status,
    'evo_state', v_evo_status,
    'debounced', v_debounced,
    'profile', v_profile
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_apply_connection_update(p_event jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$ SELECT zapp.fn_apply_connection_update(p_event) $function$
;
REVOKE ALL ON FUNCTION zapp.fn_apply_connection_update(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zapp.fn_apply_connection_update(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.fn_apply_connection_update(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apply_connection_update(jsonb) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.increment_webhook_rate_limit + wrapper public
-- Caller: evolution-webhook (rate limit por instância/evento).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.increment_webhook_rate_limit(p_instance_id text, p_event_type text, p_window_start timestamp with time zone, p_limit integer)
 RETURNS TABLE(current_count integer, is_allowed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE v_count int;
BEGIN
  INSERT INTO zapp.webhook_rate_limits(instance_id,event_type,window_start,event_count,created_at)
  VALUES(p_instance_id,p_event_type,p_window_start,1,now())
  ON CONFLICT (instance_id,event_type,window_start)
  DO UPDATE SET event_count = zapp.webhook_rate_limits.event_count + 1
  RETURNING event_count INTO v_count;
  RETURN QUERY SELECT v_count, (v_count <= p_limit * 10);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.increment_webhook_rate_limit(p_instance_id text, p_event_type text, p_window_start timestamp with time zone, p_limit integer)
 RETURNS TABLE(current_count integer, is_allowed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
BEGIN
  RETURN QUERY SELECT * FROM zapp.increment_webhook_rate_limit(p_instance_id, p_event_type, p_window_start, p_limit);
END;
$function$
;
REVOKE ALL ON FUNCTION zapp.increment_webhook_rate_limit(text, text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zapp.increment_webhook_rate_limit(text, text, timestamptz, integer) TO service_role;
REVOKE ALL ON FUNCTION public.increment_webhook_rate_limit(text, text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_webhook_rate_limit(text, text, timestamptz, integer) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.is_admin_or_supervisor (0 e 1 arg) + zapp.is_instance_paused (+ public)
-- Caller: evolution-credentials, gmail-oauth, instance-pause-control etc.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.is_admin_or_supervisor()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
BEGIN
  RETURN zapp.is_admin_or_supervisor(auth.uid());
END;
$function$
;
CREATE OR REPLACE FUNCTION zapp.is_admin_or_supervisor(_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
BEGIN
  IF _user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM zapp.user_roles
    WHERE user_id = _user_id
      AND role::TEXT IN ('dev', 'admin', 'manager', 'supervisor')
  ) OR EXISTS (
    SELECT 1 FROM zapp.workspace_members
    WHERE user_id = _user_id
      AND role IN ('admin', 'supervisor', 'owner')
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION zapp.is_instance_paused(p_instance text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$ SELECT EXISTS ( SELECT 1 FROM zapp.instance_processing_pauses WHERE instance_name = p_instance AND paused_until > now() ); $function$
;
CREATE OR REPLACE FUNCTION public.is_instance_paused(p_instance_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
  SELECT zapp.is_instance_paused(p_instance_name);
$function$
;
GRANT EXECUTE ON FUNCTION zapp.is_admin_or_supervisor() TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.is_admin_or_supervisor(uuid) TO authenticated;
REVOKE ALL ON FUNCTION zapp.is_instance_paused(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.is_instance_paused(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_instance_paused(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_instance_paused(text) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.auto_pause_instance_on_auth_spike
-- Caller: instance-pause-control (autopause por pico de auth).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.auto_pause_instance_on_auth_spike(p_instance text, p_reason text, p_trigger_count integer, p_minutes integer DEFAULT 15)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
  v_id           uuid;
  v_existing     uuid;
  v_clamped_tc   integer;
  v_clamped_min  integer;
BEGIN
  IF p_minutes <= 0 OR p_minutes > 1440 THEN
    v_clamped_min := 15;
  ELSE
    v_clamped_min := p_minutes;
  END IF;

  v_clamped_tc := GREATEST(0, COALESCE(p_trigger_count, 0));

  SELECT id INTO v_existing
    FROM zapp.instance_processing_pauses
   WHERE instance_name = p_instance
     AND paused_until > now()
   ORDER BY paused_until DESC
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE zapp.instance_processing_pauses
       SET paused_until  = GREATEST(paused_until, now() + (v_clamped_min || ' minutes')::interval),
           trigger_count = trigger_count + v_clamped_tc,
           reason        = p_reason,
           updated_at    = now()
     WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO zapp.instance_processing_pauses (
    instance_name, paused_until, reason, trigger_count, auto_paused
  )
  VALUES (
    p_instance,
    now() + (v_clamped_min || ' minutes')::interval,
    p_reason,
    v_clamped_tc,
    true
  )
  RETURNING id INTO v_id;

  INSERT INTO zapp.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    NULL,
    'instance_auto_paused',
    'instance_processing_pauses',
    v_id,
    jsonb_build_object(
      'instance',      p_instance,
      'minutes',       v_clamped_min,
      'reason',        p_reason,
      'trigger_count', v_clamped_tc,
      'raw_trigger_count', p_trigger_count
    )
  );

  RETURN v_id;
END;
$function$
;
REVOKE ALL ON FUNCTION zapp.auto_pause_instance_on_auth_spike(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zapp.auto_pause_instance_on_auth_spike(text, text, integer, integer) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.claim_next_voice_task
-- Caller: voice-agent / voice-conversion queue (worker claim).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.claim_next_voice_task(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF zapp.voice_conversion_queue
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$ UPDATE zapp.voice_conversion_queue SET status='processing', started_at=now(), updated_at=now() WHERE id = (SELECT id FROM zapp.voice_conversion_queue WHERE status='pending' ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING * $function$
;
REVOKE ALL ON FUNCTION zapp.claim_next_voice_task(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zapp.claim_next_voice_task(uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.cleanup_expired_challenges
-- Caller: webauthn (limpeza de challenges expirados).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.cleanup_expired_challenges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
BEGIN
    DELETE FROM zapp.webauthn_challenges WHERE expires_at < now();
END;
$function$
;
REVOKE ALL ON FUNCTION zapp.cleanup_expired_challenges() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zapp.cleanup_expired_challenges() TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.fn_analyze_sentiment
-- Caller: evolution-sentiment (análise de sentimento por heurística local).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_analyze_sentiment(p_text text)
 RETURNS TABLE(sentiment text, score numeric, intent text, urgency text, keywords text[])
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE v_lower TEXT; v_score DECIMAL := 0; v_sentiment TEXT := 'neutral'; v_intent TEXT := 'geral'; v_urgency TEXT := 'low'; v_keywords TEXT[] := ARRAY[]::TEXT[];
BEGIN
  v_lower := LOWER(COALESCE(p_text, ''));

  IF v_lower ~ '(n[aã]o|nunca|nem)\s+(recomendo|gostei|gosto|indico|aprovei|aprovo|satisfeit)' THEN
    v_score := v_score - 0.5; v_keywords := array_append(v_keywords, 'negacao');
  ELSIF v_lower ~ '(obrigad|excelente|perfeito|[oó]timo|maravilhos|adorei|amei|parab[eé]ns|satisfeit|recomendo|top|show|incr[ií]vel)' THEN
    v_score := v_score + 0.4; v_keywords := array_append(v_keywords, 'positivo');
  END IF;

  IF v_lower ~ '(p[eé]ssimo|horr[ií]vel|ruim|atraso|problema|reclama[cç][aã]|insatisfeit|decepcion|absurdo|vergonha|nunca mais|dem[oó]r|raiva|lixo|porcaria)' THEN
    v_score := v_score - 0.5; v_keywords := array_append(v_keywords, 'negativo');
  END IF;

  IF v_lower ~ '(advogado|procon|processo|justi[cç]a|tribunal|indeniza)' THEN
    v_urgency := 'critical'; v_score := -1; v_keywords := array_append(v_keywords, 'juridico');
  END IF;

  IF v_lower ~ '(urgente|urg[eê]ncia|imediato|agora|socorro|emerg[eê]ncia)' THEN
    v_urgency := CASE WHEN v_urgency='critical' THEN 'critical' ELSE 'high' END;
    v_keywords := array_append(v_keywords, 'urgente');
  END IF;

  IF v_lower LIKE '%?' OR v_lower ~ '(como|quando|onde|qual|quanto)' THEN v_intent := 'pergunta';
  ELSIF v_lower ~ '(reclam|problem)' THEN v_intent := 'reclamacao'; v_urgency := CASE WHEN v_urgency='low' THEN 'medium' ELSE v_urgency END;
  ELSIF v_lower ~ '(or[cç]amento|pre[cç]o|valor)' THEN v_intent := 'pedido_orcamento';
  ELSIF v_lower ~ '(parab[eé]ns|obrigad|adorei)' THEN v_intent := 'elogio';
  END IF;

  v_score := GREATEST(-1, LEAST(1, v_score));
  IF v_score > 0.2 THEN v_sentiment := 'positive';
  ELSIF v_score < -0.2 THEN v_sentiment := 'negative';
  ELSE v_sentiment := 'neutral'; END IF;

  RETURN QUERY SELECT v_sentiment, v_score, v_intent, v_urgency, v_keywords;
END;
$function$
;
GRANT EXECUTE ON FUNCTION zapp.fn_analyze_sentiment(text) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.fn_register_sticky_assignment
-- Caller: assignment engine (sticky contact→agent).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_register_sticky_assignment(p_contact_id uuid, p_agent_profile_id uuid, p_channel_connection_id uuid DEFAULT NULL::uuid, p_queue_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO zapp.sticky_assignments
    (contact_id, channel_connection_id, agent_profile_id, queue_id, last_assigned_at, expires_at)
  VALUES
    (p_contact_id, p_channel_connection_id, p_agent_profile_id, p_queue_id, now(), now() + interval '24 hours')
  ON CONFLICT (contact_id, channel_connection_id) DO UPDATE
    SET agent_profile_id = EXCLUDED.agent_profile_id,
        queue_id = EXCLUDED.queue_id,
        last_assigned_at = now(),
        expires_at = now() + interval '24 hours'
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;
REVOKE ALL ON FUNCTION zapp.fn_register_sticky_assignment(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zapp.fn_register_sticky_assignment(uuid, uuid, uuid, uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.fn_use_template
-- Caller: evolution-templates (incrementa uso de template).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_use_template(p_template_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE v_content text;
BEGIN
  UPDATE evolution_message_templates SET usage_count=COALESCE(usage_count,0)+1,last_used_at=now() WHERE id=p_template_id RETURNING content INTO v_content;
  INSERT INTO evolution_template_usage (template_id) VALUES (p_template_id);
  RETURN v_content;
END; $function$
;
REVOKE ALL ON FUNCTION zapp.fn_use_template(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zapp.fn_use_template(uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.log_security_event
-- Caller: várias (auditoria de segurança — best-effort, nunca derruba caller).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.log_security_event(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
BEGIN
  INSERT INTO zapp.audit_logs (user_id, action, entity_type, details)
  VALUES (
    auth.uid(),
    p_action,
    p_resource,
    COALESCE(p_details, '{}'::jsonb)
      || jsonb_build_object('event_type', p_event_type, 'status', p_status)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$function$
;
GRANT EXECUTE ON FUNCTION zapp.log_security_event(text, text, text, text, jsonb) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.mark_pause_investigated
-- Caller: instance-pause-control (investigação de pausa automática).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.mark_pause_investigated(p_pause_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS zapp.instance_processing_pauses
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_row zapp.instance_processing_pauses;
BEGIN
  IF NOT zapp.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE zapp.instance_processing_pauses
     SET investigated_at = now(),
         investigated_by = auth.uid(),
         investigation_notes = COALESCE(NULLIF(trim(p_notes), ''), investigation_notes)
   WHERE id = p_pause_id
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'pause_not_found';
  END IF;

  RETURN v_row;
END;
$function$
;
REVOKE ALL ON FUNCTION zapp.mark_pause_investigated(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.mark_pause_investigated(uuid, text) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.rpc_email_register_click / rpc_email_register_open
-- Caller: email-track-link / email-track-pixel (tracking de e-mail).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_email_register_click(p_link_id uuid, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_device_type text DEFAULT 'unknown'::text, p_browser text DEFAULT 'unknown'::text, p_os text DEFAULT 'unknown'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_link record; v_msg record; v_now timestamptz := now();
BEGIN
  SELECT link_id, tracking_id, original_url INTO v_link FROM zapp.email_tracked_links WHERE link_id = p_link_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'link_id not found'); END IF;

  SELECT user_id, recipient_email INTO v_msg FROM zapp.email_tracked_messages WHERE tracking_id = v_link.tracking_id;

  INSERT INTO zapp.email_link_click_events (
    link_id, tracking_id, ip_address, user_agent, country, city, device_type, browser, os
  ) VALUES (p_link_id, v_link.tracking_id, p_ip::inet, p_user_agent, p_country, p_city, p_device_type, p_browser, p_os);

  UPDATE zapp.email_tracked_links SET click_count = click_count + 1,
    first_clicked_at = COALESCE(first_clicked_at, v_now), last_clicked_at = v_now
  WHERE link_id = p_link_id;

  UPDATE zapp.email_tracked_messages SET click_count = click_count + 1, updated_at = v_now
  WHERE tracking_id = v_link.tracking_id;

  IF v_msg IS NOT NULL THEN
    INSERT INTO zapp.email_contact_scores (user_id, email, total_clicks, engagement_score, last_interaction)
    VALUES (v_msg.user_id, v_msg.recipient_email, 1, 2, v_now)
    ON CONFLICT (user_id, email) DO UPDATE SET
      total_clicks = email_contact_scores.total_clicks + 1,
      engagement_score = email_contact_scores.engagement_score + 2,
      last_interaction = v_now, updated_at = v_now;
  END IF;

  RETURN jsonb_build_object('ok', true, 'original_url', v_link.original_url);
END;
$function$
;
CREATE OR REPLACE FUNCTION zapp.rpc_email_register_open(p_tracking_id uuid, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_device_type text DEFAULT 'unknown'::text, p_browser text DEFAULT 'unknown'::text, p_os text DEFAULT 'unknown'::text, p_is_self_open boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_msg record;
  v_is_bot boolean := false;
  v_now timestamptz := now();
BEGIN
  SELECT id, user_id, recipient_email, open_count
    INTO v_msg FROM zapp.email_tracked_messages
   WHERE tracking_id = p_tracking_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'tracking_id not found'); END IF;

  v_is_bot := (p_device_type = 'bot');

  INSERT INTO zapp.email_tracking_events (
    tracking_id, event_type, ip_address, user_agent,
    country, city, device_type, browser, os, is_self_open, is_bot
  ) VALUES (
    p_tracking_id, 'open', p_ip::inet, p_user_agent,
    p_country, p_city, p_device_type, p_browser, p_os,
    p_is_self_open, v_is_bot
  );

  UPDATE zapp.email_tracked_messages
     SET open_count = open_count + 1,
         first_opened_at = COALESCE(first_opened_at, v_now),
         last_opened_at = v_now,
         delivery_status = CASE WHEN delivery_status = 'sent' THEN 'delivered' ELSE delivery_status END,
         updated_at = v_now
   WHERE tracking_id = p_tracking_id;

  INSERT INTO zapp.email_contact_scores (user_id, email, total_opens, engagement_score, last_interaction)
  VALUES (v_msg.user_id, v_msg.recipient_email, 1, 1, v_now)
  ON CONFLICT (user_id, email) DO UPDATE SET
    total_opens = email_contact_scores.total_opens + 1,
    engagement_score = email_contact_scores.engagement_score + 1,
    last_interaction = v_now,
    updated_at = v_now;

  RETURN jsonb_build_object('ok', true, 'open_count', v_msg.open_count + 1);
END;
$function$
;
REVOKE ALL ON FUNCTION zapp.rpc_email_register_click(uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_email_register_click(uuid, text, text, text, text, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION zapp.rpc_email_register_open(uuid, text, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_email_register_open(uuid, text, text, text, text, text, text, text, boolean) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.rpc_upsert_contact (2 variantes)
-- Caller: evolution-webhook (upsert de contato por remote_jid).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_upsert_contact(p_remote_jid text, p_instance text, p_push_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO zapp.contacts (remote_jid, push_name, instance, updated_at)
    VALUES (p_remote_jid, p_push_name, p_instance, now())
    ON CONFLICT (remote_jid) DO UPDATE 
    SET push_name = EXCLUDED.push_name,
        instance = EXCLUDED.instance,
        updated_at = now()
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION zapp.rpc_upsert_contact(p_remote_jid text, p_instance text DEFAULT 'wpp_pink_test'::text, p_push_name text DEFAULT NULL::text, p_full_name text DEFAULT NULL::text, p_phone_number text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_company text DEFAULT NULL::text, p_role_title text DEFAULT NULL::text, p_lead_status text DEFAULT NULL::text, p_lead_source text DEFAULT NULL::text, p_lead_score integer DEFAULT NULL::integer, p_assigned_to text DEFAULT NULL::text, p_tags text[] DEFAULT NULL::text[], p_notes text DEFAULT NULL::text)
 RETURNS evo.evolution_contacts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE v_row evo.evolution_contacts;
BEGIN
  INSERT INTO evo.evolution_contacts(
    remote_jid, instance_name, push_name, full_name, phone_number, email,
    company, role_title, lead_status, lead_source, lead_score, assigned_to,
    tags, notes, created_at, updated_at
  ) VALUES (
    p_remote_jid, p_instance, p_push_name, p_full_name, p_phone_number,
    p_email, p_company, p_role_title, COALESCE(p_lead_status,'new'),
    p_lead_source, COALESCE(p_lead_score,0), p_assigned_to, p_tags,
    p_notes, now(), now()
  )
  ON CONFLICT(remote_jid) DO UPDATE SET
    push_name     = COALESCE(EXCLUDED.push_name, evolution_contacts.push_name),
    full_name     = COALESCE(EXCLUDED.full_name, evolution_contacts.full_name),
    phone_number  = COALESCE(EXCLUDED.phone_number, evolution_contacts.phone_number),
    email         = COALESCE(EXCLUDED.email, evolution_contacts.email),
    company       = COALESCE(EXCLUDED.company, evolution_contacts.company),
    lead_status   = COALESCE(EXCLUDED.lead_status, evolution_contacts.lead_status),
    lead_score    = COALESCE(EXCLUDED.lead_score, evolution_contacts.lead_score),
    assigned_to   = COALESCE(EXCLUDED.assigned_to, evolution_contacts.assigned_to),
    tags          = COALESCE(EXCLUDED.tags, evolution_contacts.tags),
    notes         = COALESCE(EXCLUDED.notes, evolution_contacts.notes),
    deleted_at    = NULL,
    updated_at    = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$
;
REVOKE ALL ON FUNCTION zapp.rpc_upsert_contact(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_upsert_contact(text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION zapp.rpc_upsert_contact(text, text, text, text, text, text, text, text, text, text, integer, text, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_upsert_contact(text, text, text, text, text, text, text, text, text, text, integer, text, text[], text) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.search_knowledge_base
-- Caller: knowledge base search (chatbot).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.search_knowledge_base(search_query text, max_results integer DEFAULT 5)
 RETURNS TABLE(id uuid, title text, content text, category text, tags text, rank real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$ SELECT a.id, a.title, a.content, a.category, a.tags, CASE WHEN a.title ILIKE '%' || search_query || '%' THEN 1.0 WHEN a.content ILIKE '%' || search_query || '%' THEN 0.5 ELSE 0.0 END::real AS rank FROM zapp.knowledge_base_articles a WHERE a.is_published = true AND (a.title ILIKE '%' || search_query || '%' OR a.content ILIKE '%' || search_query || '%') ORDER BY rank DESC LIMIT max_results; $function$
;
GRANT EXECUTE ON FUNCTION zapp.search_knowledge_base(text, integer) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.store_reset_token
-- Caller: approve-password-reset (armazenamento de token com hash).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.store_reset_token(p_request_id uuid, p_token text, p_expires_at timestamp with time zone)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$ INSERT INTO zapp.password_reset_tokens (request_id, token_hash, expires_at) VALUES (p_request_id, p_token, p_expires_at) $function$
;
REVOKE ALL ON FUNCTION zapp.store_reset_token(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zapp.store_reset_token(uuid, text, timestamptz) TO service_role;

-- ============================================================================
-- FIM — 24 definições restauradas (snapshot do banco de produção 2026-08-04).
-- ============================================================================
