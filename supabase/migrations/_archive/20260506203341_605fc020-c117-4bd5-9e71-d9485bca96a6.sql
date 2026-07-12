-- conversations
DROP POLICY "Users can manage conversations" ON public.conversations;
CREATE POLICY "Users can manage conversations" 
ON public.conversations FOR ALL 
TO authenticated 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- automation_executions
DROP POLICY "executions_insert_authenticated" ON public.automation_executions;
CREATE POLICY "executions_insert_authenticated" 
ON public.automation_executions FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() IS NOT NULL);

-- ai_autonomous_resolutions
DROP POLICY "Service role can manage resolutions" ON public.ai_autonomous_resolutions;
CREATE POLICY "Service role can manage resolutions" 
ON public.ai_autonomous_resolutions FOR ALL 
TO authenticated 
USING (auth.uid() IS NOT NULL);

-- conversation_qa_scores
DROP POLICY "Service role manages QA scores" ON public.conversation_qa_scores;
CREATE POLICY "Service role manages QA scores" 
ON public.conversation_qa_scores FOR ALL 
TO authenticated 
USING (auth.uid() IS NOT NULL);

-- file_scan_logs
DROP POLICY "Service role can manage scan logs" ON public.file_scan_logs;
CREATE POLICY "Service role can manage scan logs" 
ON public.file_scan_logs FOR ALL 
TO authenticated 
USING (auth.uid() IS NOT NULL);

-- evolution_send_idempotency
DROP POLICY "service_role_all_evolution_send_idempotency" ON public.evolution_send_idempotency;
CREATE POLICY "service_role_all_evolution_send_idempotency" 
ON public.evolution_send_idempotency FOR ALL 
TO authenticated 
USING (auth.uid() IS NOT NULL);
