-- Create security audit logs table
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'unauthorized_access', 'permission_change', 'auth_failure'
    resource TEXT, -- table name or route path
    action TEXT, -- 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'NAVIGATE'
    status TEXT NOT NULL, -- 'denied', 'allowed', 'flagged'
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Grant permissions
GRANT SELECT, INSERT ON public.security_audit_logs TO authenticated;
GRANT ALL ON public.security_audit_logs TO service_role;

-- Enable RLS
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own security logs (for transparency)
CREATE POLICY "Users can view their own security logs"
ON public.security_audit_logs
FOR SELECT
USING (auth.uid() = user_id);

-- System function to log security events safely
CREATE OR REPLACE FUNCTION public.log_security_event(
    p_event_type TEXT,
    p_resource TEXT,
    p_action TEXT,
    p_status TEXT,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.security_audit_logs (
        user_id,
        event_type,
        resource,
        action,
        status,
        details
    ) VALUES (
        auth.uid(),
        p_event_type,
        p_resource,
        p_action,
        p_status,
        p_details
    );
END;
$$;

-- Server-side permission check function
CREATE OR REPLACE FUNCTION public.check_user_permission(
    p_permission_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_permission BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM public.role_permissions rp
        JOIN public.user_roles ur ON ur.role = rp.role
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = auth.uid()
        AND p.name = p_permission_name
    ) INTO v_has_permission;

    IF NOT v_has_permission THEN
        PERFORM public.log_security_event(
            'unauthorized_access',
            'permission:' || p_permission_name,
            'EXECUTE',
            'denied'
        );
    END IF;

    RETURN v_has_permission;
END;
$$;

-- Hardening RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'dev')
    )
);

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- Trigger for logging role changes
CREATE OR REPLACE FUNCTION public.on_role_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.log_security_event(
        'permission_change',
        'user_roles',
        TG_OP,
        'allowed',
        jsonb_build_object(
            'target_user_id', COALESCE(NEW.user_id, OLD.user_id),
            'role', COALESCE(NEW.role, OLD.role)
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_log_role_changes ON public.user_roles;
CREATE TRIGGER tr_log_role_changes
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.on_role_change();
