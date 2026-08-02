-- =============================================================================
-- Migration: Grant authenticated EXECUTE on rpc_dlq_list_audit_cursor (RPC-001)
--
-- Root cause: zapp.rpc_dlq_list_audit_cursor was moved to the zapp schema by
-- 20260716_fix_public_to_zapp_schema.sql. The function ACL was not updated —
-- only postgres and service_role have EXECUTE; authenticated role is missing.
--
-- Effect: DLQ Audit Log admin panel returns permission-denied for all users,
-- because PostgREST authenticates as the requesting user's role (authenticated).
--
-- The non-cursor variant (rpc_dlq_list_audit) was correctly granted in
-- 20260717_fix_dlq_security_and_audit_gaps.sql, but the cursor variant was
-- missed (archive/20260717000003 was never deployed).
--
-- Signature: zapp.rpc_dlq_list_audit_cursor(integer, text, uuid)
-- =============================================================================

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit_cursor(integer, text, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit_cursor(integer, text, uuid)
  TO authenticated;
