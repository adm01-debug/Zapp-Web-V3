-- Batch 2
-- Functions guarded: may not exist in CI if earlier migrations failed
DO $b2_guards$ BEGIN
  BEGIN
    ALTER FUNCTION public.rpc_update_gmail_health_state(text, integer, jsonb) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_update_gmail_health_state SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.rpc_email_mark_thread_read(text, boolean) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_email_mark_thread_read SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.rpc_email_token_status() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_email_token_status SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_mark_conversation_as_read(uuid, text) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_mark_conversation_as_read SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_reopen_transfer(uuid, text, text) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_reopen_transfer SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_process_escalations() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_process_escalations SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.process_settings_audit() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP process_settings_audit SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_on_transfer_created() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_on_transfer_created SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_is_instance_member(text) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_is_instance_member SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.claim_next_voice_task(uuid) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP claim_next_voice_task SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_log_reconnection_attempt(uuid, integer, text, text, text, text) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_log_reconnection_attempt SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.increment_voice_task_attempt(uuid) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP increment_voice_task_attempt SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.cleanup_old_stress_metrics(integer) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP cleanup_old_stress_metrics SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.rpc_check_and_trigger_gmail_revalidation() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_check_and_trigger_gmail_revalidation SET search_path: %', SQLERRM;
  END;
END $b2_guards$;
DO $v_mkb$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'vector' AND n.nspname = 'extensions'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.match_kb_chunks(extensions.vector, double precision, integer, text) SET search_path = public';
  ELSE
    RAISE NOTICE 'SKIP match_kb_chunks SET search_path — extensions.vector not available';
  END IF;
END $v_mkb$;
DO $b2_guards2$ BEGIN
  BEGIN
    ALTER FUNCTION public.rpc_log_service_event(text, text, text, text, text, jsonb, jsonb, text) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_log_service_event SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.audit_settings_changes() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP audit_settings_changes SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.is_admin_or_supervisor(uuid) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP is_admin_or_supervisor SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.send_message_v2(text, text, text, text, text) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP send_message_v2 SET search_path: %', SQLERRM;
  END;
END $b2_guards2$;
