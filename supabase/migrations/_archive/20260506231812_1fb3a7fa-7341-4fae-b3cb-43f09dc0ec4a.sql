DROP POLICY IF EXISTS "Profiles visibility" ON public.profiles;

CREATE POLICY "Profiles visibility"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth_helpers.has_role(auth.uid(), 'manager'::app_role)
  OR auth_helpers.has_role(auth.uid(), 'admin'::app_role)
  OR auth_helpers.has_role(auth.uid(), 'dev'::app_role)
  OR user_id = auth.uid()
  OR department_id = public.get_user_department(auth.uid())
);