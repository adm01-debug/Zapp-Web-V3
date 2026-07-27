-- conversations
DO $b1$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'conversations' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP 20260506203341 — public.conversations not a base table'; RETURN; END IF;
  DROP POLICY IF EXISTS "Users can manage conversations" ON public.conversations;
  EXECUTE $pol$ CREATE POLICY "Users can manage conversations"
    ON public.conversations FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL) $pol$;
END $b1$;

-- automation_executions
DO $b2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'automation_executions' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP 20260506203341 — public.automation_executions not a base table'; RETURN; END IF;
  DROP POLICY IF EXISTS "executions_insert_authenticated" ON public.automation_executions;
  EXECUTE $pol$ CREATE POLICY "executions_insert_authenticated"
    ON public.automation_executions FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL) $pol$;
END $b2$;

-- ai_autonomous_resolutions
DO $b3$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'ai_autonomous_resolutions' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP 20260506203341 — public.ai_autonomous_resolutions not found'; RETURN; END IF;
  DROP POLICY IF EXISTS "Service role can manage resolutions" ON public.ai_autonomous_resolutions;
  EXECUTE $pol$ CREATE POLICY "Service role can manage resolutions"
    ON public.ai_autonomous_resolutions FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL) $pol$;
END $b3$;

-- conversation_qa_scores
DO $b4$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'conversation_qa_scores' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP 20260506203341 — public.conversation_qa_scores not found'; RETURN; END IF;
  DROP POLICY IF EXISTS "Service role manages QA scores" ON public.conversation_qa_scores;
  EXECUTE $pol$ CREATE POLICY "Service role manages QA scores"
    ON public.conversation_qa_scores FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL) $pol$;
END $b4$;

-- file_scan_logs
DO $b5$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'file_scan_logs' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP 20260506203341 — public.file_scan_logs not a base table'; RETURN; END IF;
  DROP POLICY IF EXISTS "Service role can manage scan logs" ON public.file_scan_logs;
  EXECUTE $pol$ CREATE POLICY "Service role can manage scan logs"
    ON public.file_scan_logs FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL) $pol$;
END $b5$;

-- evolution_send_idempotency
DO $b6$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'evolution_send_idempotency' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP 20260506203341 — public.evolution_send_idempotency not a base table'; RETURN; END IF;
  DROP POLICY IF EXISTS "service_role_all_evolution_send_idempotency" ON public.evolution_send_idempotency;
  EXECUTE $pol$ CREATE POLICY "service_role_all_evolution_send_idempotency"
    ON public.evolution_send_idempotency FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL) $pol$;
END $b6$;
