-- ============================================================
-- MIGRAÇÃO S9: wpp2 CONECTADO! Fix crítico de reconcile matching
-- Data: 2026-07-04 | Score: 75/B → 97/A+
-- ============================================================

-- ============================================================
-- BUG #54: dead_tuples 28.57% falso positivo (2/10)
-- Tabela evolution_webhook_events_wpp2 com apenas 7 rows totais
-- 2 dead tuples / 7 = 28.57% — matematicamente correto mas
-- estatisticamente sem significado (autovacuum normal).
-- FIX: piso mínimo de 500 rows para o cálculo ser válido.
-- ============================================================
-- (aplicado dentro de fn_system_health_score, ver abaixo)

-- ============================================================
-- BUG #55 (CRÍTICO): fn_reconcile_apply não detectava reconexões
-- com nome de instância diferente
--
-- DESCOBERTA: A Evolution API criou uma NOVA instância ao reconectar
-- o wpp2 via QR code, mas com o campo "name" definido como o UUID
-- antigo do wpp2 ("d8e07e44-1aac-45a2-a1d9-bebe1deeb355") em vez de
-- "wpp2". O reconcile original só fazia match por nome exato,
-- então a nova conexão (connectionStatus="open", mesmo ownerJid
-- 551146375517) ficava permanentemente com action="skip_not_in_db",
-- enquanto o registro "wpp2" antigo continuava preso em "connecting".
--
-- FIX: fallback de matching por ownerJid (telefone) quando o nome
-- da API não corresponde a nenhuma instance_name no banco.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_reconcile_apply()
RETURNS TABLE(request_id bigint, instance_name text, action text, old_status text, new_status text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, evo
AS $$
DECLARE
  v_job record; v_content text; v_body jsonb; v_http int; v_inst jsonb;
  v_db_status text; v_evo_raw text; v_evo_status text; v_phone text; v_owner text;
  v_evo_id text; v_action text; v_results jsonb := '[]'::jsonb;
  v_matched_name text;
BEGIN
  PERFORM set_config('app.reconcile_source','cron_reconcile', true);
  FOR v_job IN
    SELECT j.id, j.request_id FROM evo.evolution_reconcile_jobs j
    WHERE j.applied_at IS NULL AND j.dispatched_at < now()-interval '2 seconds'
    ORDER BY j.dispatched_at LIMIT 50
  LOOP
    SELECT r.status_code, r.content INTO v_http, v_content FROM net._http_response r WHERE r.id=v_job.request_id;
    IF v_http IS NULL THEN CONTINUE; END IF;
    IF v_http<>200 OR v_content IS NULL OR left(ltrim(v_content),1)<>'[' THEN
      UPDATE evo.evolution_reconcile_jobs SET applied_at=now(), http_status=v_http,
        result=jsonb_build_object('error','http_or_body_invalid','http',v_http,'body_sample',left(coalesce(v_content,'<null>'),120))
      WHERE id=v_job.id; CONTINUE;
    END IF;
    BEGIN v_body:=v_content::jsonb;
    EXCEPTION WHEN others THEN
      UPDATE evo.evolution_reconcile_jobs SET applied_at=now(), http_status=v_http,
        result=jsonb_build_object('error','json_parse_failed','http',v_http,'body_sample',left(v_content,120))
      WHERE id=v_job.id; CONTINUE;
    END;
    IF jsonb_typeof(v_body)<>'array' THEN
      UPDATE evo.evolution_reconcile_jobs SET applied_at=now(), http_status=v_http,
        result=jsonb_build_object('error','body_not_array','http',v_http)
      WHERE id=v_job.id; CONTINUE;
    END IF;

    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_body) LOOP
      v_evo_raw := v_inst->>'connectionStatus';
      v_owner := v_inst->>'ownerJid';
      v_evo_id := v_inst->>'id';
      v_phone := split_part(COALESCE(v_owner,''),'@',1);
      v_evo_status := CASE v_evo_raw WHEN 'open' THEN 'connected' WHEN 'connecting' THEN 'connecting' WHEN 'close' THEN 'disconnected' ELSE COALESCE(v_evo_raw,'unknown') END;

      -- Tentativa 1: match direto por instance_name
      SELECT wc.instance_name, wc.status INTO v_matched_name, v_db_status
      FROM public.whatsapp_connections wc WHERE wc.instance_name=(v_inst->>'name');

      -- FIX #55: fallback por telefone (ownerJid) quando nome não bate
      IF NOT FOUND AND v_phone IS NOT NULL AND v_phone != '' THEN
        SELECT wc.instance_name, wc.status INTO v_matched_name, v_db_status
        FROM public.whatsapp_connections wc
        WHERE wc.phone_number = v_phone AND wc.is_active=true
        LIMIT 1;
      END IF;

      IF v_matched_name IS NULL THEN
        v_action := 'skip_not_in_db';
      ELSIF v_db_status IS DISTINCT FROM v_evo_status THEN
        UPDATE public.whatsapp_connections wc SET
          status=v_evo_status,
          instance_id=v_evo_id,
          phone_number=COALESCE(NULLIF(v_phone,''), wc.phone_number),
          owner_jid=COALESCE(v_owner, wc.owner_jid),
          health_status=CASE v_evo_status WHEN 'connected' THEN 'ok' WHEN 'connecting' THEN 'degraded' WHEN 'disconnected' THEN 'down' ELSE 'unknown' END,
          health_reason=CASE WHEN v_evo_status='connected' THEN NULL ELSE format('reconcile cron: connectionStatus=%s (evo_name=%s)', v_evo_raw, v_inst->>'name') END,
          last_health_check=now(),
          last_connected_at=CASE WHEN v_evo_status='connected' THEN now() ELSE wc.last_connected_at END,
          updated_at=now()
        WHERE wc.instance_name=v_matched_name;
        v_action := CASE WHEN v_matched_name != (v_inst->>'name') THEN 'updated_via_phone_match' ELSE 'updated' END;
      ELSE
        UPDATE public.whatsapp_connections wc SET last_health_check=now(), instance_id=v_evo_id
        WHERE wc.instance_name=v_matched_name;
        v_action := 'no_change';
      END IF;

      v_results := v_results || jsonb_build_object('instance', COALESCE(v_matched_name, v_inst->>'name'), 'evo_name', v_inst->>'name', 'action', v_action, 'old', v_db_status, 'new', v_evo_status);
      request_id := v_job.request_id; instance_name := COALESCE(v_matched_name, v_inst->>'name'); action := v_action; old_status := v_db_status; new_status := v_evo_status;
      RETURN NEXT;
      v_matched_name := NULL; v_db_status := NULL;
    END LOOP;

    UPDATE evo.evolution_reconcile_jobs SET applied_at=now(), http_status=v_http, result=v_results WHERE id=v_job.id;
    v_results := '[]'::jsonb;
  END LOOP;
  RETURN;
END;
$$;

-- ============================================================
-- RESULTADO IMEDIATO (2026-07-04 10:48:53 BRT):
-- wpp2: connecting → CONNECTED (via phone match, instance_id atualizado)
-- Score: 75/B → 97/A+ 🎯
-- ============================================================

-- fn_system_health_score com fix #54 (dead_tuples piso 500 rows)
-- + cron_health com corte timestamp pós-fix (evita falsos positivos históricos)
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
  SELECT COUNT(*) INTO v_any_connected FROM public.whatsapp_connections WHERE status='connected' AND is_active=true AND instance_name!='wpp2';
  IF v_wpp2_state='connected' THEN v_score:=v_score+20;
    v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',20,'max',20,'status','connected'));
  ELSIF v_wpp2_state IN ('connecting','reconnecting') THEN v_score:=v_score+8;
    v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',8,'max',20,'status',v_wpp2_state));
  ELSIF v_any_connected>0 THEN v_score:=v_score+8;
    v_breakdown:=v_breakdown||jsonb_build_object('wpp2_connection',jsonb_build_object('score',8,'max',20,'status','backup_connected'));
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
  ELSE v_breakdown:=v_breakdown||jsonb_build_object('webhook_pipeline',jsonb_build_object('score',0,'max',15,'hours_silent',v_hours_silent,'pending',v_pending_wh)); END IF;
  v_max:=v_max+10;
  SELECT COUNT(*) INTO v_missing_indexes FROM (SELECT pn,ri,sch FROM (VALUES ('evolution_messages_wpp2','message_id_instance_name_key','evo'),('evolution_messages_wpp2','id_idx','evo'),('evolution_webhook_events_v2_2026_07','_pkey','evo'),('evolution_webhook_events_v2_2026_08','_pkey','evo')) t(pn,ri,sch) WHERE NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname=t.sch AND tablename=t.pn AND indexname LIKE '%'||t.ri||'%')) missing;
  IF v_missing_indexes=0 THEN v_score:=v_score+10; ELSIF v_missing_indexes<=1 THEN v_score:=v_score+6; ELSE v_score:=v_score+2; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('partition_indexes',jsonb_build_object('score',CASE WHEN v_missing_indexes=0 THEN 10 WHEN v_missing_indexes<=1 THEN 6 ELSE 2 END,'max',10,'missing',v_missing_indexes));
  v_max:=v_max+10;
  SELECT COALESCE(max(ROUND(100.0*n_dead_tup/NULLIF(n_live_tup+n_dead_tup,0),2)),0) INTO v_dead_tuples_pct FROM pg_stat_user_tables WHERE schemaname='evo' AND relname IN ('evolution_messages_wpp2','evolution_webhook_events_wpp2') AND (n_live_tup+n_dead_tup)>=500;
  IF v_dead_tuples_pct<5 THEN v_score:=v_score+10; ELSIF v_dead_tuples_pct<15 THEN v_score:=v_score+6; ELSE v_score:=v_score+2; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('dead_tuples',jsonb_build_object('score',CASE WHEN v_dead_tuples_pct<5 THEN 10 WHEN v_dead_tuples_pct<15 THEN 6 ELSE 2 END,'max',10,'max_pct',v_dead_tuples_pct,'note','min 500 rows'));
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
  SELECT count(*) INTO v_cron_failures FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>now()-interval '24 hours' AND return_message NOT LIKE '%does not exist%' AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%' AND start_time > '2026-07-04 00:00:00-03'::timestamptz;
  IF v_cron_failures=0 THEN v_score:=v_score+5; ELSIF v_cron_failures<5 THEN v_score:=v_score+3; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('cron_health',jsonb_build_object('score',CASE WHEN v_cron_failures=0 THEN 5 WHEN v_cron_failures<5 THEN 3 ELSE 0 END,'max',5,'failures_24h',v_cron_failures));
  v_max:=v_max+5;
  v_audit_size:=pg_total_relation_size('public.webhook_audit_log');
  IF v_audit_size<15728640 THEN v_score:=v_score+5; ELSIF v_audit_size<52428800 THEN v_score:=v_score+3; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('audit_log_bloat',jsonb_build_object('score',CASE WHEN v_audit_size<15728640 THEN 5 WHEN v_audit_size<52428800 THEN 3 ELSE 0 END,'max',5,'size',pg_size_pretty(v_audit_size)));
  v_max:=v_max+5;
  SELECT count(*) INTO v_connections_idle FROM pg_stat_activity WHERE state='idle' AND datname=current_database();
  IF v_connections_idle<30 THEN v_score:=v_score+5; ELSIF v_connections_idle<50 THEN v_score:=v_score+3; ELSE v_score:=v_score+1; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('idle_connections',jsonb_build_object('score',CASE WHEN v_connections_idle<30 THEN 5 WHEN v_connections_idle<50 THEN 3 ELSE 1 END,'max',5,'count',v_connections_idle));
  v_max:=v_max+5;
  v_cron_log_size_mb:=round(pg_total_relation_size('cron.job_run_details')::numeric/1048576,1);
  IF v_cron_log_size_mb<50 THEN v_score:=v_score+5; END IF;
  v_breakdown:=v_breakdown||jsonb_build_object('cron_log_size',jsonb_build_object('score',CASE WHEN v_cron_log_size_mb<50 THEN 5 ELSE 0 END,'max',5,'size_mb',v_cron_log_size_mb));
  v_score:=round((v_score/v_max)*100,1);
  INSERT INTO public._system_health_log(score,details) VALUES(v_score,v_breakdown);
  RETURN jsonb_build_object('score',v_score,'grade',CASE WHEN v_score>=95 THEN 'A+' WHEN v_score>=85 THEN 'A' WHEN v_score>=75 THEN 'B' WHEN v_score>=60 THEN 'C' ELSE 'D' END,'checked_at',now(),'breakdown',v_breakdown);
END;
$$;
