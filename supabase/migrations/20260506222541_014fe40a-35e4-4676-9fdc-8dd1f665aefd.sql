-- Functions guarded: may not exist in CI if earlier migrations failed
DO $b4_guards$ BEGIN
  BEGIN
    ALTER FUNCTION public.fn_process_escalations() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_process_escalations SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.get_profile_id_for_user(uuid) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP get_profile_id_for_user SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.rpc_update_gmail_health_state(text, integer, jsonb) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_update_gmail_health_state SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_log_system_connection_event(uuid, text, text, text) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_log_system_connection_event SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.rpc_log_service_event(text, text, text, text, text, jsonb, jsonb, text) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_log_service_event SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_notify_status_change() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_notify_status_change SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.rpc_get_whatsapp_mode() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_get_whatsapp_mode SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_log_connection_event() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_log_connection_event SET search_path: %', SQLERRM;
  END;
END $b4_guards$;
