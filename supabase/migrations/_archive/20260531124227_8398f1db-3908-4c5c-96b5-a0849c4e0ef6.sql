-- Revoke execution from public/anon for sensitive functions identified by linter
REVOKE EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, jsonb) TO service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.user_has_permission(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO authenticated, service_role;

-- Add search_path to handle_new_user_settings if missing (critical for SECURITY DEFINER)
ALTER FUNCTION public.handle_new_user_settings() SET search_path = public;
