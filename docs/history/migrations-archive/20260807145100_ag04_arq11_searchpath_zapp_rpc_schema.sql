-- ESPELHO repo×DB — migration aplicada via MCP (supabase_apply_migration) na auditoria Hermes 2026-08-06/07.
-- Registro em supabase_migrations.schema_migrations; este arquivo é o registro histórico (DB-as-source).
-- ARQ-11: 2 outliers zapp com pg_catalog/information_schema (refs qualificadas -> troca segura).
ALTER FUNCTION zapp.rpc_schema_columns(text) SET search_path TO 'zapp, pg_temp';
ALTER FUNCTION zapp.rpc_schema_tables(text) SET search_path TO 'zapp, pg_temp';
