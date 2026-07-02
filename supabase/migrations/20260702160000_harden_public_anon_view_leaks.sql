-- =============================================================================
-- public schema — close anon leaks found during exhaustive validation (2026-07-02)
-- Applied to production live; captured here (idempotent + guarded) so staging
-- reproduces it. Targeted on purpose: `public` is shared and has INTENTIONAL
-- anon-facing objects (e.g. cookies_config), so this does NOT blanket-revoke anon.
-- =============================================================================
-- Findings (discovered via role-simulation testing; anon has USAGE+grants on public):
--  1) public.workspaces had a policy named "service_role_all" that actually
--     targeted PUBLIC with USING(true)/CHECK(true) => anon had full READ+WRITE.
--     Retargeted to authenticated (monotonic: removes anon, keeps logged-in users).
--  2) Three "safe"/redacted views run as owner (bypass RLS) AND were anon-readable,
--     leaking PII to anonymous users:
--       - gmail_accounts_safe          -> connected Gmail email addresses + sync meta
--       - password_reset_requests_safe -> reset emails, IPs, user-agents, status
--       - whatsapp_connections_agent   -> connected WhatsApp phone numbers
--     Fix is REVOKE anon (NOT security_invoker: these run as owner on purpose to give
--     authenticated users a safe projection they otherwise couldn't read).
-- =============================================================================

DO $$
BEGIN
  -- 1) workspaces: retarget the mislabeled PUBLIC policy to authenticated
  IF EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'workspaces'
      AND p.polname = 'service_role_all' AND 0 = ANY(p.polroles)
  ) THEN
    EXECUTE 'ALTER POLICY "service_role_all" ON public.workspaces TO authenticated';
  END IF;

  -- 2) revoke anon on the three RLS-bypassing "safe" views (guarded for fresh envs)
  IF to_regclass('public.gmail_accounts_safe') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON public.gmail_accounts_safe FROM anon';
  END IF;
  IF to_regclass('public.password_reset_requests_safe') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON public.password_reset_requests_safe FROM anon';
  END IF;
  IF to_regclass('public.whatsapp_connections_agent') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON public.whatsapp_connections_agent FROM anon';
  END IF;
END $$;
