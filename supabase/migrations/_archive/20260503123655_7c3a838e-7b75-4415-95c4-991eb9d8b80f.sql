-- Fix log_audit_event RPC
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Allow bypassing RLS to write to audit_logs
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_entity_uuid uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    -- Try to get from session if available, but usually auth.uid() is enough
    RETURN;
  END IF;

  -- Safely try to cast entity_id to UUID
  BEGIN
    IF p_entity_id IS NOT NULL AND p_entity_id <> '' THEN
      v_entity_uuid := p_entity_id::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_entity_uuid := NULL;
  END;
  
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details, user_agent)
  VALUES (v_user_id, p_action, p_entity_type, v_entity_uuid, p_details, p_user_agent);
END;
$$;

-- Ensure audit_logs table exists and has correct columns (idempotent)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ensure v_email_accounts_unified view exists
CREATE OR REPLACE VIEW public.v_email_accounts_unified AS
SELECT 
  id,
  user_id,
  email_address as email,
  'gmail' as provider,
  is_active,
  sync_status,
  last_sync_at,
  last_error,
  created_at,
  updated_at,
  0 as unread_threads, -- placeholder
  0 as sla_breached  -- placeholder
FROM public.gmail_accounts;

-- Grant access to the view
GRANT SELECT ON public.v_email_accounts_unified TO authenticated;
