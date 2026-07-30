-- Drop existing functions to avoid parameter mismatch
DROP FUNCTION IF EXISTS public.log_security_event(text,text,text,text,jsonb);
DROP FUNCTION IF EXISTS public.log_audit_event(text,text,text,text,jsonb);
DROP FUNCTION IF EXISTS public.rpc_migrate_whatsapp_integration();

-- Create email_accounts table if missing
CREATE TABLE IF NOT EXISTS public.email_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email_address TEXT NOT NULL,
    display_name TEXT,
    picture_url TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_accounts TO authenticated;
GRANT ALL ON public.email_accounts TO service_role;

-- Policies
DO $$ BEGIN
    CREATE POLICY "Users can view their own email accounts" 
    ON public.email_accounts FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN others THEN NULL; END $$;

-- Audit log table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    resource TEXT,
    action TEXT,
    status TEXT,
    details JSONB,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- RPC for logging audit events
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_event_type TEXT,
    p_resource TEXT,
    p_action TEXT,
    p_status TEXT,
    p_details JSONB
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.audit_logs (event_type, resource, action, status, details, user_id)
    VALUES (p_event_type, p_resource, p_action, p_status, p_details, auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC for security events
CREATE OR REPLACE FUNCTION public.log_security_event(
    p_event_type TEXT,
    p_resource TEXT,
    p_action TEXT,
    p_status TEXT,
    p_details JSONB
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.audit_logs (event_type, resource, action, status, details, user_id)
    VALUES (p_event_type, p_resource, p_action, p_status, p_details, auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stub for migrate_whatsapp_integration
CREATE OR REPLACE FUNCTION public.rpc_migrate_whatsapp_integration()
RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('success', true, 'message', 'Migration stub executed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
