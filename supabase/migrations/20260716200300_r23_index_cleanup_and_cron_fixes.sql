-- ============================================================
-- Migration: 20260716200300_r23_index_cleanup_and_cron_fixes
-- Purpose  : E8/E10/E11 – Drop unused indexes + fix cron job + refresh matviews
-- Applied  : 2026-07-16
-- Idempotent: YES
-- ============================================================

-- PART 1: Drop 6 unused indexes (idx_scan=0, no FK constraint)
-- These were confirmed 0 scans in pg_stat_user_indexes
-- Must run CONCURRENTLY (cannot be in a transaction block)
-- Applied live via Portainer psql: DROP INDEX CONCURRENTLY
-- 820 -> 814 indexes, ~5 MB reclaimed

-- idx_audit_logs_user_created (208 kB, covered by idx_audit_logs_created)
-- idx_audit_logs_event_type_created (192 kB, covered by idx_audit_logs_created)
-- idx_audit_logs_entity (104 kB, covered by pkey)
-- idx_empresas_telefone (1696 kB, 0 scans, large table 14MB)
-- idx_empresas_email_gin (1672 kB, 0 scans)
-- idx_empresas_bitrix_id (1152 kB, 0 scans)
-- NOTE: DROP INDEX CONCURRENTLY applied live, not in transaction

-- PART 2: Fix fn_analytics_log_retention cron failure
-- Root cause: dblink($q$...$q$) resolves the dollar-quoted literal as 'unknown'
--             type; PG cannot find overload dblink(text, unknown)
-- Fix: schema-qualify public.dblink() + cast literals as ::text

CREATE OR REPLACE FUNCTION ops.fn_analytics_log_retention(p_days integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_conn   text := 'host=/var/run/postgresql dbname=_supabase user=postgres';
  v_tbl    text;
  v_result jsonb := '[]'::jsonb;
  v_deleted text;
BEGIN
  FOR v_tbl IN
    SELECT t.relname
    FROM public.dblink(
      v_conn::text,
      ($q$SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='_analytics' AND c.relkind='r'
           AND c.relname ~ '^log_events_[0-9a-f_]{36}$'$q$)::text
    ) AS t(relname text)
  LOOP
    -- allowlist estrita: apenas _analytics.log_events_<uuid-com-underscores>
    v_deleted := public.dblink_exec(v_conn::text, format(
      $fmt$DELETE FROM _analytics.%I WHERE "timestamp" < (now() at time zone 'utc') - interval '%s days'$fmt$,
      v_tbl, p_days));
    PERFORM public.dblink_exec(v_conn::text, format('VACUUM ANALYZE _analytics.%I', v_tbl));
    v_result := v_result || jsonb_build_object('table', v_tbl, 'result', v_deleted);
  END LOOP;
  RETURN jsonb_build_object('retention_days', p_days, 'executed_at', now(), 'tables', v_result);
END $function$;

-- PART 3: Refresh matviews (applied live)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY zapp.mv_conversations_summary;
-- REFRESH MATERIALIZED VIEW zapp.mv_executive_dashboard;
-- REFRESH MATERIALIZED VIEW zapp.mv_system_status;
-- (mv_instance_metrics and mv_top_stickers refreshed via pg_cron)
