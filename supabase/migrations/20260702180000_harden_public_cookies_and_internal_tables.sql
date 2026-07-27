-- =============================================================================
-- public schema — close the anon credential leak the 2026-07-02 audit predicted
-- but left out of scope, plus latent-mine and defense-in-depth hardening.
--
-- Applied to production live; captured here (idempotent + guarded) so staging
-- reproduces it. Monotonic on purpose: every statement REMOVES access or narrows
-- a role — nothing grants. Verified: neither src/ nor supabase/functions/ read
-- any of these tables (they are maintained by service_role automations).
-- =============================================================================
-- Findings (role-simulation matrix; anon has USAGE + broad grants on public):
--
--  1) public.cookies_config — LIVE LEAK. anon had USAGE + SELECT grant + a policy
--     "anon pode ler cookies" (USING(true)) => anyone holding the PUBLIC anon key
--     (shipped in the frontend bundle) could `GET /rest/v1/cookies_config` and read
--     live third-party session credentials. Measured content at audit time:
--       - servico='linkedin'  -> 367-char session cookie + 24-char csrf_token
--       - servico='lusha'     -> 3202-char session cookie + token + cnpj
--     The prior migration (20260702160000) assumed this table was an INTENTIONAL
--     anon object based on its name; the actual columns (cookie/token/csrf_token)
--     prove otherwise. Fix: drop the anon policy, REVOKE from anon + PUBLIC.
--     service_role (the writer automation) is untouched.
--
--  2) public.whatsapp_connections — dead-but-latent policy "wconn_select_anon"
--     (SELECT to anon, USING(true)). Inert today (anon lacks the table GRANT) but a
--     single stray `GRANT SELECT ... TO anon` would activate it and leak connection
--     rows. Drop it.
--
--  3) public.n8n_variables — policy "service_role_all" is MISLABELED: it targets
--     PUBLIC with ALL + USING(true), not service_role. anon has no grant so it is a
--     latent mine, but every `authenticated` user could already read/write n8n
--     workflow variables. Retarget to authenticated (monotonic: removes the
--     anon/public surface, preserves logged-in automations) — same fix the prior
--     migration applied to public.workspaces.
--
--  4) public._system_health_history / _system_health_log / _vault_corrupted_quarantine
--     had RLS OFF, so every `authenticated` user could read ops telemetry and vault
--     corruption records. Enable RLS and scope reads to admins (is_admin_painel()).
--     service_role bypasses RLS and keeps full access for jobs/dashboards.
-- =============================================================================

DO $$
BEGIN
  -- 1) cookies_config: kill the anon leak ------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'cookies_config'
      AND p.polname = 'anon pode ler cookies'
  ) THEN
    EXECUTE 'DROP POLICY "anon pode ler cookies" ON public.cookies_config';
    RAISE NOTICE 'cookies_config: dropped permissive anon SELECT policy';
  END IF;

  -- Revoke the underlying grants so the mine cannot be re-armed by a policy.
  -- Guarded: table may not exist yet in a from-scratch CI migration run.
  IF EXISTS (
    SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='cookies_config'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.cookies_config FROM anon';
    EXECUTE 'REVOKE ALL ON public.cookies_config FROM PUBLIC';
    RAISE NOTICE 'cookies_config: revoked anon + PUBLIC grants (service_role retained)';
  END IF;

  -- 2) whatsapp_connections: drop the dead anon policy ------------------------
  IF EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'whatsapp_connections'
      AND p.polname = 'wconn_select_anon'
  ) THEN
    EXECUTE 'DROP POLICY "wconn_select_anon" ON public.whatsapp_connections';
    RAISE NOTICE 'whatsapp_connections: dropped dead anon SELECT policy';
  END IF;
  IF EXISTS (
    SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='whatsapp_connections'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.whatsapp_connections FROM anon';
  END IF;

  -- 3) n8n_variables: retarget the mislabeled PUBLIC policy to authenticated --
  IF EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'n8n_variables'
      AND p.polname = 'service_role_all' AND 0 = ANY(p.polroles)  -- 0 = PUBLIC
  ) THEN
    EXECUTE 'ALTER POLICY "service_role_all" ON public.n8n_variables TO authenticated';
    RAISE NOTICE 'n8n_variables: retargeted PUBLIC policy -> authenticated';
  END IF;
  IF EXISTS (
    SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='n8n_variables'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.n8n_variables FROM anon';
  END IF;

  -- 4) internal tables: enable RLS + admin-scoped read -----------------------
  --    (service_role bypasses RLS; non-admin authenticated loses read)
  PERFORM 1;
END $$;

-- 4 cont.) RLS + policies for the three internal tables (idempotent) ---------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['_system_health_history','_system_health_log','_vault_corrupted_quarantine'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND c.relkind='r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      -- admin-only SELECT (service_role bypasses RLS regardless)
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t
          AND policyname='admin_read_only'
      ) THEN
        EXECUTE format(
          'CREATE POLICY admin_read_only ON public.%I FOR SELECT TO authenticated USING (public.is_admin_painel())',
          t);
      END IF;
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      RAISE NOTICE '%: RLS enabled + admin_read_only policy', t;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='cookies_config'
  ) THEN
    EXECUTE $c$COMMENT ON TABLE public.cookies_config IS
      'Third-party integration session state (LinkedIn/Lusha cookies, tokens). SERVICE_ROLE ONLY — never grant to anon/authenticated. Hardened 2026-07-02.'$c$;
  END IF;
END $$;
