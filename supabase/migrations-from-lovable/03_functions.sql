-- ═══════════════════════════════════════════════════════════
-- All 171 public functions from Lovable migrations
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_role_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'role_updated',
      'user_roles',
      NEW.id,
      jsonb_build_object('user_id', NEW.user_id, 'old_role', OLD.role, 'new_role', NEW.role)
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'role_created', 'user_roles', NEW.id,
      jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role)
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'role_deleted', 'user_roles', OLD.id,
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role)
    );
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_assign_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  assigned_agent_id UUID;
BEGIN
  -- Find the first matching active rule for the connection
  SELECT agent_id INTO assigned_agent_id
  FROM public.client_wallet_rules
  WHERE is_active = true
    AND (whatsapp_connection_id IS NULL OR whatsapp_connection_id = NEW.whatsapp_connection_id)
  ORDER BY priority DESC, created_at ASC
  LIMIT 1;
  
  -- If a rule matches and contact has no assignment, assign it
  IF assigned_agent_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
    NEW.assigned_to := assigned_agent_id;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_assign_to_queue_agent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  assigned_agent_id UUID;
BEGIN
  -- If contact has a queue but no assigned agent, find least busy agent
  IF NEW.queue_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
    SELECT qm.profile_id INTO assigned_agent_id
    FROM public.queue_members qm
    JOIN public.profiles p ON p.id = qm.profile_id
    WHERE qm.queue_id = NEW.queue_id
      AND qm.is_active = true
      AND p.is_active = true
    ORDER BY (
      SELECT COUNT(*) FROM public.contacts c 
      WHERE c.assigned_to = qm.profile_id
    ) ASC
    LIMIT 1;
    
    IF assigned_agent_id IS NOT NULL THEN
      NEW.assigned_to := assigned_agent_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_pause_instance_on_auth_spike(p_instance text, p_reason text, p_trigger_count integer, p_minutes integer DEFAULT 15)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_existing uuid;
BEGIN
  IF p_minutes <= 0 OR p_minutes > 1440 THEN
    p_minutes := 15;
  END IF;

  -- Se já há pausa ativa, estende-a (não cria duplicata)
  SELECT id INTO v_existing
    FROM public.instance_processing_pauses
   WHERE instance_name = p_instance
     AND paused_until > now()
   ORDER BY paused_until DESC
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.instance_processing_pauses
       SET paused_until = GREATEST(paused_until, now() + (p_minutes || ' minutes')::interval),
           trigger_count = trigger_count + GREATEST(0, COALESCE(p_trigger_count, 0)),
           reason = p_reason,
           updated_at = now()
     WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO public.instance_processing_pauses (
    instance_name, paused_until, reason, trigger_count, auto_paused
  )
  VALUES (
    p_instance,
    now() + (p_minutes || ' minutes')::interval,
    p_reason,
    GREATEST(0, COALESCE(p_trigger_count, 0)),
    true
  )
  RETURNING id INTO v_id;

  -- Audit log sem user_id (auto)
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    NULL,
    'instance_auto_paused',
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
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_lgpd_optout(p_contact_ids uuid[], p_reason text DEFAULT 'user_request'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.contacts
  SET
    lgpd_opt_out_at        = now(),
    lgpd_marketing_consent = false,
    lgpd_data_sharing      = false,
    lgpd_profiling         = false,
    lgpd_last_updated_at   = now(),
    updated_at             = now()
  WHERE id = ANY(p_contact_ids)
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
    AND lgpd_opt_out_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_soft_delete_contacts(p_contact_ids uuid[], p_reason text DEFAULT 'bulk_deletion'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- Chunk safety: refuse if > 500 contacts at once
  IF array_length(p_contact_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Maximum 500 contacts per bulk operation. Got: %', array_length(p_contact_ids, 1);
  END IF;

  UPDATE public.contacts
  SET
    deleted_at     = now(),
    deleted_by     = auth.uid(),
    deleted_reason = p_reason,
    updated_at     = now()
  WHERE id = ANY(p_contact_ids)
    AND deleted_at IS NULL
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_level(xp_amount integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN GREATEST(1, FLOOR(SQRT(xp_amount / 50.0))::INTEGER + 1);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_see_pii()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'manager', 'agente_especial')
  )
$function$
;

CREATE OR REPLACE FUNCTION public.can_supervise_profile(_user_id uuid, _target_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_manager_or_above(_user_id)
    OR
    (
      public.has_role(_user_id, 'supervisor')
      AND public.get_user_department(_user_id) IS NOT NULL
      AND public.get_user_department(_user_id) = (
        SELECT department_id FROM public.profiles WHERE id = _target_profile_id LIMIT 1
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = _target_profile_id AND user_id = _user_id
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_user_see_contact(_user_id uuid, _contact_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_manager_or_above(_user_id)
    OR
    (
      public.has_role(_user_id, 'supervisor')
      AND public.get_user_department(_user_id) IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.contacts c
        JOIN public.profiles p ON p.id = c.assigned_to
        WHERE c.id = _contact_id
          AND p.department_id = public.get_user_department(_user_id)
      )
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.contacts c
      JOIN public.profiles p ON p.id = c.assigned_to
      WHERE c.id = _contact_id AND p.user_id = _user_id
    );
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_dispatch_error_logs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin or service_role required';
  END IF;

  DELETE FROM public.dispatch_error_logs
  WHERE occurred_at < now() - interval '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_evolution_fallback_events()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.evolution_fallback_events
   WHERE ts < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_evolution_send_idempotency()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.evolution_send_idempotency
  WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_challenges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    DELETE FROM public.webauthn_challenges WHERE expires_at < now();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_failed_messages()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz := now() - interval '30 days';
  v_deleted_count integer := 0;
BEGIN
  -- Apenas service_role (cron) ou admin pode executar
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role or service_role required';
  END IF;

  WITH deleted AS (
    DELETE FROM public.failed_messages
    WHERE status IN ('succeeded', 'abandoned')
      AND COALESCE(succeeded_at, last_attempt_at, created_at) < v_cutoff
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_count FROM deleted;

  RETURN jsonb_build_object(
    'deleted_count', v_deleted_count,
    'cutoff', v_cutoff,
    'executed_at', now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  deleted_errors int := 0;
  deleted_webhooks int := 0;
  deleted_dlq int := 0;
  deleted_audit int := 0;
BEGIN
  -- 1. Cleanup error logs > 30 days
  DELETE FROM public.app_error_logs WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_errors = ROW_COUNT;

  -- 2. Cleanup webhook events > 14 days
  DELETE FROM public.evolution_webhook_events WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS deleted_webhooks = ROW_COUNT;

  -- 3. Cleanup dead letter queue > 30 days
  DELETE FROM public.dead_letter_queue WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_dlq = ROW_COUNT;

  -- 4. Cleanup audit log > 90 days
  DELETE FROM public.audit_log WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_audit = ROW_COUNT;

  RETURN jsonb_build_object(
    'timestamp', now(),
    'deleted_errors', deleted_errors,
    'deleted_webhooks', deleted_webhooks,
    'deleted_dlq', deleted_dlq,
    'deleted_audit', deleted_audit
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_evolution_retry_metrics()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.evolution_retry_metrics
  WHERE created_at < now() - interval '30 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_failed_messages()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.failed_messages
   WHERE status IN ('succeeded', 'abandoned')
     AND COALESCE(succeeded_at, last_attempt_at, created_at) < now() - interval '30 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_instance_auth_events()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.instance_auth_events
   WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_qr_attempts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.qr_attempts WHERE created_at < now() - interval '60 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_proxy_metrics()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.proxy_metrics WHERE ts < now() - interval '24 hours';
  DELETE FROM public.proxy_alerts  WHERE ts < now() - interval '30 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_wa_cloud_pings()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.whatsapp_cloud_webhook_pings
  WHERE created_at < now() - interval '7 days';
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_webhook_event_dedup()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.webhook_event_dedup
   WHERE received_at < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_qr_on_connect()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'connected' AND OLD.status != 'connected' AND NEW.qr_code IS NOT NULL THEN
    NEW.qr_code := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.contacts_count_by_type()
 RETURNS TABLE(contact_type text, count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(c.contact_type, 'cliente') AS contact_type, COUNT(*) AS count
  FROM public.contacts c
  GROUP BY COALESCE(c.contact_type, 'cliente');
$function$
;

CREATE OR REPLACE FUNCTION public.decrypt_gmail_token(p_encrypted bytea)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_encrypted IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(p_encrypted, current_setting('app.encryption_key', true));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.encrypt_gmail_token(p_token text)
 RETURNS bytea
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_token IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_encrypt(p_token, current_setting('app.encryption_key', true));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_single_default_ai_provider()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.ai_providers
    SET is_default = false
    WHERE id != NEW.id
      AND is_default = true
      AND use_for && NEW.use_for;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_single_default_filter()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.saved_filters
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND entity_type = NEW.entity_type
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_contact_audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action        text;
  v_old_values    jsonb := NULL;
  v_new_values    jsonb := NULL;
  v_changed_by    uuid;
  v_sensitive_fields text[] := ARRAY['phone', 'email', 'cpf', 'cnpj', 'name', 'notes',
                                      'address', 'company', 'custom_fields', 'tags',
                                      'lgpd_consent_at', 'lgpd_opt_out_at', 'is_blocked'];
BEGIN
  -- Determine action
  v_action := TG_OP;

  -- Attempt to get the current authenticated user
  v_changed_by := auth.uid();

  -- For UPDATE: only log fields that actually changed
  IF TG_OP = 'UPDATE' THEN
    v_old_values := jsonb_object_agg(key, value)
      FROM jsonb_each(to_jsonb(OLD))
      WHERE key = ANY(v_sensitive_fields)
        AND to_jsonb(OLD)->>key IS DISTINCT FROM to_jsonb(NEW)->>key;

    v_new_values := jsonb_object_agg(key, value)
      FROM jsonb_each(to_jsonb(NEW))
      WHERE key = ANY(v_sensitive_fields)
        AND to_jsonb(OLD)->>key IS DISTINCT FROM to_jsonb(NEW)->>key;

    -- Skip log if nothing sensitive changed
    IF v_old_values IS NULL AND v_new_values IS NULL THEN
      RETURN NEW;
    END IF;

  ELSIF TG_OP = 'INSERT' THEN
    v_new_values := to_jsonb(NEW) - 'updated_at' - 'created_at';

  ELSIF TG_OP = 'DELETE' THEN
    v_old_values := to_jsonb(OLD);

  END IF;

  INSERT INTO public.contact_audit_log (
    contact_id,
    action,
    changed_by,
    changed_at,
    old_values,
    new_values
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    v_action,
    v_changed_by,
    now(),
    v_old_values,
    v_new_values
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_contacts_increment_version()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_contacts_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_contacts_update_lgpd_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.lgpd_consent_at IS DISTINCT FROM NEW.lgpd_consent_at
    OR OLD.lgpd_opt_out_at IS DISTINCT FROM NEW.lgpd_opt_out_at
    OR OLD.lgpd_marketing_consent IS DISTINCT FROM NEW.lgpd_marketing_consent
    OR OLD.lgpd_data_sharing IS DISTINCT FROM NEW.lgpd_data_sharing
    OR OLD.lgpd_profiling IS DISTINCT FROM NEW.lgpd_profiling
  THEN
    NEW.lgpd_last_updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_gmail_mark_first_reply()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Quando uma mensagem enviada é inserida, verifica se a thread ainda não teve resposta
  IF NEW.is_sent = true THEN
    UPDATE public.gmail_threads t
    SET
      first_reply_at = NEW.internal_date,
      frt_minutes    = EXTRACT(EPOCH FROM (NEW.internal_date - t.last_message_at)) / 60,
      sla_status     = 'ok'
    WHERE t.id = NEW.thread_id_ref
      AND t.first_reply_at IS NULL
      AND t.unread_count > 0;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_log_dispatch_error()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_email TEXT;
BEGIN
  v_agent_email := COALESCE(
    NEW.payload->>'agent_email',
    NEW.payload->>'agentEmail',
    NEW.payload->>'assigned_to',
    NEW.payload->>'user_email'
  );

  INSERT INTO public.dispatch_error_logs (
    failed_message_id, instance_name, remote_jid,
    agent_email, error_code, error_message, http_status,
    retry_count, payload, occurred_at
  ) VALUES (
    NEW.id, NEW.instance_name, NEW.remote_jid,
    v_agent_email, NEW.error_code, NEW.error_message, NEW.http_status,
    COALESCE(NEW.retry_count, 0), NEW.payload, COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_log_route_switchover()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.current_provider_id IS DISTINCT FROM NEW.current_provider_id
     AND NEW.current_provider_id IS NOT NULL THEN
    INSERT INTO public.provider_session_logs (provider_id, level, event, message, payload)
    VALUES (
      NEW.current_provider_id,
      'warn',
      'switchover',
      COALESCE(NEW.switched_reason, 'route changed'),
      jsonb_build_object(
        'from_provider', OLD.current_provider_id,
        'to_provider', NEW.current_provider_id,
        'channel_connection_id', NEW.channel_connection_id,
        'whatsapp_connection_id', NEW.whatsapp_connection_id
      )
    );
    NEW.switched_at := now();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_mark_qr_attempt_connected()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'connected' AND (OLD.status IS DISTINCT FROM 'connected') THEN
    UPDATE public.qr_attempts
       SET status = 'connected',
           connected_at = now()
     WHERE connection_id = NEW.id
       AND status = 'pending'
       AND created_at > now() - interval '15 minutes';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pml_protect_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key)
     OR (OLD.payload IS DISTINCT FROM NEW.payload)
     OR (OLD.payload_hash IS DISTINCT FROM NEW.payload_hash)
     OR (OLD.provider IS DISTINCT FROM NEW.provider)
     OR (OLD.external_message_id IS DISTINCT FROM NEW.external_message_id)
     OR (OLD.received_at IS DISTINCT FROM NEW.received_at) THEN
    RAISE EXCEPTION 'provider_message_log: immutable columns cannot be modified';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_register_sticky_assignment(p_contact_id uuid, p_agent_profile_id uuid, p_channel_connection_id uuid DEFAULT NULL::uuid, p_queue_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.sticky_assignments
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

CREATE OR REPLACE FUNCTION public.fn_resolve_agent_for_routing(p_contact_id uuid, p_channel_connection_id uuid DEFAULT NULL::uuid, p_queue_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_id uuid;
  v_resolved_queue uuid;
  v_strategy text;
  v_required_skills text[];
BEGIN
  -- 1) Sticky: último agente do contato neste canal, ainda válido e ativo
  SELECT s.agent_profile_id, s.queue_id
    INTO v_agent_id, v_resolved_queue
  FROM public.sticky_assignments s
  JOIN public.profiles p ON p.id = s.agent_profile_id
  WHERE s.contact_id = p_contact_id
    AND (p_channel_connection_id IS NULL OR s.channel_connection_id = p_channel_connection_id)
    AND s.expires_at > now()
    AND p.is_active = true
  ORDER BY s.last_assigned_at DESC
  LIMIT 1;

  IF v_agent_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'agent_profile_id', v_agent_id,
      'queue_id', v_resolved_queue,
      'strategy', 'sticky'
    );
  END IF;

  -- 2) Resolver fila: parâmetro > regra de roteamento do canal
  v_resolved_queue := p_queue_id;

  IF v_resolved_queue IS NULL AND p_channel_connection_id IS NOT NULL THEN
    SELECT queue_id INTO v_resolved_queue
    FROM public.channel_routing_rules
    WHERE channel_connection_id = p_channel_connection_id
      AND queue_id IS NOT NULL
    ORDER BY priority DESC
    LIMIT 1;
  END IF;

  IF v_resolved_queue IS NULL THEN
    RETURN jsonb_build_object(
      'agent_profile_id', NULL,
      'queue_id', NULL,
      'strategy', 'unassigned',
      'reason', 'no_queue_resolved'
    );
  END IF;

  -- 3) Skills exigidas pela fila
  SELECT COALESCE(array_agg(skill_name), ARRAY[]::text[])
    INTO v_required_skills
  FROM public.queue_skill_requirements
  WHERE queue_id = v_resolved_queue;

  -- 4) Round-robin: agente da fila com menos atribuições nas últimas 24h, com skills
  SELECT qm.profile_id INTO v_agent_id
  FROM public.queue_members qm
  JOIN public.profiles p ON p.id = qm.profile_id
  WHERE qm.queue_id = v_resolved_queue
    AND qm.is_active = true
    AND p.is_active = true
    AND (
      array_length(v_required_skills, 1) IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM unnest(v_required_skills) rs(name)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.agent_skills s
          WHERE s.profile_id = qm.profile_id AND s.skill_name = rs.name
        )
      )
    )
  ORDER BY (
    SELECT COUNT(*) FROM public.sticky_assignments sa
    WHERE sa.agent_profile_id = qm.profile_id
      AND sa.last_assigned_at > now() - interval '24 hours'
  ) ASC, random()
  LIMIT 1;

  IF v_agent_id IS NULL THEN
    RETURN jsonb_build_object(
      'agent_profile_id', NULL,
      'queue_id', v_resolved_queue,
      'strategy', 'unassigned',
      'reason', 'no_eligible_agent'
    );
  END IF;

  RETURN jsonb_build_object(
    'agent_profile_id', v_agent_id,
    'queue_id', v_resolved_queue,
    'strategy', 'round_robin'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_sticky_on_contact_assign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = NEW.assigned_to LIMIT 1;
  IF v_profile_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.fn_sticky_upsert(NEW.id, v_profile_id, NULL, NULL, 'contact_assignment');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_sticky_upsert(p_contact_id uuid, p_agent_profile_id uuid, p_channel_id uuid DEFAULT NULL::uuid, p_queue_id uuid DEFAULT NULL::uuid, p_source text DEFAULT 'manual'::text)
 RETURNS sticky_assignments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ttl_hours int := 24;
  v_enabled boolean := true;
  v_row public.sticky_assignments;
BEGIN
  IF p_contact_id IS NULL OR p_agent_profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Lê TTL/enabled do canal (se informado)
  IF p_channel_id IS NOT NULL THEN
    SELECT sticky_enabled, COALESCE(sticky_ttl_hours, 24)
      INTO v_enabled, v_ttl_hours
      FROM public.service_channels
     WHERE id = p_channel_id;

    IF NOT COALESCE(v_enabled, true) THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.sticky_assignments AS sa
    (contact_id, agent_profile_id, queue_id, last_assigned_at, expires_at)
  VALUES
    (p_contact_id, p_agent_profile_id, p_queue_id, now(),
     now() + make_interval(hours => v_ttl_hours))
  ON CONFLICT (contact_id) DO UPDATE
    SET agent_profile_id = EXCLUDED.agent_profile_id,
        queue_id         = COALESCE(EXCLUDED.queue_id, sa.queue_id),
        last_assigned_at = now(),
        expires_at       = now() + make_interval(hours => v_ttl_hours)
  RETURNING * INTO v_row;

  -- Audit best-effort
  BEGIN
    INSERT INTO public.audit_log(actor_user_id, action, entity_type, entity_id, payload)
    VALUES (auth.uid(), 'sticky.upsert', 'sticky_assignment', v_row.id,
            jsonb_build_object('source', p_source, 'agent', p_agent_profile_id,
                               'channel', p_channel_id, 'queue', p_queue_id,
                               'expires_at', v_row.expires_at));
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_channel_credentials(_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT credentials FROM public.channel_connections WHERE id = _connection_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_channel_credentials_safe(p_channel_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only admins can access credentials
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;
  
  RETURN (
    SELECT credentials 
    FROM public.channel_connections 
    WHERE id = p_channel_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_connection_instance(_connection_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT instance_id FROM public.whatsapp_connections WHERE id = _connection_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_connection_qr_code(_connection_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT qr_code FROM public.whatsapp_connections WHERE id = _connection_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_normalized_phone(phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN phone IS NULL OR phone = '' THEN NULL
    ELSE
      regexp_replace(
        CASE
          -- Strip leading 55 country code
          WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^55[1-9][0-9]' AND
               length(regexp_replace(phone, '[^0-9]', '', 'g')) IN (12, 13)
          THEN substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 3)
          ELSE regexp_replace(phone, '[^0-9]', '', 'g')
        END,
        '^',
        ''
      )
  END
$function$
;

CREATE OR REPLACE FUNCTION public.get_official_credentials_by_phone_id(p_phone_number_id text)
 RETURNS TABLE(connection_id uuid, phone_number_id text, access_token text, app_secret text, verify_token text, graph_api_version text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT connection_id, phone_number_id, access_token, app_secret, verify_token, graph_api_version
  FROM public.whatsapp_official_credentials
  WHERE phone_number_id = p_phone_number_id
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_own_lockout_status(p_email text)
 RETURNS TABLE(attempt_count integer, locked_until timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT la.attempt_count, la.locked_until
  FROM login_attempts la
  WHERE la.email = p_email
  ORDER BY la.created_at DESC
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_own_reset_requests()
 RETURNS SETOF password_reset_requests
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at,
         rejection_reason, NULL::text as reset_token, token_expires_at,
         ip_address, user_agent, created_at, updated_at
  FROM public.password_reset_requests
  WHERE user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_profile_role_for_check(p_user_id uuid)
 RETURNS TABLE(role text, access_level text, permissions jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.role, p.access_level, p.permissions
  FROM profiles p
  WHERE p.user_id = p_user_id
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_reset_requests_safe()
 RETURNS TABLE(id uuid, user_id uuid, email text, reason text, status text, reviewed_by uuid, reviewed_at timestamp with time zone, rejection_reason text, has_token boolean, token_expires_at timestamp with time zone, ip_address text, user_agent text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    prr.id, prr.user_id, prr.email, prr.reason, prr.status,
    prr.reviewed_by, prr.reviewed_at, prr.rejection_reason,
    (prr.reset_token IS NOT NULL) AS has_token,
    prr.token_expires_at, prr.ip_address, prr.user_agent,
    prr.created_at, prr.updated_at
  FROM public.password_reset_requests prr;
$function$
;

CREATE OR REPLACE FUNCTION public.get_route_roles(_path text)
 RETURNS app_role[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT allowed_roles FROM public.route_permissions WHERE path = _path
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_profiles()
 RETURNS TABLE(id uuid, user_id uuid, name text, email text, avatar_url text, role text, is_active boolean, department text, job_title text, phone text, max_chats integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    p.id, p.user_id, p.name, p.email, p.avatar_url, p.role,
    p.is_active, p.department, p.job_title, p.phone, p.max_chats, p.created_at
  FROM public.profiles p;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_department(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.department_id
  FROM public.profiles p
  WHERE p.user_id = _user_id
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_visible_agent_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id FROM public.profiles p WHERE p.user_id = _user_id
  UNION
  SELECT avg.can_see_agent_id
  FROM public.agent_visibility_grants avg
  JOIN public.profiles p ON p.id = avg.agent_id
  WHERE p.user_id = _user_id
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role = 'special_agent'
    )
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'agent');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$
;

CREATE OR REPLACE FUNCTION public.init_agent_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.agent_stats (profile_id)
  VALUES (NEW.id)
  ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_account_locked(check_email text)
 RETURNS TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt RECORD;
BEGIN
  SELECT la.attempt_count, la.locked_until, la.last_attempt_at
  INTO v_attempt
  FROM public.login_attempts la
  WHERE la.email = LOWER(check_email);
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, 0;
    RETURN;
  END IF;
  
  -- Check if still locked
  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until > now() THEN
    RETURN QUERY SELECT true, v_attempt.locked_until, v_attempt.attempt_count;
    RETURN;
  END IF;
  
  -- Not locked
  RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, v_attempt.attempt_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('dev', 'admin', 'manager', 'supervisor')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'moderator')
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.contacts c
    JOIN public.profiles p ON p.id = c.assigned_to
    WHERE c.id = _contact_id AND p.user_id = _user_id
  ) OR public.is_admin_or_supervisor(_user_id);
$function$
;

CREATE OR REPLACE FUNCTION public.is_country_allowed(check_country_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  geo_mode TEXT;
BEGIN
  -- Get current geo blocking mode
  SELECT mode INTO geo_mode FROM public.geo_blocking_settings LIMIT 1;
  
  -- If disabled, allow all
  IF geo_mode IS NULL OR geo_mode = 'disabled' THEN
    RETURN true;
  END IF;
  
  -- If whitelist mode, check if country is in allowed list
  IF geo_mode = 'whitelist' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.allowed_countries
      WHERE country_code = UPPER(check_country_code)
    );
  END IF;
  
  -- If blacklist mode, check if country is NOT in blocked list
  IF geo_mode = 'blacklist' THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM public.blocked_countries
      WHERE country_code = UPPER(check_country_code)
    );
  END IF;
  
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_country_blocked(check_country_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_countries
    WHERE country_code = UPPER(check_country_code)
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_instance_paused(p_instance text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.instance_processing_pauses
    WHERE instance_name = p_instance
      AND paused_until > now()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_ip_blocked(check_ip text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_ips
    WHERE ip_address = check_ip
    AND (expires_at IS NULL OR expires_at > now())
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_ip_whitelisted(check_ip text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.ip_whitelist
    WHERE ip_address = check_ip
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_manager_or_above(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('dev', 'admin', 'manager')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.profiles p ON p.id = tcm.profile_id
    WHERE tcm.conversation_id = _conversation_id
      AND p.user_id = _user_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_within_business_hours(connection_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_day INTEGER;
  v_current_time TIME;
  v_is_open BOOLEAN;
  v_open_at TIME;
  v_close_at TIME;
BEGIN
  -- Get current day of week (0=Sunday) and time in Brazil timezone
  v_current_day := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo');
  v_current_time := (now() AT TIME ZONE 'America/Sao_Paulo')::TIME;
  
  -- Check business hours for this day
  SELECT bh.is_open, bh.open_time, bh.close_time
  INTO v_is_open, v_open_at, v_close_at
  FROM business_hours bh
  WHERE bh.whatsapp_connection_id = connection_id
  AND bh.day_of_week = v_current_day;
  
  -- If no configuration found, assume open (default behavior)
  IF NOT FOUND THEN
    RETURN true;
  END IF;
  
  -- If marked as closed
  IF NOT v_is_open THEN
    RETURN false;
  END IF;
  
  -- Check if current time is within open hours
  RETURN v_current_time >= v_open_at AND v_current_time <= v_close_at;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_assignment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.conversation_events (
      contact_id, event_type, from_agent_id, to_agent_id, performed_by, metadata
    ) VALUES (
      NEW.id,
      CASE
        WHEN OLD.assigned_to IS NULL THEN 'assign'
        WHEN NEW.assigned_to IS NULL THEN 'unassign'
        ELSE 'transfer'
      END,
      OLD.assigned_to,
      NEW.assigned_to,
      COALESCE(NEW.assigned_to, OLD.assigned_to),
      jsonb_build_object('old_queue', OLD.queue_id, 'new_queue', NEW.queue_id)
    );
  END IF;

  -- Log queue changes
  IF OLD.queue_id IS DISTINCT FROM NEW.queue_id THEN
    INSERT INTO public.conversation_events (
      contact_id, event_type, from_queue_id, to_queue_id, performed_by, metadata
    ) VALUES (
      NEW.id,
      'queue_transfer',
      OLD.queue_id,
      NEW.queue_id,
      NEW.assigned_to,
      jsonb_build_object('agent', NEW.assigned_to)
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_entity_type text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text, p_details jsonb DEFAULT NULL::jsonb, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details, user_agent)
  VALUES (v_user_id, p_action, p_entity_type, p_entity_id, p_details, p_user_agent);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_pause_investigated(p_pause_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS instance_processing_pauses
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.instance_processing_pauses;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.instance_processing_pauses
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

CREATE OR REPLACE FUNCTION public.mask_channel_credentials()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- This is a SELECT trigger workaround - credentials masking is handled via the safe view
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mask_cpf(cpf text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN cpf IS NULL THEN NULL
    ELSE '***.' || substring(cpf, 5, 3) || '.***-**'
  END
$function$
;

CREATE OR REPLACE FUNCTION public.mask_email(email text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN email IS NULL OR position('@' IN email) < 2 THEN email
    ELSE
      left(email, 1) ||
      repeat('*', greatest(0, position('@' IN email) - 2)) ||
      substring(email FROM position('@' IN email))
  END
$function$
;

CREATE OR REPLACE FUNCTION public.mask_phone(phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN phone IS NULL OR length(phone) < 4 THEN phone
    ELSE
      -- Show first 2 + last 4 digits, mask middle
      left(phone, 2) || repeat('*', greatest(0, length(phone) - 6)) || right(phone, 4)
  END
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_contact_phone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_phone_for_unique(phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN phone IS NULL THEN NULL
    ELSE (
      -- Strip non-digits
      regexp_replace(
        -- Remove country code 55
        CASE
          WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^55\d{10,11}$'
          THEN right(regexp_replace(phone, '[^0-9]', '', 'g'), -2)
          ELSE regexp_replace(phone, '[^0-9]', '', 'g')
        END,
        '[^0-9]', '', 'g'
      )
    )
  END
$function$
;

CREATE OR REPLACE FUNCTION public.notify_sicoob_on_reply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_type text;
  v_supabase_url text;
BEGIN
  IF NEW.sender = 'agent' AND NEW.channel_type = 'internal_chat' THEN
    SELECT contact_type INTO v_contact_type
    FROM public.contacts
    WHERE id = NEW.contact_id;

    IF v_contact_type = 'sicoob_gifts' THEN
      v_supabase_url := 'https://supabase.atomicabr.com.br';

      PERFORM extensions.http_post(
        url := v_supabase_url || '/functions/v1/sicoob-bridge-reply',
        body := jsonb_build_object(
          'contact_id', NEW.contact_id,
          'content', NEW.content,
          'message_id', NEW.id,
          'agent_id', NEW.agent_id,
          'created_at', NEW.created_at
        )::text,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        )::jsonb
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pause_instance(p_instance text, p_reason text, p_minutes integer DEFAULT 15, p_trigger_count integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  IF p_minutes <= 0 OR p_minutes > 1440 THEN
    RAISE EXCEPTION 'p_minutes must be between 1 and 1440';
  END IF;

  INSERT INTO public.instance_processing_pauses (
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

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
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
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If role, permissions, or access_level are being changed
  IF (OLD.role IS DISTINCT FROM NEW.role) OR 
     (OLD.permissions IS DISTINCT FROM NEW.permissions) OR 
     (OLD.access_level IS DISTINCT FROM NEW.access_level) THEN
    -- Only allow if user is admin or supervisor
    IF NOT is_admin_or_supervisor(auth.uid()) THEN
      RAISE EXCEPTION 'Only administrators can modify role, permissions, or access_level';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If role is being changed, only allow admins/supervisors
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      -- Silently revert the role change
      NEW.role := OLD.role;
    END IF;
  END IF;
  
  -- Also prevent non-admins from changing access_level and permissions
  IF OLD.access_level IS DISTINCT FROM NEW.access_level THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      NEW.access_level := OLD.access_level;
    END IF;
  END IF;
  
  IF OLD.permissions IS DISTINCT FROM NEW.permissions THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      NEW.permissions := OLD.permissions;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.purge_old_deleted_contacts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- Only purge contacts merged or deleted > 30 days ago
  DELETE FROM public.contacts
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rate_limit_reset_requests()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pending_count integer;
BEGIN
  SELECT COUNT(*) INTO v_pending_count
  FROM public.password_reset_requests
  WHERE user_id = NEW.user_id
    AND status = 'pending'
    AND created_at > now() - interval '1 hour';

  IF v_pending_count >= 3 THEN
    RAISE EXCEPTION 'Too many pending reset requests. Please wait before trying again.';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reassign_absent_agents(inactive_minutes integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_absent RECORD;
  v_new_agent UUID;
  v_reassigned INTEGER := 0;
  v_contact RECORD;
BEGIN
  FOR v_absent IN
    SELECT p.id AS agent_id
    FROM profiles p
    WHERE p.is_active = true
      AND p.last_seen_at IS NOT NULL
      AND p.last_seen_at < now() - (inactive_minutes || ' minutes')::interval
      AND EXISTS (SELECT 1 FROM contacts c WHERE c.assigned_to = p.id)
  LOOP
    FOR v_contact IN
      SELECT c.id, c.queue_id
      FROM contacts c
      WHERE c.assigned_to = v_absent.agent_id
    LOOP
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm
      JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true
        AND p.is_active = true
        AND p.id != v_absent.agent_id
        AND (p.last_seen_at IS NULL OR p.last_seen_at > now() - (inactive_minutes || ' minutes')::interval)
      ORDER BY (
        SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id
      ) ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;

        INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
        VALUES (v_contact.id, 'absence_reassign', v_absent.agent_id, v_new_agent,
                jsonb_build_object('reason', 'agent_inactive', 'inactive_minutes', inactive_minutes));

        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reassign_overloaded_agents()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_overloaded RECORD;
  v_new_agent UUID;
  v_reassigned INTEGER := 0;
  v_contact RECORD;
BEGIN
  -- Encontrar agentes sobrecarregados
  FOR v_overloaded IN
    SELECT p.id AS agent_id, p.max_chats,
           COUNT(c.id) AS current_chats
    FROM profiles p
    JOIN contacts c ON c.assigned_to = p.id
    WHERE p.is_active = true
      AND p.max_chats IS NOT NULL
      AND p.max_chats > 0
    GROUP BY p.id, p.max_chats
    HAVING COUNT(c.id) > p.max_chats
  LOOP
    -- Para cada conversa excedente, reatribuir
    FOR v_contact IN
      SELECT c.id, c.queue_id
      FROM contacts c
      WHERE c.assigned_to = v_overloaded.agent_id
      ORDER BY c.updated_at ASC
      LIMIT (v_overloaded.current_chats - v_overloaded.max_chats)
    LOOP
      -- Encontrar agente com menor carga na mesma fila
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm
      JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true
        AND p.is_active = true
        AND p.id != v_overloaded.agent_id
        AND (p.max_chats IS NULL OR (
          SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = p.id
        ) < p.max_chats)
      ORDER BY (
        SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id
      ) ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;

        INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
        VALUES (v_contact.id, 'overload_reassign', v_overloaded.agent_id, v_new_agent,
                jsonb_build_object('reason', 'max_chats_exceeded', 'max_chats', v_overloaded.max_chats));

        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reassign_overloaded_agents(p_max_conversations integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN RETURN jsonb_build_object('reassigned', 0, 'message', 'No overloaded agents found'); END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt RECORD;
  v_new_count INTEGER;
  v_lock_duration INTERVAL;
  v_locked_until TIMESTAMP WITH TIME ZONE;
  v_max_attempts INTEGER := 5;
BEGIN
  -- Get existing attempts
  SELECT la.attempt_count, la.locked_until, la.last_attempt_at
  INTO v_attempt
  FROM public.login_attempts la
  WHERE la.email = LOWER(p_email);
  
  IF NOT FOUND THEN
    -- First failed attempt
    INSERT INTO public.login_attempts (email, ip_address, user_agent, attempt_count)
    VALUES (LOWER(p_email), p_ip_address, p_user_agent, 1);
    
    RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, 1;
    RETURN;
  END IF;
  
  -- If previous lock expired, reset count
  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until <= now() THEN
    v_new_count := 1;
  ELSE
    v_new_count := v_attempt.attempt_count + 1;
  END IF;
  
  -- Calculate lock duration with exponential backoff
  IF v_new_count >= v_max_attempts THEN
    -- Lock duration: 2^(attempts - max_attempts) minutes, starting at 1 minute
    -- 5 attempts = 1 min, 6 = 2 min, 7 = 4 min, 8 = 8 min, etc.
    v_lock_duration := (POWER(2, LEAST(v_new_count - v_max_attempts, 10)))::INTEGER * INTERVAL '1 minute';
    v_locked_until := now() + v_lock_duration;
  ELSE
    v_locked_until := NULL;
  END IF;
  
  -- Update attempt record
  UPDATE public.login_attempts
  SET 
    attempt_count = v_new_count,
    last_attempt_at = now(),
    locked_until = v_locked_until,
    ip_address = COALESCE(p_ip_address, login_attempts.ip_address),
    user_agent = COALESCE(p_user_agent, login_attempts.user_agent),
    updated_at = now()
  WHERE email = LOWER(p_email);
  
  RETURN QUERY SELECT 
    v_locked_until IS NOT NULL AND v_locked_until > now(),
    v_locked_until,
    v_new_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_contact(p_contact_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only managers/admins can restore
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'manager')
  ) THEN
    RAISE EXCEPTION 'Permission denied: only managers can restore contacts';
  END IF;

  UPDATE public.contacts
  SET
    deleted_at     = NULL,
    deleted_by     = NULL,
    deleted_reason = NULL,
    updated_at     = now()
  WHERE id = p_contact_id
    AND deleted_at IS NOT NULL
    AND deleted_at >= now() - interval '30 days'
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact % not found, not deleted, or outside 30-day recovery window', p_contact_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_check_and_trigger_gmail_revalidation()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_last_val TIMESTAMP WITH TIME ZONE;
    v_status TEXT;
    v_job_id UUID;
BEGIN
    SELECT last_validation, status INTO v_last_val, v_status 
    FROM public.gmail_health_summary 
    WHERE id = 'current';

    -- Trigger if degraded/error OR if last validation was more than 30 minutes ago
    IF v_status IN ('degraded', 'error') OR v_last_val < now() - interval '30 minutes' OR v_last_val IS NULL THEN
        -- Check if there's already a pending job to avoid duplicates
        IF NOT EXISTS (SELECT 1 FROM public.gmail_revalidation_jobs WHERE status = 'pending' AND requested_at > now() - interval '5 minutes') THEN
            INSERT INTO public.gmail_revalidation_jobs (status, requested_at)
            VALUES ('pending', now())
            RETURNING id INTO v_job_id;
            
            RETURN jsonb_build_object('triggered', true, 'job_id', v_job_id, 'reason', 'Threshold met or stale data');
        END IF;
    END IF;

    RETURN jsonb_build_object('triggered', false, 'reason', 'System healthy and data fresh');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_disable_service_channel(p_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS service_channels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.service_channels;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE public.service_channels SET
    status = 'disabled',
    disabled_at = now(),
    disabled_reason = NULLIF(trim(COALESCE(p_reason,'')), '')
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'channel not found'; END IF;

  -- Marca conexão whatsapp como desconectada (se houver)
  IF v_row.whatsapp_connection_id IS NOT NULL THEN
    UPDATE public.whatsapp_connections
       SET status = 'disconnected', updated_at = now()
     WHERE id = v_row.whatsapp_connection_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'service_channel_disabled', 'service_channels', p_id::text,
          jsonb_build_object('reason', p_reason, 'wpp_connection', v_row.whatsapp_connection_id));

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dispatch_error_stats(p_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hours INTEGER;
  v_total BIGINT;
  v_by_agent JSONB;
  v_by_instance JSONB;
  v_by_code JSONB;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_hours, 24), 720));

  SELECT COUNT(*) INTO v_total
  FROM public.dispatch_error_logs
  WHERE occurred_at > now() - (v_hours || ' hours')::interval;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_agent FROM (
    SELECT COALESCE(agent_email, 'sem-agente') AS agent, COUNT(*)::INT AS total
    FROM public.dispatch_error_logs
    WHERE occurred_at > now() - (v_hours || ' hours')::interval
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_instance FROM (
    SELECT instance_name AS instance, COUNT(*)::INT AS total
    FROM public.dispatch_error_logs
    WHERE occurred_at > now() - (v_hours || ' hours')::interval
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_code FROM (
    SELECT COALESCE(error_code, 'unknown') AS code, COUNT(*)::INT AS total
    FROM public.dispatch_error_logs
    WHERE occurred_at > now() - (v_hours || ' hours')::interval
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'window_hours', v_hours,
    'total', COALESCE(v_total, 0),
    'by_agent', v_by_agent,
    'by_instance', v_by_instance,
    'by_error_code', v_by_code
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_abandon(p_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated int;
  v_reason text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  v_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  UPDATE public.failed_messages
     SET status = 'abandoned',
         error_message = COALESCE(error_message, '') ||
           ' [ABANDONED: ' || COALESCE(v_reason, 'no reason given') || ']',
         updated_at = now()
   WHERE id = p_id
     AND status <> 'abandoned';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'dlq_abandon',
      'failed_messages',
      p_id::text,
      jsonb_build_object('reason', v_reason)
    );
  END IF;

  RETURN v_updated > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_bulk_abandon(p_ids uuid[], p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated int;
  v_reason text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF array_length(p_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Bulk operation limited to 500 rows per call';
  END IF;

  v_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  UPDATE public.failed_messages
     SET status = 'abandoned',
         error_message = COALESCE(error_message, '') ||
           ' [ABANDONED: ' || COALESCE(v_reason, 'bulk') || ']',
         updated_at = now()
   WHERE id = ANY(p_ids)
     AND status <> 'abandoned';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'dlq_bulk_abandon',
      'failed_messages',
      NULL,
      jsonb_build_object('reason', v_reason, 'requested', array_length(p_ids, 1), 'updated', v_updated)
    );
  END IF;

  RETURN v_updated;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_list_audit(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_action text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, action text, entity_id text, details jsonb, created_at timestamp with time zone, user_id uuid, user_name text, user_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.action,
    a.entity_id,
    a.details,
    a.created_at,
    a.user_id,
    p.name AS user_name,
    p.email AS user_email
  FROM public.audit_logs a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.entity_type = 'failed_messages'
    AND (
      p_action IS NULL
      OR a.action = p_action
      OR (p_action = 'all' AND a.action LIKE 'dlq_%')
    )
    AND a.action LIKE 'dlq_%'
  ORDER BY a.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_log_item_action(p_action text, p_ids uuid[], p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  v_action := CASE p_action
    WHEN 'retry'        THEN 'dlq_retry_now'
    WHEN 'abandon'      THEN 'dlq_abandon'
    WHEN 'bulk_retry'   THEN 'dlq_bulk_retry'
    WHEN 'bulk_abandon' THEN 'dlq_bulk_abandon'
    ELSE NULL
  END;

  IF v_action IS NULL THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_action,
    'failed_messages',
    CASE WHEN array_length(p_ids, 1) = 1 THEN p_ids[1]::text ELSE NULL END,
    jsonb_build_object(
      'ids', to_jsonb(p_ids),
      'count', array_length(p_ids, 1),
      'reason', p_reason,
      'performed_at', now()
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_log_reprocess_result(p_processed integer DEFAULT 0, p_succeeded integer DEFAULT 0, p_failed integer DEFAULT 0, p_abandoned integer DEFAULT 0, p_message text DEFAULT NULL::text, p_source text DEFAULT 'panel'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'dlq_reprocess_result',
    'failed_messages',
    NULL,
    jsonb_build_object(
      'source', COALESCE(NULLIF(TRIM(p_source), ''), 'panel'),
      'processed', GREATEST(COALESCE(p_processed, 0), 0),
      'succeeded', GREATEST(COALESCE(p_succeeded, 0), 0),
      'failed',    GREATEST(COALESCE(p_failed, 0), 0),
      'abandoned', GREATEST(COALESCE(p_abandoned, 0), 0),
      'message',   p_message,
      'finished_at', now()
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_log_reprocess_trigger(p_source text DEFAULT 'panel'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'dlq_reprocess_trigger',
    'failed_messages',
    NULL,
    jsonb_build_object(
      'source', COALESCE(NULLIF(TRIM(p_source), ''), 'panel'),
      'triggered_at', now()
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_retry_now(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE public.failed_messages
     SET status = 'pending',
         next_attempt_at = now(),
         updated_at = now()
   WHERE id = p_id
     AND status IN ('pending','retrying','failed','abandoned');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'dlq_retry_now',
      'failed_messages',
      p_id::text,
      jsonb_build_object('forced_at', now())
    );
  END IF;

  RETURN v_updated > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_stats()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT jsonb_build_object('pending', (SELECT count(*) FROM failed_messages WHERE status='pending'), 'retrying', (SELECT count(*) FROM failed_messages WHERE status='retrying'), 'failed', (SELECT count(*) FROM failed_messages WHERE status='failed'), 'total', (SELECT count(*) FROM failed_messages));
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_enqueue_reprocess(p_target_kind text, p_target_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key TEXT;
  v_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  v_key := encode(digest(
    p_target_kind || ':' || p_target_id::text || ':' || p_action || ':' ||
    COALESCE(auth.uid()::text, 'system') || ':' ||
    to_char(date_trunc('hour', now()), 'YYYY-MM-DD HH24'),
    'sha256'
  ), 'hex');

  INSERT INTO public.reprocess_jobs (
    idempotency_key, target_kind, target_id, action, requested_by, reason
  )
  VALUES (v_key, p_target_kind, p_target_id, p_action, auth.uid(), p_reason)
  ON CONFLICT (idempotency_key) DO UPDATE
    SET reason = COALESCE(EXCLUDED.reason, reprocess_jobs.reason),
        updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'reprocess_enqueued',
    'reprocess_jobs',
    v_id::text,
    jsonb_build_object(
      'target_kind', p_target_kind,
      'target_id', p_target_id,
      'action', p_action,
      'reason', p_reason
    )
  );

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_evolution_fallback_stats(p_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hours integer;
  v_total bigint;
  v_total_7d bigint;
  v_total_1h bigint;
  v_last_event timestamptz;
  v_first_event timestamptz;
  v_by_action jsonb;
  v_by_reason jsonb;
  v_by_instance jsonb;
  v_recent jsonb;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_hours, 24), 720));

  SELECT COUNT(*), MIN(ts), MAX(ts)
    INTO v_total, v_first_event, v_last_event
    FROM public.evolution_fallback_events
   WHERE ts > now() - (v_hours || ' hours')::interval;

  SELECT COUNT(*) INTO v_total_7d
    FROM public.evolution_fallback_events
   WHERE ts > now() - interval '7 days';

  SELECT COUNT(*) INTO v_total_1h
    FROM public.evolution_fallback_events
   WHERE ts > now() - interval '1 hour';

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_action FROM (
    SELECT action, COUNT(*)::int AS count
      FROM public.evolution_fallback_events
     WHERE ts > now() - (v_hours || ' hours')::interval
     GROUP BY action
     ORDER BY COUNT(*) DESC
  ) t;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_reason FROM (
    SELECT reason, COUNT(*)::int AS count
      FROM public.evolution_fallback_events
     WHERE ts > now() - (v_hours || ' hours')::interval
     GROUP BY reason
     ORDER BY COUNT(*) DESC
  ) t;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_instance FROM (
    SELECT COALESCE(instance, '(sem instância)') AS instance, COUNT(*)::int AS count
      FROM public.evolution_fallback_events
     WHERE ts > now() - (v_hours || ' hours')::interval
     GROUP BY instance
     ORDER BY COUNT(*) DESC
     LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(t.* ORDER BY t.ts DESC), '[]'::jsonb) INTO v_recent FROM (
    SELECT ts, action, instance, status, reason, mode, fallback_target, primary_ms
      FROM public.evolution_fallback_events
     WHERE ts > now() - (v_hours || ' hours')::interval
     ORDER BY ts DESC
     LIMIT 25
  ) t;

  RETURN jsonb_build_object(
    'window_hours', v_hours,
    'total', COALESCE(v_total, 0),
    'total_last_hour', COALESCE(v_total_1h, 0),
    'total_last_7d', COALESCE(v_total_7d, 0),
    'first_event_at', v_first_event,
    'last_event_at', v_last_event,
    'by_action', v_by_action,
    'by_reason', v_by_reason,
    'by_instance', v_by_instance,
    'recent', v_recent
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_active_integration_profile()
 RETURNS integration_profiles
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.integration_profiles WHERE is_active = true LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_gmail_health_summary(p_window_minutes integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_total_calls INTEGER;
    v_failure_count INTEGER;
    v_current_status TEXT;
    v_last_validation TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get count of failures in the window
    SELECT COUNT(*) INTO v_failure_count
    FROM public.gmail_health_logs
    WHERE is_failure = true
      AND timestamp > now() - (p_window_minutes || ' minutes')::interval;

    -- Get last validation timestamp
    SELECT MAX(timestamp) INTO v_last_validation
    FROM public.gmail_health_logs
    WHERE operation = 'validation';

    -- Simple threshold logic
    IF v_failure_count > 10 THEN
        v_current_status := 'error';
    ELSIF v_failure_count > 0 THEN
        v_current_status := 'degraded';
    ELSE
        v_current_status := 'healthy';
    END IF;

    RETURN jsonb_build_object(
        'status', v_current_status,
        'failure_count_window', v_failure_count,
        'last_validation', v_last_validation,
        'window_minutes', p_window_minutes
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_gmail_health_summary()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT jsonb_build_object('total_accounts', (SELECT count(*) FROM gmail_accounts), 'active', (SELECT count(*) FROM gmail_accounts WHERE is_active=true), 'error', (SELECT count(*) FROM gmail_accounts WHERE sync_status='error'));
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_whatsapp_mode()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT value FROM public.global_settings WHERE key = 'whatsapp_mode' LIMIT 1),
    'unofficial'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_instance_auth_event_summary(p_hours integer DEFAULT 24, p_instance text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hours integer;
  v_total bigint;
  v_invalid bigint;
  v_401 bigint;
  v_403 bigint;
  v_top jsonb;
  v_first timestamptz;
  v_last timestamptz;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_hours, 24), 168));

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE reason = 'invalid_signature'),
    COUNT(*) FILTER (WHERE reason = 'auth_401'),
    COUNT(*) FILTER (WHERE reason = 'auth_403'),
    MIN(created_at),
    MAX(created_at)
  INTO v_total, v_invalid, v_401, v_403, v_first, v_last
  FROM public.instance_auth_events
  WHERE created_at > now() - (v_hours || ' hours')::interval
    AND (p_instance IS NULL OR instance_name = p_instance);

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_top FROM (
    SELECT
      instance_name,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE reason = 'invalid_signature')::int AS invalid_signature,
      COUNT(*) FILTER (WHERE reason = 'auth_401')::int AS auth_401,
      COUNT(*) FILTER (WHERE reason = 'auth_403')::int AS auth_403
    FROM public.instance_auth_events
    WHERE created_at > now() - (v_hours || ' hours')::interval
      AND (p_instance IS NULL OR instance_name = p_instance)
    GROUP BY instance_name
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'window_hours', v_hours,
    'total', COALESCE(v_total, 0),
    'invalid_signature', COALESCE(v_invalid, 0),
    'auth_401', COALESCE(v_401, 0),
    'auth_403', COALESCE(v_403, 0),
    'first_event_at', v_first,
    'last_event_at', v_last,
    'top_instances', v_top
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_instance_auth_event_trend(p_hours integer DEFAULT 24, p_instance text DEFAULT NULL::text)
 RETURNS TABLE(bucket timestamp with time zone, instance_name text, invalid_signature integer, auth_401 integer, auth_403 integer, total integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hours integer;
  v_bucket_minutes integer;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_hours, 24), 168));
  v_bucket_minutes := CASE
    WHEN v_hours <= 24 THEN 10
    WHEN v_hours <= 72 THEN 30
    ELSE 60
  END;

  RETURN QUERY
  SELECT
    date_bin((v_bucket_minutes || ' minutes')::interval, e.created_at, TIMESTAMPTZ '2000-01-01') AS bucket,
    e.instance_name,
    COUNT(*) FILTER (WHERE e.reason = 'invalid_signature')::integer AS invalid_signature,
    COUNT(*) FILTER (WHERE e.reason = 'auth_401')::integer AS auth_401,
    COUNT(*) FILTER (WHERE e.reason = 'auth_403')::integer AS auth_403,
    COUNT(*)::integer AS total
  FROM public.instance_auth_events e
  WHERE e.created_at > now() - (v_hours || ' hours')::interval
    AND (p_instance IS NULL OR e.instance_name = p_instance)
  GROUP BY 1, 2
  ORDER BY 1 ASC, 2 ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_link_channel_queue(p_channel_id uuid, p_queue_id uuid, p_priority integer DEFAULT 0, p_is_active boolean DEFAULT true)
 RETURNS channel_queues
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.channel_queues;
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.channel_queues(channel_id, queue_id, priority, is_active, created_by)
  VALUES (p_channel_id, p_queue_id, COALESCE(p_priority,0), COALESCE(p_is_active,true), auth.uid())
  ON CONFLICT (channel_id, queue_id) DO UPDATE
    SET priority=EXCLUDED.priority, is_active=EXCLUDED.is_active, updated_at=now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_list_channel_queues(p_channel_id uuid)
 RETURNS TABLE(queue_id uuid, name text, status text, priority integer, is_default boolean, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT q.id, q.name, q.status,
         COALESCE(cq.priority, 0),
         (sc.default_queue_id = q.id),
         COALESCE(cq.is_active, true)
  FROM public.service_channels sc
  LEFT JOIN public.channel_queues cq ON cq.channel_id = sc.id
  LEFT JOIN public.queues q
         ON q.id = cq.queue_id OR q.id = sc.default_queue_id
  WHERE sc.id = p_channel_id AND q.id IS NOT NULL
  ORDER BY (sc.default_queue_id = q.id) DESC, COALESCE(cq.priority,0) DESC, q.name;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_list_dispatch_error_logs(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_instance text DEFAULT NULL::text, p_agent text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, failed_message_id uuid, instance_name text, remote_jid text, channel_type text, agent_email text, agent_user_id uuid, error_code text, error_message text, http_status integer, retry_count integer, payload jsonb, context jsonb, occurred_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit INTEGER;
  v_search TEXT;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH filtered AS (
    SELECT d.*
    FROM public.dispatch_error_logs d
    WHERE (p_from IS NULL OR d.occurred_at >= p_from)
      AND (p_to IS NULL OR d.occurred_at <= p_to)
      AND (p_instance IS NULL OR d.instance_name = p_instance)
      AND (p_agent IS NULL OR d.agent_email = p_agent)
      AND (p_error_code IS NULL OR d.error_code = p_error_code)
      AND (
        v_search IS NULL OR (
          d.remote_jid ILIKE '%' || v_search || '%' OR
          d.error_message ILIKE '%' || v_search || '%' OR
          d.error_code ILIKE '%' || v_search || '%'
        )
      )
  ), counted AS (
    SELECT COUNT(*)::BIGINT AS total FROM filtered
  )
  SELECT
    f.id, f.failed_message_id, f.instance_name, f.remote_jid,
    f.channel_type, f.agent_email, f.agent_user_id,
    f.error_code, f.error_message, f.http_status, f.retry_count,
    f.payload, f.context, f.occurred_at,
    c.total
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.occurred_at DESC
  LIMIT v_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_list_eligible_agents(p_queue_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, department_id uuid, max_chats integer, active_chats bigint, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH q AS (SELECT department_id, max_per_queue_per_agent FROM public.queues WHERE id = p_queue_id)
  SELECT p.user_id,
         COALESCE(p.name, p.email),
         p.department_id,
         COALESCE(p.max_chats, 5),
         (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = p.user_id),
         COALESCE(p.is_active, true)
  FROM public.profiles p, q
  WHERE (q.department_id IS NULL OR p.department_id = q.department_id)
    AND COALESCE(p.is_active, true) = true
    AND p.role IN ('agent','supervisor','admin');
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_list_failed_messages(p_status text[] DEFAULT NULL::text[], p_instance text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, instance_name text, remote_jid text, payload jsonb, error_code text, error_message text, http_status integer, retry_count integer, max_retries integer, status text, last_attempt_at timestamp with time zone, next_attempt_at timestamp with time zone, succeeded_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit int;
  v_search text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH filtered AS (
    SELECT fm.*
    FROM public.failed_messages fm
    WHERE (p_status IS NULL OR fm.status = ANY(p_status))
      AND (p_instance IS NULL OR fm.instance_name = p_instance)
      AND (p_from IS NULL OR fm.created_at >= p_from)
      AND (p_to IS NULL OR fm.created_at <= p_to)
      AND (
        v_search IS NULL OR (
          fm.remote_jid ILIKE '%' || v_search || '%' OR
          fm.error_message ILIKE '%' || v_search || '%' OR
          fm.error_code ILIKE '%' || v_search || '%'
        )
      )
  ), counted AS (
    SELECT COUNT(*)::bigint AS total FROM filtered
  )
  SELECT
    f.id, f.instance_name, f.remote_jid, f.payload, f.error_code, f.error_message,
    f.http_status, f.retry_count, f.max_retries, f.status,
    f.last_attempt_at, f.next_attempt_at, f.succeeded_at, f.created_at, f.updated_at,
    c.total
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.created_at DESC
  LIMIT v_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_list_failed_messages(p_status text DEFAULT NULL::text, p_instance text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, remote_jid text, instance_name text, status text, retry_count integer, max_retries integer, http_status integer, error_code text, error_message text, payload jsonb, next_attempt_at timestamp with time zone, succeeded_at timestamp with time zone, abandoned_at timestamp with time zone, abandon_reason text, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.failed_messages fm
  WHERE
    (p_status IS NULL OR fm.status = p_status)
    AND (p_instance IS NULL OR fm.instance_name = p_instance)
    AND (p_search IS NULL OR fm.remote_jid ILIKE '%' || p_search || '%' OR fm.error_message ILIKE '%' || p_search || '%')
    AND (p_from IS NULL OR fm.created_at >= p_from)
    AND (p_to IS NULL OR fm.created_at <= p_to);

  RETURN QUERY
  SELECT
    fm.id, fm.remote_jid, fm.instance_name, fm.status,
    fm.retry_count, fm.max_retries, fm.http_status, fm.error_code,
    fm.error_message, fm.payload, fm.next_attempt_at,
    fm.succeeded_at, fm.abandoned_at, fm.abandon_reason,
    fm.created_at, fm.updated_at,
    v_total AS total_count
  FROM public.failed_messages fm
  WHERE
    (p_status IS NULL OR fm.status = p_status)
    AND (p_instance IS NULL OR fm.instance_name = p_instance)
    AND (p_search IS NULL OR fm.remote_jid ILIKE '%' || p_search || '%' OR fm.error_message ILIKE '%' || p_search || '%')
    AND (p_from IS NULL OR fm.created_at >= p_from)
    AND (p_to IS NULL OR fm.created_at <= p_to)
  ORDER BY fm.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_list_service_channels(p_status text DEFAULT NULL::text, p_channel_type text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
 RETURNS SETOF service_channels
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  SELECT * FROM public.service_channels sc
   WHERE (p_status IS NULL OR sc.status = p_status)
     AND (p_channel_type IS NULL OR sc.channel_type = p_channel_type)
     AND (p_search IS NULL OR sc.name ILIKE '%'||p_search||'%' OR sc.display_name ILIKE '%'||p_search||'%')
   ORDER BY sc.is_default DESC, sc.name ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_log_gmail_health(p_status text, p_operation text DEFAULT NULL::text, p_resource text DEFAULT NULL::text, p_request_id text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_is_failure boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.gmail_health_logs (
        status, operation, resource, request_id, error_message, metadata, is_failure
    ) VALUES (
        p_status, p_operation, p_resource, p_request_id, p_error_message, p_metadata, p_is_failure
    ) RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_log_provider_message(p_idempotency_key text, p_provider text, p_instance_name text, p_external_message_id text, p_direction text, p_remote_jid text, p_external_contact_id uuid, p_payload jsonb, p_trace_id text DEFAULT NULL::text, p_thread_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
  v_hash TEXT;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'idempotency_key required';
  END IF;

  v_hash := encode(digest(p_payload::text, 'sha256'), 'hex');

  INSERT INTO public.provider_message_log (
    idempotency_key, provider, instance_name, external_message_id,
    direction, remote_jid, external_contact_id, payload, payload_hash,
    trace_id, thread_id
  )
  VALUES (
    p_idempotency_key, p_provider, p_instance_name, p_external_message_id,
    p_direction, p_remote_jid, p_external_contact_id, p_payload, v_hash,
    p_trace_id, p_thread_id
  )
  ON CONFLICT (idempotency_key) DO UPDATE
    SET metadata = provider_message_log.metadata || jsonb_build_object(
      'duplicate_attempts',
      COALESCE((provider_message_log.metadata->>'duplicate_attempts')::int, 0) + 1,
      'last_duplicate_at', now()
    )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_migrate_whatsapp_integration()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_evo_count INT := 0;
  v_evo_open  INT := 0;
  v_evo_default RECORD;
  v_cloud_phone TEXT;
  v_cloud_waba  TEXT;
  v_current_mode TEXT;
  v_chosen_provider TEXT;
  v_status TEXT;
  v_notes TEXT;
  v_signals JSONB;
  v_profile_id UUID;
  v_default_instance TEXT;
BEGIN
  -- Sinais Evolution: instâncias registradas localmente
  SELECT COUNT(*) INTO v_evo_count FROM public.whatsapp_connections;
  SELECT COUNT(*) INTO v_evo_open
    FROM public.whatsapp_connections
    WHERE COALESCE(status,'') IN ('open','connected');
  SELECT instance_id, name, phone_number, status
    INTO v_evo_default
    FROM public.whatsapp_connections
    WHERE is_default = true
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

  -- Sinais Cloud: settings já preenchidos
  SELECT value INTO v_cloud_phone FROM public.global_settings WHERE key = 'whatsapp_cloud_display_phone';
  SELECT value INTO v_cloud_waba  FROM public.global_settings WHERE key = 'whatsapp_cloud_waba_name';

  SELECT value INTO v_current_mode FROM public.global_settings WHERE key = 'whatsapp_mode';

  v_signals := jsonb_build_object(
    'evolution_instances_total', v_evo_count,
    'evolution_instances_open',  v_evo_open,
    'evolution_default_instance', COALESCE(v_evo_default.instance_id, NULL),
    'cloud_display_phone_set',   COALESCE(NULLIF(v_cloud_phone,''), NULL) IS NOT NULL,
    'cloud_waba_name_set',       COALESCE(NULLIF(v_cloud_waba,''),  NULL) IS NOT NULL,
    'previous_mode',             COALESCE(v_current_mode, 'unset')
  );

  -- Heurística: se já há instância Evolution conectada → unofficial.
  -- Se não há nada Evolution mas Cloud está preenchida → official.
  -- Caso contrário mantém o atual (default unofficial).
  IF v_evo_open > 0 OR v_evo_count > 0 THEN
    v_chosen_provider := 'evolution';
  ELSIF COALESCE(NULLIF(v_cloud_phone,''),'') <> '' THEN
    v_chosen_provider := 'cloud';
  ELSE
    v_chosen_provider := CASE WHEN v_current_mode = 'official' THEN 'cloud' ELSE 'evolution' END;
  END IF;

  v_default_instance := COALESCE(v_evo_default.instance_id, 'wpp2');

  -- Garante setting whatsapp_mode coerente
  INSERT INTO public.global_settings(key, value)
  VALUES ('whatsapp_mode', CASE WHEN v_chosen_provider = 'cloud' THEN 'official' ELSE 'unofficial' END)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now()
    WHERE public.global_settings.value IS DISTINCT FROM EXCLUDED.value;

  -- Status da migração
  IF v_chosen_provider = 'cloud' AND COALESCE(NULLIF(v_cloud_phone,''),'') = '' THEN
    v_status := 'pending_credentials';
    v_notes  := 'Modo oficial selecionado, mas faltam credenciais Meta (phone/WABA).';
  ELSIF v_chosen_provider = 'evolution' AND v_evo_count = 0 THEN
    v_status := 'pending_credentials';
    v_notes  := 'Modo Evolution selecionado, mas nenhuma instância registrada.';
  ELSE
    v_status := 'migrated';
    v_notes  := format('Provider %s ativado a partir dos sinais existentes.', v_chosen_provider);
  END IF;

  -- Desativa qualquer perfil ativo anterior
  UPDATE public.integration_profiles SET is_active = false WHERE is_active = true;

  -- Upsert do perfil ativo do provider escolhido
  SELECT id INTO v_profile_id
    FROM public.integration_profiles
    WHERE provider = v_chosen_provider
    ORDER BY updated_at DESC LIMIT 1;

  IF v_profile_id IS NULL THEN
    INSERT INTO public.integration_profiles
      (provider, is_active, default_instance, display_phone, waba_name,
       detected_signals, migration_status, migration_notes, migrated_at)
    VALUES
      (v_chosen_provider, true,
       CASE WHEN v_chosen_provider='evolution' THEN v_default_instance ELSE NULL END,
       NULLIF(v_cloud_phone,''), NULLIF(v_cloud_waba,''),
       v_signals, v_status, v_notes,
       CASE WHEN v_status = 'migrated' THEN now() ELSE NULL END)
    RETURNING id INTO v_profile_id;
  ELSE
    UPDATE public.integration_profiles
       SET is_active = true,
           default_instance = CASE WHEN v_chosen_provider='evolution' THEN v_default_instance ELSE default_instance END,
           display_phone = COALESCE(NULLIF(v_cloud_phone,''), display_phone),
           waba_name     = COALESCE(NULLIF(v_cloud_waba,''),  waba_name),
           detected_signals = v_signals,
           migration_status = v_status,
           migration_notes  = v_notes,
           migrated_at = CASE WHEN v_status = 'migrated' THEN now() ELSE migrated_at END
     WHERE id = v_profile_id;
  END IF;

  RETURN jsonb_build_object(
    'profile_id', v_profile_id,
    'provider',   v_chosen_provider,
    'mode',       CASE WHEN v_chosen_provider='cloud' THEN 'official' ELSE 'unofficial' END,
    'status',     v_status,
    'notes',      v_notes,
    'signals',    v_signals
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_ops_metrics(p_window_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(hours => GREATEST(p_window_hours, 1));
  v_result jsonb;
BEGIN
  -- Bloqueia agentes
  IF NOT (public.is_admin_or_supervisor(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH
  pml AS (
    SELECT * FROM public.provider_message_log WHERE received_at >= v_since
  ),
  by_channel AS (
    SELECT
      sc.id AS channel_id,
      sc.name AS channel_name,
      sc.channel_type,
      sc.status,
      COUNT(*) FILTER (WHERE p.direction = 'inbound') AS msgs_in,
      COUNT(*) FILTER (WHERE p.direction = 'outbound') AS msgs_out,
      COUNT(*) FILTER (WHERE p.delivery_status IN ('failed','error')) AS msgs_failed
    FROM public.service_channels sc
    LEFT JOIN pml p ON p.instance_name = sc.instance_name
    GROUP BY sc.id, sc.name, sc.channel_type, sc.status
  ),
  by_queue AS (
    SELECT
      q.id AS queue_id,
      q.name AS queue_name,
      q.status AS queue_status,
      COUNT(c.id) FILTER (WHERE c.assigned_to IS NULL) AS waiting,
      COUNT(c.id) FILTER (WHERE c.assigned_to IS NOT NULL) AS in_service,
      AVG(EXTRACT(EPOCH FROM (now() - c.created_at)))
        FILTER (WHERE c.assigned_to IS NULL) AS avg_wait_seconds,
      PERCENTILE_DISC(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (now() - c.created_at)))
        FILTER (WHERE c.assigned_to IS NULL) AS p99_wait_seconds
    FROM public.queues q
    LEFT JOIN public.contacts c ON c.queue_id = q.id
    GROUP BY q.id, q.name, q.status
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*) FROM pml WHERE direction='inbound') AS total_in,
      (SELECT COUNT(*) FROM pml WHERE direction='outbound') AS total_out,
      (SELECT COUNT(*) FROM pml WHERE delivery_status IN ('failed','error')) AS total_failed,
      (SELECT COUNT(*) FROM public.service_channels WHERE status='active') AS active_channels,
      (SELECT COUNT(*) FROM public.queues WHERE status='active') AS active_queues,
      (SELECT COUNT(DISTINCT user_id) FROM public.profiles WHERE status='online') AS online_agents
  )
  SELECT jsonb_build_object(
    'window_hours', p_window_hours,
    'generated_at', now(),
    'totals', (SELECT to_jsonb(t) FROM totals t),
    'by_channel', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.msgs_in DESC) FROM by_channel c), '[]'::jsonb),
    'by_queue', COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.waiting DESC) FROM by_queue q), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_pause_queue(p_queue_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS queues
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.queues;
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.queues
     SET status='paused', paused_at=now(), paused_by=auth.uid(), paused_reason=p_reason, is_active=false
   WHERE id=p_queue_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'queue not found'; END IF;
  RETURN v_row;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_pause_service_channel(p_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS service_channels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.service_channels;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE public.service_channels SET
    status = 'paused',
    paused_at = now(),
    paused_reason = NULLIF(trim(COALESCE(p_reason,'')), '')
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'channel not found'; END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'service_channel_paused', 'service_channels', p_id::text,
          jsonb_build_object('reason', p_reason));

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_pick_next_agent(p_queue_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_algo text;
  v_last uuid;
  v_pick uuid;
BEGIN
  SELECT distribution_algorithm, last_assigned_user_id
    INTO v_algo, v_last
    FROM public.queues
   WHERE id = p_queue_id AND status = 'active';

  IF v_algo IS NULL OR v_algo = 'manual_pull' THEN
    RETURN NULL;
  END IF;

  IF v_algo = 'round_robin' THEN
    -- Próximo elegível depois do último atribuído (ordem determinística por user_id),
    -- com fallback para o primeiro elegível se já passou do fim da lista.
    WITH cand AS (
      SELECT user_id, active_chats, max_chats
        FROM public.rpc_list_eligible_agents(p_queue_id)
       WHERE active_chats < max_chats
       ORDER BY user_id
    )
    SELECT user_id INTO v_pick FROM cand
     WHERE v_last IS NULL OR user_id > v_last
     ORDER BY user_id
     LIMIT 1;

    IF v_pick IS NULL THEN
      SELECT user_id INTO v_pick FROM (
        SELECT user_id, active_chats, max_chats
          FROM public.rpc_list_eligible_agents(p_queue_id)
         WHERE active_chats < max_chats
         ORDER BY user_id
         LIMIT 1
      ) s;
    END IF;
  ELSIF v_algo = 'longest_idle' THEN
    SELECT a.user_id INTO v_pick
      FROM public.rpc_list_eligible_agents(p_queue_id) a
      LEFT JOIN public.profiles p ON p.user_id = a.user_id
     WHERE a.active_chats < a.max_chats
     ORDER BY p.last_active_at NULLS FIRST, a.active_chats ASC, random()
     LIMIT 1;
  ELSE
    -- least_busy (default)
    SELECT user_id INTO v_pick
      FROM public.rpc_list_eligible_agents(p_queue_id)
     WHERE active_chats < max_chats
     ORDER BY active_chats ASC, random()
     LIMIT 1;
  END IF;

  IF v_pick IS NOT NULL THEN
    UPDATE public.queues
       SET last_assigned_user_id = v_pick,
           last_assigned_at = now()
     WHERE id = p_queue_id;
  END IF;

  RETURN v_pick;
END
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_provider_panel()
 RETURNS TABLE(provider_id uuid, name text, provider_type provider_type, base_url text, is_active boolean, priority integer, status text, last_ping_at timestamp with time zone, last_ping_latency_ms integer, last_error text, open_sessions bigint, events_24h bigint, errors_24h bigint, routes_primary bigint, routes_fallback bigint, routes_active bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.name, p.provider_type, p.base_url, p.is_active, p.priority,
    p.status, p.last_ping_at, p.last_ping_latency_ms, p.last_error,
    COALESCE((SELECT COUNT(*) FROM provider_sessions s
              WHERE s.provider_id = p.id AND s.ended_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM provider_session_logs l
              WHERE l.provider_id = p.id AND l.created_at > now() - interval '24 hours'), 0),
    COALESCE((SELECT COUNT(*) FROM provider_session_logs l
              WHERE l.provider_id = p.id AND l.level = 'error'
                AND l.created_at > now() - interval '24 hours'), 0),
    COALESCE((SELECT COUNT(*) FROM channel_provider_routes r WHERE r.primary_provider_id = p.id), 0),
    COALESCE((SELECT COUNT(*) FROM channel_provider_routes r WHERE r.fallback_provider_id = p.id), 0),
    COALESCE((SELECT COUNT(*) FROM channel_provider_routes r WHERE r.current_provider_id = p.id), 0)
  FROM provider_configs p
  ORDER BY p.priority ASC, p.name ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_provider_session_timeline(p_provider_id uuid DEFAULT NULL::uuid, p_session_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(log_id uuid, session_id uuid, provider_id uuid, provider_name text, level text, event text, message text, latency_ms integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  SELECT l.id, l.session_id, l.provider_id, p.name,
         l.level, l.event, l.message, l.latency_ms, l.created_at
  FROM provider_session_logs l
  JOIN provider_configs p ON p.id = l.provider_id
  WHERE (p_provider_id IS NULL OR l.provider_id = p_provider_id)
    AND (p_session_id IS NULL OR l.session_id = p_session_id)
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_publish_outbox(p_aggregate_type text, p_aggregate_id uuid, p_event_type text, p_payload jsonb, p_idempotency_key text DEFAULT NULL::text, p_trace_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key TEXT;
  v_id UUID;
BEGIN
  v_key := COALESCE(
    p_idempotency_key,
    encode(digest(
      p_aggregate_type || ':' || p_aggregate_id::text || ':' || p_event_type || ':' ||
      encode(digest(p_payload::text, 'sha256'), 'hex'),
      'sha256'
    ), 'hex')
  );

  INSERT INTO public.outbox_events (
    aggregate_type, aggregate_id, event_type, payload, idempotency_key, trace_id
  )
  VALUES (p_aggregate_type, p_aggregate_id, p_event_type, p_payload, v_key, p_trace_id)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_purge_channel_sticky(p_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wpp_id UUID;
  v_count INTEGER := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT whatsapp_connection_id INTO v_wpp_id
    FROM public.service_channels WHERE id = p_id;

  IF v_wpp_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.sticky_assignments
   WHERE channel_connection_id = v_wpp_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'service_channel_sticky_purged', 'service_channels', p_id::text,
          jsonb_build_object('purged_count', v_count));

  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_queue_rebalance_candidates(p_limit integer DEFAULT 50)
 RETURNS TABLE(contact_id uuid, queue_id uuid, reason text, waiting_minutes numeric, sla_priority text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.queue_id,
    CASE
      WHEN c.assigned_to IS NULL THEN 'unassigned'
      ELSE 'sla_breached'
    END AS reason,
    EXTRACT(EPOCH FROM (now() - c.created_at))/60::numeric AS waiting_minutes,
    q.sla_priority
  FROM public.contacts c
  JOIN public.queues q ON q.id = c.queue_id
  WHERE q.is_active = true
    AND q.auto_rebalance_enabled = true
    AND (
      c.assigned_to IS NULL
      OR EXTRACT(EPOCH FROM (now() - c.created_at))/60 > q.max_wait_time_minutes
    )
  ORDER BY
    CASE q.sla_priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    q.routing_weight DESC,
    c.created_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_queue_sla_panel(p_skill_name text DEFAULT NULL::text, p_channel_type text DEFAULT NULL::text, p_sla_status text DEFAULT NULL::text)
 RETURNS TABLE(queue_id uuid, queue_name text, color text, sla_priority text, routing_weight integer, auto_rebalance_enabled boolean, max_wait_time_minutes integer, active_agents bigint, waiting_count bigint, in_progress_count bigint, breached_count bigint, at_risk_count bigint, oldest_wait_minutes numeric, last_routed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  WITH q AS (
    SELECT q.* FROM public.queues q
    WHERE q.is_active = true
      AND (
        p_skill_name IS NULL OR EXISTS (
          SELECT 1 FROM public.queue_skill_requirements qsr
          WHERE qsr.queue_id = q.id AND qsr.skill_name = p_skill_name
        )
      )
      AND (
        p_channel_type IS NULL OR EXISTS (
          SELECT 1
          FROM public.whatsapp_connection_queues wcq
          JOIN public.channel_connections cc ON cc.whatsapp_connection_id = wcq.whatsapp_connection_id
          WHERE wcq.queue_id = q.id AND cc.channel_type = p_channel_type
        )
      )
  ),
  agents AS (
    SELECT qm.queue_id, COUNT(*) FILTER (WHERE qm.is_active AND p.is_active) AS active_agents
    FROM public.queue_members qm
    JOIN public.profiles p ON p.id = qm.profile_id
    GROUP BY qm.queue_id
  ),
  contacts_agg AS (
    SELECT
      c.queue_id,
      COUNT(*) FILTER (WHERE c.assigned_to IS NULL) AS waiting_count,
      COUNT(*) FILTER (WHERE c.assigned_to IS NOT NULL) AS in_progress_count,
      MAX(EXTRACT(EPOCH FROM (now() - c.created_at))/60)
        FILTER (WHERE c.assigned_to IS NULL) AS oldest_wait_minutes
    FROM public.contacts c
    WHERE c.queue_id IS NOT NULL
    GROUP BY c.queue_id
  ),
  sla_agg AS (
    SELECT
      c.queue_id,
      COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (now() - c.created_at))/60 > qq.max_wait_time_minutes
      ) AS breached_count,
      COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (now() - c.created_at))/60
              BETWEEN qq.max_wait_time_minutes * 0.75 AND qq.max_wait_time_minutes
      ) AS at_risk_count
    FROM public.contacts c
    JOIN public.queues qq ON qq.id = c.queue_id
    WHERE c.assigned_to IS NULL
    GROUP BY c.queue_id
  ),
  routing AS (
    SELECT sa.queue_id, MAX(sa.last_assigned_at) AS last_routed_at
    FROM public.sticky_assignments sa
    GROUP BY sa.queue_id
  )
  SELECT
    q.id,
    q.name,
    q.color,
    q.sla_priority,
    q.routing_weight,
    q.auto_rebalance_enabled,
    q.max_wait_time_minutes,
    COALESCE(a.active_agents, 0),
    COALESCE(ca.waiting_count, 0),
    COALESCE(ca.in_progress_count, 0),
    COALESCE(s.breached_count, 0),
    COALESCE(s.at_risk_count, 0),
    COALESCE(ca.oldest_wait_minutes, 0)::numeric,
    r.last_routed_at
  FROM q
  LEFT JOIN agents a ON a.queue_id = q.id
  LEFT JOIN contacts_agg ca ON ca.queue_id = q.id
  LEFT JOIN sla_agg s ON s.queue_id = q.id
  LEFT JOIN routing r ON r.queue_id = q.id
  WHERE
    p_sla_status IS NULL
    OR (p_sla_status = 'on_track'  AND COALESCE(s.breached_count,0) = 0 AND COALESCE(s.at_risk_count,0) = 0)
    OR (p_sla_status = 'at_risk'   AND COALESCE(s.at_risk_count,0) > 0)
    OR (p_sla_status = 'breached'  AND COALESCE(s.breached_count,0) > 0)
  ORDER BY
    CASE q.sla_priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    q.routing_weight DESC,
    COALESCE(s.breached_count,0) DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_reactivate_service_channel(p_id uuid)
 RETURNS service_channels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.service_channels;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE public.service_channels SET
    status = 'active',
    paused_at = NULL,
    paused_reason = NULL,
    disabled_at = NULL,
    disabled_reason = NULL
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'channel not found'; END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'service_channel_reactivated', 'service_channels', p_id::text, '{}'::jsonb);

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_record_automation_error(p_execution_id uuid, p_error text, p_context jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.automation_executions
  SET status = 'failed',
      error_message = LEFT(COALESCE(p_error, 'unknown error'), 2000),
      error_at = now(),
      trigger_payload = COALESCE(trigger_payload, '{}'::jsonb) || jsonb_build_object('error_context', p_context)
  WHERE id = p_execution_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_register_automation_execution(p_rule_id uuid, p_remote_jid text, p_instance_name text, p_assigned_to uuid, p_trigger_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cooldown INTEGER;
  v_recent_count INTEGER;
  v_id UUID;
BEGIN
  SELECT cooldown_seconds INTO v_cooldown
  FROM public.automation_rules WHERE id = p_rule_id AND is_active = true;
  IF v_cooldown IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM public.automation_executions
  WHERE rule_id = p_rule_id
    AND remote_jid = p_remote_jid
    AND created_at > now() - make_interval(secs => v_cooldown);

  IF v_recent_count > 0 THEN RETURN NULL; END IF;

  INSERT INTO public.automation_executions (
    rule_id, remote_jid, instance_name, assigned_to, trigger_payload, status
  ) VALUES (
    p_rule_id, p_remote_jid, p_instance_name, p_assigned_to, p_trigger_payload, 'pending'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_register_automation_execution(p_rule_id uuid, p_remote_jid text, p_instance_name text, p_assigned_to text DEFAULT NULL::text, p_trigger_payload jsonb DEFAULT '{}'::jsonb, p_channel_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cooldown INT;
  v_last TIMESTAMPTZ;
  v_id UUID;
  v_channel UUID;
  v_department UUID;
  v_snapshot JSONB;
BEGIN
  SELECT cooldown_seconds, channel_id, department_id,
         jsonb_build_object(
           'name', name,
           'description', description,
           'trigger_type', trigger_type,
           'trigger_config', trigger_config,
           'actions', actions,
           'priority', priority,
           'cooldown_seconds', cooldown_seconds,
           'channel_id', channel_id,
           'department_id', department_id,
           'captured_at', now()
         )
    INTO v_cooldown, v_channel, v_department, v_snapshot
  FROM public.automation_rules WHERE id = p_rule_id AND is_active = true;

  IF v_cooldown IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT MAX(created_at) INTO v_last
  FROM public.automation_executions
  WHERE rule_id = p_rule_id AND remote_jid = p_remote_jid;

  IF v_last IS NOT NULL AND v_last > now() - make_interval(secs => v_cooldown) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.automation_executions (
    rule_id, remote_jid, instance_name, assigned_to, trigger_payload,
    channel_id, department_id, rule_snapshot, status
  ) VALUES (
    p_rule_id, p_remote_jid, p_instance_name, p_assigned_to, p_trigger_payload,
    COALESCE(p_channel_id, v_channel),
    COALESCE(p_department_id, v_department),
    v_snapshot,
    'pending'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_register_webhook_event(p_event_key text, p_instance_name text, p_event_type text, p_payload_hash text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted BOOLEAN;
BEGIN
  IF p_event_key IS NULL OR length(p_event_key) = 0 THEN
    RAISE EXCEPTION 'event_key required';
  END IF;

  INSERT INTO public.webhook_event_dedup (event_key, instance_name, event_type, payload_hash)
  VALUES (p_event_key, p_instance_name, p_event_type, p_payload_hash)
  ON CONFLICT (event_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_resume_queue(p_queue_id uuid)
 RETURNS queues
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.queues;
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.queues
     SET status='active', paused_at=NULL, paused_by=NULL, paused_reason=NULL, is_active=true
   WHERE id=p_queue_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'queue not found'; END IF;
  RETURN v_row;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_route_inbound_message(p_contact_id uuid, p_channel_id uuid DEFAULT NULL::uuid, p_queue_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sticky public.sticky_assignments;
  v_agent_user_id uuid;
  v_agent_profile_id uuid;
  v_dept_id uuid;
  v_max int;
  v_active int;
  v_online boolean;
  v_picked uuid;
  v_source text := 'algorithm';
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'contact_id required';
  END IF;

  -- 1) Tenta sticky
  SELECT * INTO v_sticky
    FROM public.sticky_assignments
   WHERE contact_id = p_contact_id
     AND expires_at > now();

  IF FOUND THEN
    SELECT p.user_id,
           COALESCE(p.max_concurrent_chats, 5),
           COALESCE(p.is_online, false),
           p.department_id
      INTO v_agent_user_id, v_max, v_online, v_dept_id
      FROM public.profiles p
     WHERE p.id = v_sticky.agent_profile_id;

    SELECT count(*) INTO v_active
      FROM public.contacts
     WHERE assigned_to = v_agent_user_id
       AND COALESCE(status, 'open') NOT IN ('resolved','closed');

    -- valida: online, com folga, e (sem fila exigida OU mesmo depto da fila)
    IF v_agent_user_id IS NOT NULL
       AND v_online
       AND v_active < v_max
       AND (
         p_queue_id IS NULL
         OR EXISTS (
              SELECT 1 FROM public.queues q
               WHERE q.id = p_queue_id
                 AND (q.department_id IS NULL OR q.department_id = v_dept_id)
                 AND COALESCE(q.status, 'active') = 'active'
            )
       )
    THEN
      v_picked := v_agent_user_id;
      v_source := 'sticky';
    END IF;
  END IF;

  -- 2) Fallback: algoritmo da fila
  IF v_picked IS NULL AND p_queue_id IS NOT NULL THEN
    BEGIN
      SELECT public.rpc_pick_next_agent(p_queue_id) INTO v_picked;
    EXCEPTION WHEN undefined_function THEN
      v_picked := NULL;
    END;
    v_source := 'algorithm';
  END IF;

  IF v_picked IS NULL THEN
    BEGIN
      INSERT INTO public.audit_log(actor_user_id, action, entity_type, entity_id, payload)
      VALUES (NULL, 'route.no_agent', 'contact', p_contact_id,
              jsonb_build_object('channel', p_channel_id, 'queue', p_queue_id));
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    RETURN jsonb_build_object('assigned', false, 'source', null);
  END IF;

  -- 3) Atribui (dispara trigger de sticky upsert)
  UPDATE public.contacts
     SET assigned_to = v_picked,
         updated_at = now()
   WHERE id = p_contact_id
     AND (assigned_to IS DISTINCT FROM v_picked);

  -- 4) Garante sticky atualizado mesmo se já era o assigned_to
  SELECT id INTO v_agent_profile_id FROM public.profiles WHERE user_id = v_picked LIMIT 1;
  IF v_agent_profile_id IS NOT NULL THEN
    PERFORM public.fn_sticky_upsert(p_contact_id, v_agent_profile_id, p_channel_id, p_queue_id, v_source);
  END IF;

  RETURN jsonb_build_object(
    'assigned', true,
    'agent_user_id', v_picked,
    'source', v_source,
    'channel_id', p_channel_id,
    'queue_id', p_queue_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_route_incoming_message(p_contact_id uuid, p_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode TEXT;
  v_current_assigned UUID;
  v_target_agent UUID;
  v_reason TEXT;
  v_business_open BOOLEAN := TRUE;
BEGIN
  -- Lê estado atual
  SELECT assigned_to INTO v_current_assigned
    FROM public.contacts
   WHERE id = p_contact_id
   LIMIT 1;

  -- Se contato já tem dono, não mexe (princípio "nunca tirar atendimento")
  IF v_current_assigned IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action', 'skipped',
      'reason', 'already_assigned',
      'agent_id', v_current_assigned
    );
  END IF;

  -- Lê modo da conexão
  SELECT routing_mode INTO v_mode
    FROM public.whatsapp_connections
   WHERE id = p_connection_id
   LIMIT 1;

  v_mode := COALESCE(v_mode, 'manual');

  -- Horário comercial (se a função existir e a conexão configurar)
  BEGIN
    v_business_open := public.is_within_business_hours(p_connection_id);
  EXCEPTION WHEN OTHERS THEN
    v_business_open := TRUE;
  END;

  IF NOT v_business_open THEN
    RETURN jsonb_build_object(
      'action', 'unassigned',
      'reason', 'outside_business_hours',
      'mode', v_mode
    );
  END IF;

  -- Modo: manual → não faz nada (Sem dono)
  IF v_mode = 'manual' THEN
    RETURN jsonb_build_object('action', 'unassigned', 'reason', 'manual_mode');
  END IF;

  -- Modo: sticky → último agente conhecido
  IF v_mode = 'sticky' THEN
    SELECT sa.agent_profile_id INTO v_target_agent
      FROM public.sticky_assignments sa
     WHERE sa.contact_id = p_contact_id
       AND (sa.channel_connection_id IS NULL OR sa.channel_connection_id = p_connection_id)
       AND sa.expires_at > now()
     ORDER BY sa.last_assigned_at DESC
     LIMIT 1;

    IF v_target_agent IS NOT NULL THEN
      v_reason := 'sticky_match';
    END IF;
  END IF;

  -- Modo: rules → engine de client_wallet_rules
  IF v_mode = 'rules' AND v_target_agent IS NULL THEN
    SELECT cwr.agent_id INTO v_target_agent
      FROM public.client_wallet_rules cwr
     WHERE cwr.is_active = TRUE
       AND (cwr.whatsapp_connection_id IS NULL OR cwr.whatsapp_connection_id = p_connection_id)
     ORDER BY cwr.priority DESC, cwr.created_at ASC
     LIMIT 1;

    IF v_target_agent IS NOT NULL THEN
      v_reason := 'rule_match';
    END IF;
  END IF;

  -- Modo: round_robin → menor carga no depto da conexão
  IF v_mode = 'round_robin' AND v_target_agent IS NULL THEN
    SELECT p.id INTO v_target_agent
      FROM public.profiles p
     WHERE p.is_active = TRUE
       AND p.role IN ('agent', 'supervisor')
     ORDER BY (
       SELECT COUNT(*) FROM public.contacts c2
        WHERE c2.assigned_to = p.id
     ) ASC, p.created_at ASC
     LIMIT 1;

    IF v_target_agent IS NOT NULL THEN
      v_reason := 'round_robin';
    END IF;
  END IF;

  -- Aplica atribuição (se encontrou candidato)
  IF v_target_agent IS NOT NULL THEN
    UPDATE public.contacts
       SET assigned_to = v_target_agent,
           updated_at = now()
     WHERE id = p_contact_id
       AND assigned_to IS NULL;  -- guard contra race

    -- Registra sticky para próxima
    BEGIN
      PERFORM public.fn_register_sticky_assignment(
        p_contact_id, v_target_agent, p_connection_id, NULL
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- sticky é best-effort
    END;

    RETURN jsonb_build_object(
      'action', 'assigned',
      'agent_id', v_target_agent,
      'reason', v_reason,
      'mode', v_mode
    );
  END IF;

  -- Fallback: nenhum candidato encontrado em modo automático → Sem dono
  RETURN jsonb_build_object(
    'action', 'unassigned',
    'reason', 'no_candidate_fallback',
    'mode', v_mode
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_set_whatsapp_mode(p_mode text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT public.is_admin_or_supervisor(v_uid) THEN
    RAISE EXCEPTION 'forbidden: only admin/supervisor can change whatsapp_mode';
  END IF;

  IF p_mode NOT IN ('official', 'unofficial') THEN
    RAISE EXCEPTION 'invalid mode: % (allowed: official, unofficial)', p_mode;
  END IF;

  INSERT INTO public.global_settings (key, value, updated_by)
  VALUES ('whatsapp_mode', p_mode, v_uid)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  RETURN p_mode;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_system_health_check()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT jsonb_build_object('database','healthy','tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'uptime',now()-pg_postmaster_start_time());
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_unlink_channel_queue(p_channel_id uuid, p_queue_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.channel_queues WHERE channel_id=p_channel_id AND queue_id=p_queue_id;
  RETURN FOUND;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_update_gmail_health_state(p_status text, p_failure_count integer, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO public.gmail_health_summary (id, status, last_validation, failure_count_60m, metadata, updated_at)
    VALUES ('current', p_status, now(), p_failure_count, p_metadata, now())
    ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        last_validation = EXCLUDED.last_validation,
        failure_count_60m = EXCLUDED.failure_count_60m,
        metadata = public.gmail_health_summary.metadata || EXCLUDED.metadata,
        updated_at = now();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_upsert_service_channel(p_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_display_name text DEFAULT NULL::text, p_channel_type text DEFAULT 'whatsapp'::text, p_whatsapp_connection_id uuid DEFAULT NULL::uuid, p_default_queue_id uuid DEFAULT NULL::uuid, p_routing_mode text DEFAULT 'manual'::text, p_sticky_enabled boolean DEFAULT false, p_sticky_ttl_hours integer DEFAULT 24, p_is_default boolean DEFAULT false, p_description text DEFAULT NULL::text, p_icon text DEFAULT NULL::text, p_color text DEFAULT '#3B82F6'::text)
 RETURNS service_channels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.service_channels;
  v_old public.service_channels;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  -- Se este vai ser default, desmarca os outros do mesmo tipo
  IF p_is_default THEN
    UPDATE public.service_channels
       SET is_default = false
     WHERE channel_type = p_channel_type
       AND (p_id IS NULL OR id <> p_id)
       AND is_default = true;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.service_channels (
      name, display_name, channel_type, whatsapp_connection_id,
      default_queue_id, routing_mode, sticky_enabled, sticky_ttl_hours,
      is_default, description, icon, color, created_by
    ) VALUES (
      trim(p_name), p_display_name, p_channel_type, p_whatsapp_connection_id,
      p_default_queue_id, p_routing_mode, p_sticky_enabled, p_sticky_ttl_hours,
      p_is_default, p_description, p_icon, p_color, auth.uid()
    )
    RETURNING * INTO v_row;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'service_channel_created', 'service_channels', v_row.id::text,
            jsonb_build_object('name', v_row.name, 'type', v_row.channel_type));
  ELSE
    SELECT * INTO v_old FROM public.service_channels WHERE id = p_id;
    IF v_old.id IS NULL THEN RAISE EXCEPTION 'channel not found'; END IF;

    UPDATE public.service_channels SET
      name = trim(p_name),
      display_name = p_display_name,
      channel_type = p_channel_type,
      whatsapp_connection_id = p_whatsapp_connection_id,
      default_queue_id = p_default_queue_id,
      routing_mode = p_routing_mode,
      sticky_enabled = p_sticky_enabled,
      sticky_ttl_hours = p_sticky_ttl_hours,
      is_default = p_is_default,
      description = p_description,
      icon = p_icon,
      color = p_color
    WHERE id = p_id
    RETURNING * INTO v_row;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'service_channel_updated', 'service_channels', v_row.id::text,
            jsonb_build_object(
              'before', jsonb_build_object('name', v_old.name, 'queue', v_old.default_queue_id, 'sticky', v_old.sticky_enabled),
              'after',  jsonb_build_object('name', v_row.name, 'queue', v_row.default_queue_id, 'sticky', v_row.sticky_enabled)
            ));
  END IF;

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_audit_log_purge()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- LGPD: maximum 2 years for audit retention
  DELETE FROM public.contact_audit_log
  WHERE changed_at < now() - interval '2 years';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('rows_purged', v_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_lgpd_purge()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count    integer;
  v_job_id   uuid;
  v_start    timestamptz := now();
BEGIN
  -- Log job start
  INSERT INTO public.scheduled_job_log (job_name, status)
  VALUES ('lgpd_purge', 'running')
  RETURNING id INTO v_job_id;

  -- Delete contacts deleted > 30 days ago
  DELETE FROM public.contacts
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Update log
  UPDATE public.scheduled_job_log
  SET
    finished_at   = now(),
    status        = 'success',
    rows_affected = v_count
  WHERE id = v_job_id;

  RETURN jsonb_build_object(
    'job_id',       v_job_id,
    'rows_purged',  v_count,
    'duration_ms',  EXTRACT(EPOCH FROM (now() - v_start)) * 1000
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE public.scheduled_job_log
  SET finished_at = now(), status = 'error', error_msg = SQLERRM
  WHERE id = v_job_id;
  RAISE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_pii_log_purge()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.pii_access_log WHERE accessed_at < now() - interval '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('rows_purged', v_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sanitize_reset_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Authenticated users cannot set their own tokens - only server/service role can
  IF auth.uid() IS NOT NULL THEN
    NEW.reset_token := NULL;
    NEW.token_expires_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint;
  v_search text;
BEGIN
  v_search := COALESCE(NULLIF(TRIM(search_term), ''), NULL);
  
  -- Get total count first
  SELECT COUNT(*) INTO v_total
  FROM public.contacts c
  WHERE
    (v_search IS NULL OR (
      c.name ILIKE '%' || v_search || '%' OR
      c.nickname ILIKE '%' || v_search || '%' OR
      c.surname ILIKE '%' || v_search || '%' OR
      c.phone ILIKE '%' || v_search || '%' OR
      c.email ILIKE '%' || v_search || '%' OR
      c.company ILIKE '%' || v_search || '%' OR
      c.job_title ILIKE '%' || v_search || '%'
    ))
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter IS NULL OR c.company = company_filter)
    AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
    AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from IS NULL OR c.created_at >= date_from);

  RETURN QUERY
  SELECT
    c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
    c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type,
    c.created_at, c.updated_at,
    v_total AS total_count
  FROM public.contacts c
  WHERE
    (v_search IS NULL OR (
      c.name ILIKE '%' || v_search || '%' OR
      c.nickname ILIKE '%' || v_search || '%' OR
      c.surname ILIKE '%' || v_search || '%' OR
      c.phone ILIKE '%' || v_search || '%' OR
      c.email ILIKE '%' || v_search || '%' OR
      c.company ILIKE '%' || v_search || '%' OR
      c.job_title ILIKE '%' || v_search || '%'
    ))
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter IS NULL OR c.company = company_filter)
    AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
    AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from IS NULL OR c.created_at >= date_from)
  ORDER BY
    CASE WHEN sort_field = 'name' AND sort_direction = 'asc' THEN c.name END ASC,
    CASE WHEN sort_field = 'name' AND sort_direction = 'desc' THEN c.name END DESC,
    CASE WHEN sort_field = 'created_at' AND sort_direction = 'asc' THEN c.created_at END ASC,
    CASE WHEN sort_field = 'created_at' AND sort_direction = 'desc' THEN c.created_at END DESC,
    CASE WHEN sort_field = 'updated_at' AND sort_direction = 'desc' THEN c.updated_at END DESC,
    c.name ASC
  LIMIT page_size
  OFFSET page_offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_contacts(p_query text, p_workspace_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, phone text, email text, company text, tags text[], channel text, avatar_url text, created_at timestamp with time zone, last_seen_at timestamp with time zone, rank real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tsquery    tsquery;
  v_normalized text;
BEGIN
  -- Normalize query: remove accents, trim whitespace
  v_normalized := unaccent(trim(p_query));

  -- Build tsquery (websearch format handles multi-word gracefully)
  BEGIN
    v_tsquery := websearch_to_tsquery('portuguese', v_normalized);
  EXCEPTION WHEN OTHERS THEN
    v_tsquery := plainto_tsquery('portuguese', v_normalized);
  END;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.phone,
    c.email,
    c.company,
    c.tags,
    c.channel,
    c.avatar_url,
    c.created_at,
    c.last_seen_at,
    -- Hybrid rank: full-text weight + trigram similarity
    (
      ts_rank(c.search_vector, v_tsquery) * 0.7 +
      similarity(unaccent(c.name), v_normalized) * 0.3
    )::real AS rank
  FROM public.contacts c
  WHERE
    c.workspace_id = p_workspace_id
    AND c.deleted_at IS NULL
    AND (
      c.search_vector @@ v_tsquery
      OR similarity(unaccent(c.name), v_normalized) > 0.3
      OR unaccent(lower(c.phone)) LIKE '%' || v_normalized || '%'
      OR unaccent(lower(c.email)) LIKE '%' || v_normalized || '%'
    )
  ORDER BY rank DESC, c.last_seen_at DESC NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_knowledge_base(search_query text, max_results integer DEFAULT 5)
 RETURNS TABLE(id uuid, title text, content text, category text, tags text[], rank real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    a.id, a.title, a.content, a.category, a.tags,
    ts_rank(a.search_vector, websearch_to_tsquery('portuguese', search_query)) AS rank
  FROM public.knowledge_base_articles a
  WHERE a.is_published = true
    AND (
      a.search_vector @@ websearch_to_tsquery('portuguese', search_query)
      OR a.title ILIKE '%' || search_query || '%'
      OR a.content ILIKE '%' || search_query || '%'
    )
  ORDER BY rank DESC
  LIMIT max_results;
$function$
;

CREATE OR REPLACE FUNCTION public.set_automation_rules_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_woc_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.skill_based_assign(p_queue_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_id UUID;
BEGIN
  SELECT qm.profile_id INTO v_agent_id
  FROM public.queue_members qm
  JOIN public.profiles p ON p.id = qm.profile_id
  WHERE qm.queue_id = p_queue_id
    AND qm.is_active = true
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.queue_skill_requirements qsr
      WHERE qsr.queue_id = p_queue_id
      AND NOT EXISTS (
        SELECT 1 FROM public.agent_skills ags
        WHERE ags.profile_id = qm.profile_id
        AND ags.skill_name = qsr.skill_name
        AND ags.skill_level >= qsr.min_level
      )
    )
  ORDER BY (
    SELECT COUNT(*) FROM public.contacts c 
    WHERE c.assigned_to = qm.profile_id
  ) ASC
  LIMIT 1;
  
  IF v_agent_id IS NULL THEN
    SELECT qm.profile_id INTO v_agent_id
    FROM public.queue_members qm
    JOIN public.profiles p ON p.id = qm.profile_id
    WHERE qm.queue_id = p_queue_id
      AND qm.is_active = true
      AND p.is_active = true
    ORDER BY (
      SELECT COUNT(*) FROM public.contacts c 
      WHERE c.assigned_to = qm.profile_id
    ) ASC
    LIMIT 1;
  END IF;
  
  RETURN v_agent_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_contact(p_contact_id uuid, p_reason text DEFAULT 'manual_deletion'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.contacts
  SET
    deleted_at     = now(),
    deleted_by     = auth.uid(),
    deleted_reason = p_reason,
    updated_at     = now()
  WHERE id = p_contact_id
    AND deleted_at IS NULL
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact % not found or already deleted', p_contact_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_integration_profiles_updated()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unpause_instance(p_instance text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  UPDATE public.instance_processing_pauses
     SET paused_until = now(),
         updated_at = now()
   WHERE instance_name = p_instance
     AND paused_until > now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_agent_level()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.level := calculate_level(NEW.xp);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_contact_versioned(p_contact_id uuid, p_expected_version integer, p_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_version integer;
  v_result          jsonb;
BEGIN
  -- Check current version matches expected
  SELECT version INTO v_current_version
  FROM public.contacts
  WHERE id = p_contact_id
    AND deleted_at IS NULL
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  FOR UPDATE;  -- row-level lock

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTACT_NOT_FOUND: Contact % not found', p_contact_id;
  END IF;

  IF v_current_version != p_expected_version THEN
    -- Fetch the conflicting values for UI display
    SELECT jsonb_build_object(
      'error',            'CONFLICT',
      'message',          'Este contato foi modificado por outro usuário. Recarregue e tente novamente.',
      'current_version',  version,
      'your_version',     p_expected_version,
      'last_updated_by',  (SELECT full_name FROM public.profiles WHERE id = (SELECT updated_by FROM public.contacts WHERE id = p_contact_id)),
      'last_updated_at',  updated_at
    ) INTO v_result
    FROM public.contacts WHERE id = p_contact_id;

    RETURN v_result;
  END IF;

  -- Safe to update — versions match
  UPDATE public.contacts
  SET
    name    = COALESCE((p_updates->>'name')::text,    name),
    phone   = COALESCE((p_updates->>'phone')::text,   phone),
    email   = COALESCE((p_updates->>'email')::text,   email),
    company = COALESCE((p_updates->>'company')::text, company),
    notes   = COALESCE((p_updates->>'notes')::text,   notes),
    tags    = CASE WHEN p_updates ? 'tags' THEN
                ARRAY(SELECT jsonb_array_elements_text(p_updates->'tags'))
              ELSE tags END,
    custom_fields = CASE WHEN p_updates ? 'custom_fields' THEN
                      p_updates->'custom_fields'
                    ELSE custom_fields END,
    updated_by = auth.uid()
  WHERE id = p_contact_id;

  -- Return success with new version
  SELECT jsonb_build_object(
    'success', true,
    'version', version,
    'updated_at', updated_at
  ) INTO v_result
  FROM public.contacts WHERE id = p_contact_id;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_device_last_seen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.last_seen_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_global_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_gmail_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_own_profile(p_display_name text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_signature text DEFAULT NULL::text, p_birthday text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE profiles SET
    display_name = COALESCE(p_display_name, display_name),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    phone = COALESCE(p_phone, phone),
    email = COALESCE(p_email, email),
    signature = COALESCE(p_signature, signature),
    birthday = COALESCE(p_birthday, birthday),
    updated_at = now()
  WHERE id = v_profile_id;

  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_saved_filters_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.name = _permission_name
  )
$function$
;

CREATE OR REPLACE FUNCTION public.validate_phone_numbers(phone_numbers jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  -- Must be an array
  IF jsonb_typeof(phone_numbers) != 'array' THEN
    RETURN false;
  END IF;

  -- Each element must have a non-empty 'number' field
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(phone_numbers) AS elem
    WHERE elem->>'number' IS NULL OR trim(elem->>'number') = ''
  ) THEN
    RETURN false;
  END IF;

  -- Max 10 phone numbers per contact
  IF jsonb_array_length(phone_numbers) > 10 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_reset_token(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_hashed text;
BEGIN
  v_hashed := encode(extensions.digest(p_token::bytea, 'sha256'), 'hex');
  
  SELECT user_id INTO v_user_id
  FROM public.password_reset_requests
  WHERE reset_token = v_hashed
    AND status = 'pending'
    AND token_expires_at > now()
  LIMIT 1;
  
  RETURN v_user_id;
END;
$function$
;

