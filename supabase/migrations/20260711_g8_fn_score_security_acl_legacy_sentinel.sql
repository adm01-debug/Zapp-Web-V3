-- G8 2026-07-11: fn_score_security_acl canonical rewrite
-- Adds 14th vector: legacy_rls_off_anon
-- Monitors vendas/financeiro/artes/archive for tables with RLS=OFF + anon SELECT
-- Fires (score=0) if any accidental exposure is introduced by future deploys
-- Currently 0 after G1 fixed vendas.creditos and vendas.trocas

CREATE OR REPLACE FUNCTION public.fn_score_security_acl()
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
  v_legacy_rls_off_anon     int := 0;  -- G8: legacy schemas sentinel
  v_score                   int := 0;
BEGIN
  SELECT count(*) INTO v_anon_email_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND p.proname LIKE 'rpc_email_%' AND has_function_privilege('anon',p.oid,'EXECUTE');

  SELECT count(*) INTO v_anon_email_view_select FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v' AND c.relname LIKE 'email%' AND has_table_privilege('anon',c.oid,'SELECT');

  SELECT count(*) INTO v_anon_rpc_all_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND p.proname LIKE 'rpc_%'
    AND NOT p.prorettype=(SELECT oid FROM pg_type WHERE typname='trigger')
    AND has_function_privilege('anon',p.oid,'EXECUTE');

  SELECT count(*) INTO v_anon_sensitive_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public'
    AND p.proname IN ('search_contacts','fn_accept_transfer','fn_complete_transfer',
      'fn_create_transfer','fn_return_transfer','fn_transfer_comment','manage_department_member',
      'fn_check_email_views_acl','fn_system_health_score','fn_score_security_acl',
      'fn_security_acl_master_check','fn_check_email_rpc_acl',
      'fn_purge_api_key_from_logs','fn_restore_integrity_check','decrypt_gmail_token',
      'auto_pause_instance_on_auth_spike','fn_update_backup_sentinel')
    AND has_function_privilege('anon',p.oid,'EXECUTE');

  SELECT count(*) INTO v_views_no_si_anon FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v' AND has_table_privilege('anon',c.oid,'SELECT')
    AND NOT EXISTS(SELECT 1 FROM pg_options_to_table(COALESCE(c.reloptions,ARRAY[]::text[]))
      WHERE option_name='security_invoker' AND option_value='on');

  SELECT count(*) INTO v_open_critical FROM public.security_acl_alerts
  WHERE resolved_at IS NULL AND alert_type IN ('ANON_EXECUTE_GRANTED','ANON_SELECT_VIEW') AND severity='CRITICAL';
  SELECT count(*) INTO v_open_high FROM public.security_acl_alerts
  WHERE resolved_at IS NULL AND alert_type='VIEW_MISSING_SECURITY_INVOKER' AND severity='HIGH';

  SELECT count(*) INTO v_anon_any_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND has_function_privilege('anon',p.oid,'EXECUTE');

  SELECT count(*) INTO v_public_grant_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,'{}')) a
    WHERE a.grantee=0 AND a.privilege_type='EXECUTE');

  SELECT count(*) INTO v_auth_purge_no_guard FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND (p.proname ILIKE 'fn_purge%' OR p.proname ILIKE 'fn_gc%'
      OR p.proname ILIKE 'cleanup_%' OR p.proname ILIKE 'run_%_purge');

  SELECT count(*) INTO v_evo_views_no_si FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='v' AND n.nspname='public' AND pg_get_viewdef(c.oid) ILIKE '%evo.%'
    AND NOT EXISTS(SELECT 1 FROM pg_options_to_table(COALESCE(c.reloptions,ARRAY[]::text[]))
      WHERE option_name='security_invoker' AND option_value='on');

  SELECT count(*) INTO v_rls_zero_policy FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname IN ('evo','zapp') AND c.relrowsecurity=true
    AND c.relname NOT LIKE '%_202%'
    AND (SELECT count(*) FROM pg_policies pp WHERE pp.schemaname=n.nspname AND pp.tablename=c.relname)=0;

  SELECT count(*) INTO v_anon_exe_evo_zapp_breach
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname IN ('evo','zapp')
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND has_schema_privilege('anon', n.nspname, 'USAGE');

  -- G8: Legacy schema sentinel (vendas/financeiro/artes/archive)
  -- Detects tables with RLS=OFF + anon SELECT (financial data exposure risk)
  -- Fixed: vendas.creditos, vendas.trocas (2026-07-11 G1)
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
    'monitoring','pg_cron 30min — R19+G8 2026-07-11: evo/zapp breach + legacy schema sentinel'
  );
END;
$function$;

-- Verification:
-- SELECT public.fn_score_security_acl();
-- Must return: score=5, legacy_rls_off_anon=0, anon_exe_evo_zapp_breach=0
