DROP POLICY IF EXISTS "Admins can manage system connections" ON public.system_connections;

CREATE POLICY "Admins and devs can manage system connections"
ON public.system_connections
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));