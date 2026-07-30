-- Functions guarded: may not exist in CI if earlier migrations failed
DO $a1_guards$ BEGIN
  BEGIN
    ALTER FUNCTION public.fn_auto_escalate_sla() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_auto_escalate_sla SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_monitor_instance_health() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_monitor_instance_health SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.trg_log_transfer_status_change() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP trg_log_transfer_status_change SET search_path: %', SQLERRM;
  END;
END $a1_guards$;

-- Fix search_knowledge_base_rag (guarded: extensions.vector / pgvector may not be installed in CI)
DO $v_skb$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'vector' AND n.nspname = 'extensions'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.search_knowledge_base_rag(extensions.vector, text, double precision, integer) SET search_path = public';
  ELSE
    RAISE NOTICE 'SKIP search_knowledge_base_rag SET search_path — extensions.vector not available';
  END IF;
END $v_skb$;
