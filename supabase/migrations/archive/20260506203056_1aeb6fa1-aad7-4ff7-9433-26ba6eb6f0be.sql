ALTER TABLE public.sts_alert_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage alert config" 
ON public.sts_alert_config
FOR ALL
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));
