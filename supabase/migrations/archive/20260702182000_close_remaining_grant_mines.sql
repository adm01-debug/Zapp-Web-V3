-- =============================================================================
-- Close the last two latent grant "mines" surfaced by the RLS-vs-GRANT re-scan
-- that followed 20260702180000.
--
-- Both tables have RLS ON and no policy matching these roles, so RLS already
-- denies them 0 rows TODAY — these REVOKEs are functionally a no-op right now.
-- Their purpose is to remove the standing GRANT so that a future stray/permissive
-- policy cannot silently turn the grant into a leak (the exact failure mode that
-- made cookies_config exploitable). Monotonic; service_role is untouched.
-- Applied to production live; idempotent (REVOKE is naturally idempotent).
-- =============================================================================

DO $$
BEGIN
  -- cookies_config holds third-party session secrets -> service_role only.
  -- Guarded: table may not exist yet in a from-scratch CI migration run.
  IF EXISTS (
    SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='cookies_config'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.cookies_config FROM authenticated';
  END IF;

  -- email_health_logs is service_role ops telemetry -> no anon surface.
  IF EXISTS (
    SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='email_health_logs'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.email_health_logs FROM anon';
  END IF;
END $$;
