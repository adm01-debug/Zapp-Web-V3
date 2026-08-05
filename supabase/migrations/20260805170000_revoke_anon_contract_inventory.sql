-- Revoke EXECUTE on rpc_contract_inventory from anon role.
-- This function is a dev/audit utility — it must not be callable by unauthenticated
-- PostgREST requests. The security-invoker-gate workflow enforces zero anon-executable
-- functions in the zapp and evo schemas.
--
-- Rollback (dev/staging only): restore execute permission on zapp.rpc_contract_inventory
-- for the anon role — do not apply this in production.
REVOKE EXECUTE ON FUNCTION zapp.rpc_contract_inventory() FROM anon;
