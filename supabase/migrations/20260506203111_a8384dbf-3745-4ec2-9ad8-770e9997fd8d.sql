-- Fix fn_auto_escalate_sla
ALTER FUNCTION public.fn_auto_escalate_sla() 
SET search_path = public;

-- Fix fn_monitor_instance_health
ALTER FUNCTION public.fn_monitor_instance_health() 
SET search_path = public;

-- Fix trg_log_transfer_status_change
ALTER FUNCTION public.trg_log_transfer_status_change() 
SET search_path = public;

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
