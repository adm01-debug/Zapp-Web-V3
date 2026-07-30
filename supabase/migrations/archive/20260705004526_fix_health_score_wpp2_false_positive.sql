-- FALHA (auditoria sessão 6, 2026-07-05): fn_system_health_score() reportava
-- "wpp2_connection: connected 20/20" (health score Grade A, 94.2%) às
-- 2026-07-04T23:49:10Z enquanto a instância wpp2 estava, na prática, caída
-- (Evolution API ao vivo: connectionStatus=close, disconnectionReasonCode=401
-- desde 2026-07-04T15:00:44Z) — o outage passou despercebido por horas.
--
-- Causa raiz: a heurística "efetivamente conectado" aceitava QUALQUER estado
-- (inclusive 'connecting'/'disconnected') desde que
-- `whatsapp_connections.last_connected_at` estivesse dentro de uma janela de
-- graça de 15 minutos. Só que `last_connected_at` é atualizado por
-- fn_reconcile_apply() sempre que o snapshot do fetchInstances mostra 'open'
-- — e durante o loop de flap pós-401 (a sessão Baileys tenta reautenticar e
-- cai de novo em segundos), um único "open" transiente capturado pelo
-- polling já bastava para "comprar" 15 minutos inteiros de falso "saudável",
-- exatamente na janela de falha que o score deveria capturar.
--
-- Fix: a janela de graça agora só se aplica quando o ESTADO ATUAL também é
-- 'connecting' (transitório legítimo, ex.: reconexão de rede breve) — nunca
-- quando o snapshot mais recente já classificou a instância como algo pior
-- (ex.: ficou parada em 'connecting' após um 401, sem nunca voltar a
-- 'connected'). A janela também foi reduzida de 15min para 3min (o
-- reconcile dispatch roda a cada ~5min, então 15min tolerava até 3 ciclos
-- perdidos). Nenhuma outra métrica do health score foi alterada.
--
-- Ver: docs/EVOLUTION_API_AUDIT_2026-07-05_sessao6.md

CREATE OR REPLACE FUNCTION public.fn_system_health_score()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo', 'graveyard'
AS $function$
DECLARE
  v_score numeric:=0; v_max numeric:=0; v_breakdown jsonb:='{}'::jsonb;
  v_wpp2_state text; v_any_connected int; v_wpp2_phone_connected int;
  v_wpp2_phone text; v_wpp2_last_connected timestamptz;
  v_last_event timestamptz; v_hours_silent numeric;
  v_pending_wh int; v_missing_indexes int; v_dead_tuples_pct numeric;
  v_cron_failures int; v_inactive_chips int; v_secret_in_vault int;
  v_r2_status text; v_r2_evo_status text;
  v_connections_idle int; v_cron_log_size_mb numeric; v_audit_size bigint;
  v_wpp2_effectively_connected boolean;
  v_backup_hours_ago numeric; v_backup_tables int;
  v_evo_ok boolean;
  v_redis_ok boolean; v_redis_mem_pct numeric;
  -- FIX 2: métricas adicionais
  v_tables_no_pk int; v_tables_rls_off int; v_anon_zapp_grants int;
  v_bridge_views int; v_slow_log_ms text;
BEGIN
  -- 1. WhatsApp connection (20 pts) — anti-race
  v_max:=v_max+20;
  SELECT status, phone_number, last_connected_at INTO v_wpp2_state, v_wpp2_phone, v_wpp2_last_connected
    FROM public.whatsapp_connections WHERE instance_name='wpp2' LIMIT 1;
  SELECT COUNT(*) INTO v_wpp2_phone_connected FROM public.whatsapp_connections
    WHERE phone_number=v_wpp2_phone AND status='connected' AND is_active=true;
  SELECT COUNT(*) INTO v_any_connected FROM public.whatsapp_connections
    WHERE status='connected' AND is_active=true AND phone_number != COALESCE(v_wpp2_phone,'');
  -- FIX 2026-07-05 (sessao 6): a janela de graca sobre last_connected_at so vale quando o
  -- ESTADO ATUAL tambem e' 'connecting' (transitorio legitimo) — nunca para qualquer estado,
  -- e reduzida para 3min (reconcile dispatch roda a cada ~5min). Antes, um unico "open"
  -- transiente durante o loop de flap 401 comprava 15min inteiros de falso "conectado".
  v_wpp2_effectively_connected := (
    v_wpp2_state='connected' OR v_wpp2_phone_connected>0 OR
    (v_wpp2_state='connecting' AND v_wpp2_last_connected IS NOT NULL AND v_wpp2_last_connected > NOW()-INTERVAL '3 minutes')
  );
  IF v_wpp2_effectively_connected THEN v_score:=v_score+20;
    v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',20,'max',20,'status','connected','last_connected_min',ROUND(EXTRACT(EPOCH FROM (NOW()-v_wpp2_last_connected))/60,1)));
  ELSIF v_wpp2_state IN ('connecting','reconnecting') THEN v_score:=v_score+8;
    v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',8,'max',20,'status',v_wpp2_state));
  ELSIF v_any_connected>0 THEN v_score:=v_score+8;
    v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',8,'max',20,'status','backup_connected'));
  ELSE v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',0,'max',20,'status',COALESCE(v_wpp2_state,'unknown'))); END IF;

  -- 2. Pipeline webhooks (15 pts)
  v_max:=v_max+15;
  SELECT MAX(created_at) INTO v_last_event FROM evo.evolution_webhook_events_v2;
  v_hours_silent:=COALESCE(round(EXTRACT(EPOCH FROM (now()-v_last_event))/3600,1),9999);
  SELECT count(*) INTO v_pending_wh FROM evo.evolution_webhook_events_v2 WHERE status='pending';
  IF v_hours_silent<=1 AND v_pending_wh=0 THEN v_score:=v_score+15;
    v_breakdown:=v_breakdown||jsonb_build_object('webhook_pipeline',jsonb_build_object('score',15,'max',15,'hours_silent',v_hours_silent,'pending',v_pending_wh));
  ELSIF v_hours_silent<=6 THEN v_score:=v_score+12;
    v_breakdown:=v_breakdown||jsonb_build_object('webhook_pipeline',jsonb_build_object('score',12,'max',15,'hours_silent',v_hours_silent,'pending',v_pending_wh,'note','low_traffic'));
  ELSIF v_hours_silent<=24 THEN v_score:=v_score+8;
    v_breakdown:=v_breakdown||jsonb_build_object('webhook_pipeline',jsonb_build_object('score',8,'max',15,'hours_silent',v_hours_silent,'pending',v_pending_wh));
  ELSE v_breakdown:=v_breakdown||jsonb_build_object('webhook_pipeline',jsonb_build_object('score',0,'max',15,'hours_silent',v_hours_silent,'pending',v_pending_wh,'alert','pipeline_silent')); END IF;

  -- 3. Partição indexes (10 pts)
  v_max:=v_max+10;
  SELECT COUNT(*) INTO v_missing_indexes FROM (SELECT pn,ri,sch FROM (VALUES
    ('evolution_messages_wpp2','message_id_instance_name_key','evo'),('evolution_messages_wpp2','id_idx','evo'),
    ('evolution_webhook_events_v2_2026_07','_pkey','evo'),('evolution_webhook_events_v2_2026_08','_pkey','evo')
  ) t(pn,ri,sch) WHERE NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname=t.sch AND tablename=t.pn AND indexname LIKE '%'||t.ri||'%')) missing;
  IF v_missing_indexes=0 THEN v_score:=v_score+10; ELSIF v_missing_indexes<=1 THEN v_score:=v_score+6; ELSE v_score:=v_score+2; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('partition_indexes',jsonb_build_object('score',CASE WHEN v_missing_indexes=0 THEN 10 WHEN v_missing_indexes<=1 THEN 6 ELSE 2 END,'max',10,'missing',v_missing_indexes));

  -- 4. Dead tuples (10 pts)
  v_max:=v_max+10;
  SELECT COALESCE(max(ROUND(100.0*n_dead_tup/NULLIF(n_live_tup+n_dead_tup,0),2)),0) INTO v_dead_tuples_pct
  FROM pg_stat_user_tables WHERE schemaname='evo' AND relname IN ('evolution_messages_wpp2','evolution_webhook_events_wpp2') AND (n_live_tup+n_dead_tup)>=500;
  IF v_dead_tuples_pct<5 THEN v_score:=v_score+10; ELSIF v_dead_tuples_pct<15 THEN v_score:=v_score+6; ELSE v_score:=v_score+2; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('dead_tuples',jsonb_build_object('score',CASE WHEN v_dead_tuples_pct<5 THEN 10 WHEN v_dead_tuples_pct<15 THEN 6 ELSE 2 END,'max',10,'max_pct',v_dead_tuples_pct));

  -- 5. Vault (10 pts)
  v_max:=v_max+10;
  SELECT count(*) INTO v_secret_in_vault FROM vault.secrets WHERE name='webhook_secret_evolution';
  IF v_secret_in_vault>0 THEN v_score:=v_score+10; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('vault_secrets',jsonb_build_object('score',CASE WHEN v_secret_in_vault>0 THEN 10 ELSE 0 END,'max',10,'in_vault',v_secret_in_vault>0));

  -- 6. R2 (10 pts)
  v_max:=v_max+10;
  SELECT value->'status' INTO v_r2_evo_status FROM public.evolution_settings WHERE key='r2_evo_config';
  SELECT value#>>'{}' INTO v_r2_status FROM public.evolution_settings WHERE key='r2_migration_status';
  IF v_r2_evo_status::text='"CONFIGURADO"' OR v_r2_status='db_complete_r2_configured' THEN v_score:=v_score+10;
    v_breakdown:=v_breakdown||jsonb_build_object('r2_storage',jsonb_build_object('score',10,'max',10,'status','configured'));
  ELSE v_breakdown:=v_breakdown||jsonb_build_object('r2_storage',jsonb_build_object('score',0,'max',10,'status',COALESCE(v_r2_status,'missing'))); END IF;

  -- 7. Ghost instances (5 pts)
  v_max:=v_max+5;
  SELECT count(*) INTO v_inactive_chips FROM public.instance_registry WHERE phone_number IS NULL AND is_active=true;
  IF v_inactive_chips=0 THEN v_score:=v_score+5; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('ghost_instances',jsonb_build_object('score',CASE WHEN v_inactive_chips=0 THEN 5 ELSE 0 END,'max',5,'active_without_chip',v_inactive_chips));

  -- 8. Cron health (5 pts) — FIX: cutoff dinâmico (48h atrás) em vez de hardcoded
  v_max:=v_max+5;
  SELECT count(*) INTO v_cron_failures FROM cron.job_run_details
  WHERE status='failed' AND start_time IS NOT NULL AND start_time>now()-interval '24 hours'
    AND return_message NOT LIKE '%does not exist%'
    AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%'
    ;  -- FIX 2026-07-04-validation: removido filtro redundante
  IF v_cron_failures=0 THEN v_score:=v_score+5; ELSIF v_cron_failures<5 THEN v_score:=v_score+3; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('cron_health',jsonb_build_object('score',CASE WHEN v_cron_failures=0 THEN 5 WHEN v_cron_failures<5 THEN 3 ELSE 0 END,'max',5,'failures_24h',v_cron_failures));

  -- 9. Audit log (5 pts)
  v_max:=v_max+5;
  v_audit_size:=pg_total_relation_size('zapp.webhook_audit_log');
  IF v_audit_size<15728640 THEN v_score:=v_score+5; ELSIF v_audit_size<52428800 THEN v_score:=v_score+3; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('audit_log_bloat',jsonb_build_object('score',CASE WHEN v_audit_size<15728640 THEN 5 WHEN v_audit_size<52428800 THEN 3 ELSE 0 END,'max',5,'size',pg_size_pretty(v_audit_size)));

  -- 10. Idle connections (5 pts)
  v_max:=v_max+5;
  SELECT count(*) INTO v_connections_idle FROM pg_stat_activity WHERE state='idle' AND datname=current_database();
  IF v_connections_idle<30 THEN v_score:=v_score+5; ELSIF v_connections_idle<50 THEN v_score:=v_score+3; ELSE v_score:=v_score+1; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('idle_connections',jsonb_build_object('score',CASE WHEN v_connections_idle<30 THEN 5 WHEN v_connections_idle<50 THEN 3 ELSE 1 END,'max',5,'count',v_connections_idle));

  -- 11. Cron log size (5 pts)
  v_max:=v_max+5;
  v_cron_log_size_mb:=round(pg_total_relation_size('cron.job_run_details')::numeric/1048576,1);
  IF v_cron_log_size_mb<50 THEN v_score:=v_score+5; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('cron_log_size',jsonb_build_object('score',CASE WHEN v_cron_log_size_mb<50 THEN 5 ELSE 0 END,'max',5,'size_mb',v_cron_log_size_mb));

  -- 12. PK integrity (5 pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v_tables_no_pk FROM information_schema.tables t WHERE t.table_schema IN ('evo','zapp','public')
    AND t.table_type='BASE TABLE'
    AND NOT EXISTS(SELECT 1 FROM information_schema.table_constraints tc WHERE tc.table_schema=t.table_schema AND tc.table_name=t.table_name AND tc.constraint_type='PRIMARY KEY');
  IF v_tables_no_pk=0 THEN v_score:=v_score+5; ELSIF v_tables_no_pk<3 THEN v_score:=v_score+3; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('pk_integrity',jsonb_build_object('score',CASE WHEN v_tables_no_pk=0 THEN 5 WHEN v_tables_no_pk<3 THEN 3 ELSE 0 END,'max',5,'tables_no_pk',v_tables_no_pk));

  -- 13. RLS coverage (5 pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v_tables_rls_off FROM pg_tables WHERE schemaname='evo' AND tablename NOT LIKE '%_202%' AND rowsecurity=false;
  IF v_tables_rls_off=0 THEN v_score:=v_score+5; ELSIF v_tables_rls_off<3 THEN v_score:=v_score+3; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('rls_coverage',jsonb_build_object('score',CASE WHEN v_tables_rls_off=0 THEN 5 WHEN v_tables_rls_off<3 THEN 3 ELSE 0 END,'max',5,'tables_rls_off',v_tables_rls_off));

  -- 14. Security posture (5 pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v_anon_zapp_grants FROM information_schema.role_table_grants
    WHERE table_schema='zapp' AND grantee='anon';
  IF v_anon_zapp_grants=0 THEN v_score:=v_score+5; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('security_posture',jsonb_build_object('score',CASE WHEN v_anon_zapp_grants=0 THEN 5 ELSE 0 END,'max',5,'anon_zapp_grants',v_anon_zapp_grants));

  -- 15. Observability (5 pts)
  v_max:=v_max+5;
  SELECT COUNT(*) INTO v_bridge_views FROM pg_views WHERE schemaname='public' AND viewname IN ('zapp_audit_log','contact_audit_log','conversation_audit_logs','webhook_audit_log','team_messages','app_notifications','whatsapp_official_credentials');
  v_slow_log_ms:=COALESCE((SELECT setting||'ms' FROM pg_settings WHERE name='log_min_duration_statement'),'unknown');
  IF v_bridge_views>=5 THEN v_score:=v_score+5; ELSIF v_bridge_views>=3 THEN v_score:=v_score+3; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('observability',jsonb_build_object('score',CASE WHEN v_bridge_views>=5 THEN 5 WHEN v_bridge_views>=3 THEN 3 ELSE 0 END,'max',5,'bridge_views',v_bridge_views,'slow_log',v_slow_log_ms));

  -- 16. Backup freshness (10 pts)
  v_max:=v_max+10;
  SELECT round(EXTRACT(EPOCH FROM (now()-last_backup_at))/3600,1),
    last_backup_table_count
  INTO v_backup_hours_ago, v_backup_tables
  FROM ops.backup_sentinel WHERE id=1;
  IF v_backup_hours_ago IS NULL THEN
    v_breakdown:=v_breakdown||jsonb_build_object('backup_freshness',jsonb_build_object('score',0,'max',10,'hours_ago',null,'status','no_sentinel'));
  ELSIF v_backup_hours_ago < 26 AND v_backup_tables >= 400 THEN
    v_score:=v_score+10;
    v_breakdown:=v_breakdown||jsonb_build_object('backup_freshness',jsonb_build_object('score',10,'max',10,'hours_ago',v_backup_hours_ago,'tables',v_backup_tables));
  ELSIF v_backup_hours_ago < 48 THEN
    v_score:=v_score+5;
    v_breakdown:=v_breakdown||jsonb_build_object('backup_freshness',jsonb_build_object('score',5,'max',10,'hours_ago',v_backup_hours_ago,'status','stale'));
  ELSE
    v_breakdown:=v_breakdown||jsonb_build_object('backup_freshness',jsonb_build_object('score',0,'max',10,'hours_ago',v_backup_hours_ago,'status','CRITICAL'));
  END IF;

  -- 17. Evolution DB schema health (5 pts)
  v_max:=v_max+5;
  BEGIN
    SELECT (public.fn_check_evolution_db_health()->>'evo_schema_accessible')::boolean INTO v_evo_ok;
    IF COALESCE(v_evo_ok,false) THEN
      v_score:=v_score+5;
      v_breakdown:=v_breakdown||jsonb_build_object('evolution_db',jsonb_build_object('score',5,'max',5,'status','ok'));
    ELSE
      v_breakdown:=v_breakdown||jsonb_build_object('evolution_db',jsonb_build_object('score',0,'max',5,'status','error'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_breakdown:=v_breakdown||jsonb_build_object('evolution_db',jsonb_build_object('score',0,'max',5,'error',SQLERRM));
  END;

  -- 18. Redis health (5 pts)
  v_max:=v_max+5;
  BEGIN
    SELECT
      last_ping_at > NOW()-INTERVAL '10 minutes'
        AND maxmemory_policy='allkeys-lru'
        AND (used_memory_mb/NULLIF(maxmemory_mb,0)) < 0.85,
      round(100.0*used_memory_mb/NULLIF(maxmemory_mb,0),1)
    INTO v_redis_ok, v_redis_mem_pct
    FROM ops.redis_sentinel WHERE id=1;
    IF COALESCE(v_redis_ok,false) THEN
      v_score:=v_score+5;
      v_breakdown:=v_breakdown||jsonb_build_object('redis_health',jsonb_build_object('score',5,'max',5,'mem_pct',v_redis_mem_pct,'policy','allkeys-lru'));
    ELSIF v_redis_mem_pct IS NOT NULL THEN
      v_score:=v_score+2;
      v_breakdown:=v_breakdown||jsonb_build_object('redis_health',jsonb_build_object('score',2,'max',5,'mem_pct',v_redis_mem_pct,'note','degraded'));
    ELSE
      v_breakdown:=v_breakdown||jsonb_build_object('redis_health',jsonb_build_object('score',0,'max',5,'status','no_sentinel'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_breakdown:=v_breakdown||jsonb_build_object('redis_health',jsonb_build_object('score',0,'max',5,'error',SQLERRM));
  END;

  v_score:=round((v_score/v_max)*100,1);
  INSERT INTO public._system_health_log(score,details) VALUES(v_score,v_breakdown);
  RETURN jsonb_build_object('score',v_score,'grade',CASE WHEN v_score>=95 THEN 'A+' WHEN v_score>=85 THEN 'A' WHEN v_score>=75 THEN 'B' WHEN v_score>=60 THEN 'C' ELSE 'D' END,'checked_at',now(),'breakdown',v_breakdown);
END;
$function$;
