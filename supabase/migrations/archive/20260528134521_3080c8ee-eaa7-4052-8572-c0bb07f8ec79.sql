-- Drop all existing policies on user_roles to start fresh and avoid recursion
DROP POLICY IF EXISTS "Only admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users view own roles, admins view all" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

-- Create clean policies using the SECURITY DEFINER functions which bypass RLS
-- This prevents the "infinite recursion detected" error

-- 1. SELECT policy: Users can see their own roles, and admins/supervisors can see everyone's
CREATE POLICY "user_roles_select_policy"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  (user_id = auth.uid()) 
  OR 
  public.is_admin_or_supervisor(auth.uid())
);

-- 2. ALL policy (INSERT, UPDATE, DELETE): Only admins and supervisors can manage roles
CREATE POLICY "user_roles_admin_policy"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.is_admin_or_supervisor(auth.uid())
)
WITH CHECK (
  public.is_admin_or_supervisor(auth.uid())
);

-- Grant permissions (standard practice)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
