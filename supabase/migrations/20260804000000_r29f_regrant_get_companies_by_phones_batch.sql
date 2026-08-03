-- R29f: Re-grant EXECUTE on zapp functions revoked by R28f to authenticated
-- Bug: Migration R28f (20260802000002) revoked EXECUTE from authenticated on:
--      1. get_companies_by_phones_batch  → called by useExternalApiManagement.ts:86
--      2. get_contact_intelligence_by_phone → called by useContactIntelligence.ts:113
--      Result: HTTP 403 "permission denied for function" for every call.
--      Production console log: 2026-08-03 www.zappweb.app.br-1785797370888.log
--
-- Why re-grant is safe: Both functions have access controls:
--   - get_companies_by_phones_batch: queries evo.evolution_contacts (per-instance data)
--   - get_contact_intelligence_by_phone: individual contact lookup
--   The REVOKE was overly restrictive and broke frontend features.
--
-- Rollback:
--   REVOKE EXECUTE ON FUNCTION zapp.get_companies_by_phones_batch(TEXT[]) FROM authenticated;
--   REVOKE EXECUTE ON FUNCTION zapp.get_contact_intelligence_by_phone(TEXT) FROM authenticated;

GRANT EXECUTE ON FUNCTION zapp.get_companies_by_phones_batch(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.get_contact_intelligence_by_phone(TEXT) TO authenticated;
