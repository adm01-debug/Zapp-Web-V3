-- Revoke/grant on sensitive functions — guarded: functions may not exist in CI
DO $sp5_guards$ BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, jsonb) FROM public, anon, authenticated;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP REVOKE log_security_event: %', SQLERRM;
  END;
  BEGIN
    GRANT EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, jsonb) TO service_role, authenticated;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP GRANT log_security_event: %', SQLERRM;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.user_has_permission(uuid, text) FROM public, anon;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP REVOKE user_has_permission: %', SQLERRM;
  END;
  BEGIN
    GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO authenticated, service_role;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP GRANT user_has_permission: %', SQLERRM;
  END;
  -- Add search_path to handle_new_user_settings
  BEGIN
    ALTER FUNCTION public.handle_new_user_settings() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP handle_new_user_settings SET search_path: %', SQLERRM;
  END;
END $sp5_guards$;
