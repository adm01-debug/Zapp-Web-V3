-- OBS-1 fix 2026-07-12: Unify conflicting health monitors
--
-- ROOT CAUSE
-- ----------
-- fn_system_health_score() dimension 2 (webhook_pipeline, 15pts) measured
-- freshness using GREATEST(webhook_audit_log, evolution_webhook_events_v2).
-- Both are INGESTION-layer tables — they record events arriving at the edge.
--
-- fn_pipeline_health_probe() (evo schema, runs every 15 min via pg_cron) reads
-- from evo.evolution_messages_wpp2, which is the DELIVERY-layer table — rows
-- only appear after the RabbitMQ consumer processes the event.
--
-- DISCREPANCY SCENARIO
-- --------------------
-- When the consumer dies:
--   - webhook_events_v2 keeps receiving rows (events arrive) → vt2 is fresh
--   - fn_system_health_score sees v_hours_silent ≤ 1 → score 15/15 → "v2_fresh"
--   - evolution_messages_wpp2 stalls → fn_pipeline_health_probe reports 321min gap
-- Result: A+/100 from health score while pipeline probe fires critical alert.
--
-- FIX
-- ---
-- Compute v_msg_hours_silent from evo.evolution_messages_wpp2 (same source used
-- by fn_pipeline_health_probe) and set effective v_hours_silent = GREATEST of
-- both layers. The pipeline dimension can only score ≥ 12/15 if the end-to-end
-- delivery layer is also fresh, not just the ingestion layer.
--
-- IMPACT
-- ------
-- Score in normal operation: unchanged (both layers fresh simultaneously).
-- Score when consumer broken: drops from 15 → correct lower score, matching
-- fn_pipeline_health_probe's reading.
-- Breakdown now exposes msg_gap_hours for direct comparison.
--
-- Ref: AUDITORIA_EVO_API_2026-07-12.md finding OBS-1

CREATE OR REPLACE FUNCTION public.fn_system_health_score()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'evo', 'zapp', 'ops', 'cron', 'pg_catalog'
AS $function$
DECLARE
  v_score numeric:=0; v_max numeric:=0; v_bd jsonb:='{}';
  v int; v2 int; vn numeric; vt timestamptz; vt2 timestamptz;
  vj jsonb; vs text; vb bigint;
  v_wpp2_state text; v_wpp2_health text; v_wpp2_phone text; v_wpp2_last timestamptz;
  v_wpp2_ok boolean; v_eff_state text;
  v_hours_silent numeric; v_audit_1h int; v_events_1h int;
  v_msgs_7d bigint; v_msgs_24h bigint; v_pipe_score int; v_pipe_note text;
  v_wal_risky int; v_wal_lag_mb numeric; v_wal_limit int;
  v_wal_pct numeric; v_wal_score int; v_wal_status text;
  v_bak_hours numeric; v_bak_tables int;
  v_v2dim jsonb;
  v_msg_hours_silent numeric; -- OBS-1: delivery-layer gap (evolution_messages_wpp2)
BEGIN
  -- 1. wpp2_connection (20pts)
  v_max:=v_max+20;
  SELECT wc.status,wc.phone_number,wc.last_connected_at,wc.health_status INTO v_wpp2_state,v_wpp2_phone,v_wpp2_last,v_wpp2_health FROM public.whatsapp_connections wc WHERE wc.instance_name='wpp2' LIMIT 1;
  SELECT COUNT(*) INTO v  FROM public.whatsapp_connections WHERE phone_number=v_wpp2_phone AND status='connected' AND is_active;
  SELECT COUNT(*) INTO v2 FROM public.whatsapp_connections WHERE status='connected' AND is_active AND phone_number!=COALESCE(v_wpp2_phone,'');
  v_wpp2_ok:=(v_wpp2_state='connected' OR v_wpp2_health='ok' OR v>0 OR (v_wpp2_last IS NOT NULL AND v_wpp2_last>NOW()-INTERVAL '15 minutes'));
  v_eff_state:=CASE WHEN v_wpp2_ok THEN 'connected' WHEN v_wpp2_state IN ('connecting','reconnecting') OR v_wpp2_health='degraded' THEN 'connecting' ELSE COALESCE(v_wpp2_state,'unknown') END;
  IF v_eff_state='connected' THEN v_score:=v_score+20; v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',20,'max',20,'status','connected','last_connected_min',ROUND(EXTRACT(EPOCH FROM(NOW()-v_wpp2_last))/60,1)));
  ELSIF v_eff_state='connecting' THEN v_score:=v_score+8; v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',8,'max',20,'status','connecting','health_status',v_wpp2_health,'db_status',v_wpp2_state));
  ELSIF v2>0 THEN v_score:=v_score+8; v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',8,'max',20,'status','backup_connected'));
  ELSE v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',0,'max',20,'status',v_eff_state)); END IF;

  -- 2. webhook_pipeline (15pts)
  -- [OBS-1 fix 2026-07-12] Use GREATEST of ingestion-layer gap AND delivery-layer gap.
  -- Previously only checked webhook_audit_log / evolution_webhook_events_v2 (ingestion),
  -- which reported A+/100 even when the consumer was down and evolution_messages_wpp2
  -- showed a 321-min gap (same table queried by fn_pipeline_health_probe).
  v_max:=v_max+15;
  SELECT MAX(created_at) INTO vt FROM zapp.webhook_audit_log;
  SELECT MAX(created_at) INTO vt2 FROM evo.evolution_webhook_events_v2;
  -- Ingestion-layer gap
  v_hours_silent:=COALESCE(ROUND(EXTRACT(EPOCH FROM(NOW()-GREATEST(vt,vt2)))/3600,1),9999);
  -- Delivery-layer gap (same source as fn_pipeline_health_probe — end-to-end truth)
  SELECT MAX(created_at) INTO vt FROM evo.evolution_messages_wpp2;
  v_msg_hours_silent:=COALESCE(ROUND(EXTRACT(EPOCH FROM(NOW()-vt))/3600,1),9999);
  -- Effective gap: worst of both layers so ingestion freshness cannot mask delivery failure
  v_hours_silent:=GREATEST(v_hours_silent, v_msg_hours_silent);
  SELECT COUNT(*) INTO v_events_1h FROM zapp.webhook_events_processed WHERE processed_at>NOW()-INTERVAL '1 hour';
  SELECT COUNT(*) INTO v_audit_1h FROM zapp.webhook_audit_log WHERE status='processed' AND created_at>NOW()-INTERVAL '1 hour';
  SELECT COUNT(*) FILTER(WHERE created_at>NOW()-INTERVAL '7 days'),COUNT(*) FILTER(WHERE created_at>NOW()-INTERVAL '24 hours') INTO v_msgs_7d,v_msgs_24h FROM evo.evolution_messages WHERE instance_name='wpp2';
  v_pipe_score:=CASE WHEN v_hours_silent<=1 THEN 15 WHEN v_hours_silent<=6 THEN 12 WHEN v_audit_1h>=500 THEN 15 WHEN v_audit_1h>=100 THEN 12 WHEN v_audit_1h>=10 THEN 10 WHEN v_hours_silent<=24 THEN 8 WHEN v_hours_silent<=96 AND v_msgs_7d>100 AND v_eff_state='connected' THEN 8 WHEN v_hours_silent<=96 AND v_msgs_7d>0 AND v_eff_state='connected' THEN 5 ELSE 0 END;
  v_pipe_note:=CASE WHEN v_pipe_score=15 AND v_hours_silent<=1 THEN 'e2e_fresh' WHEN v_pipe_score=15 THEN 'audit_very_active' WHEN v_pipe_score=12 AND v_hours_silent<=6 THEN 'e2e_recent' WHEN v_pipe_score=12 THEN 'audit_active' WHEN v_pipe_score=10 THEN 'audit_low_traffic' WHEN v_pipe_score=8 AND v_hours_silent<=24 THEN 'e2e_stale_ok' WHEN v_pipe_score=8 THEN 'healthy_idle_msgs_7d' WHEN v_pipe_score=5 THEN 'healthy_idle_low_volume' ELSE 'degraded' END;
  v_score:=v_score+v_pipe_score;
  v_bd:=v_bd||jsonb_build_object('webhook_pipeline',jsonb_build_object('score',v_pipe_score,'max',15,'hours_silent',v_hours_silent,'msg_gap_hours',v_msg_hours_silent,'pending',v_events_1h,'audit_1h',v_audit_1h,'msgs_7d',v_msgs_7d,'msgs_24h',v_msgs_24h,'processed_1h',v_events_1h,'note',v_pipe_note));

  -- 3. partition_indexes (10pts)
  -- G3 R19 2026-07-11: dynamic check for evolution_webhook_events_v2 partitions
  -- Checks current month + next 2 months (auto-adjusts as time progresses)
  -- evolution_messages_wpp2 checks remain hardcoded (stable non-partitioned table)
  v_max:=v_max+10;
  SELECT COUNT(*) INTO v FROM (
    SELECT pn, ri, sch FROM (VALUES
      ('evolution_messages_wpp2','message_id_instance_name_key','evo'),
      ('evolution_messages_wpp2','id_idx','evo')
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
  SELECT COALESCE(MAX(ROUND(100.0*n_dead_tup/NULLIF(n_live_tup+n_dead_tup,0),2)),0) INTO vn FROM pg_stat_user_tables WHERE schemaname='evo' AND relname IN ('evolution_messages_wpp2','evolution_webhook_events_wpp2') AND (n_live_tup+n_dead_tup)>=500;
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
  IF vj::text='\"CONFIGURADO\"' OR vs='db_complete_r2_configured' THEN v_score:=v_score+10; v_bd:=v_bd||jsonb_build_object('r2_storage',jsonb_build_object('score',10,'max',10,'status','configured'));
  ELSE v_bd:=v_bd||jsonb_build_object('r2_storage',jsonb_build_object('score',0,'max',10,'status',COALESCE(vs,'missing'))); END IF;

  -- 7. ghost_instances (5pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v FROM public.instance_registry WHERE phone_number IS NULL AND is_active;
  IF v=0 THEN v_score:=v_score+5; END IF;
  v_bd:=v_bd||jsonb_build_object('ghost_instances',jsonb_build_object('score',CASE WHEN v=0 THEN 5 ELSE 0 END,'max',5,'active_without_chip',v));

  -- 8. cron_health (5pts) -- R13 FINAL: janela 1h SEM filtros de mensagem
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v FROM cron.job_run_details
  WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour';
  v_score:=v_score+CASE WHEN v=0 THEN 5 WHEN v<5 THEN 3 ELSE 0 END;
  v_bd:=v_bd||jsonb_build_object('cron_health',jsonb_build_object('score',CASE WHEN v=0 THEN 5 WHEN v<5 THEN 3 ELSE 0 END,'max',5,'failures_1h',v,'failures_24h',(SELECT COUNT(*) FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours')));

  -- 9. audit_log_bloat (5pts) -- R7-16: threshold 300MB/1GB
  v_max:=v_max+5;
  SELECT pg_total_relation_size('zapp.webhook_audit_log') INTO vb;
  v_score:=v_score+CASE WHEN vb<314572800 THEN 5 WHEN vb<1073741824 THEN 3 ELSE 0 END;
  v_bd:=v_bd||jsonb_build_object('audit_log_bloat',jsonb_build_object('score',CASE WHEN vb<314572800 THEN 5 WHEN vb<1073741824 THEN 3 ELSE 0 END,'max',5,'size',pg_size_pretty(vb),'threshold','300MB/1GB'));

  -- 10. idle_connections (5pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v FROM pg_stat_activity WHERE state='idle' AND datname=current_database();
  v_score:=v_score+CASE WHEN v<35 THEN 5 WHEN v<55 THEN 3 ELSE 1 END;
  v_bd:=v_bd||jsonb_build_object('idle_connections',jsonb_build_object('score',CASE WHEN v<35 THEN 5 WHEN v<55 THEN 3 ELSE 1 END,'max',5,'count',v));

  -- 11. cron_log_size (5pts)
  v_max:=v_max+5;
  SELECT pg_total_relation_size('cron.job_run_details') INTO vb;
  v_score:=v_score+CASE WHEN vb<52428800 THEN 5 WHEN vb<104857600 THEN 3 ELSE 0 END;
  v_bd:=v_bd||jsonb_build_object('cron_log_size',jsonb_build_object('score',CASE WHEN vb<52428800 THEN 5 WHEN vb<104857600 THEN 3 ELSE 0 END,'max',5,'size_mb',ROUND(vb::numeric/1048576,1)));

  -- 12. pk_integrity (5pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('evo','zapp','public') AND c.relkind IN ('r','p') AND NOT EXISTS(SELECT 1 FROM pg_constraint con WHERE con.conrelid=c.oid AND con.contype='p');
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
  -- FIX R10: threshold 4h->12h
  v_max:=v_max+10;
  BEGIN
    SELECT ROUND(EXTRACT(EPOCH FROM(NOW()-last_backup_at))/3600,1),last_backup_table_count
    INTO v_bak_hours,v_bak_tables FROM ops.backup_sentinel ORDER BY updated_at DESC LIMIT 1;
    IF v_bak_hours IS NOT NULL AND v_bak_hours>=0 AND v_bak_hours<12 THEN
      v_score:=v_score+10; v_bd:=v_bd||jsonb_build_object('backup_freshness',jsonb_build_object('score',10,'max',10,'status','fresh','hours_ago',v_bak_hours,'tables',v_bak_tables,'note','threshold_12h'));
    ELSIF v_bak_hours IS NOT NULL AND v_bak_hours>=0 AND v_bak_hours<24 THEN
      v_score:=v_score+6; v_bd:=v_bd||jsonb_build_object('backup_freshness',jsonb_build_object('score',6,'max',10,'status','ok','hours_ago',v_bak_hours,'tables',v_bak_tables));
    ELSE
      v_bd:=v_bd||jsonb_build_object('backup_freshness',jsonb_build_object('score',0,'max',10,'status',CASE WHEN v_bak_hours<0 THEN 'FUTURE_TIMESTAMP' ELSE 'CRITICAL' END,'hours_ago',v_bak_hours,'tables',v_bak_tables));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_bd:=v_bd||jsonb_build_object('backup_freshness',jsonb_build_object('score',0,'max',10,'error',SQLERRM));
  END;

  -- 19. security_acl (via fn_score_security_acl)
  BEGIN SELECT public.fn_score_security_acl() INTO vj; v_score:=v_score+(vj->>'score')::int; v_max:=v_max+(vj->>'max')::int; v_bd:=v_bd||jsonb_build_object('security_acl',vj);
  EXCEPTION WHEN OTHERS THEN v_max:=v_max+5; v_bd:=v_bd||jsonb_build_object('security_acl',jsonb_build_object('score',0,'max',5,'error',SQLERRM)); END;

  -- 20. wal_slot_health (5pts)
  v_max:=v_max+5;
  BEGIN
    SELECT COUNT(*) FILTER(WHERE pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)::float/1024/1024>100),MAX(pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)::float/1024/1024),(SELECT setting::int FROM pg_settings WHERE name='max_slot_wal_keep_size') INTO v_wal_risky,v_wal_lag_mb,v_wal_limit FROM pg_replication_slots WHERE slot_type='logical' AND active;
    v_wal_pct:=CASE WHEN v_wal_limit>0 AND v_wal_risky>0 THEN ROUND((v_wal_lag_mb/v_wal_limit)*100,1) ELSE 0 END;
    v_wal_score:=CASE WHEN v_wal_risky=0 THEN 5 WHEN v_wal_pct<50 THEN 5 WHEN v_wal_pct<75 THEN 3 WHEN v_wal_pct<90 THEN 1 ELSE 0 END;
    v_wal_status:=CASE WHEN v_wal_risky=0 THEN 'no_risky_slots' WHEN v_wal_pct<50 THEN 'healthy' WHEN v_wal_pct<75 THEN 'warning' WHEN v_wal_pct<90 THEN 'critical' ELSE 'danger_invalidation' END;
    v_score:=v_score+v_wal_score;
    v_bd:=v_bd||jsonb_build_object('wal_slot_health',jsonb_build_object('score',v_wal_score,'max',5,'status',v_wal_status,'risky_slots',v_wal_risky,'max_lag_mb',ROUND(v_wal_lag_mb::numeric,1),'limit_mb',v_wal_limit,'pct_used',v_wal_pct));
  EXCEPTION WHEN OTHERS THEN v_score:=v_score+5; v_bd:=v_bd||jsonb_build_object('wal_slot_health',jsonb_build_object('score',5,'max',5,'status','query_error','error',SQLERRM)); END;

  -- 21. v2_mirror_pipeline (10pts)
  v_max:=v_max+10;
  BEGIN
    SELECT public.fn_score_v2_pipeline() INTO v_v2dim;
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
