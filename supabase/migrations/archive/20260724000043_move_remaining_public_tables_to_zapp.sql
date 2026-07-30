-- Migration: move 9 remaining public-schema tables to zapp schema
--
-- Context:
--   The Supabase client is configured with db: { schema: 'zapp' }, so every
--   safeClient.from('X') call sends Accept-Profile: zapp → PostgREST resolves
--   against zapp → PGRST205 if the relation is only in public.
--
--   Affected calls:
--     • safeClient.from('business_hours', ...) in:
--         useBusinessHoursManagement.ts:63,104         → PGRST205
--     • safeClient.from('channel_routing_rules', ...) in:
--         useOmnichannelManagement.ts:147,175,188,200  → PGRST205
--     • safeClient.from('followup_steps', ...) in:
--         useFollowUpSequences.ts:56                   → PGRST205
--     • safeClient.from('conversation_sla', ...) in:
--         useAlertManagement.ts:196                    → PGRST205
--         useCrisisRoomData.ts:14                      → PGRST205
--         useContactEnrichedData.ts:157                → PGRST205
--         NextBestActionEngine.tsx:103                 → PGRST205
--         useSLAHistory.ts:70                          → PGRST205
--         useSLAMetrics.ts:68                          → PGRST205
--     • safeClient.from('sla_delivery_violations', ...) in:
--         SLADeliveryHistoryDashboard.tsx:51,69        → PGRST205
--     • safeClient.from('sla_history', ...) in:
--         useSLAAlertHistory.ts:96                     → PGRST205
--     • safeClient.from('sla_alert_preferences', ...) in:
--         useSLAAlertPreferences.ts:97                 → PGRST205
--     • safeClient.from('sales_deals', ...) in:
--         useBusinessLogicManagement.ts:410,503-572    → PGRST205
--     • safeClient.from('dev_diagnostic_logs', ...) in:
--         AdminDevDiagnosticsPage.tsx:64               → PGRST205
--
--   Fix: ALTER TABLE public.X SET SCHEMA zapp (idempotent DO block per table)
--   then drop stale policies, recreate using zapp-namespace functions.
--
--   Additionally:
--     • conversation_sla and sales_deals: added to supabase_realtime publication
--       (migration 20260724000039 skipped them because they were not yet in zapp)
--
--   Pattern per table:
--     1. Verify public has physical table AND zapp does not → SET SCHEMA
--     2. If already in zapp → NOTICE skip
--     3. Otherwise (neither) → NOTICE
--     4. Enable RLS
--     5. Drop all stale policies
--     6. Recreate RLS policies using zapp.is_admin_or_supervisor() and auth.uid()
--     7. GRANT permissions
--     8. Add to supabase_realtime publication where needed

-- ---------------------------------------------------------------------------
-- 1. zapp.business_hours
--    Original: SELECT for all authenticated, ALL for admins
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'business_hours'
      AND c.relkind IN ('r', 'p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'business_hours'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'ALTER TABLE public.business_hours SET SCHEMA zapp';
    RAISE NOTICE 'MOVED business_hours to zapp schema';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'business_hours'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'business_hours already in zapp schema — skipping move';
  ELSE
    RAISE NOTICE 'business_hours not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'business_hours') THEN
    EXECUTE 'ALTER TABLE zapp.business_hours ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;

DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'business_hours'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.business_hours', pol);
  END LOOP;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'business_hours') THEN
    EXECUTE $pol$
      CREATE POLICY "business_hours_select_authenticated"
        ON zapp.business_hours FOR SELECT TO authenticated USING (true)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "business_hours_all_admin"
        ON zapp.business_hours FOR ALL TO authenticated
        USING (zapp.is_admin_or_supervisor())
        WITH CHECK (zapp.is_admin_or_supervisor())
    $pol$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.business_hours TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.business_hours TO service_role';
    RAISE NOTICE 'CONFIGURED zapp.business_hours (RLS + grants)';
  END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- 2. zapp.channel_routing_rules
--    Original: SELECT for all authenticated, ALL for admins
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'channel_routing_rules'
      AND c.relkind IN ('r', 'p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'channel_routing_rules'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'ALTER TABLE public.channel_routing_rules SET SCHEMA zapp';
    RAISE NOTICE 'MOVED channel_routing_rules to zapp schema';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'channel_routing_rules'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'channel_routing_rules already in zapp schema — skipping move';
  ELSE
    RAISE NOTICE 'channel_routing_rules not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'channel_routing_rules') THEN
    EXECUTE 'ALTER TABLE zapp.channel_routing_rules ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;

DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'channel_routing_rules'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.channel_routing_rules', pol);
  END LOOP;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'channel_routing_rules') THEN
    EXECUTE $pol$
      CREATE POLICY "channel_routing_rules_select_authenticated"
        ON zapp.channel_routing_rules FOR SELECT TO authenticated USING (true)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "channel_routing_rules_all_admin"
        ON zapp.channel_routing_rules FOR ALL TO authenticated
        USING (zapp.is_admin_or_supervisor())
        WITH CHECK (zapp.is_admin_or_supervisor())
    $pol$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.channel_routing_rules TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.channel_routing_rules TO service_role';
    RAISE NOTICE 'CONFIGURED zapp.channel_routing_rules (RLS + grants)';
  END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- 3. zapp.followup_steps
--    Original: admin-only management; SELECT allowed to all authenticated
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'followup_steps'
      AND c.relkind IN ('r', 'p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'followup_steps'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'ALTER TABLE public.followup_steps SET SCHEMA zapp';
    RAISE NOTICE 'MOVED followup_steps to zapp schema';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'followup_steps'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'followup_steps already in zapp schema — skipping move';
  ELSE
    RAISE NOTICE 'followup_steps not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'followup_steps') THEN
    EXECUTE 'ALTER TABLE zapp.followup_steps ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;

DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'followup_steps'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.followup_steps', pol);
  END LOOP;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'followup_steps') THEN
    EXECUTE $pol$
      CREATE POLICY "followup_steps_select_authenticated"
        ON zapp.followup_steps FOR SELECT TO authenticated USING (true)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "followup_steps_all_admin"
        ON zapp.followup_steps FOR ALL TO authenticated
        USING (zapp.is_admin_or_supervisor())
        WITH CHECK (zapp.is_admin_or_supervisor())
    $pol$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.followup_steps TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.followup_steps TO service_role';
    RAISE NOTICE 'CONFIGURED zapp.followup_steps (RLS + grants)';
  END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- 4. zapp.conversation_sla
--    Original: SELECT/INSERT/UPDATE open to all authenticated
--    Also: add to supabase_realtime (was SKIPPED in migration 39)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'conversation_sla'
      AND c.relkind IN ('r', 'p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'conversation_sla'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'ALTER TABLE public.conversation_sla SET SCHEMA zapp';
    RAISE NOTICE 'MOVED conversation_sla to zapp schema';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'conversation_sla'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'conversation_sla already in zapp schema — skipping move';
  ELSE
    RAISE NOTICE 'conversation_sla not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'conversation_sla') THEN
    EXECUTE 'ALTER TABLE zapp.conversation_sla ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;

DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'conversation_sla'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.conversation_sla', pol);
  END LOOP;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'conversation_sla') THEN
    EXECUTE $pol$
      CREATE POLICY "conversation_sla_select_authenticated"
        ON zapp.conversation_sla FOR SELECT TO authenticated USING (true)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "conversation_sla_insert_authenticated"
        ON zapp.conversation_sla FOR INSERT TO authenticated WITH CHECK (true)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "conversation_sla_update_authenticated"
        ON zapp.conversation_sla FOR UPDATE TO authenticated USING (true)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "conversation_sla_delete_admin"
        ON zapp.conversation_sla FOR DELETE TO authenticated
        USING (zapp.is_admin_or_supervisor())
    $pol$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.conversation_sla TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.conversation_sla TO service_role';
    RAISE NOTICE 'CONFIGURED zapp.conversation_sla (RLS + grants)';
  END IF;
END; $$;

-- Add to supabase_realtime (was SKIPPED in 20260724000039 because table wasn't in zapp yet)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'conversation_sla'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'SKIP zapp.conversation_sla — not a physical table in this environment';
  ELSIF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename  = 'conversation_sla'
  ) THEN
    RAISE NOTICE 'SKIP zapp.conversation_sla — already in supabase_realtime';
  ELSE
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE zapp.conversation_sla';
    RAISE NOTICE 'ADDED zapp.conversation_sla to supabase_realtime';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. zapp.sla_delivery_violations
--    Original: SELECT open to all authenticated
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'sla_delivery_violations'
      AND c.relkind IN ('r', 'p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'sla_delivery_violations'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'ALTER TABLE public.sla_delivery_violations SET SCHEMA zapp';
    RAISE NOTICE 'MOVED sla_delivery_violations to zapp schema';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'sla_delivery_violations'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'sla_delivery_violations already in zapp schema — skipping move';
  ELSE
    RAISE NOTICE 'sla_delivery_violations not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'sla_delivery_violations') THEN
    EXECUTE 'ALTER TABLE zapp.sla_delivery_violations ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;

DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'sla_delivery_violations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.sla_delivery_violations', pol);
  END LOOP;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'sla_delivery_violations') THEN
    EXECUTE $pol$
      CREATE POLICY "sla_delivery_violations_select_authenticated"
        ON zapp.sla_delivery_violations FOR SELECT TO authenticated USING (true)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "sla_delivery_violations_all_admin"
        ON zapp.sla_delivery_violations FOR ALL TO authenticated
        USING (zapp.is_admin_or_supervisor())
        WITH CHECK (zapp.is_admin_or_supervisor())
    $pol$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.sla_delivery_violations TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.sla_delivery_violations TO service_role';
    RAISE NOTICE 'CONFIGURED zapp.sla_delivery_violations (RLS + grants)';
  END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- 6. zapp.sla_history
--    Original: SELECT/INSERT/UPDATE for all authenticated
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'sla_history'
      AND c.relkind IN ('r', 'p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'sla_history'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'ALTER TABLE public.sla_history SET SCHEMA zapp';
    RAISE NOTICE 'MOVED sla_history to zapp schema';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'sla_history'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'sla_history already in zapp schema — skipping move';
  ELSE
    RAISE NOTICE 'sla_history not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'sla_history') THEN
    EXECUTE 'ALTER TABLE zapp.sla_history ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;

DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'sla_history'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.sla_history', pol);
  END LOOP;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'sla_history') THEN
    EXECUTE $pol$
      CREATE POLICY "sla_history_select_authenticated"
        ON zapp.sla_history FOR SELECT TO authenticated USING (true)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "sla_history_insert_authenticated"
        ON zapp.sla_history FOR INSERT TO authenticated WITH CHECK (true)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "sla_history_update_authenticated"
        ON zapp.sla_history FOR UPDATE TO authenticated USING (true)
    $pol$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.sla_history TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.sla_history TO service_role';
    RAISE NOTICE 'CONFIGURED zapp.sla_history (RLS + grants)';
  END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- 7. zapp.sla_alert_preferences
--    Original: user_id-scoped SELECT/INSERT/UPDATE (auth.uid() = user_id)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'sla_alert_preferences'
      AND c.relkind IN ('r', 'p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'sla_alert_preferences'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'ALTER TABLE public.sla_alert_preferences SET SCHEMA zapp';
    RAISE NOTICE 'MOVED sla_alert_preferences to zapp schema';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'sla_alert_preferences'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'sla_alert_preferences already in zapp schema — skipping move';
  ELSE
    RAISE NOTICE 'sla_alert_preferences not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'sla_alert_preferences') THEN
    EXECUTE 'ALTER TABLE zapp.sla_alert_preferences ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;

DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'sla_alert_preferences'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.sla_alert_preferences', pol);
  END LOOP;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'sla_alert_preferences') THEN
    EXECUTE $pol$
      CREATE POLICY "sla_alert_preferences_select_own"
        ON zapp.sla_alert_preferences FOR SELECT TO authenticated
        USING (auth.uid() = user_id)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "sla_alert_preferences_insert_own"
        ON zapp.sla_alert_preferences FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = user_id)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "sla_alert_preferences_update_own"
        ON zapp.sla_alert_preferences FOR UPDATE TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "sla_alert_preferences_all_admin"
        ON zapp.sla_alert_preferences FOR ALL TO service_role
        USING (true)
    $pol$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.sla_alert_preferences TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.sla_alert_preferences TO service_role';
    RAISE NOTICE 'CONFIGURED zapp.sla_alert_preferences (RLS + grants)';
  END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- 8. zapp.sales_deals
--    Original: SELECT for all authenticated; INSERT by authenticated;
--    UPDATE by assigned_to or admins; DELETE by admins.
--    Also: add to supabase_realtime (was SKIPPED in migration 5 — see CLAUDE.md)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'sales_deals'
      AND c.relkind IN ('r', 'p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'sales_deals'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'ALTER TABLE public.sales_deals SET SCHEMA zapp';
    RAISE NOTICE 'MOVED sales_deals to zapp schema';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'sales_deals'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'sales_deals already in zapp schema — skipping move';
  ELSE
    RAISE NOTICE 'sales_deals not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'sales_deals') THEN
    EXECUTE 'ALTER TABLE zapp.sales_deals ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;

DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'sales_deals'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.sales_deals', pol);
  END LOOP;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'sales_deals') THEN
    EXECUTE $pol$
      CREATE POLICY "sales_deals_select_authenticated"
        ON zapp.sales_deals FOR SELECT TO authenticated USING (true)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "sales_deals_insert_authenticated"
        ON zapp.sales_deals FOR INSERT TO authenticated WITH CHECK (true)
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "sales_deals_update_own_or_admin"
        ON zapp.sales_deals FOR UPDATE TO authenticated
        USING (assigned_to = auth.uid() OR zapp.is_admin_or_supervisor())
        WITH CHECK (assigned_to = auth.uid() OR zapp.is_admin_or_supervisor())
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "sales_deals_delete_admin"
        ON zapp.sales_deals FOR DELETE TO authenticated
        USING (zapp.is_admin_or_supervisor())
    $pol$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.sales_deals TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.sales_deals TO service_role';
    RAISE NOTICE 'CONFIGURED zapp.sales_deals (RLS + grants)';
  END IF;
END; $$;

-- Add to supabase_realtime (was SKIPPED in 20260724000005 because table wasn't in zapp yet)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'sales_deals'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'SKIP zapp.sales_deals — not a physical table in this environment';
  ELSIF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename  = 'sales_deals'
  ) THEN
    RAISE NOTICE 'SKIP zapp.sales_deals — already in supabase_realtime';
  ELSE
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE zapp.sales_deals';
    RAISE NOTICE 'ADDED zapp.sales_deals to supabase_realtime';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. zapp.dev_diagnostic_logs
--    Original: ALL restricted to 'dev' role (using public.has_role)
--    After move: use zapp.has_role() for the 'dev' role check
--    Admins also get access (supervisors can see diagnostic logs)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'dev_diagnostic_logs'
      AND c.relkind IN ('r', 'p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'dev_diagnostic_logs'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'ALTER TABLE public.dev_diagnostic_logs SET SCHEMA zapp';
    RAISE NOTICE 'MOVED dev_diagnostic_logs to zapp schema';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'dev_diagnostic_logs'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE NOTICE 'dev_diagnostic_logs already in zapp schema — skipping move';
  ELSE
    RAISE NOTICE 'dev_diagnostic_logs not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'dev_diagnostic_logs') THEN
    EXECUTE 'ALTER TABLE zapp.dev_diagnostic_logs ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;

DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'dev_diagnostic_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.dev_diagnostic_logs', pol);
  END LOOP;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'zapp' AND tablename = 'dev_diagnostic_logs') THEN
    EXECUTE $pol$
      CREATE POLICY "dev_diagnostic_logs_admin_or_supervisor"
        ON zapp.dev_diagnostic_logs FOR ALL TO authenticated
        USING (zapp.is_admin_or_supervisor())
        WITH CHECK (zapp.is_admin_or_supervisor())
    $pol$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.dev_diagnostic_logs TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.dev_diagnostic_logs TO service_role';
    RAISE NOTICE 'CONFIGURED zapp.dev_diagnostic_logs (RLS + grants)';
  END IF;
END; $$;
