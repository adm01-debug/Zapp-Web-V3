-- Convert safe RPCs to SECURITY INVOKER
ALTER FUNCTION public.search_knowledge_base_rag(extensions.vector, text, double precision, integer) SECURITY INVOKER;
ALTER FUNCTION public.match_kb_chunks(extensions.vector, double precision, integer, text) SECURITY INVOKER;
ALTER FUNCTION public.rpc_email_mark_thread_read(text, boolean) SECURITY INVOKER;
ALTER FUNCTION public.rpc_record_search_click(text, text, text) SECURITY INVOKER;
ALTER FUNCTION public.rpc_log_search_event(text, text[], integer, boolean) SECURITY INVOKER;
ALTER FUNCTION public.fn_mark_conversation_as_read(uuid, text) SECURITY INVOKER;

-- Re-grant execute just in case (though default is usually fine for invoker)
GRANT EXECUTE ON FUNCTION public.search_knowledge_base_rag(extensions.vector, text, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_email_mark_thread_read(text, boolean) TO authenticated;
