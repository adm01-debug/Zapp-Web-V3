-- ============================================================================
-- AG-EX-17 wave 2 observabilidade | item 86 — Consolidação do health score
-- 20260807090000_item86_health_score_ttl30.sql
--
-- Problema (AG-EX-09): TTL do cache (5min) << intervalo entre refreshes (30min)
-- → job 108 às :45 erra o cache e recalcula sozinho; job 57 calcula e DESCARTÁ o
-- resultado. ~4 cálculos completos/hora para 1 consumo.
--
-- Fix (recomendação do relatório):
--  1. Job 57 (5 * * * *) vira o REFRESHER: cached(30, TRUE) — grava no cache
--     em vez de descartar. Cache nunca fica mais velho que ~16min (refreshes em
--     :05 via 57, :19/:49 via 148).
--  2. fn_alert_health_score_degraded passa a ler cached(30, FALSE) → às :45 o
--     cache tem ≤26min de idade < TTL 30min → HIT, sem recálculo.
--  Resultado: 3 computes/hora (57×1, 148×2), zero descartados, zero duplicados.
-- ============================================================================

UPDATE cron.job
SET command = 'SELECT zapp.fn_system_health_score_cached(30, TRUE);'
WHERE jobid = 57;

CREATE OR REPLACE FUNCTION zapp.fn_alert_health_score_degraded(p_threshold integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_hs JSONB; v_score NUMERIC; v_grade TEXT; v_already BOOLEAN;
BEGIN
  -- CACHE: usa fn_system_health_score_cached (TTL=30min) em vez de fn_system_health_score()
  -- FIX AG-EX-17: TTL 5→30min alinhado aos refreshers (job 57 :05 e 148 :19/:49)
  -- Reducao: ~1256ms -> <5ms em cache hit (220x mais rapido)
  v_hs    := zapp.fn_system_health_score_cached(30, FALSE);
  v_score := (v_hs->>'score')::NUMERIC;
  v_grade := v_hs->>'grade';

  IF v_score >= p_threshold THEN
    RETURN jsonb_build_object('status','ok','score',v_score,'grade',v_grade,'_cached',(v_hs->>'_cached')::BOOL);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM evo.evolution_alerts
    WHERE alert_type='health_score_degraded'
      AND created_at > NOW()-INTERVAL '2 hours'
      AND resolved_at IS NULL
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('status','already_alerted','score',v_score,'_cached',(v_hs->>'_cached')::BOOL);
  END IF;

  INSERT INTO evo.evolution_alerts(alert_type, severity, title, message, payload)
  VALUES(
    'health_score_degraded',
    CASE WHEN v_score<50 THEN 'critical' WHEN v_score<65 THEN 'high' ELSE 'medium' END,
    'Health Score DEGRADADO: '||ROUND(v_score,1)||'% (Grade '||v_grade||')',
    'Score '||ROUND(v_score,1)||'% abaixo do threshold '||p_threshold||'%. Grade: '||v_grade||'. Verifique o breakdown.',
    jsonb_build_object('score',v_score,'grade',v_grade,'threshold',p_threshold,'breakdown',v_hs->'breakdown')
  );

  RETURN jsonb_build_object(
    'status','alert_created','score',v_score,'grade',v_grade,
    'severity',CASE WHEN v_score<50 THEN 'critical' WHEN v_score<65 THEN 'high' ELSE 'medium' END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error',SQLERRM);
END;
$function$;
