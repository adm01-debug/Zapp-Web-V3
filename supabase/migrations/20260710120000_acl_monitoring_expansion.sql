-- ============================================================
-- MIGRATION: acl_monitoring_expansion
-- Criado: 2026-07-10 (sessao rodada 4 - bug #87)
-- fn_check_email_rpc_acl v2: escopo de 23 -> 176+ funcoes
-- fn_score_security_acl v2: 4 cheques (email, views, ALL rpc_*, sensitive)
-- ============================================================

-- -------------------------------------------------------
-- fn_check_email_rpc_acl v2
-- Monitora TODOS os rpc_* + funcoes sensiveis nao-rpc
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_check_email_rpc_acl()
 RETURNS TABLE(funcao text, anon_execute boolean, alert_raised boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  v_alert_count int := 0;
  v_total_checked int := 0;
BEGIN
  -- v2: monitora TODOS os rpc_* + funcoes sensiveis nao-rpc
  FOR rec IN
    SELECT DISTINCT
      p.proname AS funcao,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_tem_execute
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND (
        p.proname LIKE 'rpc_%'
        OR p.proname IN (
          'search_contacts',
          'fn_accept_transfer', 'fn_complete_transfer',
          'fn_create_transfer', 'fn_return_transfer',
          'fn_transfer_comment', 'manage_department_member',
          'fn_check_email_views_acl', 'fn_check_email_rpc_acl',
          'fn_system_health_score', 'fn_score_security_acl',
          'fn_security_acl_master_check'
        )
      )
      AND NOT p.prorettype = (SELECT oid FROM pg_type WHERE typname = 'trigger')
    ORDER BY p.proname
  LOOP
    funcao       := rec.funcao;
    anon_execute := rec.anon_tem_execute;
    alert_raised := false;
    v_total_checked := v_total_checked + 1;

    IF rec.anon_tem_execute THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.security_acl_alerts
        WHERE object_name = rec.funcao
          AND alert_type  = 'ANON_EXECUTE_GRANTED'
          AND resolved_at IS NULL
          AND detected_at > now() - interval '1 hour'
      ) THEN
        INSERT INTO public.security_acl_alerts
          (alert_type, object_name, role_name, privilege, severity, details)
        VALUES
          ('ANON_EXECUTE_GRANTED', rec.funcao, 'anon', 'EXECUTE', 'CRITICAL',
           jsonb_build_object(
             'function',   rec.funcao,
             'namespace',  'public',
             'detected_by','fn_check_email_rpc_acl v2',
             'action_needed', 'REVOKE EXECUTE ON FUNCTION public.' || rec.funcao || ' FROM PUBLIC;',
             'risk', 'anon pode chamar SECURITY DEFINER sem autenticacao'
           ));
        alert_raised := true;
        v_alert_count := v_alert_count + 1;
      END IF;
    END IF;
    RETURN NEXT;
  END LOOP;

  INSERT INTO public.security_acl_alerts
    (alert_type, object_name, role_name, privilege, severity, details)
  VALUES
    ('CHECK_COMPLETED', 'rpc_*+sensitive', 'system', 'N/A', 'INFO',
     jsonb_build_object(
       'version',          2,
       'new_violations',   v_alert_count,
       'functions_checked', v_total_checked,
       'scope',            'ALL rpc_* + sensitive non-rpc fns',
       'timestamp',        now()
     ));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_check_email_rpc_acl() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_check_email_rpc_acl() TO authenticated;

-- -------------------------------------------------------
-- fn_score_security_acl v2
-- 4 cheques: email_rpc, email_views, ALL_rpc, sensitive_fns
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_score_security_acl()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anon_email_execute       int := 0;
  v_anon_email_view_select   int := 0;
  v_anon_rpc_all_execute     int := 0;
  v_anon_sensitive_execute   int := 0;
  v_open_critical            int := 0;
  v_open_high                int := 0;
  v_score                    int := 0;
BEGIN
  -- Cheque 1: rpc_email_* (backward compat)
  SELECT count(*) INTO v_anon_email_execute
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname LIKE 'rpc_email_%'
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  -- Cheque 2: email views por anon
  SELECT count(*) INTO v_anon_email_view_select
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    AND c.relname LIKE 'email%'
    AND has_table_privilege('anon', c.oid, 'SELECT');

  -- Cheque 3 (NOVO v2): TODOS rpc_* acessiveis por anon
  SELECT count(*) INTO v_anon_rpc_all_execute
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname LIKE 'rpc_%'
    AND NOT p.prorettype = (SELECT oid FROM pg_type WHERE typname = 'trigger')
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  -- Cheque 4 (NOVO v2): funcoes sensiveis nao-rpc
  SELECT count(*) INTO v_anon_sensitive_execute
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'search_contacts',
      'fn_accept_transfer', 'fn_complete_transfer',
      'fn_create_transfer', 'fn_return_transfer',
      'fn_transfer_comment', 'manage_department_member',
      'fn_check_email_views_acl',
      'fn_system_health_score', 'fn_score_security_acl',
      'fn_security_acl_master_check', 'fn_check_email_rpc_acl'
    )
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  -- Alertas abertos por severidade
  SELECT count(*) INTO v_open_critical
  FROM public.security_acl_alerts
  WHERE resolved_at IS NULL
    AND alert_type IN ('ANON_EXECUTE_GRANTED','ANON_SELECT_VIEW')
    AND severity = 'CRITICAL';

  SELECT count(*) INTO v_open_high
  FROM public.security_acl_alerts
  WHERE resolved_at IS NULL
    AND alert_type = 'VIEW_MISSING_SECURITY_INVOKER'
    AND severity = 'HIGH';

  -- 0: qualquer violacao real OU alerta CRITICAL
  -- 3: apenas HIGH
  -- 5: limpo
  v_score := CASE
    WHEN v_anon_email_execute > 0
      OR v_anon_email_view_select > 0
      OR v_anon_rpc_all_execute > 0
      OR v_anon_sensitive_execute > 0
      OR v_open_critical > 0 THEN 0
    WHEN v_open_high > 0 THEN 3
    ELSE 5
  END;

  RETURN jsonb_build_object(
    'score',                    v_score,
    'max',                      5,
    'anon_email_execute',       v_anon_email_execute,
    'anon_email_view_select',   v_anon_email_view_select,
    'anon_rpc_all_execute',     v_anon_rpc_all_execute,
    'anon_sensitive_execute',   v_anon_sensitive_execute,
    'open_critical',            v_open_critical,
    'open_high',                v_open_high,
    'monitoring', 'pg_cron a cada 30min (job security_acl_email_check) - scope: ALL rpc_* + sensitive fns'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_score_security_acl() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_score_security_acl() TO authenticated;
