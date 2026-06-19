
DROP POLICY IF EXISTS "Only admins can manage custom scopes" ON public.inbox_custom_scopes;
CREATE POLICY "Only admins can manage custom scopes"
  ON public.inbox_custom_scopes
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
