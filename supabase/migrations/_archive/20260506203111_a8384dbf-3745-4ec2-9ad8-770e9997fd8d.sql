-- Fix fn_auto_escalate_sla
ALTER FUNCTION public.fn_auto_escalate_sla() 
SET search_path = public;

-- Fix fn_monitor_instance_health
ALTER FUNCTION public.fn_monitor_instance_health() 
SET search_path = public;

-- Fix trg_log_transfer_status_change
ALTER FUNCTION public.trg_log_transfer_status_change() 
SET search_path = public;

-- Fix search_knowledge_base_rag
ALTER FUNCTION public.search_knowledge_base_rag(extensions.vector, text, double precision, integer) 
SET search_path = public;
