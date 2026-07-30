-- 1. Enum for connection types
CREATE TYPE public.connection_provider AS ENUM ('supabase_external', 'bitrix24', 'n8n', 'generic_webhook', 'mcp_claude');

-- 2. System Connections Table (Sensitive data)
CREATE TABLE IF NOT EXISTS public.system_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    provider connection_provider NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb, -- Encrypted keys/tokens should be here
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.system_connections ENABLE ROW LEVEL SECURITY;

-- 3. Webhooks Table (For other Lovable apps to connect)
CREATE TABLE IF NOT EXISTS public.app_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    target_app_name TEXT, -- e.g. "CRM-Project-Lovable"
    webhook_url TEXT NOT NULL,
    auth_token TEXT,
    events_subscribed TEXT[] DEFAULT '{}'::text[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.app_webhooks ENABLE ROW LEVEL SECURITY;

-- 4. Policies (Admin only)
CREATE POLICY "Admins can manage system connections" 
ON public.system_connections FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage app webhooks" 
ON public.app_webhooks FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 5. Helper function to log connection attempts
CREATE OR REPLACE FUNCTION public.fn_log_system_connection_event(
    p_connection_id UUID,
    p_event_type TEXT,
    p_status TEXT,
    p_message TEXT
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.evolution_audit_log (
        entity_type,
        entity_id,
        action,
        performed_by,
        details
    ) VALUES (
        'system_connection',
        p_connection_id,
        p_event_type,
        'system',
        jsonb_build_object('status', p_status, 'message', p_message)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;