-- Migration: security_surface_sentinel_20260711
-- Date: 2026-07-11
-- Author: automated improvement — continuous ACL monitoring
--
-- Creates fn_security_surface_audit() + pg_cron job every 30min.
-- Detects regressions (new functions/views with anon access, RLS gaps, etc.)
-- and inserts alert into evo.evolution_alerts if any vector > 0.
--
-- Note: function itself must have EXECUTE revoked from PUBLIC immediately after creation,
-- since PostgreSQL grants PUBLIC by default on function creation.

CREATE OR REPLACE FUNCTION public.fn_security_surface_audit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'evo', 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_anon_execute    int;
  v_public_grant    int;
  v_views_no_si     int;
  v_rls_off         int;
  v_auth_purge      int;
  v_alert_needed    boolean;
BEGIN
  SELECT COUNT(*) INTO v_anon_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND has_function_privilege('anon',p.oid,'execute');
  SELECT COUNT(*) INTO v_public_grant FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,'{}')) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE');
  SELECT COUNT(*) INTO v_views_no_si FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='v' AND n.nspname='public'
    AND NOT EXISTS(SELECT 1 FROM pg_options_to_table(c.reloptions) o WHERE o.option_name='security_invoker' AND o.option_value='on')
    AND pg_get_viewdef(c.oid) ILIKE '%evo.%';
  SELECT COUNT(*) INTO v_rls_off FROM pg_tables WHERE schemaname IN ('evo','zapp','public') AND rowsecurity=false;
  SELECT COUNT(*) INTO v_auth_purge FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND has_function_privilege('authenticated',p.oid,'execute')
    AND (p.proname ILIKE 'fn_purge%' OR p.proname ILIKE 'fn_gc%' OR p.proname ILIKE 'cleanup_%' OR p.proname ILIKE 'run_%_purge');
  v_alert_needed := (v_anon_execute>0 OR v_public_grant>0 OR v_views_no_si>0 OR v_rls_off>0 OR v_auth_purge>0);
  IF v_alert_needed THEN
    INSERT INTO evo.evolution_alerts (severity, alert_type, message, payload)
    VALUES ('critical','security_acl_regression',
      format('ACL REGRESSION: anon=%s pub_grant=%s no_si=%s rls_off=%s purge_auth=%s',
        v_anon_execute,v_public_grant,v_views_no_si,v_rls_off,v_auth_purge),
      jsonb_build_object('anon_execute',v_anon_execute,'public_grant',v_public_grant,
        'views_no_si',v_views_no_si,'rls_off',v_rls_off,'auth_purge',v_auth_purge,'checked_at',NOW()))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('status',CASE WHEN v_alert_needed THEN 'REGRESSION' ELSE 'CLEAN' END,
    'anon_execute',v_anon_execute,'public_grant',v_public_grant,'views_no_si',v_views_no_si,
    'rls_off',v_rls_off,'auth_purge_noguard',v_auth_purge,'checked_at',NOW());
END;
$function$;

-- CRITICAL: revoke PUBLIC immediately (PostgreSQL grants PUBLIC by default)
REVOKE EXECUTE ON FUNCTION public.fn_security_surface_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_security_surface_audit() TO service_role;

-- Schedule every 30 minutes
SELECT cron.schedule(
  'security-surface-sentinel',
  '*/30 * * * *',
  'SELECT public.fn_security_surface_audit()'
);

-- Verify: should return status=CLEAN with all zeros
-- SELECT public.fn_security_surface_audit();
