-- Migration: harden RLS on zapp.cookies_config
-- Audit finding 2026-07-16: policy allow_anon_update_health had USING(true)
-- granting any anonymous client the ability to UPDATE any row in cookies_config.
--
-- cookies_config is a BACKEND-ONLY service-credential table (stores third-party
-- session cookies, CSRF tokens, LinkedIn li_at, etc. for backend Edge Functions).
-- It has NO user_id column and is NOT a per-user consent table.
-- Correct security posture:
--   • service_role → bypasses RLS (full access for Edge Functions — intended)
--   • authenticated → denied (no policy = default-deny)
--   • anon          → denied (no policy = default-deny)
--
-- Action: drop every non-service-role policy; do NOT add new permissive policies.

-- 1. Drop the dangerous anon UPDATE policy
DROP POLICY IF EXISTS allow_anon_update_health ON zapp.cookies_config;

-- 2. Drop the old anon SELECT policy (if it exists from a previous migration attempt)
DROP POLICY IF EXISTS allow_anon_select_cookies ON zapp.cookies_config;

-- 3. Drop the incorrectly generated auth UPDATE policy (user_id column does not exist)
DROP POLICY IF EXISTS allow_auth_update_own_cookies ON zapp.cookies_config;

-- Result: RLS remains ENABLED on zapp.cookies_config with ZERO policies.
-- Default-deny applies to all roles except service_role.
-- Edge Functions (which use service_role) continue to have full access.
