-- ============================================================
-- MIGRATION: fix_acl_monitor_all_rpcs
-- BUG #87: fn_score_security_acl so monitorava rpc_email_*
-- Fix: agora monitora TODOS os rpc_* (180 funcoes vs 23 antes)
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_score_security_acl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_anon_email_execute int := 0;
  v_anon_email_view_select int := 0;
  v_anon_rpc_all int := 0;  -- BUG#87: cobre TODOS rpc_*, nao apenas rpc_email_*
  v_open_critical int := 0;
  v_open_high int := 0;
  v_score int := 0;
BEGIN
  -- Checa rpc_email_* (monitoramento original mantido para compatibilidade)
  SELECT count(*) INTO v_anon_email_execute
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname LIKE 'rpc_email_%'
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  -- Checa views email% (monitoramento original mantido)
  SELECT count(*) INTO v_anon_email_view_select
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    AND c.relname LIKE 'email%'
    AND has_table_privilege('anon', c.oid, 'SELECT');

  -- BUG #87 FIX: Checa TODOS os rpc_* (DLQ, transfer, contacts, etc.)
  -- Cobre os 180 RPCs que foram restritos a authenticated via REVOKE FROM PUBLIC
  SELECT count(*) INTO v_anon_rpc_all
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname LIKE 'rpc_%'
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  -- Alertas nao resolvidos por severidade
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

  -- Logica de scoring:
  -- 0 pts: QUALQUER rpc_* exposto a anon OU alerta CRITICAL aberto
  -- 3 pts: apenas alertas HIGH (view sem security_invoker)
  -- 5 pts: completamente limpo
  v_score := CASE
    WHEN v_anon_email_execute > 0 OR v_anon_email_view_select > 0
      OR v_anon_rpc_all > 0 OR v_open_critical > 0 THEN 0
    WHEN v_open_high > 0 THEN 3
    ELSE 5
  END;

  RETURN jsonb_build_object(
    'score', v_score,
    'max', 5,
    'anon_email_execute', v_anon_email_execute,
    'anon_email_view_select', v_anon_email_view_select,
    'anon_rpc_all', v_anon_rpc_all,
    'open_critical', v_open_critical,
    'open_high', v_open_high,
    'monitoring', 'pg_cron a cada 30min — cobre TODOS rpc_* e email views (BUG#87 fix)'
  );
END;
$$;

-- Garante que continua bloqueado para anon
REVOKE EXECUTE ON FUNCTION public.fn_score_security_acl() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_score_security_acl() TO authenticated;
