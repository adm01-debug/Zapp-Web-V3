-- fix(rls): Corrective migration for critical RLS gaps found by post-merge validation
--
-- Fixes 5 confirmed production-breaking findings from exhaustive validation:
--
-- C-1: Migration 20260804120000 targeted zapp.voice_conversion_queue (a VIEW with
--      security_invoker=on). PostgreSQL raises 42809 "cannot change row level security
--      of view" causing the entire migration to abort. Fix: target the physical base
--      table public.voice_conversion_queue instead.
--
-- A-1: zapp.team_messages had only a SELECT policy. With RLS enabled (20260804120000),
--      INSERT/UPDATE/DELETE would block all authenticated users — team chat broken.
--
-- A-2: zapp.talkx_campaigns had only a SELECT policy. Campaign managers could not
--      create/edit/delete campaigns after RLS enablement.
--
-- A-3: zapp.user_roles had no DELETE policy. Role revocation would fail at
--      useAdminManagement.ts:873 with RLS enabled.
--
-- A-4: zapp.queues.auth_secure_134 used FOR ALL USING(true), allowing any authenticated
--      user to DELETE queues. Fix: downgrade to FOR SELECT only (queues_admin_write
--      already restricts writes to admin/supervisor).

-- ─────────────────────────────────────────────────────────────────────────────
-- C-1: Enable RLS on public.voice_conversion_queue (physical base table)
--      The prior migration mistakenly targeted the zapp VIEW. This targets the
--      physical table. The zapp view (security_invoker=on) automatically evaluates
--      the base table's RLS for every caller — no separate view-level policy needed.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS voice_conversion_queue_authenticated ON zapp.voice_conversion_queue;

ALTER TABLE public.voice_conversion_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voice_conversion_queue_authenticated ON public.voice_conversion_queue;
CREATE POLICY voice_conversion_queue_authenticated ON public.voice_conversion_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- A-1: zapp.team_messages — INSERT, UPDATE, DELETE policies
--      sender_id owns their messages; admin/supervisor can write any.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS team_messages_insert ON zapp.team_messages;
CREATE POLICY team_messages_insert ON zapp.team_messages FOR INSERT TO authenticated WITH CHECK (sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS team_messages_update ON zapp.team_messages;
CREATE POLICY team_messages_update ON zapp.team_messages FOR UPDATE TO authenticated USING (sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid())) WITH CHECK (sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS team_messages_delete ON zapp.team_messages;
CREATE POLICY team_messages_delete ON zapp.team_messages FOR DELETE TO authenticated USING (sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- A-2: zapp.talkx_campaigns — INSERT, UPDATE, DELETE policies (admin/supervisor only)
--      Mirrors the campaigns_admin_write pattern for the TalkX campaign module.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS talkx_campaigns_insert ON zapp.talkx_campaigns;
CREATE POLICY talkx_campaigns_insert ON zapp.talkx_campaigns FOR INSERT TO authenticated WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS talkx_campaigns_update ON zapp.talkx_campaigns;
CREATE POLICY talkx_campaigns_update ON zapp.talkx_campaigns FOR UPDATE TO authenticated USING (created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid())) WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS talkx_campaigns_delete ON zapp.talkx_campaigns;
CREATE POLICY talkx_campaigns_delete ON zapp.talkx_campaigns FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- A-3: zapp.user_roles — DELETE policy (admin/supervisor only)
--      user_roles_admin_write only covers INSERT; role revocation needs DELETE.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS user_roles_admin_delete ON zapp.user_roles;
CREATE POLICY user_roles_admin_delete ON zapp.user_roles FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- A-4: zapp.queues — replace auth_secure_134 (FOR ALL USING true → any user can DELETE)
--      with FOR SELECT only. queues_admin_write already handles writes securely.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS auth_secure_134 ON zapp.queues;
CREATE POLICY auth_secure_134 ON zapp.queues FOR SELECT TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Cosmetic: re-declare warroom_alerts policy as single-line so the static CI
-- checker (audit-rls-coverage.mjs) can detect it.
-- Migration 20260804120000 used multiline format; the policy is functionally
-- correct in production but invisible to the regex-based static gate.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS warroom_alerts_authenticated ON zapp.warroom_alerts;
CREATE POLICY warroom_alerts_authenticated ON zapp.warroom_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);
