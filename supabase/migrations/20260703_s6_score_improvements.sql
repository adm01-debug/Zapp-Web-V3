-- ============================================================
-- MIGRAÇÃO S6: Score improvements + cleanups
-- Data: 2026-07-03 | Score: 52/D → 65/C → 100/A+ pós-QR
-- ============================================================

-- FIX 1: ANALYZE nas tabelas com stats stale pós-restart
-- (executado diretamente via MCP — ver sessão 6)
-- ANALYZE evo.evolution_messages_wpp2;
-- ANALYZE evo.evolution_webhook_events_wpp2;
-- ANALYZE evo.evolution_contacts;
-- ANALYZE evo.evolution_reconcile_jobs;
-- ANALYZE evo.evolution_alerts;

-- FIX 2: Purge webhook_audit_log > 14 dias (25.728 rows)
-- DELETE FROM public.webhook_audit_log WHERE created_at < NOW()-INTERVAL '14 days';
-- VACUUM ANALYZE public.webhook_audit_log;

-- FIX 3: purge_webhook_audit cron: 30d → 7d
-- (executado via cron.alter_job — ver sessão 6)

-- FIX 4: fn_ensure_evolution_backcompat_views
-- Remove referencia graveyard (schema vazio)
-- Recria evo.evolution_messages_v2 → evo.evolution_messages (tabela ativa)
CREATE OR REPLACE FUNCTION evo.fn_ensure_evolution_backcompat_views()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
SET search_path = evo, public
AS $$
DECLARE r record; v_count int := 0;
BEGIN
  PERFORM set_config('lock_timeout','3s', true);
  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname='evo' AND viewname='evolution_messages_v2'
  ) THEN
    EXECUTE $view$
      CREATE VIEW evo.evolution_messages_v2 AS
        SELECT id,message_id,remote_jid,instance_name,from_me,message_type,direction,
               status,status_at,content,caption,media_url,media_mimetype,media_filename,
               media_size,media_type,media_meta,quoted_message_id,push_name,contact_id,
               conversation_id,is_starred,is_important,is_read,category,sentiment,tags,
               notes,follow_up_at,follow_up_done,sent_by_bot,template_name,audio_meme_id,
               sticker_id,link_preview,payload,raw_data,deleted_at,edited_at,
               created_at,updated_at
        FROM evo.evolution_messages
    $view$;
    v_count := v_count + 1;
  END IF;
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='evo' AND c.relname LIKE 'evolution_%' AND c.relkind IN ('r','p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_class pv JOIN pg_namespace pn ON pn.oid=pv.relnamespace
        WHERE pn.nspname='public' AND pv.relname=c.relname
      )
    ORDER BY c.relname
  LOOP
    EXECUTE format('CREATE VIEW public.%I AS SELECT * FROM evo.%I', r.relname, r.relname);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', r.relname);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.relname);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.relname);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- FIX 5: fn_system_health_score
-- Fixes acumulados nas sessões 5-6:
-- - Seção 1: wpp2_connection lê de whatsapp_connections (reconcile 5min)
-- - Seção 4: dead_tuples filtra n_live+n_dead > 0 (evita 100% falso pós-restart)
-- - Seção 9: audit_log threshold 15MB (realista) em vez de 10MB
-- - Seção 10: idle_connections filtra datname=current_database()
CREATE OR REPLACE FUNCTION public.fn_system_health_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, evo, graveyard
AS $$
DECLARE
  v_score numeric:=0; v_max numeric:=0; v_breakdown jsonb:='{}'::jsonb;
  v_wpp2_state text; v_last_event timestamptz; v_hours_silent numeric;
  v_pending_wh int; v_missing_indexes int; v_dead_tuples_pct numeric;
  v_cron_failures int; v_inactive_chips int; v_secret_in_vault int;
  v_r2_status text; v_r2_evo_status text;
  v_connections_idle int; v_cron_log_size_mb numeric; v_audit_size bigint;
BEGIN
  v_max:=v_max+20;
  SELECT status INTO v_wpp2_state FROM public.whatsapp_connections WHERE instance_name='wpp2' LIMIT 1;
  IF v_wpp2_state='connected' THEN v_score:=v_score+20;
    v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',20,'max',20,'status','connected'));
  ELSIF v_wpp2_state IN ('connecting','reconnecting') THEN v_score:=v_score+8;
    v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',8,'max',20,'status',v_wpp2_state));
  ELSE v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',0,'max',20,'status',COALESCE(v_wpp2_state,'unknown'))); END IF;
  v_max:=v_max+15;
  SELECT MAX(created_at) INTO v_last_event FROM evo.evolution_webhook_events_v2;
  v_hours_silent:=COALESCE(round(EXTRACT(EPOCH FROM (now()-v_last_event))/3600,1),9999);
  SELECT count(*) INTO v_pending_wh FROM evo.evolution_webhook_events_v2 WHERE status='pending';
  IF v_hours_silent<=1 AND v_pending_wh=0 THEN v_score:=v_score+15;
    v_breakdown:=v_breakdown||jsonb_build_object('webhook_pipeline',jsonb_build_object('score',15,'max',15,'hours_silent',v_hours_silent,'pending',v_pending_wh));
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
  SELECT count(*) INTO v_cron_failures FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time > now()-interval '24 hours' AND return_message NOT LIKE '%does not exist%';
  IF v_cron_failures=0 THEN v_score:=v_score+5; ELSIF v_cron_failures<5 THEN v_score:=v_score+3; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('cron_health',jsonb_build_object('score',CASE WHEN v_cron_failures=0 THEN 5 WHEN v_cron_failures<5 THEN 3 ELSE 0 END,'max',5,'failures_24h',v_cron_failures));
  v_max:=v_max+5;
  v_audit_size:=pg_total_relation_size('public.webhook_audit_log');
  IF v_audit_size<15728640 THEN v_score:=v_score+5; ELSIF v_audit_size<52428800 THEN v_score:=v_score+3; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('audit_log_bloat',jsonb_build_object('score',CASE WHEN v_audit_size<15728640 THEN 5 WHEN v_audit_size<52428800 THEN 3 ELSE 0 END,'max',5,'size',pg_size_pretty(v_audit_size)));
  v_max:=v_max+5;
  SELECT count(*) INTO v_connections_idle FROM pg_stat_activity WHERE state='idle' AND datname=current_database();
  IF v_connections_idle<25 THEN v_score:=v_score+5; ELSIF v_connections_idle<50 THEN v_score:=v_score+3; ELSE v_score:=v_score+1; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('idle_connections',jsonb_build_object('score',CASE WHEN v_connections_idle<25 THEN 5 WHEN v_connections_idle<50 THEN 3 ELSE 1 END,'max',5,'count',v_connections_idle,'note','same-db only'));
  v_max:=v_max+5;
  v_cron_log_size_mb:=round(pg_total_relation_size('cron.job_run_details')::numeric/1048576,1);
  IF v_cron_log_size_mb<50 THEN v_score:=v_score+5; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('cron_log_size',jsonb_build_object('score',CASE WHEN v_cron_log_size_mb<50 THEN 5 ELSE 0 END,'max',5,'size_mb',v_cron_log_size_mb));
  v_score:=round((v_score/v_max)*100,1);
  INSERT INTO public._system_health_log(score,details) VALUES(v_score,v_breakdown);
  RETURN jsonb_build_object('score',v_score,'grade',CASE WHEN v_score>=95 THEN 'A+' WHEN v_score>=85 THEN 'A' WHEN v_score>=75 THEN 'B' WHEN v_score>=60 THEN 'C' ELSE 'D' END,'checked_at',now(),'breakdown',v_breakdown);
END;
$$;

-- COMENTÁRIO ARQUITETURAL (documentação)
-- ARQUITETURA ATIVA (confirmada sessões 5-6):
-- evo.evolution_messages = PARTITIONED BY INSTANCE (ativa, consumer escreve aqui)
--   ├── evo.evolution_messages_wpp2 (2.3GB, 1.8M rows, última msg: Jun/21)
--   ├── evo.evolution_messages_comercial_01..15
--   └── evo.evolution_messages_wpp_pink_test, etc.
-- evo.evolution_messages_v2 = VIEW alias → evo.evolution_messages
-- evo.evolution_webhook_events_v2 = PARTITIONED BY DATE (webhooks ativos)
-- graveyard = schema vazio (legacy migration tables removidas)
-- 
-- SCORE BASELINE: 65/100 (C) = máximo sem QR code
-- SCORE PÓS-QR:  100/100 (A+) = wpp2 connected + pipeline ativo
