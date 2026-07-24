-- zapp.fn_wal_slot_lag_check reads pg_replication_slots (sensitive infra data).
-- Previous migration granted EXECUTE to 'authenticated', allowing any logged-in
-- user to query WAL slot names, lag sizes, and active status. Restrict to
-- service_role only (Hermes cron caller).

REVOKE EXECUTE ON FUNCTION zapp.fn_wal_slot_lag_check(INT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION zapp.fn_wal_slot_lag_check(INT) TO service_role;
