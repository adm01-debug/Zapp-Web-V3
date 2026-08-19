-- ESPELHO repo×DB — migration aplicada via MCP (supabase_apply_migration) na auditoria Hermes 2026-08-06/07.
-- Registro em supabase_migrations.schema_migrations; este arquivo é o registro histórico (DB-as-source).
-- ARQ-11: 4 outliers de search_path (2 ops com 'auth' 1o + 2 com pg_catalog/information_schema).
ALTER FUNCTION ops.auth_session_cleanup(integer, integer) SET search_path TO 'ops, pg_temp';
ALTER FUNCTION ops.fn_auth_session_overflow_alert() SET search_path TO 'ops, pg_temp';
ALTER FUNCTION ops.fn_verify_alert_delivery(interval, integer, interval, integer, interval) SET search_path TO 'ops, pg_temp';
ALTER FUNCTION zapp.fn_drop_logflare_slot() SET search_path TO 'zapp, pg_temp';
