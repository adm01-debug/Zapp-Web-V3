-- Migration: 20260704_fix_whisper_messages_indexes_rls.sql
-- Fixes pre-existing gaps in zapp.whisper_messages:
-- 1. Missing indexes (only PK existed - full table scan on every query)
-- 2. auth_full_access policy (USING: true) replaced with granular RLS
--    that enforces agents only see their own whispers

CREATE INDEX IF NOT EXISTS idx_zapp_whisper_contact_id
  ON zapp.whisper_messages (contact_id);

CREATE INDEX IF NOT EXISTS idx_zapp_whisper_target_agent
  ON zapp.whisper_messages (target_agent_id);

CREATE INDEX IF NOT EXISTS idx_zapp_whisper_sender
  ON zapp.whisper_messages (sender_id);

-- Partial index: optimizes unread-count query (.eq contact_id + is_read=false)
CREATE INDEX IF NOT EXISTS idx_zapp_whisper_unread
  ON zapp.whisper_messages (contact_id)
  WHERE is_read = false;

-- Partial index: optimizes thread reply lookups
CREATE INDEX IF NOT EXISTS idx_zapp_whisper_thread
  ON zapp.whisper_messages (whisper_thread_id)
  WHERE whisper_thread_id IS NOT NULL;

-- Remove permissive catch-all policy (any authed user saw ALL whispers)
DROP POLICY IF EXISTS auth_full_access ON zapp.whisper_messages;

-- SELECT: sender OR target OR admin/supervisor
CREATE POLICY whisper_select ON zapp.whisper_messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR target_agent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor')
    )
  );

-- INSERT: agents can only create whispers as themselves
CREATE POLICY whisper_insert ON zapp.whisper_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- UPDATE: covers mark-as-read by sender/target/admin
CREATE POLICY whisper_update ON zapp.whisper_messages
  FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    OR target_agent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    sender_id = auth.uid()
    OR target_agent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor')
    )
  );
