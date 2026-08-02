-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000013_m13_cubic_review_corrections.sql
-- Purpose  : Corrige 3 violações apontadas pelo cubic-dev-ai[bot] no PR #712.
--
-- C-P1a (M-11): rate_limit_logs subscription apontava schema errado.
--   M-4 (20260802000004) moveu public.rate_limit_logs → zapp.rate_limit_logs E
--   adicionou zapp.rate_limit_logs à publicação supabase_realtime ANTES de M-11.
--   M-11 verificava public.rate_limit_logs (NOT FOUND → skip) → no-op silencioso.
--   Frontend companion change (schema:'public') era regressão — revertida no commit
--   anterior a esta migração. Esta seção confirma idempotentemente que
--   zapp.rate_limit_logs está na publication (garante estado correto para CI/CD).
--
-- C-P2  (M-9 C2): prosrc patch de fn_system_health_score era frágil.
--   Dependia de string verbatim 'OR v>0' — qualquer hotfix ou reformatação anterior
--   quebraria o REPLACE e levantaria P0001, bloqueando todo o deploy.
--   Fix: CREATE OR REPLACE FUNCTION com corpo canônico completo (r28f) mais a
--   correção de v_wpp2_ok já aplicada (OR v>0 → AND degraded guard).
--
-- C-P1b (M-9 C4): EXCEPTION WHEN OTHERS THEN RAISE WARNING engolia erros
--   ao habilitar RLS em evo._evolution_contacts_backup_20260801.
--   Uma operação de segurança que falha silenciosamente é inaceitável (P1).
--   Fix: RAISE EXCEPTION fail-closed; a migration aborta se RLS não puder ser habilitado.
--
-- Idempotência: todos os blocos verificam estado antes de agir.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- C-P1a: Confirmar zapp.rate_limit_logs na publication supabase_realtime
--        (M-4 já fez isso; esta seção é confirmação idempotente para CI/CD)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_relkind "char";
  v_in_pub  BOOLEAN;
BEGIN
  -- Verificar que zapp.rate_limit_logs existe e é tabela física (M-4 moveu para zapp)
  SELECT c.relkind
    INTO v_relkind
    FROM pg_catalog.pg_class     c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'zapp'
     AND c.relname = 'rate_limit_logs';

  IF NOT FOUND THEN
    RAISE EXCEPTION '[M-13 C-P1a] zapp.rate_limit_logs NÃO encontrada — M-4 não aplicada?'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_relkind NOT IN ('r', 'p') THEN
    RAISE EXCEPTION '[M-13 C-P1a] zapp.rate_limit_logs existe mas relkind=''%'' (VIEW?) — Realtime não funciona com VIEWs', v_relkind
      USING ERRCODE = 'P0001';
  END IF;

  -- Verificar se já está na publication
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'zapp'
       AND tablename  = 'rate_limit_logs'
  ) INTO v_in_pub;

  IF v_in_pub THEN
    RAISE NOTICE '[M-13 C-P1a] zapp.rate_limit_logs já está em supabase_realtime (M-4 ok) — no-op';
    RETURN;
  END IF;

  -- Adicionar (caso M-4 não tenha rodado neste ambiente)
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE zapp.rate_limit_logs';
  RAISE NOTICE '[M-13 C-P1a] zapp.rate_limit_logs adicionada à supabase_realtime';

  -- Verificação pós
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'zapp'
       AND tablename  = 'rate_limit_logs'
  ) INTO v_in_pub;

  IF NOT v_in_pub THEN
    RAISE EXCEPTION '[M-13 C-P1a] zapp.rate_limit_logs NÃO está na publication após ADD'
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '[M-13 C-P1a] Verificação pós-aplicação: zapp.rate_limit_logs ✓ em supabase_realtime';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- C-P2: fn_system_health_score — CREATE OR REPLACE com corpo canônico completo
--       Substitui o prosrc patch frágil de M-9 C2 (replace() em texto verbatim).
--       Corpo: r28f canonical (20260802000002) + fix OR v>0 → degraded guard.
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- FIX: 'degraded' health_status must not count as connected.
  -- state='connected' + health='degraded' → v_wpp2_ok=FALSE → v_eff_state='connecting' → 8/20.
  -- OR v>0 also guarded: a backup connection with degraded health must not score as connected.
  v_wpp2_ok:=(
    (v_wpp2_state='connected' AND COALESCE(v_wpp2_health,'ok') != 'degraded')
    OR v_wpp2_health='ok'
    OR (v>0 AND COALESCE(v_wpp2_health,'ok') != 'degraded')
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

-- Garantir permissões corretas (somente service_role executa)
REVOKE EXECUTE ON FUNCTION zapp.fn_system_health_score() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION zapp.fn_system_health_score() TO service_role;

DO $$ BEGIN RAISE NOTICE '[M-13 C-P2] fn_system_health_score recriada com corpo canônico completo (degraded guard aplicado)'; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- C-P1b: evo._evolution_contacts_backup_20260801 — habilitar RLS fail-closed
--        M-9 C4 usava EXCEPTION WHEN OTHERS THEN RAISE WARNING — engolia erros.
--        Fix: qualquer falha levanta EXCEPTION e aborta a migração.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'evo'
       AND table_name   = '_evolution_contacts_backup_20260801'
  ) THEN
    RAISE NOTICE '[M-13 C-P1b] evo._evolution_contacts_backup_20260801 não existe — skip';
    RETURN;
  END IF;

  -- Habilitar RLS — fail-closed: nenhum EXCEPTION WHEN OTHERS aqui
  ALTER TABLE evo._evolution_contacts_backup_20260801 ENABLE ROW LEVEL SECURITY;
  RAISE NOTICE '[M-13 C-P1b] RLS habilitado em evo._evolution_contacts_backup_20260801';

  -- Garantir que a policy de service_role existe (criada em r28f FIX8; idempotente)
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
    RAISE NOTICE '[M-13 C-P1b] service_role_all policy criada';
  ELSE
    RAISE NOTICE '[M-13 C-P1b] service_role_all policy já existe — no-op';
  END IF;

  -- Garantir que a policy admin_select existe
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
    RAISE NOTICE '[M-13 C-P1b] admin_select policy criada';
  ELSE
    RAISE NOTICE '[M-13 C-P1b] admin_select policy já existe — no-op';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Verificação pós-aplicação
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_in_pub   BOOLEAN;
  v_rls_on   BOOLEAN;
  v_fn_exists BOOLEAN;
BEGIN
  -- C-P1a: zapp.rate_limit_logs na publication
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'zapp' AND tablename = 'rate_limit_logs'
  ) INTO v_in_pub;
  IF NOT v_in_pub THEN
    RAISE WARNING '[M-13 VER] zapp.rate_limit_logs NÃO está na publication!';
  ELSE
    RAISE NOTICE '[M-13 VER C-P1a] zapp.rate_limit_logs ✓ em supabase_realtime';
  END IF;

  -- C-P2: fn_system_health_score existe
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_system_health_score'
  ) INTO v_fn_exists;
  IF NOT v_fn_exists THEN
    RAISE WARNING '[M-13 VER] fn_system_health_score NÃO encontrada!';
  ELSE
    RAISE NOTICE '[M-13 VER C-P2] fn_system_health_score ✓ presente em zapp';
  END IF;

  -- C-P1b: RLS habilitado na tabela backup (se existir)
  SELECT relrowsecurity INTO v_rls_on
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'evo' AND c.relname = '_evolution_contacts_backup_20260801';
  IF FOUND THEN
    IF NOT v_rls_on THEN
      RAISE WARNING '[M-13 VER] RLS NÃO está habilitado em evo._evolution_contacts_backup_20260801!';
    ELSE
      RAISE NOTICE '[M-13 VER C-P1b] _evolution_contacts_backup_20260801 RLS ✓';
    END IF;
  ELSE
    RAISE NOTICE '[M-13 VER C-P1b] tabela backup não existe (CI env?) — skip';
  END IF;

  RAISE NOTICE '[M-13] Verificação pós-aplicação concluída';
END $$;
