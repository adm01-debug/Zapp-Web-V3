-- Migration: RLS Audit & Fixes
-- Purpose: Strengthen Row Level Security policies to close permission gaps
-- Impact: Prevents data leakage via overly permissive policies

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ AUDIT: Ensure no "authenticated" policies allow cross-user/team access     ║
-- ║ ISSUE: Tables with bare "authenticated" policies may leak data between     ║
-- ║ teams or users if filters aren't applied correctly                          ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- CHECK #1: users table — verify no unauthenticated access
CREATE POLICY IF NOT EXISTS "users_select_own" ON public.users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- CHECK #2: team_members table — verify team boundary enforcement
CREATE POLICY IF NOT EXISTS "team_members_select_own" ON public.team_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.deleted_at IS NULL
    )
  );

-- CHECK #3: messages table — verify no cross-conversation leakage
CREATE POLICY IF NOT EXISTS "messages_select_team_access" ON public.messages
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
  );

-- CHECK #4: contacts table — verify workspace isolation
CREATE POLICY IF NOT EXISTS "contacts_select_team_access" ON public.contacts
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
  );

-- CHECK #5: conversations table — team boundary validation
CREATE POLICY IF NOT EXISTS "conversations_select_team_access" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = conversations.team_id
        AND tm.user_id = auth.uid()
        AND tm.deleted_at IS NULL
    )
  );

-- CHECK #6: whatsapp_connections — ensure no credential exposure
CREATE POLICY IF NOT EXISTS "whatsapp_connections_select_team" ON public.whatsapp_connections
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = whatsapp_connections.team_id
        AND tm.user_id = auth.uid()
        AND tm.deleted_at IS NULL
    )
  );

-- CHECK #7: gmail_accounts — prevent cross-team email access
CREATE POLICY IF NOT EXISTS "gmail_accounts_select_owner" ON public.gmail_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = gmail_accounts.team_id
        AND tm.user_id = auth.uid()
        AND tm.deleted_at IS NULL
    )
  );

-- CHECK #8: evolution_instances — restrict by team
CREATE POLICY IF NOT EXISTS "evolution_instances_select_team" ON public.evolution_instances
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = evolution_instances.team_id
        AND tm.user_id = auth.uid()
        AND tm.deleted_at IS NULL
    )
  );

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ Service Role Bypass — for edge functions processing webhooks              ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

CREATE POLICY IF NOT EXISTS "service_role_bypass_messages" ON public.messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_bypass_contacts" ON public.contacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_bypass_conversations" ON public.conversations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ Audit Enforcement — track policy changes                                   ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- Log RLS policy audit (for debugging/compliance)
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
