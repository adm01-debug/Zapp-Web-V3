-- fix(rls): Exhaustive follow-up v2 — 5-agent validation + corrective patch
--
-- This migration corrects every production-breaking issue identified after
-- migration 20260804130000_fix_rls_critical_gaps merged into main.
--
-- Root cause of ENABLE RLS gap (unchanged from v1):
--   Migration 20260804120000 aborted at `ALTER TABLE zapp.voice_conversion_queue
--   ENABLE ROW LEVEL SECURITY` (error 42809 — cannot change RLS of a view).
--   PostgreSQL rolled back ALL 23 preceding ENABLE RLS statements in that migration.
--   Migration 20260804130000 only re-enabled RLS on public.voice_conversion_queue
--   (the physical base table), leaving 15+ other tables with policies installed but
--   `relrowsecurity = false` — silently non-enforced.
--
-- v1 issues fixed (F-01 through F-08 — see sections below for details):
--   F-ENABLE-RLS, F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08
--
-- v2 corrections (5-agent post-validation — applied in this file):
--
--   P-01 [HIGH]: F-04 blanket GRANT undoes triagem_security_definer revokes.
--         `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA zapp TO authenticated` overrides
--         316 explicit REVOKE FROM authenticated entries from canonical schema lines
--         10776-10807 (Rodada 1: 231 fn_* SECURITY DEFINER; Rodada 2: 85 named funcs).
--         Fix: blanket GRANT then re-apply BOTH triagem revoke rounds.
--
--   P-02 [CRITICAL]: No existence guard on evo schema for GRANT/REVOKE.
--         Bare `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA evo` fails with
--         "schema evo does not exist" in staging/CI/local environments.
--         Fix: wrapped in DO block with IF EXISTS check.
--
--   P-03 [MEDIUM]: GRANT and ALTER DEFAULT PRIVILEGES missing PROCEDURES/ROUTINES.
--         `ON ALL FUNCTIONS` skips prokind='p' (stored procedures). A-6 in
--         20260804130000 handled existing procedures per-function. F-04/F-08 didn't
--         add forward coverage. Fix: add PROCEDURES (for GRANT/REVOKE) and ROUTINES
--         (for ALTER DEFAULT PRIVILEGES, PostgreSQL 12+ alias covering all routines).
--
--   P-04 [AT RISK]: zapp.audit_logs has no INSERT policy.
--         After F-ENABLE-RLS enables RLS on this table, authenticated INSERT requests
--         from the user client are denied. 5 fire-and-forget call sites in src/ will
--         silently lose audit data:
--           messageSender.ts:158, useAuditLogMutation.ts:14,
--           externalAudioSender.ts:76+171, useReactionMutations.ts:36,
--           useDepartmentManagement.ts:213
--         Fix: CREATE POLICY audit_logs_insert.
--
--   P-05 [MEDIUM-HIGH]: warroom_alerts FOR ALL policy allows DELETE by any user.
--         The inherited `warroom_alerts_authenticated FOR ALL USING(true)` policy
--         now becomes enforced because F-ENABLE-RLS activates RLS on this table.
--         Any authenticated session can delete security alerts (incident suppression).
--         Fix: replace FOR ALL with SELECT+INSERT / separate UPDATE+DELETE (admin only).
--
--   P-06 [MEDIUM]: F-06 DROP POLICY IF EXISTS fails if table is absent.
--         `DROP POLICY IF EXISTS ... ON public.voice_conversion_queue` errors when
--         the table itself does not exist (`IF EXISTS` protects the policy name, not
--         the table reference). Fix: wrapped F-06 in a table existence DO block.
--
--   P-07 [MEDIUM]: Extended-schema DO blocks used `EXCEPTION WHEN OTHERS`.
--         Swallows real failures (permissions, syntax errors). Fix: narrow to
--         `WHEN invalid_schema_name` (3F000) only; re-raise everything else.
--
--   P-08 [HIGH]: zapp.proxy_metrics and zapp.proxy_alerts missing ENABLE RLS.
--         Both tables have admin-only SELECT policies (auth_secure_186, auth_secure_187)
--         that are currently dead because `relrowsecurity=false`. Every authenticated
--         user reads all rows. Fix: ENABLE ROW LEVEL SECURITY on both tables.
--
--   P-09 [MEDIUM]: zapp.feature_flags missing ENABLE RLS.
--         `feature_flags_anon_public` policy (`FOR SELECT TO anon USING(is_public)`)
--         is dead without ENABLE RLS. Any anon GRANT SELECT would read all rows.
--         Fix: ENABLE ROW LEVEL SECURITY.
--
--   P-10 [HIGH]: zapp.talkx_recipients missing INSERT/UPDATE/DELETE policies (Agent 5 GAP-1).
--         F-ENABLE-RLS activates RLS on talkx_recipients but zero write policies existed.
--         useTalkX.ts addRecipients mutation (authenticated client) silently fails.
--         Fix: INSERT/UPDATE/DELETE policies mirroring F-03/F-05 dual-UUID predicate.
--
-- Known limitations (documented, not fixed here):
--   C-01: All statements run in one transaction. An error in any policy fix rolls back
--         all ENABLE RLS calls. Mitigation: every external dependency is IF-EXISTS guarded.
--   M-02: ALTER DEFAULT PRIVILEGES applies only to the migration runner's role.
--         Functions created by other roles still inherit PUBLIC EXECUTE at creation.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (reverse order, run manually):
--
--   -- Restore P-09: zapp.feature_flags
--   ALTER TABLE zapp.feature_flags DISABLE ROW LEVEL SECURITY;
--   -- Restore P-08: proxy tables
--   ALTER TABLE zapp.proxy_metrics DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.proxy_alerts DISABLE ROW LEVEL SECURITY;
--   -- Restore P-05: warroom_alerts policy
--   DROP POLICY IF EXISTS warroom_alerts_select_insert ON zapp.warroom_alerts;
--   DROP POLICY IF EXISTS warroom_alerts_admin_write ON zapp.warroom_alerts;
--   CREATE POLICY warroom_alerts_authenticated ON zapp.warroom_alerts
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   -- Restore P-04: audit_logs INSERT policy
--   DROP POLICY IF EXISTS audit_logs_insert ON zapp.audit_logs;
--   -- Restore F-08: no DDL rollback for ALTER DEFAULT PRIVILEGES (schema metadata only)
--   -- Restore F-07: recreate auth_secure_134 SELECT policy on queues
--   CREATE POLICY auth_secure_134 ON zapp.queues FOR SELECT TO authenticated USING (true);
--   -- Restore F-06: revert to single FOR ALL policy (inside existence check)
--   -- Restore F-05: revert campaigns INSERT/DELETE to admin-only
--   DROP POLICY IF EXISTS talkx_campaigns_insert ON zapp.talkx_campaigns;
--   CREATE POLICY talkx_campaigns_insert ON zapp.talkx_campaigns
--     FOR INSERT TO authenticated WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));
--   DROP POLICY IF EXISTS talkx_campaigns_delete ON zapp.talkx_campaigns;
--   CREATE POLICY talkx_campaigns_delete ON zapp.talkx_campaigns
--     FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor(auth.uid()));
--   -- Restore F-04: no explicit rollback — granular REVOKE needs per-function listing
--   --   (see infra/stack35/SECDEF_REVOKED_20260801.md for the rollback baseline)
--   -- Restore P-10: drop talkx_recipients write policies
--   DROP POLICY IF EXISTS talkx_recipients_insert ON zapp.talkx_recipients;
--   DROP POLICY IF EXISTS talkx_recipients_update ON zapp.talkx_recipients;
--   DROP POLICY IF EXISTS talkx_recipients_delete ON zapp.talkx_recipients;
--   -- Restore F-03: drop talkx_recipients_select
--   DROP POLICY IF EXISTS talkx_recipients_select ON zapp.talkx_recipients;
--   -- Restore F-01/F-02: revert to tautology form (not recommended — security regression)
--   -- Restore F-ENABLE-RLS: disable RLS on added tables
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
--   ALTER TABLE zapp.proxy_metrics DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.proxy_alerts DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zapp.feature_flags DISABLE ROW LEVEL SECURITY;
--   -- (ai schema tables: DISABLE inside DO block if they exist)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- F-ENABLE-RLS: Enable RLS on all zapp tables with dead policies
--               (rolled back by 20260804120000 abort + newly discovered gaps)
--               Each ALTER is idempotent — safe to run if already enabled.
-- ─────────────────────────────────────────────────────────────────────────────

-- Original 12 tables from the 20260804120000 rollback cascade
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

-- P-08: proxy_metrics and proxy_alerts — admin-only policies were dead
ALTER TABLE zapp.proxy_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.proxy_alerts ENABLE ROW LEVEL SECURITY;

-- P-09: feature_flags — anon-public policy was dead
ALTER TABLE zapp.feature_flags ENABLE ROW LEVEL SECURITY;

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
--       Same issue as F-01: WITH CHECK used bare `conversation_id`.
--       The USING clause was already correct in 20260804130000; only WITH CHECK
--       needed fixing — both are now explicitly qualified.
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
--       Campaign owners storing created_by = auth.uid() could see their campaigns
--       but were blocked from reading their recipients.
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
--       deleteCampaign. Both operations must allow the campaign owner.
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
-- P-04: Add audit_logs INSERT policy (Agent 3 AT RISK finding)
--       F-ENABLE-RLS activates RLS on audit_logs but no INSERT policy existed.
--       5 fire-and-forget INSERT call sites in src/ silently lost audit data:
--         messageSender.ts:158, useAuditLogMutation.ts:14, externalAudioSender.ts,
--         useReactionMutations.ts:36, useDepartmentManagement.ts:213
--       Policy allows users to insert their own audit records (user_id matches
--       their profile.id or auth.uid()) — admin/supervisor bypass included.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS audit_logs_insert ON zapp.audit_logs;
CREATE POLICY audit_logs_insert ON zapp.audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR user_id = auth.uid()
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- P-05: Tighten warroom_alerts — replace FOR ALL with split policies
--       The inherited FOR ALL USING(true) policy is now enforced by F-ENABLE-RLS.
--       Any authenticated user could DELETE security alerts (incident suppression).
--       Fix: authenticated users can SELECT and INSERT; only admin/supervisor can
--       UPDATE or DELETE.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS warroom_alerts_authenticated ON zapp.warroom_alerts;
DROP POLICY IF EXISTS warroom_alerts_select_insert ON zapp.warroom_alerts;
DROP POLICY IF EXISTS warroom_alerts_admin_write ON zapp.warroom_alerts;

CREATE POLICY warroom_alerts_select_insert ON zapp.warroom_alerts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY warroom_alerts_insert_policy ON zapp.warroom_alerts
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY warroom_alerts_admin_write ON zapp.warroom_alerts
  FOR UPDATE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

CREATE POLICY warroom_alerts_admin_delete ON zapp.warroom_alerts
  FOR DELETE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- F-04 (v2): Re-grant EXECUTE to authenticated in zapp and evo schemas
--
--   P-01 FIX: Blanket GRANT is applied first (restores functions that lost
--   access when A-6 did `REVOKE FROM PUBLIC`). Then the triagem_security_definer
--   revokes from canonical schema (lines 10776-10807) are re-applied to preserve
--   the original security posture — preventing authenticated from calling 316
--   SECURITY DEFINER functions that were deliberately restricted.
--
--   P-02 FIX: evo schema wrapped in IF EXISTS guard.
--   P-03 FIX: PROCEDURES added alongside FUNCTIONS.
--   P-07 FIX: Exception handlers narrowed to invalid_schema_name (3F000).
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Blanket GRANT on zapp — restores access lost via A-6 REVOKE FROM PUBLIC
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA zapp TO authenticated, service_role;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA zapp TO authenticated, service_role;

-- Step 2: Re-apply triagem_security_definer Rodada 1
--         RE-REVOKE fn_* SECURITY DEFINER functions from authenticated
--         (mirrors canonical schema lines 10776-10791, Rodada 1)
DO $re_revoke_triagem_1$
DECLARE r record; v_count integer := 0;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef AND n.nspname = 'zapp'
      AND p.proname LIKE 'fn_%'
      AND p.proname NOT IN (
        'fn_analyze_sentiment', 'fn_apply_connection_update', 'fn_auto_escalate_sla',
        'fn_get_vault_secret', 'fn_lgpd_anonymize_deleted_contacts',
        'fn_lgpd_purge_contact_activity', 'fn_lgpd_purge_message_metadata',
        'fn_test_alert_channel', 'fn_use_template'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated',
                   r.nspname, r.proname, r.args);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Re-revoke Rodada 1 (fn_*): % functions', v_count;
END;
$re_revoke_triagem_1$;

-- Step 3: Re-apply triagem_security_definer Rodada 2
--         RE-REVOKE 85 named SECURITY DEFINER functions from authenticated
--         (mirrors canonical schema lines 10794-10807, Rodada 2)
DO $re_revoke_triagem_2$
DECLARE r record; v_count integer := 0;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef AND n.nspname = 'zapp'
      AND p.proname IN (
        'acquire_job_lock', 'add_to_contact_id_graveyard', 'admin_atualizar_usuario_painel',
        'admin_criar_usuario_painel', 'admin_desativar_usuario_painel', 'admin_listar_usuarios_painel',
        'anonymize_contacts_batch', 'apagar_nota_fiscal', 'archive_old_consent_records',
        'audit_role_changes', 'auto_add_deleted_contact_to_graveyard', 'auto_assign_contact',
        'auto_assign_to_queue_agent', 'backup_campaign_contacts', 'bpm_archive_card',
        'bpm_bulk_move_cards', 'bpm_card_counts', 'bpm_check_breached_slas', 'bpm_create_card',
        'bpm_duplicate_card', 'bpm_flow_stats', 'bpm_install_template', 'bpm_move_card',
        'bpm_my_tasks', 'bpm_process_recurrences', 'bpm_refresh_dashboards', 'bpm_search_cards',
        'bpm_workspace_overview', 'bulk_lgpd_optout', 'can_see_pii', 'can_supervise_profile',
        'can_user_see_contact', 'create_pagination_cursor', 'current_user_is_privileged',
        'decode_html_entities', 'deduplicate_campaign_contacts_atomically',
        'delete_contact_completely', 'fin_marcar_parcelas_vencidas', 'handle_new_auth_user_painel',
        'handle_new_user', 'handle_new_user_role', 'handle_new_user_settings',
        'increment_snapshot_version', 'init_agent_stats', 'is_admin_painel',
        'is_contact_id_available', 'is_feature_enabled', 'is_manager_or_above',
        'mask_channel_credentials', 'messages_instead_of_delete', 'messages_instead_of_update',
        'normalize_contact_phone_sh', 'normalize_input_nfkc', 'on_role_change',
        'populate_contact_intelligence_batch', 'prevent_audit_modification',
        'prevent_contact_id_reuse', 'prevent_profile_privilege_escalation',
        'rate_limit_reset_requests', 'release_job_lock', 'rls_auto_enable',
        'sanitize_reset_request', 'sanitize_user_input', 'sync_perfil_on_login',
        'sync_tag_use_counts', 'trg_create_followups_on_stage_change',
        'trg_fn_refresh_role_permissions_mv', 'trg_process_chat_event',
        'trg_process_connection_event', 'trg_process_contact_event', 'trg_process_message_delete',
        'trg_process_message_update', 'trg_process_webhook_chats', 'trg_process_webhook_connection',
        'trg_process_webhook_contacts', 'trg_process_webhook_message',
        'trg_process_webhook_msg_delete', 'trg_process_webhook_msg_update',
        'trg_queue_deal_for_bitrix', 'update_large_batch_safe', 'update_segment_counts',
        'upsert_contact_intelligence', 'validate_snapshot_freshness', 'validate_timestamp_freshness'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated',
                   r.nspname, r.proname, r.args);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Re-revoke Rodada 2 (named): % functions', v_count;
END;
$re_revoke_triagem_2$;

-- Step 4: Revoke anon granularly (NOT FROM PUBLIC — that would strip authenticated again)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zapp FROM anon;
REVOKE EXECUTE ON ALL PROCEDURES IN SCHEMA zapp FROM anon;

-- Step 5: evo schema — guarded (P-02 fix: fails without Evolution API in staging/CI)
DO $evo_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'evo') THEN
    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA evo TO authenticated, service_role';
    EXECUTE 'GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA evo TO authenticated, service_role';
    EXECUTE 'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA evo FROM anon';
    EXECUTE 'REVOKE EXECUTE ON ALL PROCEDURES IN SCHEMA evo FROM anon';
  END IF;
END;
$evo_grants$;

-- Step 6: Extended app schemas — P-03 adds PROCEDURES; P-07 narrows exception handler
DO $extend_grants$
DECLARE
  s text;
BEGIN
  FOR s IN VALUES ('bpm'), ('email_app'), ('ai'), ('archive'), ('financeiro'), ('vendas'), ('ops') LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      BEGIN
        EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO authenticated, service_role', s);
        EXECUTE format('GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA %I TO authenticated, service_role', s);
        EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA %I FROM anon', s);
        EXECUTE format('REVOKE EXECUTE ON ALL PROCEDURES IN SCHEMA %I FROM anon', s);
      EXCEPTION
        WHEN invalid_schema_name THEN
          RAISE WARNING 'Schema % not found, skipping', s;
        -- intentionally NOT catching OTHERS — real errors must abort
      END;
    END IF;
  END LOOP;
END;
$extend_grants$;

-- ─────────────────────────────────────────────────────────────────────────────
-- F-08 (v2): ALTER DEFAULT PRIVILEGES — prevent future routines from inheriting
--       PUBLIC EXECUTE at creation time (root cause of A-6 / F-04).
--       P-03 FIX: ON ROUTINES covers both FUNCTIONS and PROCEDURES (PostgreSQL 12+).
--       P-02 FIX: evo schema wrapped in IF EXISTS guard.
--       P-07 FIX: Extended-schema exception handler narrowed.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER DEFAULT PRIVILEGES IN SCHEMA zapp REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA zapp GRANT EXECUTE ON ROUTINES TO authenticated, service_role;

-- evo schema default privileges (P-02: existence guarded)
DO $default_privs_evo$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'evo') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA evo REVOKE EXECUTE ON ROUTINES FROM PUBLIC';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA evo GRANT EXECUTE ON ROUTINES TO authenticated, service_role';
  END IF;
END;
$default_privs_evo$;

-- Extended schemas default privileges (P-07: narrowed exception)
DO $default_privs_extended$
DECLARE
  s text;
BEGIN
  FOR s IN VALUES ('bpm'), ('email_app'), ('ai'), ('archive'), ('financeiro'), ('vendas'), ('ops') LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      BEGIN
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE EXECUTE ON ROUTINES FROM PUBLIC', s
        );
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT EXECUTE ON ROUTINES TO authenticated, service_role', s
        );
      EXCEPTION
        WHEN invalid_schema_name THEN
          RAISE WARNING 'Schema % not found for DEFAULT PRIVILEGES, skipping', s;
        -- intentionally NOT catching OTHERS — real errors must abort
      END;
    END IF;
  END LOOP;
END;
$default_privs_extended$;

-- ─────────────────────────────────────────────────────────────────────────────
-- F-06 (v2): Replace public.voice_conversion_queue FOR ALL with split policies
--       P-06 FIX: Wrapped in table existence check (DROP POLICY IF EXISTS
--       fails if the table itself is absent — IF EXISTS only protects policy name).
-- ─────────────────────────────────────────────────────────────────────────────

DO $f06_voice_queue$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'voice_conversion_queue' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS voice_conversion_queue_authenticated ON public.voice_conversion_queue';
    EXECUTE 'DROP POLICY IF EXISTS voice_conversion_queue_select ON public.voice_conversion_queue';
    EXECUTE 'DROP POLICY IF EXISTS voice_conversion_queue_insert ON public.voice_conversion_queue';
    EXECUTE 'DROP POLICY IF EXISTS voice_conversion_queue_update ON public.voice_conversion_queue';

    -- SELECT only — workers and users check queue status
    EXECUTE 'CREATE POLICY voice_conversion_queue_select ON public.voice_conversion_queue
      FOR SELECT TO authenticated USING (true)';

    -- INSERT only — jobs are submitted via authenticated sessions
    EXECUTE 'CREATE POLICY voice_conversion_queue_insert ON public.voice_conversion_queue
      FOR INSERT TO authenticated WITH CHECK (true)';

    -- UPDATE only — service_role workers update status; authenticated needs UPDATE for optimistic UI
    -- USING(true): any authenticated session can claim a row (worker pattern, not user-scoped)
    EXECUTE 'CREATE POLICY voice_conversion_queue_update ON public.voice_conversion_queue
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END;
$f06_voice_queue$;

-- ─────────────────────────────────────────────────────────────────────────────
-- F-07: Remove redundant auth_secure_134 SELECT policy on zapp.queues
--       After A-4 downgrade in 20260804130000, two identical SELECT policies
--       coexist on zapp.queues. Dropping auth_secure_134 — queues_select remains.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS auth_secure_134 ON zapp.queues;

-- ─────────────────────────────────────────────────────────────────────────────
-- P-10: talkx_recipients write policies (Agent 5 GAP-1 [HIGH])
--       F-ENABLE-RLS activates RLS on talkx_recipients, but no INSERT/UPDATE/DELETE
--       policies existed. Authenticated client writes to this table are silently denied
--       (default-deny with RLS active). Only service_role (edge functions) could write.
--       The useTalkX.ts hook's addRecipients mutation goes through the authenticated
--       client and fails silently without this policy.
--       Policy mirrors F-03/F-05 dual-UUID predicate: campaign owner may be stored
--       as auth.uid() OR as profiles.id — both must be accepted.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS talkx_recipients_insert ON zapp.talkx_recipients;
CREATE POLICY talkx_recipients_insert ON zapp.talkx_recipients FOR INSERT TO authenticated
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM zapp.talkx_campaigns tc
      WHERE tc.created_by = auth.uid()
         OR tc.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS talkx_recipients_update ON zapp.talkx_recipients;
CREATE POLICY talkx_recipients_update ON zapp.talkx_recipients FOR UPDATE TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM zapp.talkx_campaigns tc
      WHERE tc.created_by = auth.uid()
         OR tc.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM zapp.talkx_campaigns tc
      WHERE tc.created_by = auth.uid()
         OR tc.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS talkx_recipients_delete ON zapp.talkx_recipients;
CREATE POLICY talkx_recipients_delete ON zapp.talkx_recipients FOR DELETE TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM zapp.talkx_campaigns tc
      WHERE tc.created_by = auth.uid()
         OR tc.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  );
