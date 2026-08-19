-- Migration: guard_admin_bulk_rpcs
-- Applied: 2026-08-05T12:04:36.985Z
-- Recovery: recriado 2026-08-07 (arquivo ausente — C-2 AUDIT_REPORT_2026-08-06.md)
-- Contexto: revoga EXECUTE de funções bulk/admin/cron para authenticated.
-- Estas funções são exclusivas de service_role/cron.

REVOKE EXECUTE ON FUNCTION zapp.rpc_backfill_messages_contact_id() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_bulk_repair_dedup_hashes() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_platform_maintenance() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_purge_contact_intelligence() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_refresh_daily_metrics() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_refresh_metrics() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_schema_columns() FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_schema_tables() FROM authenticated;
