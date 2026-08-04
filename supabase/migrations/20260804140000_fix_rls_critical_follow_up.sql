-- fix(rls): Exhaustive follow-up — all gaps found by 5-agent post-merge validation
--
-- This migration corrects every production-breaking issue identified after
-- migration 20260804130000_fix_rls_critical_gaps merged into main.
--
-- Root cause of ENABLE RLS gap:
--   Migration 20260804120000 aborted at `ALTER TABLE zapp.voice_conversion_queue
--   ENABLE ROW LEVEL SECURITY` (error 42809 — cannot change RLS of a view).
--   PostgreSQL rolled back ALL 23 preceding ENABLE RLS statements in that migration.
--   Migration 20260804130000 only re-enabled RLS on public.voice_conversion_queue
--   (the physical base table), leaving 15 other tables with policies installed but
--   `relrowsecurity = false` — silently non-enforced.
--
-- Issues fixed (agent finding codes):
--
--   F-ENABLE-RLS: 12 zapp tables + 3 ai tables missing ENABLE ROW LEVEL SECURITY
--
--   F-01: team_messages_insert WITH CHECK — column ambiguity tautology.
--         `conversation_id` inside EXISTS subquery resolves to `tcm.conversation_id`
--         (inner scope), making the membership check always true → any authenticated
--         user could insert messages into any conversation.
--
--   F-02: team_messages_update WITH CHECK — same tautology in the WITH CHECK clause.
--         The USING clause was correct in 20260804130000; only WITH CHECK had the bug.
--
--   F-03: talkx_recipients_select not widened to match campaigns dual-UUID space.
--         Campaign owners with created_by = auth.uid() could see campaigns
--         (post A-2 fix) but were silently blocked from reading their recipients.
--
--   F-04: A-6 REVOKE FROM PUBLIC in 20260804130000 stripped EXECUTE from authenticated
--         (not just anon) for all functions in zapp/evo that had no explicit GRANT
--         (only inherited via PUBLIC). Safety net: explicit re-grant to authenticated
--         + granular anon revoke.
--
--   F-05: talkx_campaigns INSERT/DELETE reverted to admin-only by 20260804130000,
--         breaking useTalkX.ts:createCampaign (line 69: created_by=auth.uid()) and
--         deleteCampaign (line 118). Campaign owners must be able to manage their own
--         campaigns.
--
--   F-06: voice_conversion_queue physical table policy used FOR ALL (permits DELETE).
--         The zapp VIEW grants only SELECT, INSERT, UPDATE to authenticated (no DELETE).
--         Splitting to three targeted policies closes the delete gap and respects
--         the VIEW-level grant boundary.
--
--   F-07: Redundant auth_secure_134 SELECT policy on zapp.queues after A-4 downgrade.
--         The canonical queues_select (FROM 20260804000000) already covers the same
--         predicate. Duplicate policies create noise and risk ordering confusion.
--
--   F-08: ALTER DEFAULT PRIVILEGES missing from all app schemas.
--         Without this, every new function created in zapp/evo inherits PUBLIC EXECUTE
--         at creation time, silently re-opening anon access after every deployment.
--         Closing this gap permanently with schema-level defaults.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (reverse order, run manually in case of emergency):
--
--   -- Restore F-08: no DDL rollback for ALTER DEFAULT PRIVILEGES (schema metadata only)
--
--   -- Restore F-07: recreate auth_secure_134 SELECT policy on queues
--   CREATE POLICY auth_secure_134 ON zapp.queues FOR SELECT TO authenticated USING (true);
--
--   -- Restore F-06: revert to single FOR ALL policy
--   DROP POLICY IF EXISTS voice_conversion_queue_select ON public.voice_conversion_queue;
--   DROP POLICY IF EXISTS voice_conversion_queue_insert ON public.voice_conversion_queue;
--   DROP POLICY IF EXISTS voice_conversion_queue_update ON public.voice_conversion_queue;
--   CREATE POLICY voice_conversion_queue_authenticated ON public.voice_conversion_queue
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
--   -- Restore F-05: revert campaigns INSERT/DELETE to admin-only
--   DROP POLICY IF EXISTS talkx_campaigns_insert ON zapp.talkx_campaigns;
--   CREATE POLICY talkx_campaigns_insert ON zapp.talkx_campaigns
--     FOR INSERT TO authenticated WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));
--   DROP POLICY IF EXISTS talkx_campaigns_delete ON zapp.talkx_campaigns;
--   CREATE POLICY talkx_campaigns_delete ON zapp.talkx_campaigns
--     FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor(auth.uid()));
--
--   -- Restore F-04: no explicit rollback — granular REVOKE would need per-function listing
--
--   -- Restore F-03: revert recipients policy to original single-predicate form
--   DROP POLICY IF EXISTS talkx_recipients_select ON zapp.talkx_recipients;
--
--   -- Restore F-02: revert team_messages_update to tautology form (not recommended)
--   -- (no structural rollback — the tautology form is a security regression)
--
--   -- Restore F-01: revert team_messages_insert to tautology form (not recommended)
--   -- (no structural rollback — the tautology form is a security regression)
--
--   -- Restore F-ENABLE-RLS: disable RLS on the 15 tables
--   ALTER TABLE zapp.audit_logs DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.departments DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.profiles DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.queue_members DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.queues DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.talkx_campaigns DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.talkx_recipients DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.team_messages DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.user_roles DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.warroom_alerts DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.webhook_audit_log DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.whatsapp_connections DISABLE ROW LEVEL SECURITY;
--   -- (ai schema tables: DISABLE inside DO block if they exist)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- F-ENABLE-RLS: Enable RLS on the 12 zapp tables that had their ENABLE RLS
--               rolled back by migration 20260804120000's 42809 abort.
--               Each ALTER is idempotent — safe to run if already enabled.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE zapp.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.queue_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.talkx_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.talkx_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.warroom_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.webhook_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- ai schema tables — existence-guarded to survive environments without the ai schema
DO $enable_ai_rls$
DECLARE
  t text;
BEGIN
  FOR t IN VALUES ('hf_config'), ('mcp_servers'), ('tool_integrations') LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'ai' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE ai.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END;
$enable_ai_rls$;

-- ─────────────────────────────────────────────────────────────────────────────
-- F-01: Fix team_messages_insert WITH CHECK column ambiguity tautology
--       The prior migration's WITH CHECK used bare `conversation_id` which
--       PostgreSQL resolves to `tcm.conversation_id` (inner FROM scope),
--       making the membership check a tautology — any authenticated user could
--       insert into any conversation. Fix: explicit `team_messages.conversation_id`.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS team_messages_insert ON zapp.team_messages;
CREATE POLICY team_messages_insert ON zapp.team_messages FOR INSERT TO authenticated
  WITH CHECK (
    (
      sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM zapp.team_conversation_members tcm
        JOIN zapp.profiles p2 ON p2.id = tcm.profile_id
        WHERE tcm.conversation_id = team_messages.conversation_id
          AND p2.user_id = auth.uid()
      )
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- F-02: Fix team_messages_update WITH CHECK column ambiguity tautology
--       Same issue as F-01: the WITH CHECK clause used bare `conversation_id`.
--       The USING clause was already correct (used team_messages.conversation_id).
--       Only WITH CHECK needed fixing — both are now explicitly qualified.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS team_messages_update ON zapp.team_messages;
CREATE POLICY team_messages_update ON zapp.team_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.team_conversation_members tcm
      JOIN zapp.profiles p2 ON p2.id = tcm.profile_id
      WHERE tcm.conversation_id = team_messages.conversation_id
        AND p2.user_id = auth.uid()
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM zapp.team_conversation_members tcm
      JOIN zapp.profiles p2 ON p2.id = tcm.profile_id
      WHERE tcm.conversation_id = team_messages.conversation_id
        AND p2.user_id = auth.uid()
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- F-03: Widen talkx_recipients_select to match campaigns dual-UUID predicate
--       Migration 20260804130000 widened talkx_campaigns_select to OR both
--       auth.uid() and profiles.id predicates, but talkx_recipients_select
--       was not updated. Campaign owners storing created_by = auth.uid()
--       could see their campaigns but were blocked from reading their recipients.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS talkx_recipients_select ON zapp.talkx_recipients;
CREATE POLICY talkx_recipients_select ON zapp.talkx_recipients FOR SELECT TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM zapp.talkx_campaigns tc
      WHERE tc.created_by = auth.uid()
         OR tc.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- F-05: Restore talkx_campaigns INSERT/DELETE to allow campaign owners
--       Migration 20260804130000 locked INSERT/DELETE to admin/supervisor only,
--       breaking useTalkX.ts createCampaign (sets created_by = auth.uid()) and
--       deleteCampaign (no admin guard). Both operations must allow the campaign
--       owner (either UUID form) in addition to admin/supervisor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS talkx_campaigns_insert ON zapp.talkx_campaigns;
CREATE POLICY talkx_campaigns_insert ON zapp.talkx_campaigns FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS talkx_campaigns_delete ON zapp.talkx_campaigns;
CREATE POLICY talkx_campaigns_delete ON zapp.talkx_campaigns FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- F-04: Re-grant EXECUTE to authenticated in zapp and evo schemas
--       Migration 20260804130000 A-6 used `REVOKE EXECUTE FROM anon, PUBLIC`.
--       `FROM PUBLIC` strips the privilege from every role that inherited via PUBLIC,
--       which includes `authenticated` for any function that had no explicit
--       GRANT TO authenticated (only implicit via PUBLIC). This safety net
--       re-grants to authenticated and service_role, then revokes from anon only.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA zapp TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA evo TO authenticated, service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zapp FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA evo FROM anon;

-- Extended to additional app schemas that may have the same implicit-PUBLIC gap
DO $extend_anon_revoke$
DECLARE
  s text;
BEGIN
  FOR s IN VALUES ('bpm'), ('email_app'), ('ai'), ('archive'), ('financeiro'), ('vendas'), ('ops') LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      BEGIN
        EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO authenticated, service_role', s);
        EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA %I FROM anon', s);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not adjust EXECUTE grants for schema %: %', s, SQLERRM;
      END;
    END IF;
  END LOOP;
END;
$extend_anon_revoke$;

-- ─────────────────────────────────────────────────────────────────────────────
-- F-08: ALTER DEFAULT PRIVILEGES — prevent future functions from inheriting
--       PUBLIC EXECUTE at creation time (the root cause of A-6 / F-04).
--       Without this, every new function in these schemas reopens anon access.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER DEFAULT PRIVILEGES IN SCHEMA zapp REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA zapp GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA evo REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA evo GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

DO $default_privs_extended$
DECLARE
  s text;
BEGIN
  FOR s IN VALUES ('bpm'), ('email_app'), ('ai'), ('archive'), ('financeiro'), ('vendas'), ('ops') LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      BEGIN
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', s
        );
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role', s
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not set DEFAULT PRIVILEGES for schema %: %', s, SQLERRM;
      END;
    END IF;
  END LOOP;
END;
$default_privs_extended$;

-- ─────────────────────────────────────────────────────────────────────────────
-- F-06: Replace public.voice_conversion_queue FOR ALL with split targeted policies
--       The prior single FOR ALL policy permitted DELETE on the physical base table.
--       The zapp VIEW grants only SELECT, INSERT, UPDATE to authenticated (no DELETE).
--       Three targeted policies now match exactly what the VIEW layer allows.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS voice_conversion_queue_authenticated ON public.voice_conversion_queue;
DROP POLICY IF EXISTS voice_conversion_queue_select ON public.voice_conversion_queue;
DROP POLICY IF EXISTS voice_conversion_queue_insert ON public.voice_conversion_queue;
DROP POLICY IF EXISTS voice_conversion_queue_update ON public.voice_conversion_queue;

CREATE POLICY voice_conversion_queue_select ON public.voice_conversion_queue
  FOR SELECT TO authenticated USING (true);

CREATE POLICY voice_conversion_queue_insert ON public.voice_conversion_queue
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY voice_conversion_queue_update ON public.voice_conversion_queue
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- F-07: Remove redundant auth_secure_134 SELECT policy on zapp.queues
--       After A-4 downgrade in 20260804130000, two identical SELECT policies
--       coexist on zapp.queues: the canonical queues_select (FROM 20260804000000)
--       and auth_secure_134. Dropping auth_secure_134 — queues_select remains.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS auth_secure_134 ON zapp.queues;
