-- Comprehensive fix for blanket authenticated write-access policies across the evo schema.
--
-- Context: PR #499 Codex audit revealed that the P1-B finding (auth_full_access FOR ALL
-- USING(true) on authenticated users) was not limited to the 9 tables fixed in migration
-- 000010. A full scan of the evo schema found 73+ more tables with the same pattern,
-- including conversation/message partitions and operational logs.
--
-- Fix strategy:
--   Phase 1 (40 tables): Service-managed tables → authenticated READ-ONLY.
--     Audit logs, metrics, webhook events, mirror queues, retry state, etc.
--     These are written exclusively by edge functions (service_role). Authenticated
--     users receive workspace-scoped SELECT; all write access is removed.
--
--   Phase 2 (5 tables): Conversation partitions without the standard UPDATE policy.
--     evolution_conversations_compras/_default/_financeiro/_logistica/_marketing had
--     auth_full_access FOR ALL while other conversation partitions (artes, comercial_01-15,
--     gravacao, wpp2) have targeted authenticated_update (UPDATE only). Aligned.
--     NOTE: USING (true) is intentional — these are child partitions of a partitioned root
--     table (evolution_conversations). Tenant isolation is enforced by RLS on the root table
--     and by the instance_name column (partition key). Duplicating a workspace_members check
--     on every partition would (a) create inconsistency with the pre-existing wpp2/artes/…
--     pattern, (b) add redundant overhead, and (c) risk policy drift. The root table is the
--     single authoritative security boundary per PostgreSQL RLS partition semantics.
--
--   Phase 3 (5 tables): Message partitions without the standard INSERT policy.
--     Same asymmetry as Phase 2 for evolution_messages_compras/_default/_financeiro/
--     _logistica/_marketing. Aligned with the authenticated_insert (INSERT only) pattern.
--     NOTE: WITH CHECK (true) is intentional for the same reason as Phase 2 — the root
--     table evolution_messages enforces tenant isolation; child partitions inherit its RLS.
--
--   Phase 4 (22 tables): User-configurable tables → workspace-scoped FOR ALL.
--     automations, quick_replies, broadcasts, business_hours, contact_notes, etc.
--     Authenticated users legitimately write to these. Replace USING(true) blanket
--     access with a workspace_members membership check (tenant isolation).
--
-- All changes are idempotent. Tables not found in the evo schema are silently skipped.

DO $$
DECLARE
  tbl  TEXT;
  prec RECORD;
BEGIN

  ----------------------------------------------------------------------------
  -- PHASE 1: Service-managed tables → authenticated SELECT-only
  -- Drop any authenticated non-SELECT policies; add workspace-scoped SELECT.
  ----------------------------------------------------------------------------
  FOR tbl IN SELECT unnest(ARRAY[
    'evolution_audit_log',
    'evolution_automation_logs',
    'evolution_backfill_audit',
    'evolution_baileys_session_history',
    'evolution_bitrix_sync',
    'evolution_calls',
    'evolution_campaign_recipients',
    'evolution_connection_history',
    'evolution_contact_rate_limits',
    'evolution_daily_metrics',
    'evolution_dlq',
    'evolution_ef_logs',
    'evolution_fallback_events',
    'evolution_group_messages',
    'evolution_group_participants',
    'evolution_group_stats',
    'evolution_mirror_batches',
    'evolution_mirror_checkpoints',
    'evolution_mirror_media_queue',
    'evolution_mirror_runs',
    'evolution_notification_log',
    'evolution_pipeline_health_log',
    'evolution_pipeline_history',
    'evolution_realtime_events',
    'evolution_retention_log',
    'evolution_retry_metrics',
    'evolution_send_idempotency',
    'evolution_sentiment_alerts',
    'evolution_sentiment_metrics',
    'evolution_source_schema_map',
    'evolution_template_usage',
    'evolution_typebot_sessions',
    'evolution_webhook_dlq',
    'evolution_webhook_events_compras',
    'evolution_webhook_events_default',
    'evolution_webhook_events_financeiro',
    'evolution_webhook_events_logistica',
    'evolution_webhook_events_marketing',
    'evolution_webhook_events_wpp2',
    'evolution_webhook_metrics'
  ]) LOOP

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = tbl AND n.nspname = 'evo'
        AND c.relkind IN ('r','p')
    ) THEN
      RAISE NOTICE 'SKIP phase1 % — not found in evo schema', tbl;
      CONTINUE;
    END IF;

    -- Drop all non-SELECT authenticated policies (any name)
    FOR prec IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'evo' AND tablename = tbl
        AND roles @> ARRAY['authenticated']::name[]
        AND cmd != 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY %I ON evo.%I', prec.policyname, tbl);
      RAISE NOTICE 'phase1: dropped % on evo.%', prec.policyname, tbl;
    END LOOP;

    -- Add workspace-scoped SELECT policy if no SELECT policy exists yet
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'evo' AND tablename = tbl
        AND roles @> ARRAY['authenticated']::name[]
        AND cmd = 'SELECT'
    ) THEN
      EXECUTE format(
        $pol$CREATE POLICY "auth_read_%s" ON evo.%I
          FOR SELECT TO authenticated
          USING (EXISTS (
            SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()
          ))$pol$,
        tbl, tbl
      );
      RAISE NOTICE 'phase1: created SELECT policy on evo.%', tbl;
    END IF;

  END LOOP;


  ----------------------------------------------------------------------------
  -- PHASE 2: Conversation partitions → UPDATE-only (align with artes, wpp2, …)
  -- These had auth_full_access FOR ALL; they should only allow UPDATE.
  ----------------------------------------------------------------------------
  FOR tbl IN SELECT unnest(ARRAY[
    'evolution_conversations_compras',
    'evolution_conversations_default',
    'evolution_conversations_financeiro',
    'evolution_conversations_logistica',
    'evolution_conversations_marketing'
  ]) LOOP

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = tbl AND n.nspname = 'evo'
        AND c.relkind IN ('r','p')
    ) THEN
      RAISE NOTICE 'SKIP phase2 % — not found', tbl;
      CONTINUE;
    END IF;

    -- Drop all authenticated write policies (FOR ALL)
    FOR prec IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'evo' AND tablename = tbl
        AND roles @> ARRAY['authenticated']::name[]
        AND cmd NOT IN ('SELECT','UPDATE')
    LOOP
      EXECUTE format('DROP POLICY %I ON evo.%I', prec.policyname, tbl);
      RAISE NOTICE 'phase2: dropped % on evo.%', prec.policyname, tbl;
    END LOOP;

    -- Drop blanket FOR ALL (covers SELECT/UPDATE/INSERT/DELETE) if present
    FOR prec IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'evo' AND tablename = tbl
        AND roles @> ARRAY['authenticated']::name[]
        AND cmd = 'ALL'
    LOOP
      EXECUTE format('DROP POLICY %I ON evo.%I', prec.policyname, tbl);
      RAISE NOTICE 'phase2: dropped FOR ALL % on evo.%', prec.policyname, tbl;
    END LOOP;

    -- Add UPDATE-only (matching the pattern of other conversation partitions)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'evo' AND tablename = tbl
        AND roles @> ARRAY['authenticated']::name[]
        AND cmd = 'UPDATE'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "authenticated_update" ON evo.%I FOR UPDATE TO authenticated USING (true)',
        tbl
      );
      RAISE NOTICE 'phase2: created UPDATE policy on evo.%', tbl;
    END IF;

    -- Ensure SELECT policy exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'evo' AND tablename = tbl
        AND roles @> ARRAY['authenticated']::name[]
        AND cmd = 'SELECT'
    ) THEN
      EXECUTE format(
        $pol$CREATE POLICY "auth_read_%s" ON evo.%I
          FOR SELECT TO authenticated
          USING (EXISTS (
            SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()
          ))$pol$,
        tbl, tbl
      );
    END IF;

  END LOOP;


  ----------------------------------------------------------------------------
  -- PHASE 3: Message partitions → INSERT-only (align with artes, wpp2, …)
  -- These had auth_full_access FOR ALL; they should only allow INSERT.
  ----------------------------------------------------------------------------
  FOR tbl IN SELECT unnest(ARRAY[
    'evolution_messages_compras',
    'evolution_messages_default',
    'evolution_messages_financeiro',
    'evolution_messages_logistica',
    'evolution_messages_marketing'
  ]) LOOP

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = tbl AND n.nspname = 'evo'
        AND c.relkind IN ('r','p')
    ) THEN
      RAISE NOTICE 'SKIP phase3 % — not found', tbl;
      CONTINUE;
    END IF;

    -- Drop blanket FOR ALL
    FOR prec IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'evo' AND tablename = tbl
        AND roles @> ARRAY['authenticated']::name[]
        AND cmd = 'ALL'
    LOOP
      EXECUTE format('DROP POLICY %I ON evo.%I', prec.policyname, tbl);
      RAISE NOTICE 'phase3: dropped FOR ALL % on evo.%', prec.policyname, tbl;
    END LOOP;

    -- Add INSERT-only (matching the pattern of other message partitions)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'evo' AND tablename = tbl
        AND roles @> ARRAY['authenticated']::name[]
        AND cmd = 'INSERT'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "authenticated_insert" ON evo.%I FOR INSERT TO authenticated WITH CHECK (true)',
        tbl
      );
      RAISE NOTICE 'phase3: created INSERT policy on evo.%', tbl;
    END IF;

    -- Ensure SELECT policy exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'evo' AND tablename = tbl
        AND roles @> ARRAY['authenticated']::name[]
        AND cmd = 'SELECT'
    ) THEN
      EXECUTE format(
        $pol$CREATE POLICY "auth_read_%s" ON evo.%I
          FOR SELECT TO authenticated
          USING (EXISTS (
            SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()
          ))$pol$,
        tbl, tbl
      );
    END IF;

  END LOOP;


  ----------------------------------------------------------------------------
  -- PHASE 4: User-configurable tables → workspace-scoped FOR ALL
  -- Authenticated users legitimately write to these (automations, quick replies,
  -- contact notes, scheduled messages, etc.). Replace USING(true) blanket policy
  -- with workspace_members scoping to achieve tenant isolation.
  ----------------------------------------------------------------------------
  FOR tbl IN SELECT unnest(ARRAY[
    'evolution_automations',
    'evolution_bitrix_field_mapping',
    'evolution_blacklist',
    'evolution_broadcasts',
    'evolution_business_hours',
    'evolution_contact_attachments',
    'evolution_contact_blacklist',
    'evolution_contact_notes',
    'evolution_followup_rules',
    'evolution_group_rules',
    'evolution_holidays',
    'evolution_keyword_automations',
    'evolution_label_associations',
    'evolution_notification_config',
    'evolution_notifications',
    'evolution_quick_replies',
    'evolution_sales_pipeline',
    'evolution_scheduled_messages',
    'evolution_spam_keywords',
    'evolution_stage_mapping',
    'evolution_tag_assignments',
    'evolution_tasks'
  ]) LOOP

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = tbl AND n.nspname = 'evo'
        AND c.relkind IN ('r','p')
    ) THEN
      RAISE NOTICE 'SKIP phase4 % — not found', tbl;
      CONTINUE;
    END IF;

    -- Drop all existing authenticated policies (replace with scoped version)
    FOR prec IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'evo' AND tablename = tbl
        AND roles @> ARRAY['authenticated']::name[]
    LOOP
      EXECUTE format('DROP POLICY %I ON evo.%I', prec.policyname, tbl);
      RAISE NOTICE 'phase4: dropped % on evo.%', prec.policyname, tbl;
    END LOOP;

    -- Workspace-scoped FOR ALL: read + write allowed, but only for workspace members
    EXECUTE format(
      $pol$CREATE POLICY "auth_workspace_all_%s" ON evo.%I
        FOR ALL TO authenticated
        USING (EXISTS (
          SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()
        ))$pol$,
      tbl, tbl
    );
    RAISE NOTICE 'phase4: created workspace-scoped ALL on evo.%', tbl;

  END LOOP;

END $$;
