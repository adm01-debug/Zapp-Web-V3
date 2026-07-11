
-- HIGH-1.1  pause_instance
CREATE OR REPLACE FUNCTION public.pause_instance(p_instance text, p_reason text, p_minutes integer, p_trigger_count integer DEFAULT 0)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_id UUID; v_until TIMESTAMPTZ;
BEGIN
    IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor')) THEN
        PERFORM public.log_rls_denied('instance_processing_pauses','admin|supervisor',
            jsonb_build_object('rpc','pause_instance','instance',p_instance));
        RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
    v_until := now() + (p_minutes||' minutes')::interval;
    INSERT INTO public.instance_processing_pauses (instance_name, paused_until, reason, trigger_count)
    VALUES (p_instance, v_until, p_reason, p_trigger_count) RETURNING id INTO v_id;
    RETURN v_id;
END; $fn$;

-- HIGH-1.2  unpause_instance
CREATE OR REPLACE FUNCTION public.unpause_instance(p_instance text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_count INTEGER;
BEGIN
    IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor')) THEN
        PERFORM public.log_rls_denied('instance_processing_pauses','admin|supervisor',
            jsonb_build_object('rpc','unpause_instance','instance',p_instance));
        RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
    UPDATE public.instance_processing_pauses SET paused_until = now()
      WHERE instance_name = p_instance AND paused_until > now();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END; $fn$;

-- HIGH-1.3  manage_department_member (3 sobrecargas — preservando defaults)
CREATE OR REPLACE FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
        PERFORM public.log_rls_denied('profiles.department_id','admin|supervisor',
            jsonb_build_object('rpc','manage_department_member','action',p_action,'target',p_profile_id));
        RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
    IF p_action='add' THEN
        UPDATE public.profiles SET department_id=p_department_id WHERE id=p_profile_id;
    ELSIF p_action='remove' THEN
        UPDATE public.profiles SET department_id=NULL WHERE id=p_profile_id;
    END IF;
    RETURN TRUE;
END; $fn$;

CREATE OR REPLACE FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
        PERFORM public.log_rls_denied('profiles.department_id','admin|supervisor',
            jsonb_build_object('rpc','manage_department_member','action',p_action,'target',p_profile_id));
        RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
    IF p_action='add' THEN
        UPDATE public.profiles SET department_id=p_department_id WHERE id=p_profile_id;
    ELSIF p_action='remove' THEN
        UPDATE public.profiles SET department_id=NULL WHERE id=p_profile_id;
    END IF;
    RETURN TRUE;
END; $fn$;

CREATE OR REPLACE FUNCTION public.manage_department_member(
    p_profile_id uuid DEFAULT NULL::uuid,
    p_department_id uuid DEFAULT NULL::uuid,
    p_action text DEFAULT NULL::text,
    _admin_user_id uuid DEFAULT NULL::uuid,
    _target_profile_id uuid DEFAULT NULL::uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_target_id UUID;
BEGIN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
        PERFORM public.log_rls_denied('profiles.department_id','admin|supervisor',
            jsonb_build_object('rpc','manage_department_member','action',p_action));
        RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
    v_target_id := COALESCE(p_profile_id, _target_profile_id);
    IF v_target_id IS NULL THEN RETURN FALSE; END IF;
    IF p_action='add' AND p_department_id IS NOT NULL THEN
        UPDATE public.profiles SET department_id=p_department_id WHERE id=v_target_id;
    ELSIF p_action='remove' THEN
        UPDATE public.profiles SET department_id=NULL WHERE id=v_target_id;
    END IF;
    RETURN TRUE;
END; $fn$;

-- HIGH-1.4  rpc_migrate_whatsapp_integration
CREATE OR REPLACE FUNCTION public.rpc_migrate_whatsapp_integration()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
    IF NOT public.has_role(auth.uid(),'admin') THEN
        PERFORM public.log_rls_denied('whatsapp_migration','admin',
            jsonb_build_object('rpc','rpc_migrate_whatsapp_integration'));
        RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'Migration stub executed');
END; $fn$;

-- HIGH-1.5  fn_accept_transfer / fn_complete_transfer — exigir auth
CREATE OR REPLACE FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_operator text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
    UPDATE public.conversation_transfers SET status='accepted', target_operator=p_operator, accepted_at=NOW()
      WHERE id=p_transfer_id AND status='pending';
    RETURN FOUND;
END; $fn$;

CREATE OR REPLACE FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_agent_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_conversation_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
    UPDATE public.conversation_transfers SET status='accepted', to_agent_id=p_agent_id, accepted_at=NOW()
      WHERE id=p_transfer_id AND status='pending' RETURNING conversation_id INTO v_conversation_id;
    IF FOUND THEN
        UPDATE public.contacts SET assigned_to=p_agent_id WHERE id=v_conversation_id;
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END; $fn$;

CREATE OR REPLACE FUNCTION public.fn_complete_transfer(p_transfer_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
    UPDATE public.conversation_transfers SET status='completed', completed_at=NOW()
      WHERE id=p_transfer_id AND status='accepted';
    RETURN FOUND;
END; $fn$;

CREATE OR REPLACE FUNCTION public.fn_complete_transfer(p_transfer_id uuid, p_notes text, p_type text DEFAULT 'resolved'::text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
    UPDATE public.conversation_transfers
        SET status='completed', resolution_notes=p_notes, resolution_type=p_type, completed_at=NOW()
      WHERE id=p_transfer_id AND status IN ('accepted','in_progress');
    RETURN FOUND;
END; $fn$;

-- HIGH-2  prevent_role_escalation — rejeitar + auditar
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
    IF (OLD.role IS DISTINCT FROM NEW.role)
       OR (OLD.access_level IS DISTINCT FROM NEW.access_level)
       OR (OLD.permissions   IS DISTINCT FROM NEW.permissions) THEN
        IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
            PERFORM public.log_security_event(
                'privilege_escalation_attempt','profiles',TG_OP,'denied',
                jsonb_build_object(
                    'target_profile_id', NEW.id,
                    'old_role', OLD.role, 'new_role', NEW.role,
                    'old_access_level', OLD.access_level, 'new_access_level', NEW.access_level
                ));
            RAISE EXCEPTION 'privilege escalation denied' USING ERRCODE='42501';
        END IF;
    END IF;
    RETURN NEW;
END; $fn$;

-- HIGH-3  notify_sicoob_on_reply — remover service_role_key da GUC
CREATE OR REPLACE FUNCTION public.notify_sicoob_on_reply()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_contact_type text; v_payload jsonb;
BEGIN
    IF NEW.sender='agent' AND NEW.channel_type='internal_chat' THEN
        SELECT contact_type INTO v_contact_type FROM public.contacts WHERE id=NEW.contact_id;
        IF v_contact_type='sicoob_gifts' THEN
            v_payload := jsonb_build_object(
                'contact_id', NEW.contact_id, 'content', NEW.content,
                'message_id', NEW.id, 'agent_id', NEW.agent_id, 'created_at', NEW.created_at);
            PERFORM pg_notify('sicoob_bridge_reply', v_payload::text);
        END IF;
    END IF;
    RETURN NEW;
END; $fn$;
