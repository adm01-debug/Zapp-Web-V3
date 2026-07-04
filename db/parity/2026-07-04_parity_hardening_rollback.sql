-- ============================================================================
-- ROLLBACK de db/parity/2026-07-04_parity_hardening.sql
-- ATENÇÃO: o bloco 8 (RLS) restaura o estado ANTERIOR INSEGURO (auth_full_access
-- ALL/true). Só use se o endurecimento quebrar algum fluxo legítimo do app.
-- ============================================================================

-- 1) password_reset_requests
DROP TRIGGER IF EXISTS sanitize_reset_request_trigger ON public.password_reset_requests;
DROP TRIGGER IF EXISTS trg_rate_limit_reset ON public.password_reset_requests;

-- 2) auto-assign
DROP TRIGGER IF EXISTS trg_auto_assign_contact ON evo.evolution_contacts;
DROP TRIGGER IF EXISTS trg_log_assignment_change ON evo.evolution_contacts;
DROP FUNCTION IF EXISTS evo.fn_auto_assign_contact();
DROP FUNCTION IF EXISTS evo.fn_log_assignment_change();
DROP FUNCTION IF EXISTS evo.fn_uuid_safe(text);

-- 3) gamificação
DROP TRIGGER IF EXISTS update_level_on_xp_change ON zapp.agent_stats;
DROP TRIGGER IF EXISTS on_profile_created_init_stats ON public.profiles;
DROP INDEX IF EXISTS zapp.agent_stats_profile_id_key;
-- defaults podem permanecer (inofensivos); para remover:
-- ALTER TABLE zapp.agent_stats ALTER COLUMN xp DROP DEFAULT; -- etc.

-- 4) saved_filters
DROP TRIGGER IF EXISTS ensure_single_default_filter_trigger ON public.saved_filters;

-- 5) user_devices
DROP TRIGGER IF EXISTS update_user_devices_last_seen ON public.user_devices;

-- 6) user_roles audit
DROP TRIGGER IF EXISTS audit_user_role_changes ON public.user_roles;

-- 7) sicoob
DROP TRIGGER IF EXISTS trg_sicoob_reply ON evo.evolution_messages;
DROP FUNCTION IF EXISTS evo.fn_notify_sicoob_on_reply();

-- 8) RLS (restaura estado anterior — INSEGURO)
DROP POLICY IF EXISTS user_roles_select_authenticated ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_manage ON public.user_roles;
CREATE POLICY auth_full_access ON public.user_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS prr_select_own_or_admin ON public.password_reset_requests;
DROP POLICY IF EXISTS prr_insert_own ON public.password_reset_requests;
DROP POLICY IF EXISTS prr_admin_write ON public.password_reset_requests;
DROP POLICY IF EXISTS prr_admin_delete ON public.password_reset_requests;
CREATE POLICY auth_full_access ON public.password_reset_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS gmail_select_own ON email_app.gmail_accounts;
CREATE POLICY auth_full_access ON email_app.gmail_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS prevent_privilege_escalation ON public.profiles;
