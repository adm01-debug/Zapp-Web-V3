-- Revoke EXECUTE on rpc_contract_inventory from anon role.
-- This function is a dev/audit utility — it must not be callable by unauthenticated
-- PostgREST requests. The security-invoker-gate workflow enforces zero anon-executable
-- functions in the zapp and evo schemas.
--
-- Rollback: revogar o REVOKE (reconceder EXECUTE a anon) apenas em dev/staging.
-- (Only apply rollback in a dev/staging environment for debugging purposes.)
REVOKE EXECUTE ON FUNCTION zapp.rpc_contract_inventory() FROM anon;
