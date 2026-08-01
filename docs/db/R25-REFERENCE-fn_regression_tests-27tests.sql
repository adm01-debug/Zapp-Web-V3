-- Referência: definição AO VIVO de ops.fn_regression_tests() (2026-08-01 15:20 UTC)
-- Usada para rewrite canônico completo (Regra F3) com adição de RT26/RT27.
CREATE OR REPLACE FUNCTION ops.fn_regression_tests()
 RETURNS TABLE(test_name text, status text, detail text, duration_ms numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops', 'pg_catalog'
AS $function$
DECLARE
  v_start timestamptz; v_n int; v_r jsonb; v_txt text;
  v_pass boolean; v_b1 int; v_b2 int;
  v_uses_zapp boolean; v_no_public boolean; v_score numeric;
BEGIN
  -- RT01-RT24 mantidos intactos
  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v' AND c.relname IN('zapp_audit_log','contact_audit_log','conversation_audit_logs','webhook_audit_log','team_messages','app_notifications','whatsapp_official_credentials') AND (c.reloptions::text LIKE '%security_invoker%');
  RETURN QUERY SELECT 'RT01_bridge_views_security_invoker'::text,CASE WHEN v_n=7 THEN 'PASS' ELSE 'FAIL' END::text,v_n::text||'/7'::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM information_schema.column_privileges cp WHERE cp.grantee IN('authenticated','anon') AND cp.privilege_type='SELECT' AND cp.column_name='api_key' AND cp.table_schema IN('public','zapp','evo') AND NOT(cp.table_schema='public' AND cp.table_name='instance_registry');
  RETURN QUERY SELECT 'RT02_api_key_blocked_fullscope'::text,CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL' END::text,'grants='||v_n::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM information_schema.role_table_grants WHERE table_schema='zapp' AND grantee='anon' AND table_name IN('zapp_audit_log','contact_audit_log','conversation_audit_logs','webhook_audit_log','team_messages','app_notifications','whatsapp_official_credentials');
  RETURN QUERY SELECT 'RT03_anon_zapp_zero'::text,CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL' END::text,'grants='||v_n::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN('public','zapp') AND NOT c.relrowsecurity;
  RETURN QUERY SELECT 'RT04_rls_100pct'::text,CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL' END::text,'rls_off='||v_n::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  v_txt:=(ops.check_lovable_parity()).status||(ops.check_schema_drift()).status||(ops.check_critical_fks()).status;
  RETURN QUERY SELECT 'RT05_ops_checks'::text,CASE WHEN v_txt='OKOKOK' THEN 'PASS' ELSE 'FAIL' END::text,v_txt,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp(); v_pass:=true;
  SELECT COUNT(*) INTO v_b1 FROM zapp.app_notifications; SELECT COUNT(*) INTO v_b2 FROM zapp.app_notifications;
  IF v_b1!=v_b2 THEN v_pass:=false; END IF;
  SELECT COUNT(*) INTO v_b1 FROM zapp.webhook_audit_log; SELECT COUNT(*) INTO v_b2 FROM zapp.webhook_audit_log;
  IF v_b1!=v_b2 THEN v_pass:=false; END IF;
  RETURN QUERY SELECT 'RT06_bridge_parity'::text,CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END::text,'ok'::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  v_r:=zapp.fn_system_health_score(); v_score:=(v_r->>'score')::numeric;
  RETURN QUERY SELECT 'RT07_health_score_85plus'::text,CASE WHEN v_score>=85 THEN 'PASS' WHEN v_score>=75 THEN 'WARN ('||v_score||')' ELSE 'FAIL' END::text,'score='||(v_r->>'score')||' grade='||(v_r->>'grade'),round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  RETURN QUERY SELECT 'RT08_guardrails_catalog'::text,CASE WHEN (ops.fn_guardrails_check())->>'ok'='true' AND (ops.fn_catalog_sanity_check())->>'status'='CLEAN' THEN 'PASS' ELSE 'FAIL' END::text,'ok',round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='app_notifications' AND (t.tgtype & 64)::boolean;
  RETURN QUERY SELECT 'RT09_instead_of_triggers'::text,CASE WHEN v_n=3 THEN 'PASS' ELSE 'FAIL' END::text,v_n::text||'/3',round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT pg_get_functiondef(oid) LIKE '%zapp.webhook_audit_log%' INTO v_uses_zapp FROM pg_proc WHERE proname='fn_system_health_score';
  SELECT regexp_replace(pg_get_functiondef(oid),chr(45)||chr(45)||'[^'||chr(10)||']+','','g') NOT LIKE ('%zapp.webhook_audit_log%') INTO v_no_public FROM pg_proc WHERE proname='fn_system_health_score';
  RETURN QUERY SELECT 'RT10_audit_log_uses_zapp'::text,CASE WHEN v_uses_zapp AND v_no_public THEN 'PASS' ELSE 'FAIL' END::text,'zapp='||v_uses_zapp::text||' no_public='||v_no_public::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  v_r:=ops.check_infrastructure();
  RETURN QUERY SELECT 'RT11_infra_pct'::text,CASE WHEN (v_r->>'pct')::numeric>=85 THEN 'PASS' ELSE 'WARN ('||(v_r->>'pct')||'%)' END::text,'pct='||(v_r->>'pct'),round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_constraint pk ON pk.conrelid=c.oid AND pk.contype='p' WHERE c.relkind='r' AND n.nspname IN('public','zapp','evo') AND pk.oid IS NULL;
  RETURN QUERY SELECT 'RT12_pk_zero_missing'::text,CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL' END::text,'missing='||v_n::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM jsonb_object_keys((zapp.fn_system_health_score())->'breakdown');
  RETURN QUERY SELECT 'RT13_health_18plus_dims'::text,CASE WHEN v_n>=18 THEN 'PASS' ELSE 'FAIL' END::text,v_n::text||'/18+',round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM cron.job WHERE jobname='vacuum_critical_tables';
  RETURN QUERY SELECT 'RT14_no_broken_vacuum_cron'::text,CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL' END::text,'exists='||v_n::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM ops.schema_changelog;
  RETURN QUERY SELECT 'RT15_schema_changelog'::text,CASE WHEN v_n>=20 THEN 'PASS' ELSE 'FAIL' END::text,v_n::text||' entries',round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ops' AND c.relkind='r' AND c.relname='edge_function_registry') THEN SELECT COUNT(*) INTO v_n FROM ops.edge_function_registry WHERE is_active; ELSE v_n:=0; END IF;
  RETURN QUERY SELECT 'RT16_edge_fn_registry_100plus'::text,CASE WHEN v_n>=100 THEN 'PASS' WHEN v_n>=50 THEN 'WARN' ELSE 'FAIL' END::text,v_n::text||' ativas',round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM ops.check_mirror_integrity() WHERE severity='CRITICAL';
  RETURN QUERY SELECT 'RT17_mirror_integrity_no_critical'::text,CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL ('||v_n||' CRITICAL)' END::text,'critical_checks='||v_n::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM information_schema.column_privileges WHERE grantee IN('authenticated','anon') AND table_schema IN('zapp','evo') AND column_name='api_key' AND privilege_type='SELECT';
  RETURN QUERY SELECT 'RT18_api_key_no_plain_select_zapp_evo'::text,CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL' END::text,'plain_grants='||v_n::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM information_schema.columns WHERE table_schema='public' AND table_name='evolution_instance_credentials' AND column_name IN('api_key','instance_token');
  RETURN QUERY SELECT 'RT19_evo_creds_view_no_secrets'::text,CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL' END::text,'exposed_cols='||v_n::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='ops' AND(has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'));
  RETURN QUERY SELECT 'RT20_ops_schema_private'::text,CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL ('||v_n||' exposed)' END::text,'public_fns='||v_n::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM pg_roles r JOIN pg_db_role_setting s ON s.setrole=r.oid AND s.setdatabase=0 WHERE r.rolname IN('postgres','authenticated','anon') AND s.setconfig @> ARRAY['idle_in_transaction_session_timeout=60s'];
  RETURN QUERY SELECT 'RT21_idle_in_tx_timeout_configured'::text,CASE WHEN v_n=3 THEN 'PASS' ELSE 'FAIL ('||v_n||'/3 roles)' END::text,v_n::text||'/3 roles',round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM(SELECT tablename FROM pg_tables WHERE schemaname='vendas' AND tablename IN('creditos','trocas') AND NOT rowsecurity UNION ALL SELECT t.tablename FROM pg_tables t WHERE t.schemaname='vendas' AND t.tablename IN('creditos','trocas') AND has_table_privilege('anon','vendas.'||t.tablename,'SELECT')) issues;
  RETURN QUERY SELECT 'RT22_vendas_g1_rls_fix'::text,CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL ('||v_n||' issues)' END::text,'rls_off_or_anon_access='||v_n::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  v_r:=zapp.fn_score_security_acl(); v_n:=COALESCE((v_r->>'legacy_rls_off_anon')::int,-1);
  RETURN QUERY SELECT 'RT23_g8_legacy_sentinel'::text,CASE WHEN v_n=0 THEN 'PASS' WHEN v_n>0 THEN 'FAIL ('||v_n||' violations)' ELSE 'FAIL (vector missing)' END::text,'legacy_rls_off_anon='||v_n::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  v_start:=clock_timestamp();
  SELECT COUNT(*) INTO v_n FROM pg_matviews WHERE schemaname IN('public','evo','zapp') AND ispopulated=false;
  RETURN QUERY SELECT 'RT24_matviews_all_populated'::text,CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL ('||v_n||' unpopulated)' END::text,'unpopulated_matviews='||v_n::text,round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  -- RT25: guardian heartbeat fresh (< 30 min em AMBAS as tabelas)
  v_start:=clock_timestamp();
  SELECT EXTRACT(EPOCH FROM (now() - GREATEST(
    (SELECT max(heartbeat_at) FROM evo.evolution_guardian_heartbeat WHERE service_name='swarm-task-guardian'),
    (SELECT max(heartbeat_at) FROM zapp.evolution_guardian_heartbeat WHERE service_name='swarm-task-guardian')
  )))/60 INTO v_score;
  RETURN QUERY SELECT 'RT25_guardian_heartbeat_fresh'::text,
    CASE WHEN v_score < 30 THEN 'PASS' ELSE 'FAIL (gap='||round(v_score::numeric,1)||'min)' END::text,
    'gap_min='||round(COALESCE(v_score::numeric,9999),1)||' (threshold:30min)',
    round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  -- RT26 (R25 P1-7): nenhuma função de RLS inexecutável por authenticated
  -- (rede permanente do incidente #668: 403 no inbox por EXECUTE revogado)
  v_start:=clock_timestamp();
  WITH rls_fns AS (
    SELECT DISTINCT (m)[1] AS fnname
    FROM (SELECT regexp_matches(
            COALESCE(pg_get_expr(polqual,polrelid),'')||' '||COALESCE(pg_get_expr(polwithcheck,polrelid),''),
            '([a-z_][a-z0-9_]*)\s*\(', 'g') AS m
          FROM pg_policy) s)
  SELECT COUNT(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  JOIN rls_fns rf ON rf.fnname=p.proname
  WHERE n.nspname IN ('public','zapp','evo')
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  RETURN QUERY SELECT 'RT26_rls_fns_exec_authenticated'::text,
    CASE WHEN v_n=0 THEN 'PASS' ELSE 'FAIL ('||v_n||' broken)' END::text,
    'broken='||v_n::text,
    round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

  -- RT27 (R25 P1-7): authenticated consegue ler as views críticas do front
  -- (end-to-end; captura permission denied de RLS chain security_invoker)
  -- NOTA: SET LOCAL ROLE é proibido dentro de SECURITY DEFINER — delegado ao
  -- helper SECURITY INVOKER ops.fn_auth_can_read_front_views() (criado na migration).
  v_start:=clock_timestamp();
  SELECT ops.fn_auth_can_read_front_views() INTO v_pass;
  RETURN QUERY SELECT 'RT27_authenticated_reads_front_views'::text,
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL (permission denied)' END::text,
    CASE WHEN v_pass THEN 'messages+contacts ok' ELSE 'authenticated blocked on front views' END,
    round(EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::numeric,1);

END;
$function$;
