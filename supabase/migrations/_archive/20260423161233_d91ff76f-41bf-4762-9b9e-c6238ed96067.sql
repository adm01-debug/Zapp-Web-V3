DROP POLICY IF EXISTS "ipp_admin_all" ON public.instance_processing_pauses;

CREATE POLICY "ipp_admin_select"
  ON public.instance_processing_pauses
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "ipp_admin_insert"
  ON public.instance_processing_pauses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "ipp_admin_update"
  ON public.instance_processing_pauses
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "ipp_admin_delete"
  ON public.instance_processing_pauses
  FOR DELETE
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));