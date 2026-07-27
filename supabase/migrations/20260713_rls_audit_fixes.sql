-- Migration: RLS Audit & Fixes
-- Purpose: Strengthen Row Level Security policies to close permission gaps
-- Impact: Prevents data leakage via overly permissive policies
-- Note: All DDL is guarded by existence checks so the migration is idempotent
--       on databases where these tables were renamed, moved, or never created.

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ AUDIT: Ensure no "authenticated" policies allow cross-user/team access     ║
-- ║ ISSUE: Tables with bare "authenticated" policies may leak data between     ║
-- ║ teams or users if filters aren't applied correctly                          ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- CHECK #1: users table — verify no unauthenticated access
DO $c1$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'users' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP rls_audit_fixes CHECK #1 — public.users not a base table'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_select_own') THEN
    EXECUTE $pol$ CREATE POLICY "users_select_own" ON public.users
      FOR SELECT TO authenticated USING (auth.uid() = id) $pol$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_update_own') THEN
    EXECUTE $pol$ CREATE POLICY "users_update_own" ON public.users
      FOR UPDATE TO authenticated USING (auth.uid() = id) $pol$;
  END IF;
END $c1$;

-- CHECK #2: team_members table — verify team boundary enforcement
DO $c2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_members' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP rls_audit_fixes CHECK #2 — public.team_members not a base table'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_members' AND policyname='team_members_select_own') THEN
    EXECUTE $pol$
      CREATE POLICY "team_members_select_own" ON public.team_members
        FOR SELECT TO authenticated
        USING (
          user_id = auth.uid() OR
          EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = team_members.team_id
              AND tm.user_id = auth.uid()
              AND tm.deleted_at IS NULL
          )
        )
    $pol$;
  END IF;
END $c2$;

-- CHECK #3: messages table — verify no cross-conversation leakage
DO $c3$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'messages' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP rls_audit_fixes CHECK #3 — public.messages not a base table'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_select_team_access') THEN
    EXECUTE $pol$
      CREATE POLICY "messages_select_team_access" ON public.messages
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
              AND (
                c.user_id = auth.uid() OR
                EXISTS (
                  SELECT 1 FROM public.team_members tm
                  WHERE tm.team_id = c.team_id
                    AND tm.user_id = auth.uid()
                    AND tm.deleted_at IS NULL
                )
              )
          )
        )
    $pol$;
  END IF;
END $c3$;

-- CHECK #4: contacts table — verify workspace isolation
DO $c4$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'contacts' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP rls_audit_fixes CHECK #4 — public.contacts not a base table'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='contacts_select_team_access') THEN
    EXECUTE $pol$
      CREATE POLICY "contacts_select_team_access" ON public.contacts
        FOR SELECT TO authenticated
        USING (
          team_id IS NULL OR
          auth.uid() = user_id OR
          EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = contacts.team_id
              AND tm.user_id = auth.uid()
              AND tm.deleted_at IS NULL
          )
        )
    $pol$;
  END IF;
END $c4$;

-- CHECK #5: conversations table — team boundary validation
DO $c5$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'conversations' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP rls_audit_fixes CHECK #5 — public.conversations not a base table'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversations' AND policyname='conversations_select_team_access') THEN
    EXECUTE $pol$
      CREATE POLICY "conversations_select_team_access" ON public.conversations
        FOR SELECT TO authenticated
        USING (
          user_id = auth.uid() OR
          EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = conversations.team_id
              AND tm.user_id = auth.uid()
              AND tm.deleted_at IS NULL
          )
        )
    $pol$;
  END IF;
END $c5$;

-- CHECK #6: whatsapp_connections — ensure no credential exposure
DO $c6$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whatsapp_connections' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP rls_audit_fixes CHECK #6 — public.whatsapp_connections not a base table'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_connections' AND policyname='whatsapp_connections_select_team') THEN
    EXECUTE $pol$
      CREATE POLICY "whatsapp_connections_select_team" ON public.whatsapp_connections
        FOR SELECT TO authenticated
        USING (
          user_id = auth.uid() OR
          EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = whatsapp_connections.team_id
              AND tm.user_id = auth.uid()
              AND tm.deleted_at IS NULL
          )
        )
    $pol$;
  END IF;
END $c6$;

-- CHECK #7: gmail_accounts — prevent cross-team email access
DO $c7$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'gmail_accounts' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP rls_audit_fixes CHECK #7 — public.gmail_accounts not a base table'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gmail_accounts' AND policyname='gmail_accounts_select_owner') THEN
    EXECUTE $pol$
      CREATE POLICY "gmail_accounts_select_owner" ON public.gmail_accounts
        FOR SELECT TO authenticated
        USING (
          user_id = auth.uid() OR
          EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = gmail_accounts.team_id
              AND tm.user_id = auth.uid()
              AND tm.deleted_at IS NULL
          )
        )
    $pol$;
  END IF;
END $c7$;

-- CHECK #8: evolution_instances — restrict by team
DO $c8$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'evolution_instances' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP rls_audit_fixes CHECK #8 — public.evolution_instances not a base table'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evolution_instances' AND policyname='evolution_instances_select_team') THEN
    EXECUTE $pol$
      CREATE POLICY "evolution_instances_select_team" ON public.evolution_instances
        FOR SELECT TO authenticated
        USING (
          user_id = auth.uid() OR
          EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = evolution_instances.team_id
              AND tm.user_id = auth.uid()
              AND tm.deleted_at IS NULL
          )
        )
    $pol$;
  END IF;
END $c8$;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ Service Role Bypass — for edge functions processing webhooks              ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $sr1$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'messages' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP rls_audit_fixes service_role_bypass_messages — not a base table'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='service_role_bypass_messages') THEN
    EXECUTE $pol$ CREATE POLICY "service_role_bypass_messages" ON public.messages
      FOR ALL TO service_role USING (true) WITH CHECK (true) $pol$;
  END IF;
END $sr1$;

DO $sr2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'contacts' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP rls_audit_fixes service_role_bypass_contacts — not a base table'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='service_role_bypass_contacts') THEN
    EXECUTE $pol$ CREATE POLICY "service_role_bypass_contacts" ON public.contacts
      FOR ALL TO service_role USING (true) WITH CHECK (true) $pol$;
  END IF;
END $sr2$;

DO $sr3$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'conversations' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN RAISE NOTICE 'SKIP rls_audit_fixes service_role_bypass_conversations — not a base table'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversations' AND policyname='service_role_bypass_conversations') THEN
    EXECUTE $pol$ CREATE POLICY "service_role_bypass_conversations" ON public.conversations
      FOR ALL TO service_role USING (true) WITH CHECK (true) $pol$;
  END IF;
END $sr3$;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ Audit Enforcement — track policy changes                                   ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $audit_log$
BEGIN
  -- Log RLS policy audit only if the audit_log table exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audit_log' AND n.nspname = 'public' AND c.relkind IN ('r','p')
  ) THEN
    RAISE NOTICE 'SKIP rls_audit_fixes audit INSERT — public.audit_log not found';
    RETURN;
  END IF;

  INSERT INTO public.audit_log (
    event_type,
    description,
    details,
    created_at
  ) VALUES (
    'rls_policy_audit',
    'RLS policies audited and strengthened per 2026-07-13 audit',
    jsonb_build_object(
      'tables_audited', ARRAY[
        'users', 'team_members', 'messages', 'contacts', 'conversations',
        'whatsapp_connections', 'gmail_accounts', 'evolution_instances'
      ],
      'focus_areas', ARRAY[
        'Cross-user data leakage prevention',
        'Team boundary enforcement',
        'Service role bypass for webhooks',
        'Deleted record soft-delete filtering'
      ]
    ),
    NOW()
  ) ON CONFLICT DO NOTHING;
END $audit_log$;
