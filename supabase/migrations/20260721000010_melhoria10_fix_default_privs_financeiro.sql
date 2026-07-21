-- MELHORIA #10 — Remove anon from DEFAULT PRIVILEGES in financeiro schema
--
-- Audit (2026-07-21): pg_default_acl shows that the financeiro schema was
-- initialised with DEFAULT PRIVILEGES granting anon:
--   • EXECUTE on all new functions  (defaclobjtype='f')
--   • INSERT, UPDATE, DELETE on all new tables  (defaclobjtype='r', acl 'awd')
--
-- This means every future CREATE FUNCTION or CREATE TABLE in financeiro
-- automatically becomes accessible to unauthenticated callers, silently
-- undoing MELHORIA #9's per-function REVOKEs over time.
--
-- Fix: ALTER DEFAULT PRIVILEGES ... REVOKE from anon.
-- The existing per-object grants/revokes from MELHORIA #9 are not affected;
-- this only changes what NEW objects inherit.

-- Remove anon's default EXECUTE on future functions in financeiro
ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Remove anon's default INSERT, UPDATE, DELETE on future tables in financeiro
ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro
  REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;

-- Sanity check: authenticated and service_role default grants are preserved
-- (no change needed for those roles — only anon is stripped).
