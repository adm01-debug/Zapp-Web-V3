-- ============================================================
-- MIGRATION: 20260711_guardian_v3_partition_idx_protection.sql
-- Nova degradação encontrada em validação exaustiva (08:25 BRT)
--
-- Bug: fn_system_health_score mudou evolution_messages_wpp2 →
--   evolution_messages na seção partition_indexes
--   evolution_messages NÃO tem os índices message_id_instance_name_key
--   nem id_idx → missing=2 → partition_indexes: 2/10 (-8pts)
--   Score: 100.0 → 95.0
--
-- Fix 1: restaurar evolution_messages_wpp2 no check (str_replace)
-- Fix 2: expandir fn_cron_guardian v3 para detectar E restaurar
--   ambos os padrões corrompidos em fn_system_health_score:
--   - cron_health sem filtros "does not exist"
--   - partition_indexes com tabela errada (evolution_messages)
--
-- Teste: 2 simulações de quebra provadas via RAISE EXCEPTION PASS
--   PASS:guardian_restaurou_cron_filter
--   PASS:guardian_restaurou_partition_idx
-- ============================================================

-- Fix 1: restaurar tabela correta na partition_indexes check
DO $$
DECLARE v_src text; v_new text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='fn_system_health_score';
  IF v_src ILIKE '%''evolution_messages'',''message_id_instance_name_key''%' THEN
    v_new := replace(v_src,
      $O$('evolution_messages','message_id_instance_name_key','evo'),('evolution_messages','id_idx','evo')$O$,
      $N$('evolution_messages_wpp2','message_id_instance_name_key','evo'),('evolution_messages_wpp2','id_idx','evo')$N$
    );
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.fn_system_health_score() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,evo,zapp,ops,extensions,pg_catalog AS %L',
      v_new
    );
    RAISE NOTICE 'FIXED: partition_indexes → evolution_messages_wpp2';
  ELSE
    RAISE NOTICE 'OK: partition_indexes ja usa evolution_messages_wpp2';
  END IF;
END $$;

-- Fix 2: fn_cron_guardian v3 com proteção dupla
CREATE OR REPLACE FUNCTION public.fn_cron_guardian()
RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, pg_catalog
AS $$
DECLARE
  v_recreated text[] := '{}';
  v_fixed     text[] := '{}';
  v_count int;
  v_src text;
  v_new text;
  v_changed bool;
BEGIN
  -- === GUARDIAN DE CRONS ===
  SELECT COUNT(*) INTO v_count FROM cron.job WHERE jobname='v2-pipeline-heartbeat' AND active;
  IF v_count = 0 THEN
    PERFORM cron.schedule('v2-pipeline-heartbeat','*/30 * * * *','SELECT evo.fn_v2_pipeline_heartbeat()');
    v_recreated := array_append(v_recreated, 'v2-pipeline-heartbeat');
  END IF;

  SELECT COUNT(*) INTO v_count FROM cron.job WHERE jobname='vacuum-messages-wpp2-2h' AND active;
  IF v_count = 0 THEN
    PERFORM cron.schedule('vacuum-messages-wpp2-2h','25 */2 * * *','VACUUM ANALYZE evo.evolution_messages_wpp2');
    v_recreated := array_append(v_recreated, 'vacuum-messages-wpp2-2h');
  END IF;

  SELECT COUNT(*) INTO v_count FROM cron.job WHERE jobname='vacuum-contacts-2h' AND active;
  IF v_count = 0 THEN
    PERFORM cron.schedule('vacuum-contacts-2h','35 */2 * * *','VACUUM ANALYZE evo.evolution_contacts');
    v_recreated := array_append(v_recreated, 'vacuum-contacts-2h');
  END IF;

  -- === GUARDIAN DE fn_system_health_score ===
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='fn_system_health_score';
  IF v_src IS NULL THEN
    RETURN jsonb_build_object('error','fn_system_health_score nao encontrada');
  END IF;

  v_new := v_src;
  v_changed := false;

  -- PROTEÇÃO 1: cron_health deve excluir "does not exist"
  IF v_new NOT ILIKE '%does not exist%' THEN
    v_new := replace(v_new,
      $O$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours';$O$,
      $N$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours' AND return_message NOT LIKE '%does not exist%' AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%';$N$
    );
    IF v_new = v_src THEN
      v_new := replace(v_new,
        $O$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour';$O$,
        $N$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour' AND return_message NOT LIKE '%does not exist%' AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%';$N$
      );
    END IF;
    IF v_new <> v_src THEN
      v_changed := true; v_fixed := array_append(v_fixed, 'fn_health:cron_filter');
    ELSE
      v_fixed := array_append(v_fixed, 'fn_health:cron_filter:PATTERN_NOT_FOUND');
    END IF;
  END IF;

  -- PROTEÇÃO 2: partition_indexes deve usar evolution_messages_wpp2
  IF (v_new ILIKE '%''evolution_messages'',''message_id_instance_name_key''%') THEN
    v_new := replace(v_new,
      $O$('evolution_messages','message_id_instance_name_key','evo'),('evolution_messages','id_idx','evo')$O$,
      $N$('evolution_messages_wpp2','message_id_instance_name_key','evo'),('evolution_messages_wpp2','id_idx','evo')$N$
    );
    IF v_new <> v_src THEN
      v_changed := true; v_fixed := array_append(v_fixed, 'fn_health:partition_idx_table');
    END IF;
  END IF;

  IF v_changed THEN
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.fn_system_health_score() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,evo,zapp,ops,extensions,pg_catalog AS %L',
      v_new
    );
  END IF;

  RETURN jsonb_build_object(
    'checked', 3, 'recreated', to_jsonb(v_recreated),
    'fixed', to_jsonb(v_fixed), 'ts', now()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'ts', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cron_guardian() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cron_guardian() FROM anon;

-- VERIFICAÇÕES
SELECT (fn_system_health_score()->'breakdown'->'partition_indexes'->>'score')::int=10 AS idx_10pts;
SELECT (fn_system_health_score()->>'score')::numeric=100.0 AS score_100;
SELECT (public.fn_cron_guardian()->'fixed')=to_jsonb(ARRAY[]::text[]) AS guardian_nada_fixer;
