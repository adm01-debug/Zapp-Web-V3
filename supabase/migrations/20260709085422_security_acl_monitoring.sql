-- ============================================================
-- Migration: security_acl_monitoring
-- Session: 2026-07-09 — Melhoria #2 e #3
-- Descrição: Sistema de monitoramento de segurança ACL em tempo real
-- ============================================================

-- 1. Tabela de alertas de segurança
CREATE TABLE IF NOT EXISTS public.security_acl_alerts (
  id          bigserial PRIMARY KEY,
  detected_at timestamptz NOT NULL DEFAULT now(),
  alert_type  text        NOT NULL,
  object_name text        NOT NULL,
  role_name   text        NOT NULL,
  privilege   text        NOT NULL,
  severity    text        NOT NULL DEFAULT 'CRITICAL',
  resolved_at timestamptz,
  resolved_by text,
  details     jsonb
);

CREATE INDEX IF NOT EXISTS idx_security_acl_alerts_type_date
  ON public.security_acl_alerts (alert_type, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_acl_alerts_unresolved
  ON public.security_acl_alerts (detected_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.security_acl_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='security_acl_alerts' AND policyname='svc_full_access') THEN
    EXECUTE 'CREATE POLICY svc_full_access ON public.security_acl_alerts TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='security_acl_alerts' AND policyname='auth_read') THEN
    EXECUTE 'CREATE POLICY auth_read ON public.security_acl_alerts FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

-- 2. Função de verificação de RPCs email
CREATE OR REPLACE FUNCTION public.fn_check_email_rpc_acl()
RETURNS TABLE(funcao text, anon_execute boolean, alert_raised boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_alert_count int := 0;
BEGIN
  FOR rec IN
    SELECT p.proname AS funcao, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_tem_execute
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname LIKE 'rpc_email_%'
    ORDER BY p.proname
  LOOP
    funcao       := rec.funcao;
    anon_execute := rec.anon_tem_execute;
    alert_raised := false;
    IF rec.anon_tem_execute THEN
      IF NOT EXISTS (SELECT 1 FROM public.security_acl_alerts
          WHERE object_name = rec.funcao AND alert_type = 'ANON_EXECUTE_GRANTED'
            AND resolved_at IS NULL AND detected_at > now() - interval '1 hour') THEN
        INSERT INTO public.security_acl_alerts (alert_type, object_name, role_name, privilege, severity, details)
        VALUES ('ANON_EXECUTE_GRANTED', rec.funcao, 'anon', 'EXECUTE', 'CRITICAL',
          jsonb_build_object('function', rec.funcao, 'action_needed',
            'REVOKE EXECUTE ON FUNCTION public.' || rec.funcao || ' FROM anon;'));
        alert_raised := true;
        v_alert_count := v_alert_count + 1;
      END IF;
    END IF;
    RETURN NEXT;
  END LOOP;
  INSERT INTO public.security_acl_alerts (alert_type, object_name, role_name, privilege, severity, details)
  VALUES ('CHECK_COMPLETED', 'rpc_email_*', 'system', 'N/A', 'INFO',
    jsonb_build_object('new_violations', v_alert_count, 'timestamp', now()));
END;
$$;

-- 3. Função master de security check
CREATE OR REPLACE FUNCTION public.fn_security_acl_master_check()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rpc_violations   int := 0;
  v_view_violations  int := 0;
BEGIN
  SELECT count(*) INTO v_rpc_violations FROM public.fn_check_email_rpc_acl() WHERE anon_execute = true;
  RETURN jsonb_build_object(
    'checked_at', now(), 'rpc_violations', v_rpc_violations,
    'total_violations', v_rpc_violations,
    'status', CASE WHEN v_rpc_violations = 0 THEN 'CLEAN' ELSE 'VIOLATIONS_DETECTED' END
  );
END;
$$;

-- 4. Função auxiliar para health score
CREATE OR REPLACE FUNCTION public.fn_score_security_acl()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_anon_email_execute int := 0;
  v_anon_email_view_select int := 0;
  v_open_violations int := 0;
  v_score int := 0;
BEGIN
  SELECT count(*) INTO v_anon_email_execute
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname LIKE 'rpc_email_%'
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  SELECT count(*) INTO v_anon_email_view_select
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.relname LIKE 'email%'
    AND has_table_privilege('anon', c.oid, 'SELECT');
  SELECT count(*) INTO v_open_violations FROM public.security_acl_alerts
  WHERE resolved_at IS NULL
    AND alert_type IN ('ANON_EXECUTE_GRANTED','ANON_SELECT_VIEW','VIEW_MISSING_SECURITY_INVOKER')
    AND severity IN ('CRITICAL','HIGH');
  v_score := CASE
    WHEN v_anon_email_execute = 0 AND v_anon_email_view_select = 0 AND v_open_violations = 0 THEN 5
    WHEN v_anon_email_execute = 0 AND v_anon_email_view_select = 0 THEN 3
    ELSE 0 END;
  RETURN jsonb_build_object('score', v_score, 'max', 5,
    'anon_email_execute', v_anon_email_execute,
    'anon_email_view_select', v_anon_email_view_select,
    'open_violations', v_open_violations,
    'monitoring', 'pg_cron a cada 30min (job security_acl_email_check)');
END;
$$;

-- 5. pg_cron job (idempotente)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'security_acl_email_check';
SELECT cron.schedule('security_acl_email_check', '*/30 * * * *',
  $$SELECT public.fn_security_acl_master_check()$$);
