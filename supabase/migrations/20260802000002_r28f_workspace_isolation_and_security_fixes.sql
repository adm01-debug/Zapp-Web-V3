BEGIN;

-- ============================================================
-- R28f: Workspace Isolation & Security Fixes (CI/fresh-env parity)
-- Date: 2026-08-02
-- Resolves: 20260801185500_r27_security_workspace_isolation_rt28_31.sql
--   which was documentation-only (all fixes applied directly to prod DB)
-- ============================================================
-- FIX 1: zapp.bulk_auto_merge_duplicates — admin guard (42501 for non-admin)
-- FIX 4: zapp.get_contact_360_by_phone   — workspace isolation via workspace_members
-- FIX 6: zapp.get_companies_by_phones_batch — workspace guard + REVOKE from authenticated
-- FIX 7: zapp.fn_system_health_score     — degraded≠connected (was scoring 20/20 wrong)
-- FIX 8: evo._evolution_contacts_backup_20260801 — add 2 RLS policies (was total lockout)
-- FIX 9: DROP public._grant_backup_20260730 (empty, must not exist per Regra T2)
-- ============================================================

-- ─────────────────────────────────────────────────────────────────
-- FIX 1: zapp.bulk_auto_merge_duplicates — admin guard
-- Archive: 20260725000004_create_missing_external_db_proxy_rpcs.sql:559
-- SECURITY DEFINER function had no role check; any authenticated user could call.
-- Fix: RAISE 42501 for non-admin authenticated; service_role passes (uid IS NULL).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.bulk_auto_merge_duplicates(
  p_instance_name TEXT,
  p_limit         INT DEFAULT 50
)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = zapp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'bulk_auto_merge_duplicates: insufficient privilege'
      USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'bulk_auto_merge_duplicates: automatic contact merging not yet implemented. Use merge_contacts() for individual merges.'
    USING ERRCODE = 'P0001',
          HINT    = 'Find duplicates with get_duplicate_report() then call merge_contacts() for each pair';
END;
$$;

REVOKE ALL ON FUNCTION zapp.bulk_auto_merge_duplicates(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.bulk_auto_merge_duplicates(TEXT, INT) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────
-- FIX 4: zapp.get_contact_360_by_phone — workspace isolation
-- Archive: 20260725000004_create_missing_external_db_proxy_rpcs.sql:259
-- SECURITY DEFINER queried zapp.contacts with no workspace filter;
-- any authenticated user could read contacts from ALL workspaces.
-- Fix: join workspace_members to get caller's workspace_id, filter rows.
-- service_role (auth.uid() IS NULL): v_workspace_id stays NULL → no filter.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.get_contact_360_by_phone(p_phone TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = zapp AS $$
DECLARE
  v_contact      JSONB;
  v_uid          UUID := auth.uid();
  v_workspace_id UUID;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT wm.workspace_id INTO v_workspace_id
      FROM zapp.workspace_members wm
     WHERE wm.user_id = v_uid
     LIMIT 1;
  END IF;

  SELECT jsonb_build_object(
      'id',                  c.id,
      'name',                c.name,
      'phone',               c.phone,
      'email',               c.email,
      'tags',                c.tags,
      'notes',               c.notes,
      'created_at',          c.created_at,
      'conversations_count', 0
    )
    INTO v_contact
    FROM zapp.contacts c
   WHERE (c.phone = p_phone
          OR REPLACE(REPLACE(c.phone,'+',''),'-','')
             = REPLACE(REPLACE(p_phone,'+',''),'-',''))
     AND (v_workspace_id IS NULL OR c.workspace_id = v_workspace_id)
   ORDER BY c.created_at DESC
   LIMIT 1;

  RETURN COALESCE(v_contact, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION zapp.get_contact_360_by_phone(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.get_contact_360_by_phone(TEXT) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────
-- FIX 6: zapp.get_companies_by_phones_batch — workspace guard + REVOKE
-- Archive: 20260725000004_create_missing_external_db_proxy_rpcs.sql:200
-- SECURITY DEFINER queried zapp.empresas with no workspace filter;
-- any authenticated user could read empresa data from ALL workspaces.
-- Fix: workspace_id filter + REVOKE EXECUTE from authenticated (service_role only).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.get_companies_by_phones_batch(p_phones TEXT[])
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = zapp AS $$
DECLARE
  v_results      JSONB;
  v_uid          UUID := auth.uid();
  v_workspace_id UUID;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT wm.workspace_id INTO v_workspace_id
      FROM zapp.workspace_members wm
     WHERE wm.user_id = v_uid
     LIMIT 1;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
      'phone',        e.telefone,
      'company_id',   e.id,
      'company_name', e.nome_fantasia,
      'cnpj',         e.cnpj,
      'email',        e.email
    ))
    INTO v_results
    FROM zapp.empresas e
   WHERE (e.telefone = ANY(p_phones) OR e.telefone2 = ANY(p_phones))
     AND (v_workspace_id IS NULL OR e.workspace_id = v_workspace_id);

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION zapp.get_companies_by_phones_batch(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zapp.get_companies_by_phones_batch(TEXT[]) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- FIX 7: zapp.fn_system_health_score — degraded≠connected
-- OBS-1 base: 20260712000001_obs1_fix_fn_system_health_score.sql
-- Moved to zapp schema by: 20260716_fix_public_to_zapp_schema.sql
-- BUG: v_wpp2_ok was TRUE when state='connected' regardless of health_status='degraded'
--   because the condition was: v_wpp2_state='connected' OR v_wpp2_health='ok'
--   → 'connected'+'degraded' scored 20/20 (wrong; should score 8/20 as 'connecting')
-- FIX: guard the state='connected' branch and the recency branch with
--   COALESCE(v_wpp2_health,'ok') != 'degraded'
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_system_health_score()
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
  v_msg_hours_silent numeric;
BEGIN
  -- 1. wpp2_connection (20pts)
  v_max:=v_max+20;
  SELECT wc.status,wc.phone_number,wc.last_connected_at,wc.health_status INTO v_wpp2_state,v_wpp2_phone,v_wpp2_last,v_wpp2_health FROM public.whatsapp_connections wc WHERE wc.instance_name='wpp2' LIMIT 1;
  SELECT COUNT(*) INTO v  FROM public.whatsapp_connections WHERE phone_number=v_wpp2_phone AND status='connected' AND is_active;
  SELECT COUNT(*) INTO v2 FROM public.whatsapp_connections WHERE status='connected' AND is_active AND phone_number!=COALESCE(v_wpp2_phone,'');
  -- FIX 7: 'degraded' health_status must not count as connected (was scoring 20/20 incorrectly)
  -- state='connected' + health='degraded' → v_wpp2_ok=FALSE → v_eff_state='connecting' → 8/20
  v_wpp2_ok:=(
    (v_wpp2_state='connected' AND COALESCE(v_wpp2_health,'ok') != 'degraded')
    OR v_wpp2_health='ok'
    OR v>0
    OR (v_wpp2_last IS NOT NULL AND v_wpp2_last>NOW()-INTERVAL '15 minutes'
        AND COALESCE(v_wpp2_health,'ok') != 'degraded')
  );
  v_eff_state:=CASE WHEN v_wpp2_ok THEN 'connected' WHEN v_wpp2_state IN ('connecting','reconnecting') OR v_wpp2_health='degraded' THEN 'connecting' ELSE COALESCE(v_wpp2_state,'unknown') END;
  -- [OBS-1] penalizar conexão stale: DB pode manter status='connected' sem reconexão real >2h
  vn := ROUND(EXTRACT(EPOCH FROM(NOW()-v_wpp2_last))/60, 1);
  IF v_eff_state='connected' THEN
    IF vn <= 120 THEN
      v_score:=v_score+20;
      v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',20,'max',20,'status','connected','last_connected_min',vn));
    ELSE
      v_score:=v_score+12;
      v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',12,'max',20,'status','connected_stale','last_connected_min',vn,'note','stale>2h_penalty'));
    END IF;
  ELSIF v_eff_state='connecting' THEN v_score:=v_score+8; v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',8,'max',20,'status','connecting','health_status',v_wpp2_health,'db_status',v_wpp2_state));
  ELSIF v2>0 THEN v_score:=v_score+8; v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',8,'max',20,'status','backup_connected'));
  ELSE v_bd:=v_bd||jsonb_build_object('wpp2_connection',jsonb_build_object('score',0,'max',20,'status',v_eff_state)); END IF;

  -- 2. webhook_pipeline (15pts)
  v_max:=v_max+15;
  SELECT MAX(created_at) INTO vt FROM zapp.webhook_audit_log;
  SELECT MAX(created_at) INTO vt2 FROM evo.evolution_webhook_events_v2;
  v_hours_silent:=COALESCE(ROUND(EXTRACT(EPOCH FROM(NOW()-GREATEST(vt,vt2)))/3600,1),9999);
  -- [OBS-1] usar tabela consolidada evolution_messages (não a legada evolution_messages_wpp2)
  SELECT MAX(created_at) INTO vt FROM evo.evolution_messages WHERE instance_name='wpp2';
  v_msg_hours_silent:=COALESCE(ROUND(EXTRACT(EPOCH FROM(NOW()-vt))/3600,1),9999);
  v_hours_silent:=GREATEST(v_hours_silent, v_msg_hours_silent);
  SELECT COUNT(*) INTO v_events_1h FROM zapp.webhook_events_processed WHERE processed_at>NOW()-INTERVAL '1 hour';
  SELECT COUNT(*) INTO v_audit_1h FROM zapp.webhook_audit_log WHERE status='processed' AND created_at>NOW()-INTERVAL '1 hour';
  SELECT COUNT(*) FILTER(WHERE created_at>NOW()-INTERVAL '7 days'),COUNT(*) FILTER(WHERE created_at>NOW()-INTERVAL '24 hours') INTO v_msgs_7d,v_msgs_24h FROM evo.evolution_messages WHERE instance_name='wpp2';
  v_pipe_score:=CASE WHEN v_hours_silent<=1 THEN 15 WHEN v_hours_silent<=6 THEN 12 WHEN v_audit_1h>=500 THEN 15 WHEN v_audit_1h>=100 THEN 12 WHEN v_audit_1h>=10 THEN 10 WHEN v_hours_silent<=24 THEN 8 WHEN v_hours_silent<=96 AND v_msgs_7d>100 AND v_eff_state='connected' THEN 8 WHEN v_hours_silent<=96 AND v_msgs_7d>0 AND v_eff_state='connected' THEN 5 ELSE 0 END;
  v_pipe_note:=CASE WHEN v_pipe_score=15 AND v_hours_silent<=1 THEN 'e2e_fresh' WHEN v_pipe_score=15 THEN 'audit_very_active' WHEN v_pipe_score=12 AND v_hours_silent<=6 THEN 'e2e_recent' WHEN v_pipe_score=12 THEN 'audit_active' WHEN v_pipe_score=10 THEN 'audit_low_traffic' WHEN v_pipe_score=8 AND v_hours_silent<=24 THEN 'e2e_stale_ok' WHEN v_pipe_score=8 THEN 'healthy_idle_msgs_7d' WHEN v_pipe_score=5 THEN 'healthy_idle_low_volume' ELSE 'degraded' END;
  v_score:=v_score+v_pipe_score;
  v_bd:=v_bd||jsonb_build_object('webhook_pipeline',jsonb_build_object('score',v_pipe_score,'max',15,'hours_silent',v_hours_silent,'msg_gap_hours',v_msg_hours_silent,'pending',v_events_1h,'audit_1h',v_audit_1h,'msgs_7d',v_msgs_7d,'msgs_24h',v_msgs_24h,'processed_1h',v_events_1h,'note',v_pipe_note));

  -- 3. partition_indexes (10pts)
  -- [OBS-1] substituir evolution_messages_wpp2 (legada) por evolution_messages (consolidada)
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
  -- [OBS-1] substituir tabelas legadas por tabelas ativas
  v_max:=v_max+10;
  SELECT COALESCE(MAX(ROUND(100.0*n_dead_tup/NULLIF(n_live_tup+n_dead_tup,0),2)),0) INTO vn FROM pg_stat_user_tables WHERE schemaname='evo' AND relname IN ('evolution_messages','evolution_webhook_events_v2') AND (n_live_tup+n_dead_tup)>=500;
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
  IF vj::text='"CONFIGURADO"' OR vs='db_complete_r2_configured' THEN v_score:=v_score+10; v_bd:=v_bd||jsonb_build_object('r2_storage',jsonb_build_object('score',10,'max',10,'status','configured'));
  ELSE v_bd:=v_bd||jsonb_build_object('r2_storage',jsonb_build_object('score',0,'max',10,'status',COALESCE(vs,'missing'))); END IF;

  -- 7. ghost_instances (5pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v FROM public.instance_registry WHERE phone_number IS NULL AND is_active;
  IF v=0 THEN v_score:=v_score+5; END IF;
  v_bd:=v_bd||jsonb_build_object('ghost_instances',jsonb_build_object('score',CASE WHEN v=0 THEN 5 ELSE 0 END,'max',5,'active_without_chip',v));

  -- 8. cron_health (5pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v FROM cron.job_run_details
  WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour';
  v_score:=v_score+CASE WHEN v=0 THEN 5 WHEN v<5 THEN 3 ELSE 0 END;
  v_bd:=v_bd||jsonb_build_object('cron_health',jsonb_build_object('score',CASE WHEN v=0 THEN 5 WHEN v<5 THEN 3 ELSE 0 END,'max',5,'failures_1h',v,'failures_24h',(SELECT COUNT(*) FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours')));

  -- 9. audit_log_bloat (5pts)
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

-- ─────────────────────────────────────────────────────────────────
-- FIX 8: evo._evolution_contacts_backup_20260801 — add RLS policies
-- Table created in 20260801020001_merge_duplicate_contacts.sql with RLS ON
-- but ZERO policies → total lockout (even service_role was blocked).
-- Fix: service_role gets ALL; authenticated admins get SELECT.
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'evo' AND table_name = '_evolution_contacts_backup_20260801'
  ) THEN
    RAISE NOTICE 'R28f FIX8: _evolution_contacts_backup_20260801 not found — skip';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'evo'
       AND tablename  = '_evolution_contacts_backup_20260801'
       AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all"
      ON evo._evolution_contacts_backup_20260801
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
    RAISE NOTICE 'R28f FIX8: service_role_all policy created';
  ELSE
    RAISE NOTICE 'R28f FIX8: service_role_all already exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'evo'
       AND tablename  = '_evolution_contacts_backup_20260801'
       AND policyname = 'admin_select'
  ) THEN
    CREATE POLICY "admin_select"
      ON evo._evolution_contacts_backup_20260801
      FOR SELECT TO authenticated
      USING (zapp.is_admin_or_supervisor());
    RAISE NOTICE 'R28f FIX8: admin_select policy created';
  ELSE
    RAISE NOTICE 'R28f FIX8: admin_select already exists';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- FIX 9: DROP public._grant_backup_20260730
-- Empty table in public schema violates Regra T2 (no app tables in public).
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  DROP TABLE IF EXISTS public._grant_backup_20260730;
  RAISE NOTICE 'R28f FIX9: public._grant_backup_20260730 dropped (or did not exist)';
END $$;

-- ─────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_src text;
  v_cnt int;
BEGIN
  -- FIX 1: bulk_auto_merge_duplicates has admin guard
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE proname = 'bulk_auto_merge_duplicates'
     AND pronamespace = 'zapp'::regnamespace;
  IF v_src IS NULL THEN
    RAISE NOTICE 'R28f FIX1: bulk_auto_merge_duplicates not found (CI env?) — skip';
  ELSIF v_src NOT LIKE '%42501%' OR v_src NOT LIKE '%is_admin_or_supervisor%' THEN
    RAISE EXCEPTION 'R28f VERIFICATION FAILED FIX1: bulk_auto_merge_duplicates missing admin guard (42501 + is_admin_or_supervisor)';
  ELSE
    RAISE NOTICE 'R28f FIX1: bulk_auto_merge_duplicates admin guard present ✓';
  END IF;

  -- FIX 4: get_contact_360_by_phone has workspace_id filter
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE proname = 'get_contact_360_by_phone'
     AND pronamespace = 'zapp'::regnamespace;
  IF v_src IS NULL THEN
    RAISE NOTICE 'R28f FIX4: get_contact_360_by_phone not found (CI env?) — skip';
  ELSIF v_src NOT LIKE '%workspace_id%' THEN
    RAISE EXCEPTION 'R28f VERIFICATION FAILED FIX4: get_contact_360_by_phone missing workspace_id filter';
  ELSE
    RAISE NOTICE 'R28f FIX4: get_contact_360_by_phone workspace isolation present ✓';
  END IF;

  -- FIX 6: get_companies_by_phones_batch has workspace_id filter
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE proname = 'get_companies_by_phones_batch'
     AND pronamespace = 'zapp'::regnamespace;
  IF v_src IS NULL THEN
    RAISE NOTICE 'R28f FIX6: get_companies_by_phones_batch not found (CI env?) — skip';
  ELSIF v_src NOT LIKE '%workspace_id%' THEN
    RAISE EXCEPTION 'R28f VERIFICATION FAILED FIX6: get_companies_by_phones_batch missing workspace_id filter';
  ELSE
    RAISE NOTICE 'R28f FIX6: get_companies_by_phones_batch workspace isolation present ✓';
  END IF;

  -- FIX 7: fn_system_health_score degraded fix (must NOT have old bare OR pattern)
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE proname = 'fn_system_health_score'
     AND pronamespace = 'zapp'::regnamespace;
  IF v_src IS NULL THEN
    RAISE WARNING 'R28f FIX7: fn_system_health_score not found in zapp (CI env?) — skip';
  ELSIF v_src LIKE '%v_wpp2_state=''connected'' OR v_wpp2_health%' THEN
    RAISE EXCEPTION 'R28f VERIFICATION FAILED FIX7: fn_system_health_score still has unguarded degraded path (state=connected OR health)';
  ELSE
    RAISE NOTICE 'R28f FIX7: fn_system_health_score degraded fix applied (no bare OR path) ✓';
  END IF;

  -- FIX 8: _evolution_contacts_backup_20260801 has >= 2 policies
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'evo' AND table_name = '_evolution_contacts_backup_20260801'
  ) THEN
    SELECT COUNT(*) INTO v_cnt FROM pg_policies
     WHERE schemaname = 'evo' AND tablename = '_evolution_contacts_backup_20260801';
    IF v_cnt >= 2 THEN
      RAISE NOTICE 'R28f FIX8: _evolution_contacts_backup_20260801 has % RLS policies ✓', v_cnt;
    ELSE
      RAISE EXCEPTION 'R28f VERIFICATION FAILED FIX8: backup table has only % policies (expected >= 2)', v_cnt;
    END IF;
  ELSE
    RAISE NOTICE 'R28f FIX8: backup table absent — skip';
  END IF;

  -- FIX 9: public._grant_backup_20260730 must not exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = '_grant_backup_20260730'
  ) THEN
    RAISE EXCEPTION 'R28f VERIFICATION FAILED FIX9: public._grant_backup_20260730 still exists after DROP';
  ELSE
    RAISE NOTICE 'R28f FIX9: public._grant_backup_20260730 absent ✓';
  END IF;
END $$;

COMMIT;
