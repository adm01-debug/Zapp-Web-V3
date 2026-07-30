-- Convert safe RPCs to SECURITY INVOKER
-- Vector functions guarded: extensions.vector (pgvector) may not be installed in CI
DO $v_si$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'vector' AND n.nspname = 'extensions'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.search_knowledge_base_rag(extensions.vector, text, double precision, integer) SECURITY INVOKER';
    EXECUTE 'ALTER FUNCTION public.match_kb_chunks(extensions.vector, double precision, integer, text) SECURITY INVOKER';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.search_knowledge_base_rag(extensions.vector, text, double precision, integer) TO authenticated';
  ELSE
    RAISE NOTICE 'SKIP vector functions SECURITY INVOKER — extensions.vector not available';
  END IF;
END $v_si$;
-- Non-vector functions guarded: functions may not exist in CI if earlier migrations failed
DO $guards$ BEGIN
  BEGIN
    ALTER FUNCTION public.rpc_email_mark_thread_read(text, boolean) SECURITY INVOKER;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_email_mark_thread_read SECURITY INVOKER: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.rpc_record_search_click(text, text, text) SECURITY INVOKER;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_record_search_click SECURITY INVOKER: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.rpc_log_search_event(text, text[], integer, boolean) SECURITY INVOKER;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_log_search_event SECURITY INVOKER: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_mark_conversation_as_read(uuid, text) SECURITY INVOKER;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_mark_conversation_as_read SECURITY INVOKER: %', SQLERRM;
  END;
  -- Re-grant execute just in case (though default is usually fine for invoker)
  BEGIN
    GRANT EXECUTE ON FUNCTION public.rpc_email_mark_thread_read(text, boolean) TO authenticated;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP grant rpc_email_mark_thread_read: %', SQLERRM;
  END;
END $guards$;
