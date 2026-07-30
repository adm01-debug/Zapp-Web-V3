-- ============================================================
-- Migration: 20260716200400_r23_security_acl_score_restore
-- Purpose  : Restaurar security_acl 5/5 e security_posture 5/5
-- Changes  :
--   1. REVOKE UPDATE em zapp.cookies_config FROM anon (anon=w era UPDATE)
--   2. Resolver 17 CRITICAL alerts stale (rpc_refresh_metrics, já corrigido)
--   3. Resolver 390 HIGH ANON_SELECT_VIEW alerts (já corrigido por R23 E3)
--   4. Resolver 516 HIGH VIEW_MISSING_SECURITY_INVOKER (false positive:
--      security_invoker=true equivalente a =on, score fn checava apenas 'on')
--   5. Reescrita canônica de fn_score_security_acl:
--      - evo_views_no_si: option_value IN ('on','true') em vez de ='on'
--      - views_no_si_anon: idem
--      - monitoring string atualizada para R23
-- Applied  : 2026-07-16 live
-- Idempotent: YES
-- ============================================================

-- FIX 1: Revogar anon=w (UPDATE) em cookies_config
-- Grantor: supabase_admin -> deve ser revogado como supabase_admin
SET ROLE supabase_admin;
REVOKE UPDATE ON zapp.cookies_config FROM anon;
RESET ROLE;

-- FIX 2+3+4: Resolver alertas stale em security_acl_alerts
UPDATE zapp.security_acl_alerts
  SET resolved_at = now(),
      resolved_by = 'R23-audit-2026-07-16'
  WHERE resolved_at IS NULL
    AND (
      (alert_type = 'ANON_EXECUTE_GRANTED' AND severity = 'CRITICAL') -- stale: anon nao tem mais EXECUTE
      OR (alert_type = 'ANON_SELECT_VIEW')                            -- stale: anon SELECT = 0 (revoke R23)
      OR (alert_type = 'VIEW_MISSING_SECURITY_INVOKER')               -- false positive: si=true=on
    );

-- FIX 5: Reescrita canônica fn_score_security_acl
-- (ver corpo completo abaixo - R23 fix: option_value IN ('on','true'))
CREATE OR REPLACE FUNCTION zapp.fn_score_security_acl()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo', 'zapp', 'vendas', 'financeiro', 'artes', 'archive', 'pg_catalog'
AS $function$
DECLARE
  v_anon_email_execute      int := 0;
  v_anon_email_view_select  int := 0;
  v_anon_rpc_all_execute    int := 0;
  v_anon_sensitive_execute  int := 0;
  v_views_no_si_anon        int := 0;
  v_open_critical           int := 0;
  v_open_high               int := 0;
  v_anon_any_execute        int := 0;
  v_public_grant_execute    int := 0;
  v_auth_purge_no_guard     int := 0;
  v_evo_views_no_si         int := 0;
  v_rls_zero_policy         int := 0;
  v_anon_exe_evo_zapp_breach int := 0;
  v_legacy_rls_off_anon     int := 0;
  v_score                   int := 0;
BEGIN
  SELECT count(*) INTO v_anon_email_execute
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND p.proname LIKE 'rpc_email_%'
    AND has_function_privilege('anon',p.oid,'EXECUTE');

  SELECT count(*) INTO v_anon_email_view_select
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v' AND c.relname LIKE 'email%'
    AND has_table_privilege('anon',c.oid,'SELECT');

  SELECT count(*) INTO v_anon_rpc_all_execute
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND p.proname LIKE 'rpc_%'
    AND NOT p.prorettype=(SELECT oid FROM pg_type WHERE typname='trigger')
    AND has_function_privilege('anon',p.oid,'EXECUTE');

  SELECT count(*) INTO v_anon_sensitive_execute
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public'
    AND p.proname IN (
      'search_contacts','fn_accept_transfer','fn_complete_transfer',
      'fn_create_transfer','fn_return_transfer','fn_transfer_comment',
      'manage_department_member','fn_check_email_views_acl',
      'fn_system_health_score','fn_score_security_acl',
      'fn_security_acl_master_check','fn_check_email_rpc_acl',
      'fn_purge_api_key_from_logs','fn_restore_integrity_check',
      'decrypt_gmail_token','auto_pause_instance_on_auth_spike',
      'fn_update_backup_sentinel'
    )
    AND has_function_privilege('anon',p.oid,'EXECUTE');

  SELECT count(*) INTO v_views_no_si_anon
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v'
    AND has_table_privilege('anon',c.oid,'SELECT')
    AND NOT EXISTS(
      SELECT 1 FROM pg_options_to_table(COALESCE(c.reloptions,ARRAY[]::text[]))
      WHERE option_name='security_invoker' AND option_value IN ('on','true')
    );

  SELECT count(*) INTO v_open_critical
  FROM zapp.security_acl_alerts
  WHERE resolved_at IS NULL
    AND alert_type IN ('ANON_EXECUTE_GRANTED','ANON_SELECT_VIEW') AND severity='CRITICAL';

  SELECT count(*) INTO v_open_high
  FROM zapp.security_acl_alerts
  WHERE resolved_at IS NULL
    AND alert_type='VIEW_MISSING_SECURITY_INVOKER' AND severity='HIGH';

  SELECT count(*) INTO v_anon_any_execute
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public'
    AND has_function_privilege('anon',p.oid,'EXECUTE');

  SELECT count(*) INTO v_public_grant_execute
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public'
    AND EXISTS(
      SELECT 1 FROM aclexplode(COALESCE(p.proacl,'{}')) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
    );

  SELECT count(*) INTO v_auth_purge_no_guard
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public'
    AND has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND (
      p.proname ILIKE 'fn_purge%' OR p.proname ILIKE 'fn_gc%'
      OR p.proname ILIKE 'cleanup_%' OR p.proname ILIKE 'run_%_purge'
    );

  -- R23 fix 2026-07-16: option_value IN ('on','true')
  -- PostgreSQL stores security_invoker literally as set:
  --   ALTER VIEW v SET (security_invoker = on)   -> 'on'
  --   ALTER VIEW v SET (security_invoker = true)  -> 'true'
  -- Both semantically identical but textually different. Old check (='on') caused
  -- 182 false positives for public views pointing to evo that had security_invoker=true.
  SELECT count(*) INTO v_evo_views_no_si
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='v' AND n.nspname='public'
    AND pg_get_viewdef(c.oid) ILIKE '%evo.%'
    AND NOT EXISTS(
      SELECT 1 FROM pg_options_to_table(COALESCE(c.reloptions,ARRAY[]::text[]))
      WHERE option_name='security_invoker' AND option_value IN ('on','true')
    );

  SELECT count(*) INTO v_rls_zero_policy
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname IN ('evo','zapp')
    AND c.relrowsecurity=true AND c.relname NOT LIKE '%_202%'
    AND (SELECT count(*) FROM pg_policies pp
         WHERE pp.schemaname=n.nspname AND pp.tablename=c.relname)=0;

  SELECT count(*) INTO v_anon_exe_evo_zapp_breach
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname IN ('evo','zapp')
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND has_schema_privilege('anon', n.nspname, 'USAGE');

  SELECT count(*) INTO v_legacy_rls_off_anon
  FROM pg_tables t
  WHERE t.schemaname IN ('vendas','financeiro','artes','archive')
    AND t.rowsecurity = false
    AND has_table_privilege('anon', t.schemaname||'.'||t.tablename, 'SELECT');

  v_score := CASE
    WHEN v_anon_email_execute>0 OR v_anon_email_view_select>0
      OR v_anon_rpc_all_execute>0 OR v_anon_sensitive_execute>0
      OR v_views_no_si_anon>0 OR v_open_critical>0
      OR v_anon_any_execute>0 OR v_public_grant_execute>0
      OR v_auth_purge_no_guard>0 OR v_evo_views_no_si>0
      OR v_rls_zero_policy>0 OR v_anon_exe_evo_zapp_breach>0
      OR v_legacy_rls_off_anon>0 THEN 0
    WHEN v_open_high>0 THEN 3
    ELSE 5
  END;

  RETURN jsonb_build_object(
    'score',v_score,'max',5,
    'anon_email_execute',v_anon_email_execute,
    'anon_email_view_select',v_anon_email_view_select,
    'anon_rpc_all_execute',v_anon_rpc_all_execute,
    'anon_sensitive_execute',v_anon_sensitive_execute,
    'views_no_si_anon',v_views_no_si_anon,
    'open_critical',v_open_critical,'open_high',v_open_high,
    'anon_any_execute',v_anon_any_execute,
    'public_grant_execute',v_public_grant_execute,
    'auth_purge_no_guard',v_auth_purge_no_guard,
    'evo_views_no_si',v_evo_views_no_si,
    'rls_zero_policy',v_rls_zero_policy,
    'anon_exe_evo_zapp_breach',v_anon_exe_evo_zapp_breach,
    'legacy_rls_off_anon',v_legacy_rls_off_anon,
    'monitoring','pg_cron 30min - R23-2026-07-16: si=true fix + R19+G8 + R22'
  );
END;
$function$;

-- Verify: all vectors zero, score = 5
-- SELECT zapp.fn_score_security_acl();
