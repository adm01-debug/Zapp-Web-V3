-- Drop recursive policy on route_permissions
DROP POLICY IF EXISTS "Route permissions are manageable by admins and devs" ON public.route_permissions;

-- Create fresh policy using security definer functions to prevent infinite recursion
-- Note: 'dev' role is usually handled by maxRank in functions, but let's be explicit
CREATE POLICY "route_permissions_admin_policy"
ON public.route_permissions
FOR ALL
TO authenticated
USING (
  public.is_admin_or_supervisor(auth.uid()) OR public.has_role(auth.uid(), 'dev')
)
WITH CHECK (
  public.is_admin_or_supervisor(auth.uid()) OR public.has_role(auth.uid(), 'dev')
);
