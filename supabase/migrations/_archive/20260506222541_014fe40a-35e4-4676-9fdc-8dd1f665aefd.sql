ALTER FUNCTION public.fn_process_escalations() SET search_path = public;
ALTER FUNCTION public.get_profile_id_for_user(uuid) SET search_path = public;
ALTER FUNCTION public.rpc_update_gmail_health_state(text, integer, jsonb) SET search_path = public;
ALTER FUNCTION public.fn_log_system_connection_event(uuid, text, text, text) SET search_path = public;
ALTER FUNCTION public.rpc_log_service_event(text, text, text, text, text, jsonb, jsonb, text) SET search_path = public;
ALTER FUNCTION public.fn_notify_status_change() SET search_path = public;
ALTER FUNCTION public.rpc_get_whatsapp_mode() SET search_path = public;
ALTER FUNCTION public.fn_log_connection_event() SET search_path = public;