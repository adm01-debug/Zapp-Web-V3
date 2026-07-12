REVOKE EXECUTE ON FUNCTION public.handle_new_user_settings() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user_settings() TO service_role;
