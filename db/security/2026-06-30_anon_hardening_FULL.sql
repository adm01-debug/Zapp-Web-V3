-- =====================================================================
-- zapp-web-v3 - Self-hosted Supabase - ANON read-leak hardening (FULL)
-- Date: 2026-06-30  (v2: now also covers materialized views, relkind 'm')
--
-- WHY: `anon` (public API key, NO login) can read ~350 relations whose
--      RLS does not actually restrict it:
--        (A) tables with RLS disabled
--        (B) tables with an anon/public USING(true) SELECT/ALL policy
--        (C) views created WITH (security_invoker=off) that bypass RLS
--        (D) materialized views (no RLS at all) granted to anon
--      => full WhatsApp message/conversation history, contacts, deals,
--         dashboards, and some credential views are readable by anyone
--         holding the public anon key. LGPD exposure.
--
-- FIX: REVOKE anon on those relations. The grant gate is evaluated
--      BEFORE RLS, so removing the grant fully closes anon regardless of
--      policy. `authenticated` and `service_role` are untouched, so the
--      app (post-login) keeps working.
--
-- RESULT (applied 2026-06-30): 342 relations revoked; residual anon-
--      readable leak = ALLOWLIST only (cookies_config, workspaces).
--
-- SAFETY:
--   * Backs up the exact anon grants to archive.anon_grant_backup_20260630
--     (rollback source). See the ROLLBACK script.
--   * ALLOWLIST below keeps anon on relations the logged-OUT app may need.
--     REVIEW IT before running. Defaults: cookies_config, workspaces.
--   * Idempotent: re-running skips whatever is already revoked.
-- =====================================================================

BEGIN;
CREATE SCHEMA IF NOT EXISTS archive;

CREATE TABLE IF NOT EXISTS archive.anon_grant_backup_20260630 (
  schema      name,
  rel         name,
  privs       text,
  captured_at timestamptz NOT NULL DEFAULT now()
);

-- ---- ALLOWLIST (keep anon) - REVIEW BEFORE RUNNING ------------------
CREATE TEMP TABLE _anon_keep(schema name, rel name) ON COMMIT DROP;
INSERT INTO _anon_keep(schema, rel) VALUES
  ('public','cookies_config'),  -- cookie-consent banner, loaded pre-login
  ('public','workspaces');      -- tenant bootstrap (confirm before removing)
-- --------------------------------------------------------------------

WITH targets AS (
  -- (A) RLS disabled (regular + partitioned tables)
  SELECT n.nspname AS schema, c.relname AS rel
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public','evo','zapp','bpm','ai','email_app')
    AND c.relkind IN ('r','p') AND c.relrowsecurity = false
    AND has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'SELECT')
  UNION
  -- (B) RLS on but anon/public USING(true) SELECT/ALL policy
  SELECT DISTINCT p.schemaname, p.tablename
  FROM pg_policies p
  WHERE p.schemaname IN ('public','evo','zapp','bpm','ai','email_app')
    AND (p.roles @> ARRAY['anon']::name[] OR p.roles @> ARRAY['public']::name[])
    AND p.cmd IN ('SELECT','ALL') AND (p.qual IS NULL OR btrim(lower(p.qual)) = 'true')
    AND has_table_privilege('anon', format('%I.%I', p.schemaname, p.tablename), 'SELECT')
  UNION
  -- (C) security_invoker=off views
  SELECT n.nspname, c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'v' AND n.nspname IN ('public','evo','zapp','bpm','ai','email_app')
    AND has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'SELECT')
    AND coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                  WHERE option_name = 'security_invoker'), 'false') = 'false'
  UNION
  -- (D) materialized views (no RLS) granted to anon
  SELECT n.nspname, c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'm' AND n.nspname IN ('public','evo','zapp','bpm','ai','email_app')
    AND has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'SELECT')
)
INSERT INTO archive.anon_grant_backup_20260630(schema, rel, privs)
SELECT t.schema, t.rel,
  (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
     FROM information_schema.role_table_grants g
     WHERE g.grantee = 'anon' AND g.table_schema = t.schema AND g.table_name = t.rel)
FROM targets t
WHERE NOT EXISTS (SELECT 1 FROM _anon_keep k WHERE k.schema = t.schema AND k.rel = t.rel)
  AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
              WHERE g.grantee = 'anon' AND g.table_schema = t.schema AND g.table_name = t.rel);

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT schema, rel
    FROM archive.anon_grant_backup_20260630
    WHERE captured_at >= now() - interval '5 minutes'
  LOOP
    EXECUTE format('REVOKE ALL ON %I.%I FROM anon', r.schema, r.rel);
  END LOOP;
END $$;

COMMIT;

-- Post-check (expect only the allowlist, i.e. 2 rows):
--   WITH t AS ( <targets CTE above> ) SELECT * FROM t ORDER BY 1,2;
