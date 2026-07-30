DROP POLICY IF EXISTS "pml_admin_update" ON public.provider_message_log;

CREATE POLICY "pml_admin_update"
ON public.provider_message_log
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));