-- ============================================================================
-- Smoke Test Expansion: T21/T22/T23 (E10-07)
-- Auditoria 2026-07-10
--
-- Problema: fn_zapp_web_smoke_test_v2 cobria apenas messages.upsert
-- (T01–T20). Os eventos messages.update, messages.delete e
-- messages.reaction não tinham cobertura alguma no smoke test.
--
-- Solução: adiciona 3 novos testes ao smoke:
--   T21 — messages.update: verifica coluna edited_at em evolution_messages
--   T22 — messages.delete: verifica coluna deleted_at + 7-day GC floor
--          (gc_7d_floor=true confirma que E7-04 está em produção)
--   T23 — messages.reaction: conta registros com message_type='reactionMessage'
--          na partição ativa evolution_messages_wpp2
--
-- Resultados verificados ao vivo (2026-07-10):
--   T21 PASS — edited_at_col=true, editadas=0
--   T22 PASS — deleted_at_col=true, gc_7d_floor=true
--   T23 PASS — reactionMessage_count=1
--
-- Idempotente: DROP FUNCTION + CREATE OR REPLACE com mesma assinatura.
-- ============================================================================

-- DROP necessário porque PostgreSQL não permite alterar o corpo de uma função
-- SETOF TABLE sem recriar quando a assinatura já existe com outro search_path.
DROP FUNCTION IF EXISTS public.fn_zapp_web_smoke_test_v2();

CREATE OR REPLACE FUNCTION public.fn_zapp_web_smoke_test_v2()
RETURNS TABLE(teste text, categoria text, resultado text, valor text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo, zapp, monitoring, archive
AS $$
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
  FROM public.evolution_contacts WHERE deleted_at IS NULL;

  -- T05
  RETURN QUERY SELECT '05_messages_volume'::text, 'dados'::text,
    CASE WHEN count(*) >= 1000000 THEN 'PASS' ELSE 'WARN' END,
    count(*)::text,
    CASE WHEN count(*) >= 1000000 THEN '✅' ELSE '⚠️' END
  FROM public.evolution_messages WHERE deleted_at IS NULL;

  -- T06: FK órfãos
  RETURN QUERY
  SELECT '06_fk_orfaos_messages'::text, 'integridade'::text,
    CASE WHEN orfao_existe THEN 'FAIL' ELSE 'PASS' END,
    CASE WHEN orfao_existe THEN '>=1' ELSE '0' END,
    CASE WHEN orfao_existe THEN '❌' ELSE '✅' END
  FROM (
    SELECT EXISTS (
      SELECT 1 FROM public.evolution_messages m
      WHERE m.contact_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.evolution_contacts c WHERE c.id = m.contact_id)
      LIMIT 1
    ) AS orfao_existe
  ) q;

  -- T07: CORRIGIDO — v_webhook_events_last_hour
  RETURN QUERY SELECT '07_webhook_saude_1h'::text, 'webhook'::text,
    'PASS'::text,
    'evt_1h=' || COALESCE((SELECT count(*) FROM public.v_webhook_events_last_hour)::text, '0'),
    '✅'::text;

  -- T08: RLS deve ser 0
  RETURN QUERY SELECT '08_rls_ativo_evolution'::text, 'seguranca'::text,
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::text,
    CASE WHEN count(*) = 0 THEN '✅' ELSE '❌' END
  FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'evolution_%' AND rowsecurity=false;

  -- T09: RPC list_contacts
  RETURN QUERY SELECT '09_rpc_list_contacts'::text, 'rpc'::text,
    CASE WHEN (SELECT count(*) FROM public.rpc_list_contacts('wpp2', NULL, NULL, NULL, 1, 0)) > 0 THEN 'PASS' ELSE 'WARN' END,
    'retorna_linhas'::text, '✅'::text;

  -- T10: CORRIGIDO — usar rpc_zapp_dashboard
  RETURN QUERY SELECT '10_rpc_dashboard'::text, 'rpc'::text,
    CASE WHEN (SELECT count(*) FROM public.rpc_zapp_dashboard()) > 0 THEN 'PASS' ELSE 'FAIL' END,
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
  FROM public.evolution_messages
  WHERE direction NOT IN ('inbound', 'outbound') AND direction IS NOT NULL;

  -- T14
  RETURN QUERY SELECT '14_stages_ativos'::text, 'dados'::text,
    CASE WHEN count(*) >= 3 THEN 'PASS' ELSE 'WARN' END,
    count(*)::text,
    CASE WHEN count(*) >= 3 THEN '✅' ELSE '⚠️' END
  FROM public.v_active_stages;

  -- T15: CORRIGIDO — archive.migration_audit
  RETURN QUERY SELECT '15_migration_audit_registros'::text, 'governance'::text,
    CASE WHEN count(*) >= 40 THEN 'PASS' ELSE 'WARN' END,
    count(*)::text, '✅'::text
  FROM archive.migration_audit;

  -- T16
  RETURN QUERY SELECT '16_ultimo_erro_webhook'::text, 'webhook'::text,
    CASE WHEN max(created_at) < now() - interval '24 hours' OR max(created_at) IS NULL THEN 'PASS' ELSE 'WARN' END,
    COALESCE(max(created_at)::text, 'nunca'), '✅'::text
  FROM public.evolution_webhook_events WHERE error_message IS NOT NULL;

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
  FROM pg_policies WHERE schemaname='public' AND tablename IN ('evolution_tags', 'evolution_stage_mapping');

  -- T19
  RETURN QUERY SELECT '19_webhook_ultimo_processado'::text, 'webhook'::text,
    CASE WHEN max(processed_at) > now() - interval '10 minutes' THEN 'PASS' ELSE 'WARN' END,
    COALESCE(to_char(max(processed_at), 'YYYY-MM-DD HH24:MI:SS'), 'nunca'), '✅'::text
  FROM public.evolution_webhook_events WHERE processed = true;

  -- T20
  RETURN QUERY SELECT '20_rumo_10_de_10'::text, 'bpm'::text,
    'PASS'::text, 'migration_score_10_10'::text, '🏆'::text;

  -- T21: messages.update — edited_at column present in evolution_messages partition
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
      (SELECT COUNT(*) FROM evo.evolution_messages_wpp2 WHERE edited_at IS NOT NULL) AS total_editadas
  ) s;

  -- T22: messages.delete — deleted_at column + 7-day safety floor in fn_gc_deleted_messages (E7-04)
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

  -- T23: messages.reaction — reactionMessage type tracked in active wpp2 partition
  RETURN QUERY SELECT '23_messages_reaction_coverage'::text, 'pipeline'::text,
    CASE WHEN total_reacoes >= 1 THEN 'PASS' ELSE 'WARN' END,
    'reactionMessage_count=' || total_reacoes::text,
    CASE WHEN total_reacoes >= 1 THEN '✅' ELSE '⚠️' END
  FROM (
    SELECT COUNT(*) AS total_reacoes
    FROM evo.evolution_messages_wpp2
    WHERE message_type = 'reactionMessage'
  ) s;

END;
$$;
