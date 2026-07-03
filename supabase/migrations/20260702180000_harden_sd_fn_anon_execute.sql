-- =============================================================================
-- Harden SECURITY DEFINER functions: revoke EXECUTE from PUBLIC (anon), grant
-- only to authenticated + service_role. Applied to production 2026-07-02.
-- Idempotent: the DO block skips functions already restricted.
-- =============================================================================
-- Finding (empirically confirmed):
--   16 SECURITY DEFINER functions in public/zapp were executable by anon.
--   These run as postgres (owner) and bypass RLS. Confirmed leaks:
--     - public.contacts_count_by_type()      => returned real contact counts (15638/4452)
--     - public.rpc_get_contact(uuid)         => returns PII with real UUID
--     - public.log_security_event(...)       => anon could inject fake audit entries
--     - public.record_failed_login(email,ip) => anon could spam login failure log
--     - public.mark_follow_up_done(uuid)     => anon could mutate follow-up data
--   Additionally closed:
--     - public.vw_system_health (run-as-owner view leaking WhatsApp phone/status/alerts)
--     - 10 public.evolution_webhook_events_v2_* partition views (future data risk)
--     - anon default-privilege on public tables (re-grant prevention)
-- =============================================================================
DO $$
DECLARE p record; cnt int := 0;
BEGIN
  FOR p IN
    SELECT pg_proc.oid, n.nspname, pg_proc.proname,
           pg_get_function_identity_arguments(pg_proc.oid) AS args
    FROM pg_proc
    JOIN pg_namespace n ON n.oid = pg_proc.pronamespace
    WHERE n.nspname IN ('zapp', 'public')
      AND pg_proc.prosecdef = true
      AND has_function_privilege('anon', pg_proc.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',
                   p.nspname, p.proname, p.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
                   p.nspname, p.proname, p.args);
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'SD functions hardened: %', cnt;
END $$;

-- Close anon access to run-as-owner views leaked in prod (idempotent via REVOKE)
REVOKE SELECT ON public.vw_system_health FROM anon;

DO $$
DECLARE v record;
BEGIN
  FOR v IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='v' AND c.relname LIKE 'evolution_webhook_events_v2_%'
             AND has_table_privilege('anon','public.'||quote_ident(c.relname),'SELECT')
             AND NOT COALESCE((SELECT lower(option_value)='true' FROM pg_options_to_table(c.reloptions)
                               WHERE option_name='security_invoker'),false)
  LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon', v.relname);
  END LOOP;
END $$;

-- Prevent future anon grants on new public tables/views
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
