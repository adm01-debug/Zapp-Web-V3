-- ============================================================================
-- AG-EX-17 wave 2 | item 84 (correção) — coluna GENERATED no sync de resolução
-- 20260807100000_item84_fix_mirror_resolved_generated.sql
--
-- evo.evolution_alerts.resolved é GENERATED ALWAYS AS (resolved_at IS NOT NULL)
-- → SET resolved=true aborta a função (rollback completo). Basta setar
-- resolved_at/resolved_by; a coluna gerada deriva o estado.
-- ============================================================================

CREATE OR REPLACE FUNCTION ops.fn_mirror_warroom_criticals(p_lookback_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_mirrored int;
  v_synced   int;
BEGIN
  -- 1) Espelhar críticos abertos do warroom (janela lookback)
  INSERT INTO evo.evolution_alerts (alert_type, severity, title, message, payload, created_at)
  SELECT
    'warroom_' || w.alert_type::text,
    CASE
      WHEN w.alert_type::text IN ('critical', 'sla_breach') THEN 'critical'
      WHEN w.severity = 'high' THEN 'high'
      ELSE 'medium'
    END,
    COALESCE(w.title, w.message),
    w.message,
    jsonb_build_object(
      'warroom_id',  w.id,
      'source',      w.source,
      'entity',      w.entity,
      'mirrored_from', 'zapp.warroom_alerts',
      'mirrored_at', now()
    ),
    w.created_at
  FROM zapp.warroom_alerts w
  WHERE w.resolved_at IS NULL
    AND w.created_at > now() - make_interval(hours => p_lookback_hours)
    AND (w.alert_type::text IN ('critical', 'sla_breach') OR w.severity IN ('critical', 'high'))
    -- dedupe exato: mesmo alerta do warroom nunca duplica
    AND NOT EXISTS (
      SELECT 1 FROM evo.evolution_alerts e
      WHERE e.payload->>'warroom_id' = w.id::text
    )
    -- dedupe 1h: mesma fonte+tipo no máximo 1×/hora
    AND NOT EXISTS (
      SELECT 1 FROM evo.evolution_alerts e2
      WHERE e2.alert_type = 'warroom_' || w.alert_type::text
        AND e2.payload->>'source' = w.source
        AND e2.created_at > now() - interval '1 hour'
    );
  GET DIAGNOSTICS v_mirrored = ROW_COUNT;

  -- 2) Sync de resolução: warroom resolvido ⇒ espelho resolvido.
  --    FIX: resolved é GENERATED (resolved_at IS NOT NULL) — não setar a coluna.
  UPDATE evo.evolution_alerts e
  SET resolved_at = w.resolved_at,
      resolved_by = 'warroom-sync'
  FROM zapp.warroom_alerts w
  WHERE e.payload->>'warroom_id' = w.id::text
    AND w.resolved_at IS NOT NULL
    AND e.resolved_at IS NULL;
  GET DIAGNOSTICS v_synced = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'mirrored', v_mirrored,
    'resolved_synced', v_synced,
    'lookback_hours', p_lookback_hours,
    'version', 'v2-20260807'
  );
END;
$function$;
