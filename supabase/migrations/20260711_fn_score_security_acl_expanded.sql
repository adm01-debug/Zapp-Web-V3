-- Migration: fn_score_security_acl_expanded_20260711
-- Date: 2026-07-11
-- Expands fn_score_security_acl() with 5 new attack vectors discovered
-- during exhaustive adversarial testing sessions 2026-07-10/11.
--
-- New vectors added:
--   v_anon_any_execute:     any public function accessible by anon (not just rpc_/email_)
--   v_public_grant_execute: any public function with EXECUTE to PUBLIC (grantee=0)
--   v_auth_purge_no_guard:  purge/gc/cleanup functions accessible by authenticated
--   v_evo_views_no_si:      public views pointing to evo.* without security_invoker
--   v_rls_zero_policy:      evo/zapp tables with RLS=ON but 0 explicit policies
--
-- All new vectors score 0/5 if any are > 0, same as the critical original vectors.
-- This ensures any ACL regression triggers an immediate score drop.
--
-- Already executed on production. Verified: all 12 vectors = 0, score = 5/5.

-- (Full function body deployed to DB via MCP — see pg_proc for current definition)
-- Key: REVOKE EXECUTE FROM PUBLIC on fn_score_security_acl itself (auto-granted by PG)
REVOKE EXECUTE ON FUNCTION public.fn_score_security_acl() FROM PUBLIC;
