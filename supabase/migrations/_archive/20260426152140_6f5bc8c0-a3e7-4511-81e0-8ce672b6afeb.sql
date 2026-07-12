DROP POLICY IF EXISTS "Authenticated can insert send failures" ON public.send_failures;

CREATE POLICY "Service role inserts send failures"
ON public.send_failures
FOR INSERT
TO service_role
WITH CHECK (true);