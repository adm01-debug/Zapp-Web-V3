-- =============================================================================
-- Harden schema `public`: remove CREATE from PUBLIC (the PostgreSQL 15 default).
-- Applied to production 2026-07-02. Idempotent.
-- =============================================================================
-- Context: the legacy `GRANT CREATE ON SCHEMA public TO PUBLIC` let ANY role
-- (incl. anon / authenticated) create objects in `public`. Combined with the
-- ~543 SECURITY DEFINER functions that carry `public` on their search_path,
-- that is a theoretical privilege-escalation surface (an attacker plants an
-- object in public to shadow an unqualified call inside a definer function).
--
-- Measured before applying: real exploitability of that vector was ZERO -- none
-- of the 543 functions make an unqualified call to a shadowable (non-public,
-- non-builtin) function; they qualify auth/extension/app calls (e.g. auth.uid())
-- and only use pg_catalog builtins unqualified (which are not shadowable). So
-- this is defense-in-depth hardening, not an active-hole fix.
--
-- Safety: every object in `public` is owned by postgres / supabase_admin
-- (superusers, keep CREATE). No custom app role owns objects in public. anon /
-- authenticated are NOLOGIN roles reached via PostgREST, which cannot run DDL,
-- so removing their CREATE has zero functional impact. USAGE is left intact
-- (the app needs it). service_role is granted CREATE explicitly to preserve any
-- backend tooling that runs DDL.
-- =============================================================================

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT  CREATE ON SCHEMA public TO service_role;
