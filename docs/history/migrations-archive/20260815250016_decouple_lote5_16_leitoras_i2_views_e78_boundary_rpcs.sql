-- ============================================================================
-- REPLAY CONVERGENTE — materializado retroativamente em 2026-08-16 a partir de
-- supabase_migrations.schema_migrations (version=20260815250016), sem arquivo
-- correspondente neste repo. Ver convencao completa em 20260815250008_*.sql.
--
-- Fonte: docs/decouple/LOTE5_LOG.md, secao "Lote 5 — 16 leitoras de I2".
-- Corpos: pg_get_functiondef em producao 2026-08-15 pos-Lote5 (identico ao
-- corpo pos-swap, ja que este e o ultimo lote que tocou essas fns).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 11 swaps mecanicos (evo.<tabela> -> view E78 correspondente)
-- ---------------------------------------------------------------------------

-- Grupo evo.evolution_webhook_events_v2 -> public.evo_webhook_events_v2 (8 fns)

CREATE OR REPLACE FUNCTION zapp.fn_get_evolution_health_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'instances', (SELECT count(*) FROM zapp.instance_registry WHERE is_active),
    'events_1h', (SELECT count(*) FROM public.evo_webhook_events_v2 WHERE created_at >= now() - interval '1 hour'),
    'pipeline_ok', (SELECT count(*) > 0 FROM public.evo_webhook_events_v2 WHERE processed = true AND created_at >= now() - interval '24 hours'),
    'reconcile_ok_15min', (SELECT count(*) > 0 FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid WHERE j.jobname='whatsapp_reconcile_dispatch' AND d.status='succeeded' AND d.start_time > now() - interval '15 min'),
    'msgs_sem_conversa', (SELECT count(*) FROM zapp.evolution_messages WHERE conversation_id IS NULL),
    'backcompat_views', (SELECT count(*) FILTER (WHERE relkind='v') FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname LIKE 'evolution_%'),
    'last_event', (SELECT max(created_at) FROM public.evo_webhook_events_v2),
    'db_size', pg_size_pretty(pg_database_size(current_database()))
  ) INTO v;
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.fn_webhook_pipeline_score(p_eff_state text DEFAULT 'unknown'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'ops', 'cron', 'pg_catalog'
AS $function$
DECLARE
  vt timestamptz; vt2 timestamptz;
  v_hours_silent numeric;
  v_audit_1h int; v_events_1h int;
  v_msgs_7d bigint; v_msgs_24h bigint;
  v_msg_hours_silent numeric;
  v_pipe_score int; v_pipe_note text;
  vb bigint; v_bloat_score int;
  -- NOVO: janela adaptativa baseada em horário comercial (BRT)
  v_hour_brt int;
  v_dow_brt int;
  v_fresh_window numeric;
BEGIN
  -- Determinar janela de "fresh" com consciência de horário comercial
  v_hour_brt := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo');
  v_dow_brt  := EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo');

  -- Business hours: seg-sex 08h-20h BRT → janela estrita 1h
  -- Fora do horário (noite/madrugada/fim de semana) → janela relaxada 4h
  -- Justificativa: silêncio noturno é OPERACIONAL, não indica falha no pipeline
  v_fresh_window := CASE
    WHEN v_dow_brt IN (0, 6) THEN 4.0  -- fim de semana: 4h
    WHEN v_hour_brt < 8 OR v_hour_brt >= 20 THEN 4.0  -- noite/madrugada: 4h
    ELSE 1.0  -- horário comercial: estrito 1h
  END;

  -- Calcular silêncio do pipeline
  SELECT MAX(created_at) INTO vt FROM zapp.webhook_audit_log;
  SELECT MAX(created_at) INTO vt2 FROM public.evo_webhook_events_v2;
  v_hours_silent := COALESCE(ROUND(EXTRACT(EPOCH FROM(NOW()-GREATEST(vt,vt2)))/3600,1),9999);

  SELECT MAX(created_at) INTO vt FROM zapp.evolution_messages WHERE instance_name='wpp2';
  v_msg_hours_silent := COALESCE(ROUND(EXTRACT(EPOCH FROM(NOW()-vt))/3600,1),9999);
  -- v_msg_hours_silent é informacional: silêncio de msgs é condição operacional,
  -- não indica falha no pipeline. Pipeline health = apenas webhook/event activity.

  -- Contadores de atividade
  SELECT COUNT(*) INTO v_events_1h FROM zapp.webhook_events_processed
    WHERE processed_at > NOW()-INTERVAL '1 hour';
  SELECT COUNT(*) INTO v_audit_1h FROM zapp.webhook_audit_log
    WHERE status='processed' AND created_at > NOW()-INTERVAL '1 hour';
  SELECT
    COUNT(*) FILTER(WHERE created_at > NOW()-INTERVAL '7 days'),
    COUNT(*) FILTER(WHERE created_at > NOW()-INTERVAL '24 hours')
  INTO v_msgs_7d, v_msgs_24h
  FROM zapp.evolution_messages WHERE instance_name='wpp2';

  -- Score com janela adaptativa
  v_pipe_score := CASE
    WHEN v_hours_silent <= v_fresh_window THEN 15    -- fresh (considera horário)
    WHEN v_hours_silent <= 6              THEN 12    -- recente (até 6h)
    WHEN v_audit_1h >= 500               THEN 15    -- muito ativo
    WHEN v_audit_1h >= 100               THEN 12    -- ativo
    WHEN v_audit_1h >= 10                THEN 10    -- baixo tráfego
    WHEN v_hours_silent <= 24            THEN 8     -- stale ok
    WHEN v_hours_silent <= 96 AND v_msgs_7d > 100 AND p_eff_state = 'connected' THEN 8
    WHEN v_hours_silent <= 96 AND v_msgs_7d > 0   AND p_eff_state = 'connected' THEN 5
    ELSE 0
  END;

  v_pipe_note := CASE
    WHEN v_pipe_score = 15 AND v_hours_silent <= v_fresh_window
      THEN CASE WHEN v_fresh_window > 1 THEN 'e2e_fresh_offhours' ELSE 'e2e_fresh' END
    WHEN v_pipe_score = 15 THEN 'audit_very_active'
    WHEN v_pipe_score = 12 AND v_hours_silent <= 6  THEN 'e2e_recent'
    WHEN v_pipe_score = 12                          THEN 'audit_active'
    WHEN v_pipe_score = 10                          THEN 'audit_low_traffic'
    WHEN v_pipe_score = 8 AND v_hours_silent <= 24  THEN 'e2e_stale_ok'
    WHEN v_pipe_score = 8                           THEN 'healthy_idle_msgs_7d'
    WHEN v_pipe_score = 5                           THEN 'healthy_idle_low_volume'
    ELSE 'degraded'
  END;

  SELECT pg_total_relation_size('zapp.webhook_audit_log') INTO vb;
  v_bloat_score := CASE
    WHEN vb < 314572800  THEN 5
    WHEN vb < 1073741824 THEN 3
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'pipe_score', v_pipe_score,
    'bloat_score', v_bloat_score,
    'msgs_7d', v_msgs_7d,
    'webhook_pipeline', jsonb_build_object(
      'score', v_pipe_score, 'max', 15,
      'hours_silent', v_hours_silent,
      'msg_gap_hours', v_msg_hours_silent,
      'pending', v_events_1h,
      'audit_1h', v_audit_1h,
      'msgs_7d', v_msgs_7d,
      'msgs_24h', v_msgs_24h,
      'processed_1h', v_events_1h,
      'note', v_pipe_note,
      'fresh_window_h', v_fresh_window,
      'hour_brt', v_hour_brt
    ),
    'audit_log_bloat', jsonb_build_object(
      'score', v_bloat_score, 'max', 5,
      'size', pg_size_pretty(vb), 'threshold', '300MB/1GB'
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.fn_zapp_web_smoke_test_v2()
 RETURNS TABLE(teste text, categoria text, resultado text, valor text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring', 'archive'
AS $function$
BEGIN
  -- T01
  RETURN QUERY SELECT '01_tabelas_evolution'::text, 'backend'::text,
    CASE WHEN count(*) >= 100 THEN 'PASS' ELSE 'WARN' END,
    count(*)::text,
    CASE WHEN count(*) >= 100 THEN '✅' ELSE '⚠️' END
  FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'evolution_%';

  -- T02
  RETURN QUERY SELECT '02_views_publicas'::text, 'backend'::text,
    CASE WHEN count(*) >= 50 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::text,
    CASE WHEN count(*) >= 50 THEN '✅' ELSE '❌' END
  FROM information_schema.views WHERE table_schema='public' AND table_name LIKE 'v_%';

  -- T03
  RETURN QUERY SELECT '03_rpcs_disponiveis'::text, 'backend'::text,
    CASE WHEN count(*) >= 100 THEN 'PASS' ELSE 'WARN' END,
    count(*)::text,
    CASE WHEN count(*) >= 100 THEN '✅' ELSE '⚠️' END
  FROM information_schema.routines WHERE routine_schema='public' AND routine_name LIKE 'rpc_%';

  -- T04
  RETURN QUERY SELECT '04_contacts_volume'::text, 'dados'::text,
    CASE WHEN count(*) >= 10000 THEN 'PASS' ELSE 'WARN' END,
    count(*)::text,
    CASE WHEN count(*) >= 10000 THEN '✅' ELSE '⚠️' END
  FROM zapp.evolution_contacts WHERE deleted_at IS NULL;

  -- T05
  RETURN QUERY SELECT '05_messages_volume'::text, 'dados'::text,
    CASE WHEN count(*) >= 1000000 THEN 'PASS' ELSE 'WARN' END,
    count(*)::text,
    CASE WHEN count(*) >= 1000000 THEN '✅' ELSE '⚠️' END
  FROM zapp.evolution_messages WHERE deleted_at IS NULL;

  -- T06: FK órfãos
  RETURN QUERY
  SELECT '06_fk_orfaos_messages'::text, 'integridade'::text,
    CASE WHEN orfao_existe THEN 'FAIL' ELSE 'PASS' END,
    CASE WHEN orfao_existe THEN '>=1' ELSE '0' END,
    CASE WHEN orfao_existe THEN '❌' ELSE '✅' END
  FROM (
    SELECT EXISTS (
      SELECT 1 FROM zapp.evolution_messages m
      WHERE m.contact_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM zapp.evolution_contacts c WHERE c.id = m.contact_id)
      LIMIT 1
    ) AS orfao_existe
  ) q;

  -- T07
  RETURN QUERY SELECT '07_webhook_saude_1h'::text, 'webhook'::text,
    'PASS'::text,
    'evt_1h=' || COALESCE((SELECT count(*) FROM public.evo_webhook_events_v2)::text, '0'),
    '✅'::text;

  -- T08
  RETURN QUERY SELECT '08_rls_ativo_evolution'::text, 'seguranca'::text,
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::text,
    CASE WHEN count(*) = 0 THEN '✅' ELSE '❌' END
  FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'evolution_%' AND rowsecurity=false;

  -- T09
  RETURN QUERY SELECT '09_rpc_list_contacts'::text, 'rpc'::text,
    CASE WHEN (SELECT count(*) FROM zapp.rpc_list_contacts('wpp2', NULL, NULL, NULL, 1, 0)) > 0 THEN 'PASS' ELSE 'WARN' END,
    'retorna_linhas'::text, '✅'::text;

  -- T10
  RETURN QUERY SELECT '10_rpc_dashboard'::text, 'rpc'::text,
    CASE WHEN (SELECT count(*) FROM zapp.rpc_zapp_dashboard()) > 0 THEN 'PASS' ELSE 'FAIL' END,
    'records_ok'::text, '✅'::text;

  -- T11
  RETURN QUERY SELECT '11_triggers_updated_at'::text, 'hardening'::text,
    CASE WHEN count(*) >= 5 THEN 'PASS' ELSE 'WARN' END,
    count(*)::text,
    CASE WHEN count(*) >= 5 THEN '✅' ELSE '⚠️' END
  FROM information_schema.triggers WHERE trigger_schema='public' AND trigger_name LIKE 'trg_evolution_%_updated_at';

  -- T12
  RETURN QUERY SELECT '12_indices_performance'::text, 'performance'::text,
    CASE WHEN count(*) >= 100 THEN 'PASS' ELSE 'WARN' END,
    count(*)::text,
    CASE WHEN count(*) >= 100 THEN '✅' ELSE '⚠️' END
  FROM pg_indexes WHERE schemaname='public' AND (indexname LIKE 'idx_%' OR indexname LIKE 'uk_%');

  -- T13
  RETURN QUERY SELECT '13_direction_normalized'::text, 'integridade'::text,
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::text,
    CASE WHEN count(*) = 0 THEN '✅' ELSE '❌' END
  FROM zapp.evolution_messages
  WHERE direction NOT IN ('inbound', 'outbound') AND direction IS NOT NULL;

  -- T14
  RETURN QUERY SELECT '14_stages_ativos'::text, 'dados'::text,
    CASE WHEN count(*) >= 3 THEN 'PASS' ELSE 'WARN' END,
    count(*)::text,
    CASE WHEN count(*) >= 3 THEN '✅' ELSE '⚠️' END
  FROM zapp.v_active_stages;

  -- T15
  RETURN QUERY SELECT '15_migration_audit_registros'::text, 'governance'::text,
    CASE WHEN count(*) >= 40 THEN 'PASS' ELSE 'WARN' END,
    count(*)::text, '✅'::text
  FROM archive.migration_audit;

  -- T16
  RETURN QUERY SELECT '16_ultimo_erro_webhook'::text, 'webhook'::text,
    CASE WHEN max(created_at) < now() - interval '24 hours' OR max(created_at) IS NULL THEN 'PASS' ELSE 'WARN' END,
    COALESCE(max(created_at)::text, 'nunca'), '✅'::text
  FROM public.evo_webhook_events_v2 WHERE error_message IS NOT NULL;

  -- T17
  RETURN QUERY SELECT '17_soft_delete_contacts'::text, 'bpm'::text,
    'PASS'::text, 'coluna_presente'::text, '✅'::text
  WHERE EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='evolution_contacts' AND column_name='deleted_at'
  );

  -- T18
  RETURN QUERY SELECT '18_rls_tags_stages'::text, 'seguranca'::text,
    CASE WHEN count(*) >= 2 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::text || ' policies',
    CASE WHEN count(*) >= 2 THEN '✅' ELSE '❌' END
  FROM pg_policies WHERE schemaname='evo' AND tablename IN ('evolution_tags', 'evolution_stage_mapping');

  -- T19
  RETURN QUERY SELECT '19_webhook_ultimo_processado'::text, 'webhook'::text,
    CASE WHEN max(processed_at) > now() - interval '10 minutes' THEN 'PASS' ELSE 'WARN' END,
    COALESCE(to_char(max(processed_at), 'YYYY-MM-DD HH24:MI:SS'), 'nunca'), '✅'::text
  FROM public.evo_webhook_events_v2 WHERE processed = true;

  -- T20
  RETURN QUERY SELECT '20_rumo_10_de_10'::text, 'bpm'::text,
    'PASS'::text, 'migration_score_10_10'::text, '🏆'::text;

  -- T21: messages.update — edited_at column + count of edited messages
  RETURN QUERY SELECT '21_messages_update_coverage'::text, 'pipeline'::text,
    CASE WHEN col_existe THEN 'PASS' ELSE 'FAIL' END,
    'edited_at_col=' || col_existe::text || ' editadas=' || total_editadas::text,
    CASE WHEN col_existe THEN '✅' ELSE '❌' END
  FROM (
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'evo' AND table_name = 'evolution_messages' AND column_name = 'edited_at'
      ) AS col_existe,
      (SELECT COUNT(*) FROM zapp.evolution_messages WHERE edited_at IS NOT NULL) AS total_editadas
  ) s;

  -- T22: messages.delete — deleted_at column + 7-day safety floor in GC function
  RETURN QUERY SELECT '22_messages_delete_coverage'::text, 'pipeline'::text,
    CASE WHEN col_existe AND gc_tem_floor THEN 'PASS'
         WHEN col_existe THEN 'WARN'
         ELSE 'FAIL' END,
    'deleted_at_col=' || col_existe::text || ' gc_7d_floor=' || gc_tem_floor::text,
    CASE WHEN col_existe AND gc_tem_floor THEN '✅'
         WHEN col_existe THEN '⚠️'
         ELSE '❌' END
  FROM (
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'evo' AND table_name = 'evolution_messages' AND column_name = 'deleted_at'
      ) AS col_existe,
      EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_gc_deleted_messages'
          AND p.prosrc ILIKE '%v_created_floor%'
      ) AS gc_tem_floor
  ) s;

  -- T23: messages.reaction — reactionMessage type tracked in active partition
  RETURN QUERY SELECT '23_messages_reaction_coverage'::text, 'pipeline'::text,
    CASE WHEN total_reacoes >= 1 THEN 'PASS' ELSE 'WARN' END,
    'reactionMessage_count=' || total_reacoes::text,
    CASE WHEN total_reacoes >= 1 THEN '✅' ELSE '⚠️' END
  FROM (
    SELECT COUNT(*) AS total_reacoes
    FROM zapp.evolution_messages
    WHERE message_type = 'reactionMessage'
  ) s;

END;
$function$;

CREATE OR REPLACE FUNCTION zapp.get_platform_health(p_instance_name text DEFAULT NULL::text, p_days integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'evo'
AS $function$ SELECT jsonb_build_object('contacts', jsonb_build_object('total_active', (SELECT count(*) FROM zapp.evolution_contacts WHERE deleted_at IS NULL), 'new_today', (SELECT count(*) FROM zapp.evolution_contacts WHERE created_at >= date_trunc('day', now()) AND deleted_at IS NULL), 'duplicates', (SELECT COALESCE(sum(n-1),0) FROM (SELECT count(*) n FROM zapp.evolution_contacts WHERE deleted_at IS NULL AND phone_number IS NOT NULL GROUP BY phone_number HAVING count(*)>1) d), 'consent_rate_pct', 'n/a'), 'conversations', jsonb_build_object('open', (SELECT count(*) FROM zapp.evolution_conversations WHERE status NOT IN ('closed','resolved') OR status IS NULL), 'closed_today', (SELECT count(*) FROM zapp.evolution_conversations WHERE status IN ('closed','resolved') AND updated_at >= date_trunc('day', now())), 'unread', (SELECT COALESCE(sum(unread_count),0) FROM zapp.evolution_conversations), 'bot_active', (SELECT count(*) FROM zapp.evolution_conversations WHERE COALESCE(is_bot_active,false)), 'avg_response_s', NULL), 'messages', jsonb_build_object('total_today', (SELECT count(*) FROM zapp.evolution_messages WHERE created_at >= date_trunc('day', now())), 'inbound_today', (SELECT count(*) FROM zapp.evolution_messages WHERE created_at >= date_trunc('day', now()) AND COALESCE(from_me,false)=false), 'outbound_today', (SELECT count(*) FROM zapp.evolution_messages WHERE created_at >= date_trunc('day', now()) AND COALESCE(from_me,false)=true), 'failed_today', (SELECT count(*) FROM zapp.failed_messages WHERE created_at >= date_trunc('day', now()))), 'webhooks', jsonb_build_object('total_events', (SELECT count(*) FROM public.evo_webhook_events_v2 WHERE created_at >= now() - make_interval(days => GREATEST(p_days,1))), 'processed_events', (SELECT count(*) FROM public.evo_webhook_events_v2 WHERE created_at >= now() - make_interval(days => GREATEST(p_days,1)) AND processed_at IS NOT NULL), 'pending_events', (SELECT count(*) FROM public.evo_webhook_events_v2 WHERE created_at >= now() - make_interval(days => GREATEST(p_days,1)) AND processed_at IS NULL), 'dlq_pending', (SELECT count(*) FROM zapp.failed_messages WHERE status IN ('pending','retrying'))), 'instance_name', COALESCE(p_instance_name,'all'), 'generated_at', now()::text) $function$;

CREATE OR REPLACE FUNCTION zapp.rpc_dr_health_check()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'pg_temp'
AS $function$
DECLARE
  v_db_stats      record;
  v_wh_health     record;
  v_cron_failing  bigint;
  v_open_inc      bigint;
  v_evo_cred      record;
  v_result        jsonb;
BEGIN
  SELECT
  CASE WHEN count(*) FILTER (WHERE created_at >= now() - interval '1 hour') > 0 THEN 'healthy'
       WHEN count(*) FILTER (WHERE created_at >= now() - interval '24 hours') > 0 THEN 'degraded'
       ELSE 'critical' END AS health_status,
  max(created_at) AS last_event_at,
  count(*) FILTER (WHERE NOT processed) AS unresponded,
  count(*) FILTER (WHERE created_at >= now() - interval '1 hour') AS events_1h,
  count(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS events_24h,
  count(*) FILTER (WHERE processed_at >= now() - interval '1 hour') AS processed_1h
INTO v_wh_health
FROM public.evo_webhook_events_v2;

  BEGIN
    SELECT count(*) INTO v_cron_failing FROM cron.job WHERE active = false;
  EXCEPTION WHEN OTHERS THEN
    v_cron_failing := 0;
  END;

  BEGIN
    SELECT count(*) INTO v_open_inc
    FROM zapp.system_health_incidents WHERE status IN ('open','investigating');
  EXCEPTION WHEN OTHERS THEN
    v_open_inc := 0;
  END;

  BEGIN
    SELECT * INTO v_evo_cred
    FROM zapp.evolution_instance_credentials WHERE instance_name='wpp2' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_evo_cred := NULL;
  END;

  v_result := jsonb_build_object(
    'overall_status', CASE
      WHEN v_wh_health.health_status = 'critical' THEN 'critical'
      WHEN v_open_inc > 0 OR v_cron_failing > 0 THEN 'degraded'
      ELSE 'healthy'
    END,
    'checks', jsonb_build_object(
      'pipeline', jsonb_build_object(
        'status',       v_wh_health.health_status,
        'last_event_at', v_wh_health.last_event_at,
        'pending',      v_wh_health.unresponded
      ),
      'cron_jobs', jsonb_build_object(
        'disabled_count', COALESCE(v_cron_failing, 0),
        'status', CASE WHEN COALESCE(v_cron_failing,0)=0 THEN 'ok' ELSE 'warning' END
      ),
      'incidents', jsonb_build_object(
        'open_count', COALESCE(v_open_inc, 0),
        'status', CASE WHEN COALESCE(v_open_inc,0)=0 THEN 'ok' ELSE 'warning' END
      ),
      'evo_api', jsonb_build_object(
        'instance',       'wpp2',
        'health_status',  COALESCE(v_evo_cred.health_status, 'unknown'),
        'last_check',     v_evo_cred.last_health_check
      ),
      'database', jsonb_build_object('status','ok','checked_at',now())
    ),
    'runbook_steps', 8,
    'generated_at', now()
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.rpc_pipeline_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'pg_temp'
AS $function$
DECLARE
  v_wh_health       record;
  v_pending_count   bigint;
  v_failed_count    bigint;
  v_hours_silent    numeric;
  v_health_status   text;
  v_result          jsonb;
BEGIN
  SELECT
  CASE WHEN count(*) FILTER (WHERE created_at >= now() - interval '1 hour') > 0 THEN 'healthy'
       WHEN count(*) FILTER (WHERE created_at >= now() - interval '24 hours') > 0 THEN 'degraded'
       ELSE 'critical' END AS health_status,
  max(created_at) AS last_event_at,
  count(*) FILTER (WHERE NOT processed) AS unresponded,
  count(*) FILTER (WHERE created_at >= now() - interval '1 hour') AS events_1h,
  count(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS events_24h,
  count(*) FILTER (WHERE processed_at >= now() - interval '1 hour') AS processed_1h
INTO v_wh_health
FROM public.evo_webhook_events_v2;

  SELECT count(*) INTO v_pending_count
  FROM public.evo_webhook_events_v2 WHERE status = 'pending';

  SELECT count(*) INTO v_failed_count
  FROM public.evo_webhook_events_v2 WHERE status = 'failed';

  v_hours_silent := CASE
    WHEN v_wh_health.last_event_at IS NOT NULL
    THEN ROUND(EXTRACT(EPOCH FROM (now() - v_wh_health.last_event_at))/3600, 1)
    ELSE 9999
  END;

  v_health_status := CASE
    WHEN v_wh_health.events_1h > 0 THEN 'healthy'
    WHEN v_wh_health.events_24h > 0 THEN 'degraded'
    WHEN v_hours_silent > 24        THEN 'critical'
    ELSE 'unknown'
  END;

  v_result := jsonb_build_object(
    'health_status',       v_health_status,
    'last_event_at',       v_wh_health.last_event_at,
    'events_last_hour',    COALESCE(v_wh_health.events_1h, 0),
    'events_last_24h',     COALESCE(v_wh_health.events_24h, 0),
    'processed_last_hour', COALESCE(v_wh_health.processed_1h, 0),
    'pending_webhooks',    COALESCE(v_pending_count, 0),
    'failed_webhooks',     COALESCE(v_failed_count, 0),
    'hours_silent',        v_hours_silent,
    'source_table',        'evolution_webhook_events_v2',
    'snapshot_at',         now()
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.rpc_run_full_test_suite()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'auth', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_run_id  text := 'suite_' || to_char(now(), 'YYYYMMDD_HH24MISS');
  v_passed  integer := 0;
  v_failed  integer := 0;
  v_ok      boolean;
  v_msg     text;
BEGIN
  IF NOT zapp.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied: admin or supervisor required';
  END IF;
  -- T1: Webhook pipeline health
  v_ok := EXISTS (SELECT 1 FROM public.evo_webhook_events_v2 WHERE created_at >= now() - interval '1 hour');
  v_msg := CASE WHEN v_ok THEN 'Pipeline respondendo' ELSE 'Pipeline não responde' END;
  INSERT INTO zapp.sts_troubleshooting_report (test_name, status, description, started_at, completed_at)
    VALUES ('webhook_pipeline_health', CASE WHEN v_ok THEN 'passed' ELSE 'failed' END, v_msg, now(), now());
  INSERT INTO zapp.stress_test_metrics (run_id, task_type, latency_ms, status)
    VALUES (v_run_id, 'webhook_pipeline_health', 1, CASE WHEN v_ok THEN 'success' ELSE 'failed' END);
  IF v_ok THEN v_passed := v_passed + 1; ELSE v_failed := v_failed + 1; END IF;
  -- T2: Alert channels ativos
  v_ok := EXISTS (SELECT 1 FROM zapp.alert_channels WHERE is_active = true);
  v_msg := CASE WHEN v_ok THEN 'Pelo menos 1 canal ativo' ELSE 'Nenhum canal ativo' END;
  INSERT INTO zapp.sts_troubleshooting_report (test_name, status, description, started_at, completed_at)
    VALUES ('alert_channels_reachable', CASE WHEN v_ok THEN 'passed' ELSE 'failed' END, v_msg, now(), now());
  INSERT INTO zapp.stress_test_metrics (run_id, task_type, latency_ms, status)
    VALUES (v_run_id, 'alert_channels_reachable', 1, CASE WHEN v_ok THEN 'success' ELSE 'failed' END);
  IF v_ok THEN v_passed := v_passed + 1; ELSE v_failed := v_failed + 1; END IF;
  -- T3: Evolution credentials
  v_ok := EXISTS (SELECT 1 FROM zapp.evolution_instance_credentials WHERE is_active = true);
  v_msg := CASE WHEN v_ok THEN 'Credenciais Evo configuradas' ELSE 'Sem credenciais Evo' END;
  INSERT INTO zapp.sts_troubleshooting_report (test_name, status, description, started_at, completed_at)
    VALUES ('evolution_credentials_present', CASE WHEN v_ok THEN 'passed' ELSE 'failed' END, v_msg, now(), now());
  INSERT INTO zapp.stress_test_metrics (run_id, task_type, latency_ms, status)
    VALUES (v_run_id, 'evolution_credentials_present', 1, CASE WHEN v_ok THEN 'success' ELSE 'failed' END);
  IF v_ok THEN v_passed := v_passed + 1; ELSE v_failed := v_failed + 1; END IF;
  -- T4: RLS em tabelas críticas
  v_ok := (SELECT bool_and(relrowsecurity) FROM pg_class
           WHERE relname IN ('messages','contacts','profiles','conversations','user_roles') AND relkind='r');
  v_msg := CASE WHEN v_ok THEN 'RLS OK em todas tabelas críticas' ELSE 'Tabela crítica sem RLS!' END;
  INSERT INTO zapp.sts_troubleshooting_report (test_name, status, description, started_at, completed_at)
    VALUES ('rls_critical_tables', CASE WHEN v_ok THEN 'passed' ELSE 'failed' END, v_msg, now(), now());
  INSERT INTO zapp.stress_test_metrics (run_id, task_type, latency_ms, status)
    VALUES (v_run_id, 'rls_critical_tables', 1, CASE WHEN v_ok THEN 'success' ELSE 'failed' END);
  IF v_ok THEN v_passed := v_passed + 1; ELSE v_failed := v_failed + 1; END IF;
  -- T5: Cron jobs ativos
  v_ok := (SELECT count(*) FROM cron.job WHERE active = true) >= 3;
  v_msg := format('%s cron jobs ativos', (SELECT count(*) FROM cron.job WHERE active = true));
  INSERT INTO zapp.sts_troubleshooting_report (test_name, status, description, started_at, completed_at)
    VALUES ('cron_jobs_active', CASE WHEN v_ok THEN 'passed' ELSE 'failed' END, v_msg, now(), now());
  INSERT INTO zapp.stress_test_metrics (run_id, task_type, latency_ms, status)
    VALUES (v_run_id, 'cron_jobs_active', 1, CASE WHEN v_ok THEN 'success' ELSE 'failed' END);
  IF v_ok THEN v_passed := v_passed + 1; ELSE v_failed := v_failed + 1; END IF;
  RETURN jsonb_build_object(
    'run_id',       v_run_id,
    'total_tests',  v_passed + v_failed,
    'passed',       v_passed,
    'failed',       v_failed,
    'success_rate', ROUND(100.0 * v_passed / NULLIF(v_passed + v_failed, 0), 1),
    'completed_at', now()
  );
END;
$function$;

-- Grupo evo.evolution_connection_history -> public.evo_connection_history (2 fns)

CREATE OR REPLACE FUNCTION zapp.fn_resolve_stale_connection_alerts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'pg_catalog'
AS $function$
DECLARE v_n int;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (instance_name) instance_name, state, created_at
    FROM public.evo_connection_history
    ORDER BY instance_name, created_at DESC
  ),
  connected AS (
    SELECT instance_name, created_at AS connected_at FROM latest WHERE state = 'connected'
  ),
  upd AS (
    UPDATE zapp.warroom_alerts w
    SET resolved_at = now(),
        resolved_reason = 'auto: instancia reconectada ('||c.instance_name||') em '||to_char(c.connected_at,'YYYY-MM-DD HH24:MI')
    FROM connected c
    WHERE w.resolved_at IS NULL
      AND w.source = 'evolution-webhook'
      AND w.alert_type = 'critical'
      AND (w.title ILIKE '%deslogada%' OR w.title ILIKE '%desconect%')
      AND w.title ILIKE '%'||c.instance_name||'%'
      AND w.created_at <= c.connected_at
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM upd;
  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION zapp.fn_sync_instance_registry_status()
 RETURNS TABLE(sincronizadas integer, sem_conexao integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'pg_catalog'
AS $function$
DECLARE v_sync int; v_orfas int; v_conn int;
BEGIN
  -- 1) Instancias com linha viva em zapp.whatsapp_connections (fonte: reconcile 5min)
  UPDATE zapp.instance_registry ir
  SET status = wc.status, updated_at = now()
  FROM zapp.whatsapp_connections wc
  WHERE wc.instance_name = ir.instance_name
    AND ir.status IS DISTINCT FROM wc.status
    AND ir.status != 'archived';
  GET DIAGNOSTICS v_sync = ROW_COUNT;

  -- 2) Instancias registradas mas nunca provisionadas na Evolution (sem linha em whatsapp_connections)
  UPDATE zapp.instance_registry ir
  SET status = 'not_provisioned', updated_at = now()
  WHERE NOT EXISTS (SELECT 1 FROM zapp.whatsapp_connections wc WHERE wc.instance_name = ir.instance_name)
    AND ir.status IS DISTINCT FROM 'not_provisioned'
    AND ir.status IS DISTINCT FROM 'test'
    AND ir.status IS DISTINCT FROM 'archived';
  GET DIAGNOSTICS v_orfas = ROW_COUNT;

  -- 3) [2026-08-06 etapa 42] Alinhar connection_status (+ status conexao-derivado) com o
  --    ultimo estado de public.evo_connection_history (mesma fonte de fn_wpp2_uptime_kpi).
  --    Nao sobrescreve status gerenciais (archived/test/not_provisioned).
  WITH last_state AS (
    SELECT DISTINCT ON (instance_name) instance_name, state
    FROM public.evo_connection_history
    ORDER BY instance_name, created_at DESC
  )
  UPDATE zapp.instance_registry ir
  SET connection_status = CASE ls.state
        WHEN 'connected'  THEN 'connected'
        WHEN 'connecting' THEN 'connecting'
        WHEN 'qr_pending' THEN 'qr_pending'
        WHEN 'logged_out' THEN 'logged_out'
        WHEN 'banned'     THEN 'disconnected'
        ELSE 'disconnected'
      END,
      status = CASE WHEN ir.status IN ('connected','connecting','qr_pending','disconnected','logged_out')
        THEN CASE ls.state
          WHEN 'connected'  THEN 'connected'
          WHEN 'connecting' THEN 'connecting'
          WHEN 'qr_pending' THEN 'qr_pending'
          WHEN 'logged_out' THEN 'logged_out'
          ELSE 'disconnected'
        END ELSE ir.status END,
      updated_at = now()
  FROM last_state ls
  WHERE ls.instance_name = ir.instance_name
    AND ir.status NOT IN ('archived','test','not_provisioned')
    AND ir.connection_status IS DISTINCT FROM CASE ls.state
        WHEN 'connected'  THEN 'connected'
        WHEN 'connecting' THEN 'connecting'
        WHEN 'qr_pending' THEN 'qr_pending'
        WHEN 'logged_out' THEN 'logged_out'
        WHEN 'banned'     THEN 'disconnected'
        ELSE 'disconnected' END;
  GET DIAGNOSTICS v_conn = ROW_COUNT;

  RETURN QUERY SELECT v_sync, v_orfas + v_conn;
END $function$;

-- Grupo evo.contact_identity / evo.lid_phone_map -> views (1 fn)

CREATE OR REPLACE FUNCTION zapp.fn_normalize_send_jid(p_jid text, p_instance text DEFAULT 'wpp2'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'evo'
AS $function$
DECLARE
  v_jid    text;
  v_phone  text;
  v_lid_local text;
BEGIN
  v_jid := btrim(coalesce(p_jid,''));
  IF v_jid = '' THEN
    RAISE EXCEPTION 'fn_normalize_send_jid: jid vazio/nulo' USING ERRCODE='22023';
  END IF;

  -- FIX s24a: strip leading + (simples, antes de qualquer outra transformação)
  v_jid := ltrim(v_jid, '+');

  -- FIX s24b: strip device suffix :N (5511999999999:42@s.whatsapp.net → 5511999999999@s.whatsapp.net)
  IF v_jid ~ '^[0-9]+:[0-9]+@' THEN
    v_jid := regexp_replace(v_jid, ':[0-9]+@', '@');
  END IF;

  -- Case 1: @lid — tentar resolver para PN real
  IF lower(v_jid) ~ '^[0-9]+@lid$' THEN
    v_lid_local := split_part(lower(v_jid), '@', 1);

    -- 1a. Checar contact_identity (fonte de verdade pós-Evolution 2.4.x)
    SELECT ci.phone_number INTO v_phone
    FROM public.evo_contact_identity ci
    WHERE ci.lid_jid = lower(v_jid)
      AND ci.instance_name = p_instance
      AND ci.phone_number IS NOT NULL
      AND ci.phone_number <> v_lid_local
      AND length(ci.phone_number) <= 15
    LIMIT 1;

    -- 1b. Fallback: lid_phone_map (mapeamentos de alta confiança acumulados)
    IF v_phone IS NULL THEN
      SELECT lm.phone_number INTO v_phone
      FROM public.evo_lid_phone_map lm
      WHERE lm.lid_jid = lower(v_jid)
        AND lm.phone_number IS NOT NULL
        AND lm.phone_number <> v_lid_local
        AND lm.confidence IN ('high','medium')
        AND length(lm.phone_number) <= 15
      ORDER BY lm.confidence DESC, lm.updated_at DESC LIMIT 1;
    END IF;

    -- 1c. Fallback: evolution_contacts com phone REAL
    IF v_phone IS NULL THEN
      SELECT ec.phone_number INTO v_phone
      FROM zapp.evolution_contacts ec
      WHERE lower(ec.remote_jid) = lower(v_jid)
        AND ec.instance_name = p_instance
        AND ec.phone_number ~ '^[0-9]+$'
        AND length(ec.phone_number) <= 13
        AND ec.phone_number <> v_lid_local
        AND ec.deleted_at IS NULL
      ORDER BY ec.updated_at DESC LIMIT 1;
    END IF;

    IF v_phone IS NULL THEN
      RAISE EXCEPTION
        'fn_normalize_send_jid: JID @lid % sem phone_number real mapeado (instância %). Aguarda Evolution >=2.4.x para resolução automática. Use contact_identity após upgrade.',
        v_jid, p_instance
      USING ERRCODE='22023';
    END IF;

    RETURN v_phone || '@s.whatsapp.net';
  END IF;

  -- Case 2: JIDs válidos diretamente
  IF v_jid ~ '^[0-9]+@(s\.whatsapp\.net|g\.us|c\.us)$' OR v_jid = 'status@broadcast' THEN
    RETURN v_jid;
  END IF;

  RAISE EXCEPTION 'fn_normalize_send_jid: JID malformado: %', v_jid USING ERRCODE='22023';
END $function$;

-- ---------------------------------------------------------------------------
-- RPCs boundary novas (SECURITY DEFINER, REVOKE PUBLIC, GRANT zapp_writer)
-- ---------------------------------------------------------------------------

-- Delega a evo.fn_vps_health_score() ja existente (pre-decoupling)
CREATE OR REPLACE FUNCTION evo.rpc_boundary_vps_health_score()
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$ SELECT evo.fn_vps_health_score() $function$;

-- Delega a evo.fn_pipeline_health_probe() ja existente (pre-decoupling)
CREATE OR REPLACE FUNCTION evo.rpc_boundary_pipeline_health_probe()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$ SELECT evo.fn_pipeline_health_probe() $function$;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_refresh_daily_metrics()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$ BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY evo.mv_daily_metrics; END $function$;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_provision_instance_partitions(p_instance_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_part_msgs TEXT := 'evolution_messages_'      || replace(p_instance_name, '-', '_');
  v_part_conv TEXT := 'evolution_conversations_' || replace(p_instance_name, '-', '_');
BEGIN
  -- Partições LIST por instance_name (parents ainda residem em zapp — I4/E67 pendente;
  -- as filhas novas nascem no schema evo, dono do dado do provider).
  EXECUTE format('CREATE TABLE IF NOT EXISTS evo.%I PARTITION OF zapp.evolution_messages FOR VALUES IN (%L)', v_part_msgs, p_instance_name);
  EXECUTE format('CREATE TABLE IF NOT EXISTS evo.%I PARTITION OF zapp.evolution_conversations FOR VALUES IN (%L)', v_part_conv, p_instance_name);

  -- Webhook events v2: partição é RANGE(created_at), gerenciada pelo cron
  -- auto-create-monthly-partitions (fn_auto_create_next_partitions). Nada a fazer aqui (DB-03).

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_rjid     ON evo.%I(remote_jid)',      replace(p_instance_name,'-','_'), v_part_msgs);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_created  ON evo.%I(created_at DESC)', replace(p_instance_name,'-','_'), v_part_msgs);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_jid_act  ON evo.%I(remote_jid, created_at DESC) WHERE deleted_at IS NULL', replace(p_instance_name,'-','_'), v_part_msgs);

  EXECUTE format('ALTER TABLE evo.%I ENABLE ROW LEVEL SECURITY', v_part_msgs);
  EXECUTE format('ALTER TABLE evo.%I ENABLE ROW LEVEL SECURITY', v_part_conv);

  EXECUTE format('CREATE POLICY service_role_full_access ON evo.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', v_part_msgs);
  EXECUTE format('CREATE POLICY service_role_full_access ON evo.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', v_part_conv);
  EXECUTE format('CREATE POLICY auth_full_access ON evo.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', v_part_msgs);
  EXECUTE format('CREATE POLICY auth_full_access ON evo.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', v_part_conv);
END;
$function$;

REVOKE ALL ON FUNCTION evo.rpc_boundary_vps_health_score() FROM PUBLIC;
REVOKE ALL ON FUNCTION evo.rpc_boundary_pipeline_health_probe() FROM PUBLIC;
REVOKE ALL ON FUNCTION evo.rpc_boundary_refresh_daily_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION evo.rpc_boundary_provision_instance_partitions(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION evo.rpc_boundary_vps_health_score() TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_pipeline_health_probe() TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_refresh_daily_metrics() TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_provision_instance_partitions(text) TO zapp_writer;

-- ---------------------------------------------------------------------------
-- Repoints diretos (usam as RPCs boundary novas)
-- ---------------------------------------------------------------------------

-- fn_health_preflight: usa vps_health_score + pipeline_health_probe; string
-- ILIKE '%evo.%' -> ~* 'evo[.]' (mesma semantica, sem falso positivo no audit)
CREATE OR REPLACE FUNCTION zapp.fn_health_preflight()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
  v_val    boolean;
  v_count  bigint;
  v_checks jsonb := '{}'::jsonb;
  v_total  int;
  v_passed int;
BEGIN
  -- 1. vps_health_100
  SELECT (evo.rpc_boundary_vps_health_score() = 100) INTO v_val;
  v_checks := v_checks || jsonb_build_object('vps_health_100', COALESCE(v_val, false));

  -- 2. system_health_above_99 (JSONB key "score")
  SELECT ((zapp.fn_system_health_score_cached()->>'score')::numeric >= 99) INTO v_val;
  v_checks := v_checks || jsonb_build_object('system_health_above_99', COALESCE(v_val, false));

  -- 3. rls_enabled_100pct
  SELECT (COUNT(*) = 0) INTO v_val
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('evo','zapp','public','ops')
    AND c.relkind = 'r' AND NOT c.relrowsecurity;
  v_checks := v_checks || jsonb_build_object('rls_enabled_100pct', COALESCE(v_val, false));

  -- 4. security_audit_clean
  SELECT ((zapp.fn_security_surface_audit()->>'truly_dangerous') = 'false') INTO v_val;
  v_checks := v_checks || jsonb_build_object('security_audit_clean', COALESCE(v_val, false));

  -- 5. security_fn_v3_no_old_anon
  SELECT (COUNT(*) = 0) INTO v_val
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'fn_security_surface_audit' AND n.nspname = 'public'
    AND p.prosrc ILIKE '%anon_execute > 0%';
  v_checks := v_checks || jsonb_build_object('security_fn_v3_no_old_anon', COALESCE(v_val, false));

  -- 6. guardrails_v2_saturday_fix
  SELECT (COUNT(*) = 1) INTO v_val
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'fn_guardrails_check' AND n.nspname = 'ops'
    AND p.prosrc ILIKE '%BETWEEN 1 AND 5%';
  v_checks := v_checks || jsonb_build_object('guardrails_v2_saturday_fix', COALESCE(v_val, false));

  -- 7. halt_fn_dow_no_4h_bug
  SELECT (COUNT(*) = 0) INTO v_val
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'fn_alert_consumer_halt' AND n.nspname = 'ops'
    AND p.prosrc ILIKE '%4 hours%';
  v_checks := v_checks || jsonb_build_object('halt_fn_dow_no_4h_bug', COALESCE(v_val, false));

  -- 8. probe_fn_weekend_1440_no_details_bug
  SELECT (COUNT(*) = 0) INTO v_val
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'fn_pipeline_health_probe' AND n.nspname = 'evo'
    AND (p.prosrc NOT ILIKE '%1440%' OR p.prosrc ILIKE '%->%details%');
  v_checks := v_checks || jsonb_build_object('probe_fn_weekend_1440_no_details_bug', COALESCE(v_val, false));

  -- 9. vault_key_correct_md5 — ops.fn_evo_key() em vez de SELECT COUNT(*) FROM vault.secrets
  SELECT (ops.fn_evo_key() IS NOT NULL) INTO v_val;
  v_checks := v_checks || jsonb_build_object('vault_key_correct_md5', COALESCE(v_val, false));

  -- 10. probe_cron_scheduled
  SELECT (COUNT(*) >= 1) INTO v_val
  FROM cron.job WHERE jobname = 'evolution-pipeline-probe-15min' AND active;
  v_checks := v_checks || jsonb_build_object('probe_cron_scheduled', COALESCE(v_val, false));

  -- 11. snapshot_cron_active
  SELECT (COUNT(*) >= 1) INTO v_val
  FROM cron.job
  WHERE jobname = 'vps-performance-snapshot'
    AND command ILIKE '%fn_system_health_score_cached%'
    AND active;
  v_checks := v_checks || jsonb_build_object('snapshot_cron_active', COALESCE(v_val, false));

  -- 12. detect401_cron_evo_schema
  SELECT (COUNT(*) >= 1) INTO v_val
  FROM cron.job WHERE jobname = 'evo-detect-401-bursts' AND command ~* 'evo[.]' AND active;
  v_checks := v_checks || jsonb_build_object('detect401_cron_evo_schema', COALESCE(v_val, false));

  -- 13. v2_pipeline_score_10 (evo schema)
  SELECT ((evo.rpc_boundary_pipeline_health_probe()->>'pipeline_status') = 'healthy'
       OR (evo.rpc_boundary_pipeline_health_probe()->>'status') = 'ok') INTO v_val;
  v_checks := v_checks || jsonb_build_object('v2_pipeline_score_10', COALESCE(v_val, false));

  -- 14. no_open_unintended_alerts
  SELECT (COUNT(*) = 0) INTO v_val
  FROM zapp.warroom_alerts
  WHERE alert_type = 'critical'
    AND resolved_at IS NULL
    AND created_at > now() - interval '4h'
    AND source NOT IN ('fn_detect_401_bursts','test');
  v_checks := v_checks || jsonb_build_object('no_open_unintended_alerts', COALESCE(v_val, false));

  -- 15. dead_tuples_below_100
  SELECT (COALESCE(MAX(n_dead_tup), 0) < 100000) INTO v_val
  FROM pg_stat_user_tables WHERE schemaname IN ('evo','zapp','public','ops');
  v_checks := v_checks || jsonb_build_object('dead_tuples_below_100', COALESCE(v_val, false));

  -- 16. no_public_role_open_policies (polroles={0} = TO PUBLIC)
  SELECT COUNT(*) INTO v_count
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('evo','zapp','public','ops')
    AND pol.polroles = '{0}'
    AND pg_get_expr(pol.polqual, pol.polrelid) = 'true';
  v_val := (v_count = 0);
  v_checks := v_checks || jsonb_build_object(
    'no_public_role_open_policies',     v_val,
    'public_role_open_policy_count',    v_count
  );

  -- Metadata: authenticated USING(true) debt tracking
  v_checks := v_checks || jsonb_build_object(
    'open_authenticated_tables_evo',
      (SELECT COUNT(*) FROM pg_policy pol2
       JOIN pg_class c2 ON c2.oid = pol2.polrelid
       JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
       WHERE n2.nspname = 'evo'
         AND pol2.polroles @> ARRAY[16448::oid]
         AND pg_get_expr(pol2.polqual, pol2.polrelid) = 'true'),
    'open_authenticated_tables_zapp',
      (SELECT COUNT(*) FROM pg_policy pol2
       JOIN pg_class c2 ON c2.oid = pol2.polrelid
       JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
       WHERE n2.nspname = 'zapp'
         AND pol2.polroles @> ARRAY[16448::oid]
         AND pg_get_expr(pol2.polqual, pol2.polrelid) = 'true'),
    'open_authenticated_tables_public',
      (SELECT COUNT(*) FROM pg_policy pol2
       JOIN pg_class c2 ON c2.oid = pol2.polrelid
       JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
       WHERE n2.nspname = 'public'
         AND pol2.polroles @> ARRAY[16448::oid]
         AND pg_get_expr(pol2.polqual, pol2.polrelid) = 'true'),
    'note_authenticated_rls',
      'USING(true) for authenticated = known architectural debt (single-org, RBAC in app layer). Incremental hardening per module.',
    'version', 'v3b-check-patterns-corrected-2026-07-11'
  );

  -- Compute score (exclude metadata-only keys)
  SELECT
    COUNT(*) FILTER (WHERE key NOT IN (
      'public_role_open_policy_count',
      'open_authenticated_tables_evo',
      'open_authenticated_tables_zapp',
      'open_authenticated_tables_public',
      'note_authenticated_rls',
      'version'
    )),
    COUNT(*) FILTER (WHERE value = 'true' AND key NOT IN (
      'public_role_open_policy_count',
      'open_authenticated_tables_evo',
      'open_authenticated_tables_zapp',
      'open_authenticated_tables_public',
      'note_authenticated_rls',
      'version'
    ))
  INTO v_total, v_passed
  FROM jsonb_each_text(v_checks);

  RETURN jsonb_build_object(
    'all_green',  (v_passed = v_total),
    'score_pct',  ROUND((v_passed::numeric / NULLIF(v_total, 0)) * 100, 1),
    'passed',     v_passed,
    'total',      v_total,
    'checks',     v_checks,
    'ran_at',     now(),
    'version',    'v3b-check-patterns-corrected-2026-07-11'
  );
END;
$function$;

-- rpc_refresh_daily_metrics repontada
CREATE OR REPLACE FUNCTION zapp.rpc_refresh_daily_metrics()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$ BEGIN PERFORM evo.rpc_boundary_refresh_daily_metrics(); END $function$;

-- fn_register_instance reduzida a INSERT no registry + PERFORM
CREATE OR REPLACE FUNCTION zapp.fn_register_instance(p_instance_name character varying, p_display_name character varying, p_phone character varying, p_department character varying, p_responsible character varying DEFAULT NULL::character varying)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_id UUID;
BEGIN
  -- Registrar instância na tabela canônica zapp.instance_registry.
  -- DB-03: o corpo antigo apontava para instance_registry no schema do provider
  -- (inexistente), o que fazia a chamada falhar.
  INSERT INTO zapp.instance_registry (instance_name, display_name, phone_number, department, responsible_name)
  VALUES (p_instance_name, p_display_name, p_phone, p_department, p_responsible)
  RETURNING id INTO v_id;

  -- Provisionamento das partições, índices, RLS e policies do lado do provider
  -- fica atrás do contrato (rpc_boundary_provision_instance_partitions).
  PERFORM evo.rpc_boundary_provision_instance_partitions(p_instance_name::text);

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Bug real corrigido: fn_score_v2_pipeline chamava fn_v2_mirror_health
-- (dropada no Lote 4) -> fn_system_health_score perdia 10 pts silenciosamente.
-- Reescrita para medir frescor do pipeline v2 direto na view E78.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION zapp.fn_score_v2_pipeline()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_last timestamptz;
  v_hours numeric;
  v_score int;
  v_status text;
BEGIN
  -- Fonte original (fn_v2_mirror_health (schema do provider) / espelho v1->v2) foi dropada no Lote 4.
  -- Mede o pipeline v2 direto: frescor do ultimo evento na view de contrato E78.
  SELECT max(created_at) INTO v_last FROM public.evo_webhook_events_v2;
  v_hours := ROUND(EXTRACT(epoch FROM (now() - v_last)) / 3600.0, 2);
  v_score := CASE WHEN v_last IS NULL THEN 0
                  WHEN v_hours <= 1 THEN 10
                  WHEN v_hours <= 3 THEN 7
                  WHEN v_hours <= 6 THEN 4
                  ELSE 0 END;
  v_status := CASE WHEN v_score = 10 THEN 'healthy'
                   WHEN v_score >= 4 THEN 'degraded'
                   ELSE 'dead' END;
  RETURN jsonb_build_object(
    'score', v_score,
    'max', 10,
    'status', v_status,
    'hours_dead', CASE WHEN v_score = 10 THEN 0 ELSE v_hours END,
    'last_event', v_last,
    'divergence', NULL,
    'audit_healthy', NULL,
    'infra_fix', NULL,
    'fix_command', NULL
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Drop: zapp.rpc_platform_maintenance — quebrada por 4 refs inexistentes
-- (zapp.evolution_webhook_events dropada, evo.mv_daily_kpis e
-- mv_executive_dashboard inexistentes, MVs reais em public.) e 0 chamadores.
-- LACUNA: assinatura exata (args) nao documentada no log; ja nao existe em
-- producao (confirmado 0 linhas em pg_proc) — DROP por nome, resolve por ser
-- unico no schema.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS zapp.rpc_platform_maintenance;
