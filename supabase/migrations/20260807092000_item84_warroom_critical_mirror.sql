-- ============================================================================
-- AG-EX-17 wave 2 observabilidade | item 84 — Entrega MÍNIMA de alertas
-- 20260807092000_item84_warroom_critical_mirror.sql
--
-- Problema (AG-EX-09 §84): zapp.warroom_alerts é silo silencioso (5.178 linhas,
-- 7 escritores) — só evo.evolution_alerts tem pipeline de entrega (job 84 notifica
-- wpp2+n8n/Bitrix24, job 73 escala, job 205 verifica entrega).
--
-- Fix (entrega mínima, sem refazer o pipeline): função ops.fn_mirror_warroom_criticals()
-- espelha alertas críticos do warroom (alert_type IN critical/sla_breach OU
-- severity critical/high) para evo.evolution_alerts (canal com entrega), com:
--   - dedupe exato por warroom_id (payload.warroom_id) — nunca duplica o mesmo alerta;
--   - dedupe por janela 1h por (source, alert_type) — anti-spam de alertas repetidos;
--   - janela de lookback 24h (evita flood de catch-up de críticos antigos);
--   - sync de resolução: warroom resolvido ⇒ espelho resolvido.
-- Agendado a cada 15min (job novo via cron.schedule — upsert por nome).
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

  -- 2) Sync de resolução: warroom resolvido ⇒ espelho resolvido
  UPDATE evo.evolution_alerts e
  SET resolved_at = w.resolved_at,
      resolved    = true,
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
    'version', 'v1-20260807'
  );
END;
$function$;

SELECT cron.schedule(
  'mirror-warroom-criticals',
  '5,20,35,50 * * * *',
  'SELECT ops.fn_mirror_warroom_criticals()'
);
