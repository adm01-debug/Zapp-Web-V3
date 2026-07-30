
DROP POLICY IF EXISTS "manage channel_queues" ON public.channel_queues;

CREATE POLICY "channel_queues insert admin" ON public.channel_queues
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "channel_queues update admin" ON public.channel_queues
  FOR UPDATE TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "channel_queues delete admin" ON public.channel_queues
  FOR DELETE TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
