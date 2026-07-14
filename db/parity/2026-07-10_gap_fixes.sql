-- =============================================================================
-- GAP FIXES — post-audit corrections (2026-07-10)
-- Derived from exhaustive simulation batteries T1–T11b + VERIFY (12/12 PASS)
-- =============================================================================
-- FIX 1: prevent_role_escalation — service_role bypass (CRITICAL)
--         service_role JWT has no sub claim → auth.uid()=NULL → is_admin_or_supervisor(NULL)=false
--         → ALL role/access_level/permissions changes via backend SDK were silently reverted
-- FIX 2: email_app.gmail_accounts — service_full_access qual=true leaked to ALL auth users
--         Replaced with service_role claim check + explicit per-operation auth policies
-- FIX 3: saved_filters — auth_full_access qual=true allowed any auth user to see ALL filters
--         Replaced with user_id=auth.uid() scoped policies + shared filter read access
-- FIX 4: zapp.agent_stats — 17 profiles with no stats row (trigger fires only on INSERT)
--         Backfilled with ON CONFLICT DO NOTHING (idempotent)
-- FIX 5: zapp.agent_stats — duplicate UNIQUE index on profile_id
--         Dropped idx_agent_stats_profile; kept constraint agent_stats_profile_id_key
-- =============================================================================
-- DOCUMENTED GAPS (no DDL fix, risk-accepted):
-- GAP-A: Double audit on user_roles — audit_user_role_changes + tr_log_role_changes both fire
--         Both write to public.audit_logs with different actions; double-logging not data loss
-- GAP-B: public.gmail_accounts is a SECURITY INVOKER view over email_app.gmail_accounts
--         RLS on underlying table applies; no fix needed (T9 was false positive)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1: prevent_role_escalation — add service_role bypass
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- service_role (backend/admin SDK) is always permitted
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;

  IF OLD.access_level IS DISTINCT FROM NEW.access_level THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      NEW.access_level := OLD.access_level;
    END IF;
  END IF;

  IF OLD.permissions IS DISTINCT FROM NEW.permissions THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      NEW.permissions := OLD.permissions;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 2: email_app.gmail_accounts — restrict service_full_access to service_role only
-- service_role has BYPASSRLS but this ensures explicit grant for explicit role claim
-- Authenticated users get per-operation policies scoped to user_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "service_full_access"        ON email_app.gmail_accounts;
DROP POLICY IF EXISTS "gmail_accounts_auth_write"  ON email_app.gmail_accounts;
DROP POLICY IF EXISTS "gmail_accounts_auth_update" ON email_app.gmail_accounts;
DROP POLICY IF EXISTS "gmail_accounts_auth_delete" ON email_app.gmail_accounts;

CREATE POLICY "service_full_access" ON email_app.gmail_accounts
  FOR ALL
  USING  (current_setting('request.jwt.claim.role', true) = 'service_role')
  WITH CHECK (current_setting('request.jwt.claim.role', true) = 'service_role');

CREATE POLICY "gmail_accounts_auth_write" ON email_app.gmail_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "gmail_accounts_auth_update" ON email_app.gmail_accounts
  FOR UPDATE TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "gmail_accounts_auth_delete" ON email_app.gmail_accounts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 3: saved_filters — user-scoped policies replacing USING=true
-- is_shared=true rows are readable by all authenticated users (by design)
-- Only the owner can INSERT/UPDATE/DELETE
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_full_access"            ON public.saved_filters;
DROP POLICY IF EXISTS "auth_select_own_or_shared"   ON public.saved_filters;
DROP POLICY IF EXISTS "auth_insert_own"             ON public.saved_filters;
DROP POLICY IF EXISTS "auth_update_own"             ON public.saved_filters;
DROP POLICY IF EXISTS "auth_delete_own"             ON public.saved_filters;

CREATE POLICY "auth_select_own_or_shared" ON public.saved_filters
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_shared = true);

CREATE POLICY "auth_insert_own" ON public.saved_filters
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "auth_update_own" ON public.saved_filters
  FOR UPDATE TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "auth_delete_own" ON public.saved_filters
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 4: zapp.agent_stats — backfill for 17 existing profiles
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO zapp.agent_stats (profile_id)
SELECT id FROM public.profiles
ON CONFLICT (profile_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 5: Drop redundant UNIQUE index — keep UNIQUE CONSTRAINT
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS zapp.idx_agent_stats_profile;

COMMIT;

-- =============================================================================
-- POST-APPLY VERIFICATION (all 12/12 PASS confirmed 2026-07-10)
-- =============================================================================
-- V1:  prevent_role_escalation has service_role bypass                 PASS
-- V2:  service_role can change profiles.role (pre=admin post=supervisor) PASS
-- V3:  Non-admin still blocked (pre=agent post=agent)                  PASS
-- V4:  email_app.gmail_accounts service_full_access uses claim check   PASS
-- V5:  email_app.gmail_accounts policy count: 5                        PASS
-- V6:  saved_filters auth_full_access removed                          PASS
-- V7:  saved_filters policies scope by auth.uid()                      PASS
-- V8:  Profiles without agent_stats: 0                                 PASS
-- V9:  idx_agent_stats_profile removed                                 PASS
-- V10: agent_stats_profile_id_key constraint intact                    PASS
-- V11: ON CONFLICT(profile_id) works after index drop                  PASS
-- V12: prevent_privilege_escalation trigger still enabled              PASS
-- =============================================================================
