-- ============================================================================
-- LOW-1 (2026-07-12): profiles.account_status column — waitlist / approval
--
-- PROBLEM (AUDITORIA_BACKEND_SENIOR_2026-07-11.md LOW-1)
-- -------
-- handle_new_user_role assigns 'agent' to every new auth.users row immediately.
-- Anyone who signs up with a valid email gets operational access with no
-- approval gate — messages can be read, conversations claimed, etc.
--
-- SOLUTION
-- --------
--   1. Add account_status TEXT column to profiles (default 'active' so
--      existing users are not affected).
--   2. Update handle_new_user to insert account_status = 'pending' for all
--      new registrations (admin must approve to 'active').
--   3. Create is_active_user() STABLE helper for use in RLS policies.
--   4. Add RESTRICTIVE RLS policies on conversations + messages so that
--      pending/suspended users cannot read or write those tables regardless
--      of other permissive policies.
--   5. Add rpc_approve_user(p_profile_id) admin-only RPC for approval workflow.
--
-- Existing users: account_status defaults to 'active' — no disruption.
-- New users: start as 'pending'; admin calls rpc_approve_user() to activate.
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add account_status column
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
  CHECK (account_status IN ('active', 'pending', 'suspended'));

-- Performance: RLS checks hit this column frequently.
CREATE INDEX IF NOT EXISTS idx_profiles_user_id_account_status
  ON public.profiles(user_id, account_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Update handle_new_user to set pending for new registrations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email, account_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.email,
    'pending'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. is_active_user() — stable helper for RLS and application use
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND account_status = 'active'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RESTRICTIVE RLS policies — block non-active users from core tables
--    RESTRICTIVE policies are ANDed with permissive ones; they cannot be
--    bypassed even if a permissive policy would grant access.
-- ─────────────────────────────────────────────────────────────────────────────

-- conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restrict_pending_users_conversations" ON public.conversations;
CREATE POLICY "restrict_pending_users_conversations"
  ON public.conversations
  AS RESTRICTIVE
  USING (public.is_active_user());

-- messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restrict_pending_users_messages" ON public.messages;
CREATE POLICY "restrict_pending_users_messages"
  ON public.messages
  AS RESTRICTIVE
  USING (public.is_active_user());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. rpc_approve_user — admin sets account_status = 'active'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_approve_user(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
        PERFORM public.log_rls_denied(
            'profiles', 'admin',
            jsonb_build_object('rpc', 'rpc_approve_user', 'p_profile_id', p_profile_id)
        );
        RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
    END IF;

    UPDATE public.profiles
       SET account_status = 'active'
     WHERE id = p_profile_id
       AND account_status = 'pending';

    RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_approve_user(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_approve_user(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. rpc_suspend_user — admin sets account_status = 'suspended'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_suspend_user(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
        PERFORM public.log_rls_denied(
            'profiles', 'admin',
            jsonb_build_object('rpc', 'rpc_suspend_user', 'p_profile_id', p_profile_id)
        );
        RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
    END IF;

    UPDATE public.profiles
       SET account_status = 'suspended'
     WHERE id = p_profile_id;

    RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_suspend_user(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_suspend_user(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Validate
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'account_status'
  ) THEN
    RAISE EXCEPTION 'LOW-1 FAILED: profiles.account_status column missing';
  END IF;

  -- Restrictive policies exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversations'
      AND policyname = 'restrict_pending_users_conversations'
  ) THEN
    RAISE EXCEPTION 'LOW-1 FAILED: restrict_pending_users_conversations policy missing';
  END IF;

  RAISE NOTICE 'LOW-1 OK: profiles.account_status + is_active_user() + restrictive RLS + approve/suspend RPCs.';
END;
$$;
