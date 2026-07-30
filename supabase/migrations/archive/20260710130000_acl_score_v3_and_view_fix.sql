-- ============================================================
-- MIGRATION: acl_score_v3_and_view_fix
-- Criado: 2026-07-10 sessao rodada 4
-- fn_score_security_acl v3: adiciona 5o check (views_no_si_anon)
-- fix: evolution_logpatch_audit sem security_invoker
-- ============================================================

-- Fix view sem security_invoker descoberta em auditoria
ALTER VIEW public.evolution_logpatch_audit SET (security_invoker = on);

-- fn_score_security_acl v3: 5 cheques
CREATE OR REPLACE FUNCTION public.fn_score_security_acl()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anon_email_execute     int := 0;
  v_anon_email_view_select int := 0;
  v_anon_rpc_all_execute   int := 0;
  v_anon_sensitive_execute int := 0;
  v_views_no_si_anon       int := 0;
  v_open_critical          int := 0;
  v_open_high              int := 0;
  v_score                  int := 0;
BEGIN
  -- Cheque 1: rpc_email_* por anon
  SELECT count(*) INTO v_anon_email_execute
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND p.proname LIKE 'rpc_email_%'
    AND has_function_privilege('anon',p.oid,'EXECUTE');

  -- Cheque 2: email views por anon
  SELECT count(*) INTO v_anon_email_view_select
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v'
    AND c.relname LIKE 'email%'
    AND has_table_privilege('anon',c.oid,'SELECT');

  -- Cheque 3: TODOS rpc_* por anon
  SELECT count(*) INTO v_anon_rpc_all_execute
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND p.proname LIKE 'rpc_%'
    AND NOT p.prorettype=(SELECT oid FROM pg_type WHERE typname='trigger')
    AND has_function_privilege('anon',p.oid,'EXECUTE');

  -- Cheque 4: funcoes sensiveis nao-rpc por anon
  SELECT count(*) INTO v_anon_sensitive_execute
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public'
    AND p.proname IN (
      'search_contacts','fn_accept_transfer','fn_complete_transfer',
      'fn_create_transfer','fn_return_transfer','fn_transfer_comment',
      'manage_department_member','fn_check_email_views_acl',
      'fn_system_health_score','fn_score_security_acl',
      'fn_security_acl_master_check','fn_check_email_rpc_acl'
    )
    AND has_function_privilege('anon',p.oid,'EXECUTE');

  -- Cheque 5 (NOVO v3): views publicas acessiveis por anon sem security_invoker
  SELECT count(*) INTO v_views_no_si_anon
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v'
    AND has_table_privilege('anon',c.oid,'SELECT')
    AND NOT EXISTS(
      SELECT 1 FROM pg_options_to_table(COALESCE(c.reloptions,ARRAY[]::text[]))
      WHERE option_name='security_invoker' AND option_value='on'
    );

  SELECT count(*) INTO v_open_critical
  FROM public.security_acl_alerts
  WHERE resolved_at IS NULL
    AND alert_type IN ('ANON_EXECUTE_GRANTED','ANON_SELECT_VIEW')
    AND severity='CRITICAL';

  SELECT count(*) INTO v_open_high
  FROM public.security_acl_alerts
  WHERE resolved_at IS NULL
    AND alert_type='VIEW_MISSING_SECURITY_INVOKER'
    AND severity='HIGH';

  -- 0: qualquer violacao real
  -- 3: apenas HIGH
  -- 5: limpo
  v_score := CASE
    WHEN v_anon_email_execute > 0
      OR v_anon_email_view_select > 0
      OR v_anon_rpc_all_execute > 0
      OR v_anon_sensitive_execute > 0
      OR v_views_no_si_anon > 0
      OR v_open_critical > 0 THEN 0
    WHEN v_open_high > 0 THEN 3
    ELSE 5
  END;

  RETURN jsonb_build_object(
    'score',                  v_score,
    'max',                    5,
    'anon_email_execute',     v_anon_email_execute,
    'anon_email_view_select', v_anon_email_view_select,
    'anon_rpc_all_execute',   v_anon_rpc_all_execute,
    'anon_sensitive_execute', v_anon_sensitive_execute,
    'views_no_si_anon',       v_views_no_si_anon,
    'open_critical',          v_open_critical,
    'open_high',              v_open_high,
    'monitoring', 'pg_cron 30min - scope: ALL rpc_* + sensitive fns + views_no_si'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_score_security_acl() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_score_security_acl() TO authenticated;
