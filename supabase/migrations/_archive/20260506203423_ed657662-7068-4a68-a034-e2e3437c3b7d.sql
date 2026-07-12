-- sla_history
DROP POLICY "Users can insert SLA history" ON public.sla_history;
CREATE POLICY "Users can insert SLA history" 
ON public.sla_history FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "Users can update SLA history" ON public.sla_history;
CREATE POLICY "Users can update SLA history" 
ON public.sla_history FOR UPDATE 
TO authenticated 
USING (auth.uid() IS NOT NULL);

-- team_message_receipts
DROP POLICY "Users can update their own receipts" ON public.team_message_receipts;
CREATE POLICY "Users can update their own receipts" 
ON public.team_message_receipts FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() IS NOT NULL);

-- gmail_health_logs
DROP POLICY "Authenticated users can insert gmail health logs" ON public.gmail_health_logs;
CREATE POLICY "Authenticated users can insert gmail health logs" 
ON public.gmail_health_logs FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() IS NOT NULL);
