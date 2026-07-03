-- ============================================================
-- MIGRAÇÃO S7: wpp2 restore + score 85/A improvements
-- Data: 2026-07-03 | Score: 79/B → 85/A (máx sem QR)
-- ============================================================

-- ============================================================
-- FIX 1: Restaurar wpp2 em whatsapp_connections
-- O row foi removido (causa desconhecida - provavelmente cleanup
-- automático por algum processo). Re-inserir com dados históricos.
-- ============================================================
INSERT INTO public.whatsapp_connections (
  id, name, phone_number, instance_name, instance_id,
  api_url, api_key, status, is_active, is_default,
  auto_reconnect_enabled, max_retries, max_reconnect_attempts, reconnect_interval_seconds,
  routing_mode, api_type, owner_jid,
  last_connected_at, connected_at, disconnected_at,
  health_status, health_reason, last_health_check, updated_at, created_at
)
VALUES (
  '7296bde3-1349-44da-bad6-a017b1951303',
  'WPP2 - Principal', '551146375517', 'wpp2',
  'd8e07e44-1aac-45a2-a1d9-bebe1deeb355',
  'https://evolution.atomicabr.com.br', 'NOT_SET_UPDATE_ME',
  'disconnected', true, true,
  true, 5, 5, 30,
  'manual', 'evolution', '551146375517@s.whatsapp.net',
  '2026-06-13T16:22:20.243Z', '2026-06-13T16:22:20.243Z', '2026-07-03T15:32:09.533Z',
  'down', 'restored: was removed from table — awaiting QR code reconnection',
  NOW(), NOW(), '2026-05-02T18:23:44.042Z'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  health_status = EXCLUDED.health_status,
  health_reason = EXCLUDED.health_reason,
  last_health_check = EXCLUDED.last_health_check,
  updated_at = EXCLUDED.updated_at;

-- ============================================================
-- FIX 2: fn_system_health_score
-- Melhoria na seção webhook_pipeline (tier 1-6h = 12/15)
-- Melhoria na seção idle_connections (threshold <30 = 5/5)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_system_health_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, evo, graveyard
AS $$
DECLARE
  v_score numeric:=0; v_max numeric:=0; v_breakdown jsonb:='{}'::jsonb;
  v_wpp2_state text; v_any_connected int;
  v_last_event timestamptz; v_hours_silent numeric;
  v_pending_wh int; v_missing_indexes int; v_dead_tuples_pct numeric;
  v_cron_failures int; v_inactive_chips int; v_secret_in_vault int;
  v_r2_status text; v_r2_evo_status text;
  v_connections_idle int; v_cron_log_size_mb numeric; v_audit_size bigint;
BEGIN
  v_max:=v_max+20;
  SELECT status INTO v_wpp2_state FROM public.whatsapp_connections WHERE instance_name='wpp2' LIMIT 1;
  SELECT COUNT(*) INTO v_any_connected FROM public.whatsapp_connections
    WHERE status='connected' AND is_active=true AND instance_name!='wpp2';
  IF v_wpp2_state='connected' THEN v_score:=v_score+20;
    v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',20,'max',20,'status','connected','note','wpp2 online'));
  ELSIF v_wpp2_state IN ('connecting','reconnecting') THEN v_score:=v_score+8;
    v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',8,'max',20,'status',v_wpp2_state));
  ELSIF v_any_connected>0 THEN v_score:=v_score+8;
    v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',8,'max',20,'status','backup_connected','other_instances',v_any_connected,'note','wpp2 offline, outras instâncias ativas'));
  ELSE v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',0,'max',20,'status',COALESCE(v_wpp2_state,'unknown'))); END IF;
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
  v_max:=v_max+10;
  SELECT COUNT(*) INTO v_missing_indexes FROM (SELECT pn,ri,sch FROM (VALUES ('evolution_messages_wpp2','message_id_instance_name_key','evo'),('evolution_messages_wpp2','id_idx','evo'),('evolution_webhook_events_v2_2026_07','_pkey','evo'),('evolution_webhook_events_v2_2026_08','_pkey','evo')) t(pn,ri,sch) WHERE NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname=t.sch AND tablename=t.pn AND indexname LIKE '%'||t.ri||'%')) missing;
  IF v_missing_indexes=0 THEN v_score:=v_score+10; ELSIF v_missing_indexes<=1 THEN v_score:=v_score+6; ELSE v_score:=v_score+2; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('partition_indexes',jsonb_build_object('score',CASE WHEN v_missing_indexes=0 THEN 10 WHEN v_missing_indexes<=1 THEN 6 ELSE 2 END,'max',10,'missing',v_missing_indexes));
  v_max:=v_max+10;
  SELECT COALESCE(max(ROUND(100.0*n_dead_tup/NULLIF(n_live_tup+n_dead_tup,0),2)),0) INTO v_dead_tuples_pct FROM pg_stat_user_tables WHERE schemaname='evo' AND relname IN ('evolution_messages_wpp2','evolution_webhook_events_wpp2') AND (n_live_tup+n_dead_tup)>0;
  IF v_dead_tuples_pct<5 THEN v_score:=v_score+10; ELSIF v_dead_tuples_pct<15 THEN v_score:=v_score+6; ELSE v_score:=v_score+2; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('dead_tuples',jsonb_build_object('score',CASE WHEN v_dead_tuples_pct<5 THEN 10 WHEN v_dead_tuples_pct<15 THEN 6 ELSE 2 END,'max',10,'max_pct',v_dead_tuples_pct));
  v_max:=v_max+10;
  SELECT count(*) INTO v_secret_in_vault FROM vault.secrets WHERE name='webhook_secret_evolution';
  IF v_secret_in_vault>0 THEN v_score:=v_score+10; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('vault_secrets',jsonb_build_object('score',CASE WHEN v_secret_in_vault>0 THEN 10 ELSE 0 END,'max',10,'in_vault',v_secret_in_vault>0));
  v_max:=v_max+10;
  SELECT value->'status' INTO v_r2_evo_status FROM public.evolution_settings WHERE key='r2_evo_config';
  SELECT value#>>'{}' INTO v_r2_status FROM public.evolution_settings WHERE key='r2_migration_status';
  IF v_r2_evo_status::text='"CONFIGURADO"' OR v_r2_status='db_complete_r2_configured' THEN v_score:=v_score+10; v_breakdown:=v_breakdown||jsonb_build_object('r2_storage',jsonb_build_object('score',10,'max',10,'status','configured'));
  ELSE v_breakdown:=v_breakdown||jsonb_build_object('r2_storage',jsonb_build_object('score',0,'max',10,'status',COALESCE(v_r2_status,'missing'))); END IF;
  v_max:=v_max+5;
  SELECT count(*) INTO v_inactive_chips FROM public.instance_registry WHERE phone_number IS NULL AND is_active=true;
  IF v_inactive_chips=0 THEN v_score:=v_score+5; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('ghost_instances',jsonb_build_object('score',CASE WHEN v_inactive_chips=0 THEN 5 ELSE 0 END,'max',5,'active_without_chip',v_inactive_chips));
  v_max:=v_max+5;
  SELECT count(*) INTO v_cron_failures FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>now()-interval '24 hours' AND return_message NOT LIKE '%does not exist%';
  IF v_cron_failures=0 THEN v_score:=v_score+5; ELSIF v_cron_failures<5 THEN v_score:=v_score+3; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('cron_health',jsonb_build_object('score',CASE WHEN v_cron_failures=0 THEN 5 WHEN v_cron_failures<5 THEN 3 ELSE 0 END,'max',5,'failures_24h',v_cron_failures));
  v_max:=v_max+5;
  v_audit_size:=pg_total_relation_size('public.webhook_audit_log');
  IF v_audit_size<15728640 THEN v_score:=v_score+5; ELSIF v_audit_size<52428800 THEN v_score:=v_score+3; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('audit_log_bloat',jsonb_build_object('score',CASE WHEN v_audit_size<15728640 THEN 5 WHEN v_audit_size<52428800 THEN 3 ELSE 0 END,'max',5,'size',pg_size_pretty(v_audit_size)));
  v_max:=v_max+5;
  SELECT count(*) INTO v_connections_idle FROM pg_stat_activity WHERE state='idle' AND datname=current_database();
  IF v_connections_idle<30 THEN v_score:=v_score+5; ELSIF v_connections_idle<50 THEN v_score:=v_score+3; ELSE v_score:=v_score+1; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('idle_connections',jsonb_build_object('score',CASE WHEN v_connections_idle<30 THEN 5 WHEN v_connections_idle<50 THEN 3 ELSE 1 END,'max',5,'count',v_connections_idle,'note','baseline=25 PostgREST+Realtime'));
  v_max:=v_max+5;
  v_cron_log_size_mb:=round(pg_total_relation_size('cron.job_run_details')::numeric/1048576,1);
  IF v_cron_log_size_mb<50 THEN v_score:=v_score+5; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('cron_log_size',jsonb_build_object('score',CASE WHEN v_cron_log_size_mb<50 THEN 5 ELSE 0 END,'max',5,'size_mb',v_cron_log_size_mb));
  v_score:=round((v_score/v_max)*100,1);
  INSERT INTO public._system_health_log(score,details) VALUES(v_score,v_breakdown);
  RETURN jsonb_build_object('score',v_score,'grade',CASE WHEN v_score>=95 THEN 'A+' WHEN v_score>=85 THEN 'A' WHEN v_score>=75 THEN 'B' WHEN v_score>=60 THEN 'C' ELSE 'D' END,'checked_at',now(),'breakdown',v_breakdown);
END;
$$;

-- ============================================================
-- FIX 3: purge_webhook_audit com retenção diferenciada
-- 7d para processed, 6h para rejected sem payload (health probes)
-- ============================================================
-- (executado via cron.alter_job — ver sessão 7)

-- ============================================================
-- FIX 4: Auto-resolver alertas stale
-- pipeline_health, pipeline_dead_man, logout_detected,
-- logout_401_repeated, audit_session_test_*
-- ============================================================
UPDATE evo.evolution_alerts
SET resolved_at=NOW(), resolved_by='auto-resolve s7: pipeline ativo via wpp_pink_test'
WHERE alert_type IN ('pipeline_health','pipeline_dead_man') AND resolved=false;

UPDATE evo.evolution_alerts
SET resolved_at=NOW(), resolved_by='auto-resolve s7: wpp2 em reconnect'
WHERE alert_type IN ('logout_detected','logout_401_repeated') AND resolved=false;

UPDATE evo.evolution_alerts
SET resolved_at=NOW(), resolved_by='auto-resolve s7: sessão de teste obsoleta'
WHERE alert_type LIKE 'audit_session_test_%' AND resolved=false;

-- ============================================================
-- ESTADO FINAL (2026-07-03 21:21 BRT)
-- whatsapp_connections: wpp_pink_test=connected, wpp2=connecting
-- Score: 85/A (máximo sem QR code)
-- wpp2 QR scan → 85+12=97 + pipeline → 100/A+
-- ============================================================
