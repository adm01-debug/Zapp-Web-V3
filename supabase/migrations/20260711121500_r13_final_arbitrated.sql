-- ============================================================================
-- R13 FINAL — ARBITRADO POR JOAQUIM em 2026-07-11 ("R13 puro.")
-- Encerra o conflito das sessoes paralelas sobre o bloco cron_health do
-- fn_system_health_score. DECISAO OFICIAL: janela 1h SEM filtros de mensagem.
--
-- Motivo tecnico (prova empirica em docs/runbooks/validation-battery-2026-07-11.md):
--   * Filtro NOT LIKE '%does not exist%' escondeu os 2 maiores incidentes
--     silenciosos (114 falhas route-failed + 48 falhas probe e2e quebrado).
--   * NULL NOT LIKE => NULL => falhas sem mensagem somem (bug logico).
--   * Janela 1h ja limita ruido de DDL transitorio a 60 min.
--
-- REGRA VINCULANTE PARA TODAS AS SESSOES:
--   NAO reintroduzir filtros de return_message no count do cron_health.
--   Validacao em 1 chamada: SELECT ops.fn_test_health_score_unmask();
--   (pass=true <=> R13 puro ativo)
--
-- Idempotente: cobre as duas variantes de formatacao observadas (single-line
-- e multi-line) e faz skip se ja aplicado.
-- ============================================================================

DO $r13final$
DECLARE v_def text; v_new text; v_hit boolean := false;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname='fn_system_health_score' AND n.nspname='public';

  IF position($chk$NOT LIKE '%does not exist%'$chk$ IN v_def) = 0
     AND position('failures_1h' IN v_def) > 0 THEN
    RAISE NOTICE 'R13 puro ja ativo — skip';
    RETURN;
  END IF;

  INSERT INTO ops._fn_backups (fn_name, def, tag)
  VALUES ('public.fn_system_health_score', v_def, 'pre-R13-final-migration');

  -- Variante A (multi-line, base 15031 da sessao paralela)
  v_new := replace(v_def,
    $oA$SELECT COUNT(*) INTO v FROM cron.job_run_details
  WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours'
    AND return_message NOT LIKE '%does not exist%'
    AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%';$oA$,
    $nA$SELECT COUNT(*) INTO v FROM cron.job_run_details
  WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour'; -- R13 FINAL (arbitrado por Joaquim 2026-07-11): janela 1h SEM filtros de mensagem. NAO reintroduzir NOT LIKE: esconde classe 'does not exist' (114+48 falhas dos incidentes) e NULL msgs. Teste: SELECT ops.fn_test_health_score_unmask()$nA$);
  IF v_new <> v_def THEN v_hit := true; v_def := v_new; END IF;

  -- Variante B (single-line, base R12 original)
  IF NOT v_hit THEN
    v_new := replace(v_def,
      $oB$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours' AND return_message NOT LIKE '%does not exist%' AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%';$oB$,
      $nB$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour'; -- R13 FINAL (arbitrado por Joaquim 2026-07-11)$nB$);
    IF v_new <> v_def THEN v_hit := true; v_def := v_new; END IF;
  END IF;

  -- Variante C (hibrido: janela 1h + filtros)
  IF NOT v_hit THEN
    v_new := replace(v_def,
      $oC$start_time>NOW()-INTERVAL '1 hour' AND return_message NOT LIKE '%does not exist%' AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%';$oC$,
      $nC$start_time>NOW()-INTERVAL '1 hour';$nC$);
    IF v_new <> v_def THEN v_hit := true; v_def := v_new; END IF;
  END IF;

  IF NOT v_hit THEN
    RAISE EXCEPTION 'R13-FINAL: nenhuma variante conhecida encontrada — inspecionar def manualmente';
  END IF;

  -- breakdown: failures_1h (score) + failures_24h (informativo)
  v_new := replace(v_def,
    $oD$v_bd:=v_bd||jsonb_build_object('cron_health',jsonb_build_object('score',CASE WHEN v=0 THEN 5 WHEN v<5 THEN 3 ELSE 0 END,'max',5,'failures_24h',v));$oD$,
    $nD$v_bd:=v_bd||jsonb_build_object('cron_health',jsonb_build_object('score',CASE WHEN v=0 THEN 5 WHEN v<5 THEN 3 ELSE 0 END,'max',5,'failures_1h',v,'failures_24h',(SELECT COUNT(*) FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours')));$nD$);
  IF v_new <> v_def THEN v_def := v_new; END IF; -- pode ja estar no formato novo

  EXECUTE v_def;
END $r13final$;

-- Validacao obrigatoria pos-migration:
-- SELECT ops.fn_test_health_score_unmask();  -- esperado: pass=true
