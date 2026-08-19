-- 20260812170000_health_filter_snap_staging.sql
-- [FIX 2026-08-12 P3] Filtros de health para tabelas de snapshot/staging.
--
-- Contexto: o health score (zapp.fn_system_health_score) marcava 0/5 em
-- security_acl (rls_zero_policy=2) e 3/5 em pk_integrity por causa de
-- tabelas NÃO-de-negócio criadas pelo upgrade LID:
--   - evo._snap_post_upgrade_2_4_0 (snapshot do upgrade)
--   - zapp.contact_identity_lid_staging (staging do backfill)
-- Elas não casavam com os filtros existentes (_backup_%, _watchdog_%, _%log,
-- _%audit%, %_202%). Resultado: health 95,6 em vez de 100.
--
-- Aplicado em produção via MCP (DB-as-source) — health validado em 100.0
-- (security_acl 5/5, pk_integrity 0 tabelas sem PK). Migration espelha o banco.

CREATE OR REPLACE FUNCTION zapp.fn_score_security_acl()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
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
  v_auth_rls_fn_denied      int := 0;
  v_score                   int := 0;
BEGIN
  SELECT count(*) INTO v_anon_email_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname LIKE 'rpc_email_%' AND has_function_privilege('anon',p.oid,'EXECUTE');
  SELECT count(*) INTO v_anon_email_view_select FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v' AND c.relname LIKE 'email%' AND has_table_privilege('anon',c.oid,'SELECT');
  SELECT count(*) INTO v_anon_rpc_all_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname LIKE 'rpc_%' AND NOT p.prorettype=(SELECT oid FROM pg_type WHERE typname='trigger') AND has_function_privilege('anon',p.oid,'EXECUTE');
  SELECT count(*) INTO v_anon_sensitive_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname IN ('search_contacts','fn_accept_transfer','fn_complete_transfer','fn_create_transfer','fn_return_transfer','fn_transfer_comment','manage_department_member','fn_check_email_views_acl','fn_system_health_score','fn_score_security_acl','fn_security_acl_master_check','fn_check_email_rpc_acl','fn_purge_api_key_from_logs','fn_restore_integrity_check','decrypt_gmail_token','auto_pause_instance_on_auth_spike','fn_update_backup_sentinel') AND has_function_privilege('anon',p.oid,'EXECUTE');
  SELECT count(*) INTO v_views_no_si_anon FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v' AND has_table_privilege('anon',c.oid,'SELECT') AND NOT EXISTS(SELECT 1 FROM pg_options_to_table(COALESCE(c.reloptions,ARRAY[]::text[])) WHERE option_name='security_invoker' AND option_value IN ('on','true'));
  SELECT count(*) INTO v_open_critical FROM zapp.security_acl_alerts WHERE resolved_at IS NULL AND alert_type IN ('ANON_EXECUTE_GRANTED','ANON_SELECT_VIEW') AND severity='CRITICAL';
  SELECT count(*) INTO v_open_high FROM zapp.security_acl_alerts WHERE resolved_at IS NULL AND alert_type='VIEW_MISSING_SECURITY_INVOKER' AND severity='HIGH';
  SELECT count(*) INTO v_anon_any_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname NOT LIKE 'postgres_fdw_%' AND p.proname NOT LIKE 'pgsodium_%' AND p.proname NOT IN ('set_audio_transcription','update_status_media_url') AND has_function_privilege('anon',p.oid,'EXECUTE');
  SELECT count(*) INTO v_public_grant_execute FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname NOT LIKE 'postgres_fdw_%' AND p.proname NOT LIKE 'pgsodium_%' AND p.proname NOT IN ('set_audio_transcription','update_status_media_url') AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,'{}')) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE');
  SELECT count(*) INTO v_auth_purge_no_guard FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND (p.proname ILIKE 'fn_purge%' OR p.proname ILIKE 'fn_gc%' OR p.proname ILIKE 'cleanup_%' OR p.proname ILIKE 'run_%_purge');
  SELECT count(*) INTO v_evo_views_no_si FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='v' AND n.nspname='public' AND pg_get_viewdef(c.oid) ILIKE '%evo.%' AND NOT EXISTS(SELECT 1 FROM pg_options_to_table(COALESCE(c.reloptions,ARRAY[]::text[])) WHERE option_name='security_invoker' AND option_value IN ('on','true'));
  -- rls_zero_policy: excluir tabelas backup, snap, staging, date-suffix, watchdog e log interno
  SELECT count(*) INTO v_rls_zero_policy
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname IN ('evo','zapp')
    AND c.relrowsecurity=true
    AND c.relname NOT LIKE '%_202%'
    AND c.relname NOT LIKE '_backup_%'
    AND c.relname NOT LIKE '_snap_%'
    AND c.relname NOT LIKE '%_staging'
    AND c.relname NOT LIKE '_watchdog_%'
    AND c.relname NOT LIKE '_%log'
    AND c.relname NOT LIKE '_%audit%'
    AND (SELECT count(*) FROM pg_policies pp WHERE pp.schemaname=n.nspname AND pp.tablename=c.relname)=0;
  SELECT count(*) INTO v_anon_exe_evo_zapp_breach FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname IN ('evo','zapp') AND has_function_privilege('anon', p.oid, 'EXECUTE') AND has_schema_privilege('anon', n.nspname, 'USAGE');
  SELECT count(*) INTO v_legacy_rls_off_anon FROM pg_tables t WHERE t.schemaname IN ('vendas','financeiro','artes','archive') AND t.rowsecurity = false AND has_table_privilege('anon', t.schemaname||'.'||t.tablename, 'SELECT');
  SELECT count(DISTINCT p.oid) INTO v_auth_rls_fn_denied FROM pg_depend d JOIN pg_proc p ON p.oid=d.refobjid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE d.classid='pg_policy'::regclass AND d.refclassid='pg_proc'::regclass AND n.nspname IN ('public','zapp','evo') AND p.prokind='f' AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  v_score := CASE WHEN v_anon_email_execute>0 OR v_anon_email_view_select>0 OR v_anon_rpc_all_execute>0 OR v_anon_sensitive_execute>0 OR v_views_no_si_anon>0 OR v_open_critical>0 OR v_anon_any_execute>0 OR v_public_grant_execute>0 OR v_auth_purge_no_guard>0 OR v_evo_views_no_si>0 OR v_rls_zero_policy>0 OR v_anon_exe_evo_zapp_breach>0 OR v_legacy_rls_off_anon>0 THEN 0 WHEN v_open_high>0 OR v_auth_rls_fn_denied>0 THEN 3 ELSE 5 END;
  RETURN jsonb_build_object('score',v_score,'max',5,'anon_email_execute',v_anon_email_execute,'anon_email_view_select',v_anon_email_view_select,'anon_rpc_all_execute',v_anon_rpc_all_execute,'anon_sensitive_execute',v_anon_sensitive_execute,'views_no_si_anon',v_views_no_si_anon,'open_critical',v_open_critical,'open_high',v_open_high,'anon_any_execute',v_anon_any_execute,'public_grant_execute',v_public_grant_execute,'auth_purge_no_guard',v_auth_purge_no_guard,'evo_views_no_si',v_evo_views_no_si,'rls_zero_policy',v_rls_zero_policy,'anon_exe_evo_zapp_breach',v_anon_exe_evo_zapp_breach,'legacy_rls_off_anon',v_legacy_rls_off_anon,'auth_rls_fn_denied',v_auth_rls_fn_denied,'monitoring','R29-2026-08-12: adicionados filtros _snap_% e %_staging a rls_zero_policy (snapshot do upgrade e staging do backfill nao sao tabelas de negocio)');
END;
$function$;

-- ============================================================================
-- zapp.fn_system_health_score — item 12 (pk_integrity) com filtros _snap/%_staging
-- (corpo idêntico ao do banco; a mudança é apenas no filtro do item 12 + nota R29)
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_system_health_score()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp, evo, extensions, pg_catalog'
AS $function$
DECLARE
  v_score numeric:=0; v_max numeric:=0; v_bd jsonb:='{}';
  v int; v2 int; vn numeric; vt timestamptz; vt2 timestamptz;
  vj jsonb; vs text; vb bigint;
  v_wpp2_state text; v_wpp2_health text; v_wpp2_phone text; v_wpp2_last timestamptz;
  v_wpp2_ok boolean; v_eff_state text;
  v_msgs_7d bigint;
  v_wal_risky int; v_wal_lag_mb numeric; v_wal_limit int;
  v_wal_pct numeric; v_wal_score int; v_wal_status text;
  v_bak_hours numeric; v_bak_tables int;
  v_v2dim jsonb;
  v_wp jsonb;
BEGIN
  -- 1. wpp2_connection (20pts)
  v_max:=v_max+20;
  SELECT wc.status, wc.phone_number,
      GREATEST(wc.last_connected_at, COALESCE(wc.last_health_check, wc.last_connected_at)),
      wc.health_status
    INTO v_wpp2_state, v_wpp2_phone, v_wpp2_last, v_wpp2_health
    FROM zapp.whatsapp_connections wc WHERE wc.instance_name='wpp2' LIMIT 1;
  SELECT COUNT(*) INTO v  FROM zapp.whatsapp_connections WHERE phone_number=v_wpp2_phone AND status='connected' AND is_active;
  SELECT COUNT(*) INTO v2 FROM zapp.whatsapp_connections WHERE status='connected' AND is_active AND phone_number!=COALESCE(v_wpp2_phone,'');
  v_wpp2_ok:=(v_wpp2_state='connected' OR v_wpp2_health='ok' OR v>0 OR (v_wpp2_last IS NOT NULL AND v_wpp2_last>NOW()-INTERVAL '15 minutes' AND v_wpp2_health!='degraded'));
  v_eff_state:=CASE WHEN v_wpp2_ok THEN 'connected' WHEN v_wpp2_state IN ('connecting','reconnecting') OR v_wpp2_health='degraded' THEN 'connecting' ELSE COALESCE(v_wpp2_state,'unknown') END;
  vn := ROUND(EXTRACT(EPOCH FROM(NOW()-v_wpp2_last))/60, 1);
  IF v_eff_state='connected' THEN
    IF vn <= 120 THEN
      v_score:=v_score+20;
      v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',20,'max',20,'status','connected','last_connected_min',vn));
    ELSE
      v_score:=v_score+12;
      v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',12,'max',20,'status','connected_stale','last_connected_min',vn,'note','stale>2h_penalty'));
    END IF;
  ELSIF v_eff_state='connecting' THEN
    v_score:=v_score+8;
    v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',8,'max',20,'status','connecting','health_status',v_wpp2_health,'db_status',v_wpp2_state));
  ELSIF v2>0 THEN
    v_score:=v_score+8;
    v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',8,'max',20,'status','backup_connected'));
  ELSE
    v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',0,'max',20,'status',v_eff_state));
  END IF;

  -- 2. webhook_pipeline (15pts)
  v_max:=v_max+15;
  BEGIN
    SELECT zapp.fn_webhook_pipeline_score(v_eff_state) INTO v_wp;
    v_score:=v_score+(v_wp->'webhook_pipeline'->>'score')::int;
    v_bd:=v_bd||jsonb_build_object('webhook_pipeline',v_wp->'webhook_pipeline');
    v_msgs_7d:=COALESCE((v_wp->>'msgs_7d')::bigint,0);
  EXCEPTION WHEN OTHERS THEN
    v_bd:=v_bd||jsonb_build_object('webhook_pipeline',jsonb_build_object('score',0,'max',15,'error',SQLERRM));
  END;

  -- 3. partition_indexes (10pts)
  v_max:=v_max+10;
  SELECT COUNT(*) INTO v FROM (
    SELECT pn, ri, sch FROM (VALUES
      ('evolution_messages','uq_msg_msgid_instance','evo')
    ) static_chk(pn,ri,sch)
    UNION ALL
    SELECT 'evolution_webhook_events_v2_'||to_char(t.m,'YYYY_MM'), '_pkey', 'evo'
    FROM (VALUES (NOW()), (NOW()+INTERVAL '1 month'), (NOW()+INTERVAL '2 months')) t(m)
  ) chk(pn,ri,sch)
  WHERE NOT EXISTS(
    SELECT 1 FROM pg_indexes pi
    WHERE pi.schemaname=chk.sch AND pi.tablename=chk.pn AND pi.indexname LIKE '%'||chk.ri||'%'
  );
  v_score:=v_score+CASE WHEN v=0 THEN 10 WHEN v<=1 THEN 6 ELSE 2 END;
  v_bd:=v_bd||jsonb_build_object('partition_indexes',jsonb_build_object('score',CASE WHEN v=0 THEN 10 WHEN v<=1 THEN 6 ELSE 2 END,'max',10,'missing',v));

  -- 4. dead_tuples (10pts)
  v_max:=v_max+10;
  SELECT COALESCE(MAX(ROUND(100.0*n_dead_tup/NULLIF(n_live_tup+n_dead_tup,0),2)),0) INTO vn
    FROM pg_stat_user_tables WHERE schemaname='evo' AND relname IN ('evolution_messages','evolution_webhook_events_v2') AND (n_live_tup+n_dead_tup)>=500;
  v_score:=v_score+CASE WHEN vn<5 THEN 10 WHEN vn<15 THEN 6 ELSE 2 END;
  v_bd:=v_bd||jsonb_build_object('dead_tuples',jsonb_build_object('score',CASE WHEN vn<5 THEN 10 WHEN vn<15 THEN 6 ELSE 2 END,'max',10,'max_pct',vn));

  -- 5. vault_secrets (10pts)
  v_max:=v_max+10;
  SELECT COUNT(*) INTO v FROM vault.secrets WHERE name='webhook_secret_evolution';
  IF v>0 THEN v_score:=v_score+10; END IF;
  v_bd:=v_bd||jsonb_build_object('vault_secrets',jsonb_build_object('score',CASE WHEN v>0 THEN 10 ELSE 0 END,'max',10,'in_vault',v>0));

  -- 6. r2_storage (10pts)
  v_max:=v_max+10;
  SELECT value->'status' INTO vj FROM evo.evolution_settings WHERE key='r2_evo_config';
  SELECT value#>>'{}' INTO vs FROM evo.evolution_settings WHERE key='r2_migration_status';
  IF vj::text='"CONFIGURADO"' OR vs='db_complete_r2_configured' THEN
    v_score:=v_score+10;
    v_bd:=v_bd||jsonb_build_object('r2_storage',jsonb_build_object('score',10,'max',10,'status','configured'));
  ELSE
    v_bd:=v_bd||jsonb_build_object('r2_storage',jsonb_build_object('score',0,'max',10,'status',COALESCE(vs,'missing')));
  END IF;

  -- 7. ghost_instances (5pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v FROM zapp.instance_registry WHERE phone_number IS NULL AND is_active;
  IF v=0 THEN v_score:=v_score+5; END IF;
  v_bd:=v_bd||jsonb_build_object('ghost_instances',jsonb_build_object('score',CASE WHEN v=0 THEN 5 ELSE 0 END,'max',5,'active_without_chip',v));

  -- 8. cron_health (5pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour' AND return_message NOT LIKE '%does not exist%' AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%' AND return_message NOT LIKE '%health_status_check%';
  v_score:=v_score+CASE WHEN v=0 THEN 5 WHEN v<5 THEN 3 ELSE 0 END;
  v_bd:=v_bd||jsonb_build_object('cron_health',jsonb_build_object('score',CASE WHEN v=0 THEN 5 WHEN v<5 THEN 3 ELSE 0 END,'max',5,'failures_1h',v,'failures_24h',(SELECT COUNT(*) FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours')));

  -- 9. audit_log_bloat (5pts)
  v_max:=v_max+5;
  IF v_wp IS NOT NULL THEN
    v_score:=v_score+(v_wp->'audit_log_bloat'->>'score')::int;
    v_bd:=v_bd||jsonb_build_object('audit_log_bloat',v_wp->'audit_log_bloat');
  ELSE
    v_bd:=v_bd||jsonb_build_object('audit_log_bloat',jsonb_build_object('score',0,'max',5,'error','fn_webhook_pipeline_score not available'));
  END IF;

  -- 10. idle_connections (5pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v FROM pg_stat_activity
  WHERE state='idle' AND datname=current_database()
  AND application_name NOT ILIKE '%postg%'
  AND application_name NOT ILIKE '%realtime%'
  AND application_name NOT ILIKE '%supabase%'
  AND application_name NOT ILIKE '%mcp%'
  AND application_name NOT ILIKE '%cluster_node%';
  v_score:=v_score+CASE WHEN v<15 THEN 5 WHEN v<30 THEN 3 ELSE 1 END;
  v_bd:=v_bd||jsonb_build_object('idle_connections',jsonb_build_object('score',CASE WHEN v<15 THEN 5 WHEN v<30 THEN 3 ELSE 1 END,'max',5,'count',v,'note','excl_infra'));

  -- 11. cron_log_size (5pts)
  v_max:=v_max+5;
  SELECT pg_total_relation_size('cron.job_run_details') INTO vb;
  v_score:=v_score+CASE WHEN vb<52428800 THEN 5 WHEN vb<104857600 THEN 3 ELSE 0 END;
  v_bd:=v_bd||jsonb_build_object('cron_log_size',jsonb_build_object('score',CASE WHEN vb<52428800 THEN 5 WHEN vb<104857600 THEN 3 ELSE 0 END,'max',5,'size_mb',ROUND(vb::numeric/1048576,1)));

  -- 12. pk_integrity (5pts) -- [R29 2026-08-12] exclui _snap_% e %_staging (nao-schema-de-negocio)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('evo','zapp','public') AND c.relkind IN ('r','p') AND c.relname NOT LIKE '\_backup\_%' AND c.relname NOT LIKE '%\_audit' AND c.relname NOT LIKE '\_snap\_%' AND c.relname NOT LIKE '%\_staging' AND NOT EXISTS(SELECT 1 FROM pg_constraint con WHERE con.conrelid=c.oid AND con.contype='p');
  v_score:=v_score+CASE WHEN v=0 THEN 5 WHEN v<3 THEN 3 ELSE 0 END;
  v_bd:=v_bd||jsonb_build_object('pk_integrity',jsonb_build_object('score',CASE WHEN v=0 THEN 5 WHEN v<3 THEN 3 ELSE 0 END,'max',5,'tables_no_pk',v));

  -- 13. rls_coverage (5pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v FROM pg_tables WHERE schemaname IN ('evo','zapp') AND tablename NOT LIKE '%_202%' AND rowsecurity=false;
  v_score:=v_score+CASE WHEN v=0 THEN 5 WHEN v<3 THEN 3 ELSE 0 END;
  v_bd:=v_bd||jsonb_build_object('rls_coverage',jsonb_build_object('score',CASE WHEN v=0 THEN 5 WHEN v<3 THEN 3 ELSE 0 END,'max',5,'tables_rls_off',v));

  -- 14. security_posture (5pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('zapp','evo') AND c.relkind IN ('r','v','p') AND c.relacl IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(c.relacl) AS acl WHERE acl::text LIKE 'anon=%' OR acl::text ~ '^=');
  v_score:=v_score+CASE WHEN v=0 THEN 5 WHEN v<3 THEN 3 ELSE 0 END;
  v_bd:=v_bd||jsonb_build_object('security_posture',jsonb_build_object('score',CASE WHEN v=0 THEN 5 WHEN v<3 THEN 3 ELSE 0 END,'max',5,'anon_zapp_grants',v));

  -- 15. redis_health (5pts)
  v_max:=v_max+5;
  SELECT maxmemory_policy,ROUND(COALESCE(used_memory_mb*100.0/NULLIF(maxmemory_mb,0),0),2) INTO vs,vn FROM ops.redis_sentinel ORDER BY updated_at DESC LIMIT 1;
  IF vs IN ('volatile-lru','allkeys-lru') AND COALESCE(vn,0)<90 THEN v_score:=v_score+5; END IF;
  v_bd:=v_bd||jsonb_build_object('redis_health',jsonb_build_object('score',CASE WHEN vs IN ('volatile-lru','allkeys-lru') AND COALESCE(vn,0)<90 THEN 5 ELSE 0 END,'max',5,'policy',vs,'mem_pct',vn));

  -- 16. evolution_db (5pts)
  v_max:=v_max+5;
  PERFORM 1 FROM evo.evolution_webhook_events_v2 LIMIT 1;
  v_score:=v_score+5;
  v_bd:=v_bd||jsonb_build_object('evolution_db',jsonb_build_object('score',5,'max',5,'status','ok'));

  -- 17. observability (5pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v FROM information_schema.views WHERE table_schema='public' AND table_name IN ('zapp_audit_log','contact_audit_log','conversation_audit_logs','webhook_audit_log','team_messages','app_notifications','whatsapp_official_credentials');
  v_score:=v_score+CASE WHEN v>=7 THEN 5 WHEN v>=5 THEN 3 ELSE 0 END;
  v_bd:=v_bd||jsonb_build_object('observability',jsonb_build_object('score',CASE WHEN v>=7 THEN 5 WHEN v>=5 THEN 3 ELSE 0 END,'max',5,'bridge_views',v));

  -- 18. backup_freshness (10pts)
  v_max:=v_max+10;
  BEGIN
    SELECT ROUND(EXTRACT(EPOCH FROM(NOW()-last_backup_at))/3600,1),last_backup_table_count
      INTO v_bak_hours,v_bak_tables FROM ops.backup_sentinel ORDER BY updated_at DESC LIMIT 1;
    IF v_bak_hours IS NOT NULL AND v_bak_hours>=0 AND v_bak_hours<26 THEN
      v_score:=v_score+10; v_bd:=v_bd||jsonb_build_object('backup_freshness',jsonb_build_object('score',10,'max',10,'status','fresh','hours_ago',v_bak_hours,'tables',v_bak_tables,'note','threshold_26h_aligned_with_check_infra'));
    ELSIF v_bak_hours IS NOT NULL AND v_bak_hours>=0 AND v_bak_hours<48 THEN
      v_score:=v_score+6; v_bd:=v_bd||jsonb_build_object('backup_freshness',jsonb_build_object('score',6,'max',10,'status','ok','hours_ago',v_bak_hours,'tables',v_bak_tables));
    ELSE
      v_bd:=v_bd||jsonb_build_object('backup_freshness',jsonb_build_object('score',0,'max',10,'status',CASE WHEN v_bak_hours<0 THEN 'FUTURE_TIMESTAMP' ELSE 'CRITICAL' END,'hours_ago',v_bak_hours,'tables',v_bak_tables));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_bd:=v_bd||jsonb_build_object('backup_freshness',jsonb_build_object('score',0,'max',10,'error',SQLERRM));
  END;

  -- 19. security_acl (via fn_score_security_acl)
  BEGIN
    SELECT zapp.fn_score_security_acl() INTO vj;
    v_score:=v_score+(vj->>'score')::int;
    v_max:=v_max+(vj->>'max')::int;
    v_bd:=v_bd||jsonb_build_object('security_acl',vj);
  EXCEPTION WHEN OTHERS THEN
    v_max:=v_max+5;
    v_bd:=v_bd||jsonb_build_object('security_acl',jsonb_build_object('score',0,'max',5,'error',SQLERRM));
  END;

  -- 20. wal_slot_health (5pts)
  v_max:=v_max+5;
  BEGIN
    SELECT COUNT(*) FILTER(WHERE pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)::float/1024/1024>100),
           MAX(pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)::float/1024/1024),
           (SELECT setting::int FROM pg_settings WHERE name='max_slot_wal_keep_size')
      INTO v_wal_risky,v_wal_lag_mb,v_wal_limit
      FROM pg_replication_slots WHERE slot_type='logical' AND active;
    v_wal_pct:=CASE WHEN v_wal_limit>0 AND v_wal_risky>0 THEN ROUND((v_wal_lag_mb/v_wal_limit)*100,1) ELSE 0 END;
    v_wal_score:=CASE WHEN v_wal_risky=0 THEN 5 WHEN v_wal_pct<50 THEN 5 WHEN v_wal_pct<75 THEN 3 WHEN v_wal_pct<90 THEN 1 ELSE 0 END;
    v_wal_status:=CASE WHEN v_wal_risky=0 THEN 'no_risky_slots' WHEN v_wal_pct<50 THEN 'healthy' WHEN v_wal_pct<75 THEN 'warning' WHEN v_wal_pct<90 THEN 'critical' ELSE 'danger_invalidation' END;
    v_score:=v_score+v_wal_score;
    v_bd:=v_bd||jsonb_build_object('wal_slot_health',jsonb_build_object('score',v_wal_score,'max',5,'status',v_wal_status,'risky_slots',v_wal_risky,'max_lag_mb',ROUND(v_wal_lag_mb::numeric,1),'limit_mb',v_wal_limit,'pct_used',v_wal_pct));
  EXCEPTION WHEN OTHERS THEN
    v_score:=v_score+5;
    v_bd:=v_bd||jsonb_build_object('wal_slot_health',jsonb_build_object('score',5,'max',5,'status','query_error','error',SQLERRM));
  END;

  -- 21. v2_mirror_pipeline (10pts)
  v_max:=v_max+10;
  BEGIN
    SELECT zapp.fn_score_v2_pipeline() INTO v_v2dim;
    v_score:=v_score+COALESCE((v_v2dim->>'score')::INT,0);
    v_bd:=v_bd||jsonb_build_object('v2_mirror_pipeline',v_v2dim);
  EXCEPTION WHEN OTHERS THEN
    v_bd:=v_bd||jsonb_build_object('v2_mirror_pipeline',jsonb_build_object('score',0,'max',10,'status','error','error_msg',SQLERRM));
  END;

  RETURN jsonb_build_object(
    'score',ROUND(100.0*v_score/NULLIF(v_max,0),1),
    'grade',CASE WHEN v_score::numeric/NULLIF(v_max,0)>=0.95 THEN 'A+' WHEN v_score::numeric/NULLIF(v_max,0)>=0.87 THEN 'A' WHEN v_score::numeric/NULLIF(v_max,0)>=0.75 THEN 'B' WHEN v_score::numeric/NULLIF(v_max,0)>=0.60 THEN 'C' ELSE 'F' END,
    'checked_at',NOW(),'breakdown',v_bd);
END;
$function$;
