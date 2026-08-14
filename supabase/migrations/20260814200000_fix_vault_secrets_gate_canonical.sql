-- 20260814200000_fix_vault_secrets_gate_canonical.sql
-- FIX: vault_secrets check (item 5) em fn_system_health_score e fn_health_preflight
--
-- Problema: SELECT COUNT(*) FROM vault.secrets WHERE name='webhook_secret_evolution'
--   - Acessa vault.secrets diretamente, bypassando o gateway canônico
--   - Falha quando RLS em vault.secrets (migration 20260807230000_vault_rls) bloqueia
--   - Reportado como "gate SQL não-zero" pelo inventory.mjs
--
-- Fix: usar ops.fn_evo_key() IS NOT NULL como gate
--   - ops.fn_evo_key() lê de vault.decrypted_secrets via SECURITY DEFINER
--   - Checa se a Evolution API key está acessível (mais significativo que webhook secret)
--   - Elimina acesso direto a vault.secrets fora do whitelist canônico

-- ═══════════════════════════════════════════════════════════════════════
-- 1. zapp.fn_system_health_score — item 5 corrigido (corpo completo)
-- ═══════════════════════════════════════════════════════════════════════

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

  -- 5. vault_secrets (10pts) — gate canônico via ops.fn_evo_key() [fix 2026-08-14]
  -- Substituído: SELECT COUNT(*) FROM vault.secrets (bypassava RLS + gateway canônico)
  v_max:=v_max+10;
  BEGIN
    vs := ops.fn_evo_key();
  EXCEPTION WHEN OTHERS THEN
    vs := NULL;
  END;
  IF vs IS NOT NULL AND vs <> '' THEN v_score:=v_score+10; END IF;
  v_bd:=v_bd||jsonb_build_object('vault_secrets',jsonb_build_object('score',CASE WHEN vs IS NOT NULL AND vs<>'' THEN 10 ELSE 0 END,'max',10,'evo_key_ok',vs IS NOT NULL AND vs<>'','note','gate-via-fn_evo_key-2026-08-14'));

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

  -- 12. pk_integrity (5pts) -- [R29 2026-08-12] exclui _snap_% e %_staging
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

-- ═══════════════════════════════════════════════════════════════════════
-- 2. public.fn_health_preflight — patch cirúrgico via pg_get_functiondef
-- Substitui SELECT COUNT(*) FROM vault.secrets → ops.fn_evo_key() IS NOT NULL
-- Safe: só aplica se o padrão existir; NOTICE se já correto ou não existe
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_def  text;
  v_new  text;
  v_old_pattern  text;
  v_new_pattern  text;
BEGIN
  SELECT pg_get_functiondef(oid)
  INTO v_def
  FROM pg_proc
  WHERE proname = 'fn_health_preflight'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'fn_health_preflight: não encontrada em public — skip';
    RETURN;
  END IF;

  IF v_def NOT LIKE '%vault.secrets%' THEN
    RAISE NOTICE 'fn_health_preflight: vault.secrets não encontrada no corpo — já corrigida ou usa outro padrão';
    RETURN;
  END IF;

  -- Substituição: troca o acesso direto a vault.secrets pelo gate canônico
  -- Padrão genérico: SELECT COUNT(*) INTO v FROM vault.secrets ...
  v_new := regexp_replace(
    v_def,
    'SELECT COUNT\(\*\) INTO v FROM vault\.secrets[^;]+;(\s+)IF v>0 THEN v_score:=v_score\+(\d+); END IF;(\s+)v_bd:=v_bd\|\|jsonb_build_object\(''vault_secrets'',jsonb_build_object\(''score'',CASE WHEN v>0 THEN \d+ ELSE 0 END,''max'',\d+,''in_vault'',v>0\)\);',
    E'-- gate canônico via ops.fn_evo_key() [fix 2026-08-14]\n  BEGIN vs := ops.fn_evo_key(); EXCEPTION WHEN OTHERS THEN vs := NULL; END;\n  IF vs IS NOT NULL AND vs <> '''' THEN v_score:=v_score+\\2; END IF;\n  v_bd:=v_bd||jsonb_build_object(''vault_secrets'',jsonb_build_object(''score'',CASE WHEN vs IS NOT NULL AND vs<>'''' THEN \\2 ELSE 0 END,''max'',10,''evo_key_ok'',vs IS NOT NULL AND vs<>'''',''note'',''gate-via-fn_evo_key-2026-08-14''));',
    'g'
  );

  IF v_new = v_def THEN
    RAISE NOTICE 'fn_health_preflight: regexp não casou — inspeção manual necessária';
    RETURN;
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'fn_health_preflight: vault.secrets → ops.fn_evo_key() aplicado com sucesso';
END;
$$;

-- Verificação
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT COUNT(*) INTO v_n
  FROM pg_proc
  WHERE proname IN ('fn_system_health_score', 'fn_health_preflight')
    AND pg_get_functiondef(oid) LIKE '%vault.secrets%';
  IF v_n = 0 THEN
    RAISE NOTICE 'PASS: nenhuma das funções usa vault.secrets diretamente';
  ELSE
    RAISE WARNING 'WARN: % função(ões) ainda usa vault.secrets — verificar manualmente', v_n;
  END IF;
END;
$$;
