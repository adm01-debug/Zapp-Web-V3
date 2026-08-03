-- R29f: Re-grant EXECUTE on zapp.get_companies_by_phones_batch to authenticated
-- Bug: Migration R28f (20260802000002) revoked EXECUTE from authenticated,
--      but the frontend CRM badge (useExternalApiManagement.ts:86) still calls this RPC
--      via the Supabase anon key (authenticated role).
--      Result: HTTP 403 "permission denied for function get_companies_by_phones_batch"
--      for every inbox/conversation list load since 2026-08-02 deploy.
--
-- Why re-grant is safe: R28f added a workspace guard (lines 104-108) that filters
-- by the user's workspace_id. The function already protects cross-workspace access.
-- The REVOKE was overly restrictive and broke the CRM badge feature.
--
-- Rollback: REVOKE EXECUTE ON FUNCTION zapp.get_companies_by_phones_batch(TEXT[]) FROM authenticated;

GRANT EXECUTE ON FUNCTION zapp.get_companies_by_phones_batch(TEXT[]) TO authenticated;
