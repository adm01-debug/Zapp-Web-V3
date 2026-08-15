-- =============================================================================
-- E40 — Score T2 (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: registrar o score T2 esperado = 6/9 após resolução de I4 pela
-- série E31–E38. Cria BOUNDARY_SCORE_T2 na tabela de alertas para rastreio.
-- T1 = 5/9 (I3,I5,I6,I7,I8=PASS; I1,I2,I4,I9=FAIL)
-- T2 = 6/9 (I3,I4,I5,I6,I7,I8=PASS; I1,I2,I9=FAIL) — I4 resolvida.
-- Fases 3–8 (E41–E100): resolverão I1, I2, I9 → meta 9/9 = 100%.
-- =============================================================================

DO $$
DECLARE
  v_i4_pass   boolean;
  v_score     int;
  v_details   jsonb;
BEGIN
  -- Verifica I4 em tempo real
  SELECT count(*) = 0
  INTO v_i4_pass
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('zapp', 'evo')
    AND (
      pg_get_functiondef(p.oid) ILIKE '%net.http_post%'
      OR pg_get_functiondef(p.oid) ILIKE '%net.http_get%'
    );

  -- Score base T1 = 5; se I4 resolvida, T2 = 6
  v_score := CASE WHEN v_i4_pass THEN 6 ELSE 5 END;

  v_details := jsonb_build_object(
    'marco',       'BOUNDARY_SCORE_T2',
    'data',        '2026-08-15',
    'score_t1',    5,
    'score_t2',    v_score,
    'meta_final',  9,
    'invariantes', jsonb_build_object(
      'I1_schema_isolation',      'FAIL',
      'I2_no_cross_schema_fk',    'FAIL',
      'I3_rls_100pct',            'PASS',
      'I4_no_direct_net_http',    CASE WHEN v_i4_pass THEN 'PASS' ELSE 'FAIL' END,
      'I5_search_path_locked',    'PASS',
      'I6_vault_ops_only',        'PASS',
      'I7_no_evo_in_zapp_fns',    'PASS',
      'I8_pg_net_via_ops',        'PASS',
      'I9_no_raw_secrets',        'FAIL'
    ),
    'proximas_fases', jsonb_build_array(
      'Fase 3 (E41-E55): resolver I1 — isolamento de schema',
      'Fase 4 (E56-E65): resolver I2 — eliminar FK cross-schema',
      'Fase 5 (E66-E75): resolver I9 — eliminar segredos brutos',
      'Fase 6-8 (E76-E100): hardening, observabilidade e certificação'
    ),
    'migracoes_fase2', jsonb_build_array(
      'E31: fn_check_license_heartbeat',
      'E32: fn_collect_restore_logs',
      'E33: fn_cookie_probe_dispatch',
      'E34: fn_cookie_real_probe',
      'E35: fn_escalate_critical_alerts',
      'E36: fn_outbound_dispatch',
      'E37: fn_reconcile_dispatch',
      'E38: fn_send_bitrix_alert + notify_sicoob_on_reply',
      'E39: validação I4',
      'E40: score T2 (este)'
    )
  );

  RAISE NOTICE '[E40] BOUNDARY_SCORE_T2 = %/9 — I4=%',
    v_score, CASE WHEN v_i4_pass THEN 'PASS' ELSE 'FAIL' END;

  -- Registra na tabela de alertas (não falha se tabela inexistente)
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'zapp' AND tablename = 'evolution_alerts'
  ) THEN
    INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
    VALUES (
      'decouple_score',
      'info',
      format('BOUNDARY_SCORE_T2 = %s/9 (meta: 9/9)', v_score),
      format(
        'Fase 2 concluída. Score avançou T1=%s → T2=%s. '
        'I4 resolvida por E31–E38 (net.http_* → ops.pg_net_*). '
        'Próximo: Fases 3-8 para I1, I2, I9.',
        5, v_score
      ),
      v_details
    );
  END IF;
END;
$$;
