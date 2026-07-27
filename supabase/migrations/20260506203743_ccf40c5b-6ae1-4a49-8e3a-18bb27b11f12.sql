-- Create internal schema if not exists
CREATE SCHEMA IF NOT EXISTS auth_helpers;

-- Functions guarded: may not exist in CI if earlier migrations failed
DO $ah1_guards$ BEGIN

  -- 1. rpc_update_gmail_health_state — move to auth_helpers
  BEGIN
    ALTER FUNCTION public.rpc_update_gmail_health_state(text, integer, jsonb) SET SCHEMA auth_helpers;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_update_gmail_health_state SET SCHEMA auth_helpers: %', SQLERRM;
  END;

  -- 2. fn_process_escalations — move to auth_helpers
  BEGIN
    ALTER FUNCTION public.fn_process_escalations() SET SCHEMA auth_helpers;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_process_escalations SET SCHEMA auth_helpers: %', SQLERRM;
  END;

  -- 3. rpc_log_service_event — move to auth_helpers
  BEGIN
    ALTER FUNCTION public.rpc_log_service_event(text, text, text, text, text, jsonb, jsonb, text) SET SCHEMA auth_helpers;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_log_service_event SET SCHEMA auth_helpers: %', SQLERRM;
  END;

  -- 4. get_profile_id_for_user — move to auth_helpers
  BEGIN
    ALTER FUNCTION public.get_profile_id_for_user(uuid) SET SCHEMA auth_helpers;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP get_profile_id_for_user SET SCHEMA auth_helpers: %', SQLERRM;
  END;

  -- 5. handle_new_user (TRIGGER) — keep in public but REVOKE execute
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP REVOKE handle_new_user: %', SQLERRM;
  END;

  -- 6. rpc_get_whatsapp_mode — move to auth_helpers
  BEGIN
    ALTER FUNCTION public.rpc_get_whatsapp_mode() SET SCHEMA auth_helpers;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_get_whatsapp_mode SET SCHEMA auth_helpers: %', SQLERRM;
  END;

END $ah1_guards$;

-- Create wrapper: rpc_update_gmail_health_state
CREATE OR REPLACE FUNCTION public.rpc_update_gmail_health_state(p_status text, p_failure_count integer, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  PERFORM auth_helpers.rpc_update_gmail_health_state(p_status, p_failure_count, p_metadata);
END;
$$;

-- Create wrapper: fn_process_escalations
CREATE OR REPLACE FUNCTION public.fn_process_escalations()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  PERFORM auth_helpers.fn_process_escalations();
END;
$$;

-- Create wrapper: rpc_log_service_event
CREATE OR REPLACE FUNCTION public.rpc_log_service_event(p_instance text, p_event_type text, p_message text, p_level text DEFAULT 'info'::text, p_remote_jid text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb, p_performed_by text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  PERFORM auth_helpers.rpc_log_service_event(p_instance, p_event_type, p_message, p_level, p_remote_jid, p_payload, p_metadata, p_performed_by);
END;
$$;

-- Create wrapper: get_profile_id_for_user
CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RETURN auth_helpers.get_profile_id_for_user(_user_id);
END;
$$;

-- Create wrapper: rpc_get_whatsapp_mode
CREATE OR REPLACE FUNCTION public.rpc_get_whatsapp_mode()
RETURNS text LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RETURN auth_helpers.rpc_get_whatsapp_mode();
END;
$$;
