-- Migration: fix_default_privileges_evo_20260711
-- Date: 2026-07-11
-- Author: automated hardening — systemic gap identified by DEFAULT PRIVILEGES audit
--
-- ROOT CAUSE FOUND:
-- pg_default_acl for evo schema had:
--   {authenticated=r/postgres, service_role=arwdDxt/postgres}
--
-- This means EVERY new table created in evo schema by postgres/supabase_admin
-- automatically gets SELECT grant to authenticated. This is why new sessions
-- kept finding new evo.* tables accessible by authenticated — they were being
-- re-granted automatically via DEFAULT PRIVILEGES.
--
-- Fix: Remove authenticated from DEFAULT PRIVILEGES for evo tables.
-- New evo tables will only get service_role (full access) by default.
-- Existing tables are unaffected (DEFAULT PRIVILEGES are forward-only).
--
-- Post-fix verification:
--   pg_default_acl for evo = {service_role=arwdDxt/postgres} only
--   No authenticated entry remains.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA evo 
  REVOKE SELECT ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA evo 
  REVOKE SELECT ON TABLES FROM authenticated;

-- VERIFY:
-- SELECT nspname, defaclrole::regrole, defaclacl
-- FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
-- WHERE n.nspname='evo';
-- Expected: only {service_role=arwdDxt/postgres} — no authenticated entry.
