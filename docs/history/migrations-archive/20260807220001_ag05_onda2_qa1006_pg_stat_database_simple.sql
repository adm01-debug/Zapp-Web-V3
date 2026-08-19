-- ESPELHO repo×DB — migration aplicada via MCP (supabase_apply_migration) na auditoria Hermes 2026-08-06/07.
-- Registro em supabase_migrations.schema_migrations; este arquivo é o registro histórico (DB-as-source).
CREATE OR REPLACE FUNCTION zapp.pg_stat_database_simple()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp, pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM zapp.fn_require_app_user();
  SELECT jsonb_build_object(
           'datname', datname,
           'numbackends', numbackends,
           'xact_commit', xact_commit,
           'xact_rollback', xact_rollback,
           'blks_read', blks_read,
           'blks_hit', blks_hit,
           'tup_returned', tup_returned,
           'tup_fetched', tup_fetched,
           'tup_inserted', tup_inserted,
           'tup_updated', tup_updated,
           'tup_deleted', tup_deleted,
           'sampled_at', now()
         )
  INTO v_result
  FROM pg_catalog.pg_stat_database
  WHERE datname = current_database();
  RETURN coalesce(v_result, '{}'::jsonb);
END;
$function$
