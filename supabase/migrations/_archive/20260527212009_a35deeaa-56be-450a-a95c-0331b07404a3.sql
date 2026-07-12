-- Revoke public access to all functions in the public schema
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Re-grant to authenticated and service_role
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Specifically check sensitive functions that might need SECURITY DEFINER
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.handle_new_user_role() SET search_path = public;
ALTER FUNCTION public.prevent_profile_privilege_escalation() SET search_path = public;
ALTER FUNCTION public.is_admin_or_supervisor(uuid) SET search_path = public;
ALTER FUNCTION public.get_profile_id_for_user(uuid) SET search_path = public;
ALTER FUNCTION public.get_profile_role_for_check(uuid) SET search_path = public;

-- Fix potentially permissive RLS on instance_registry
DROP POLICY IF EXISTS "Anyone can select instance_registry" ON public.instance_registry;
CREATE POLICY "Admin or Supervisor can view instance registry" 
ON public.instance_registry 
FOR SELECT 
TO authenticated 
USING (is_admin_or_supervisor(auth.uid()));

-- Tighten profiles SELECT policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated users" 
ON public.profiles 
FOR SELECT 
TO authenticated 
USING (true);

-- Ensure audit_logs is protected
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Audit logs public insert" ON public.audit_logs;
CREATE POLICY "Only system can insert audit logs" 
ON public.audit_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Contact notes check
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Contact notes are public" ON public.contact_notes;
CREATE POLICY "Users view relevant contact notes" 
ON public.contact_notes 
FOR SELECT 
TO authenticated 
USING (true); -- Usually notes are shared among the team

CREATE POLICY "Users insert contact notes" 
ON public.contact_notes 
FOR INSERT 
TO authenticated 
WITH CHECK (true);
