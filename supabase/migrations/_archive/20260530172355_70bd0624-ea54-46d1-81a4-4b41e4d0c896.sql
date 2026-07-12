-- 1. Fix SECURITY DEFINER search_path for handle_new_user_settings
ALTER FUNCTION public.handle_new_user_settings() SET search_path = public;

-- 2. Hardening whatsapp_connections policies
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Staff can view connections" ON public.whatsapp_connections;

-- Create a more restrictive one
CREATE POLICY "Staff can view their assigned connections" 
ON public.whatsapp_connections 
FOR SELECT 
TO authenticated 
USING (
  is_admin_or_supervisor(auth.uid()) 
  OR 
  (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'dev'::app_role
  ))
  OR
  (created_by = auth.uid()) 
);

-- 3. Ensure audit_logs is secure (double checking)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 4. Set search_path for other potential functions that might be used as triggers or security definers
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN 
        SELECT proname, nspname
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.prosecdef = true 
        AND n.nspname = 'public'
        AND (p.proconfig IS NULL OR NOT p.proconfig @> ARRAY['search_path=public'])
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I() SET search_path = public', r.nspname, r.proname);
    END LOOP;
END $$;
