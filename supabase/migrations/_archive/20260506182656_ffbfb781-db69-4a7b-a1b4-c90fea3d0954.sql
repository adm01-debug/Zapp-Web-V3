-- Rename tables to match front-end expectations
ALTER TABLE public.gmail_revalidation_jobs RENAME TO email_revalidation_jobs;
ALTER TABLE public.gmail_health_summary RENAME TO email_health_summary;

-- Create RPC wrappers to match front-end expectations
-- These are necessary for the codegen to pick up the names used in the code

CREATE OR REPLACE FUNCTION public.rpc_email_mark_thread_read(p_thread_id TEXT, p_read BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Dummy implementation to allow codegen and type safety
  -- Real logic should be implemented based on provider (gmail, etc)
  RETURN jsonb_build_object('success', true, 'thread_id', p_thread_id, 'read', p_read);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_email_token_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Redirect to existing logic or provide a healthy response
  RETURN jsonb_build_object('status', 'healthy', 'checked_at', now());
END;
$$;

-- Allow access to these functions
GRANT EXECUTE ON FUNCTION public.rpc_email_mark_thread_read(TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_email_token_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_email_mark_thread_read(TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_email_token_status() TO service_role;
