-- Runbook-2 (05/08/2026): Fix format() em evo.fn_monitor_lid_contamination (item A-4)
-- ===========================================================================
-- Sync repo x DB: o fix de format() foi aplicado diretamente no banco pelos
-- agentes do runbook-2 (05-06/08/2026) SEM cobertura versionada.
-- A migration 20260806125000_fix_evo_percent_format.sql cobre apenas
-- fn_detect_spurious_closes e fn_peak_hours_sla_check (confirmado por grep) —
-- fn_monitor_lid_contamination ficou de fora.
--
-- Bug: format('@LID contamination at %.1f%% ...') — PostgreSQL rejeita
-- especificador printf-style "%.1f" em format() ("unrecognized format() type
-- specifier") QUANDO o alerta dispararia, silenciado por EXCEPTION WHEN OTHERS
-- (falso-negativo estrutural).
-- Fix: %s + round(v_pct, 1) (especificador %s é válido em format()).
--
-- Corpo espelha pg_get_functiondef do banco canônico (byte-exact, já com o
-- fix). CREATE OR REPLACE FUNCTION com corpo idêntico = re-aplicação no-op.
-- ===========================================================================

CREATE OR REPLACE FUNCTION evo.fn_monitor_lid_contamination()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
DECLARE
  v_total      bigint;
  v_lid_total  bigint;
  v_lid_7d     bigint;
  v_pct        numeric;
  v_threshold  numeric := 30.0;
  v_result     jsonb;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE remote_jid LIKE '%@lid'),
    count(*) FILTER (WHERE remote_jid LIKE '%@lid' AND updated_at > now()-interval '7 days')
  INTO v_total, v_lid_total, v_lid_7d
  FROM evo.evolution_conversations_wpp2;

  v_pct := round(100.0 * v_lid_total / nullif(v_total,0), 1);

  v_result := jsonb_build_object(
    'checked_at',    now(),
    'total_conv',    v_total,
    'lid_total',     v_lid_total,
    'lid_7d_new',    v_lid_7d,
    'pct_lid',       v_pct,
    'threshold_pct', v_threshold,
    'status',        CASE WHEN v_pct >= v_threshold THEN 'WARNING' ELSE 'OK' END,
    'note',          'LID = WhatsApp temporary device ID for Android users. Fix: upgrade Evolution API when version with senderPn fix is stable. Issue #1778 upstream.'
  );

  -- Alert if contamination grows above threshold
  IF v_pct >= v_threshold AND NOT EXISTS (
    SELECT 1 FROM evo.evolution_alerts
    WHERE alert_type = 'lid_contamination_high'
      AND (resolved IS NULL OR resolved = false)
      AND created_at >= now() - INTERVAL '24 hours'
  ) THEN
    INSERT INTO evo.evolution_alerts (severity, alert_type, message, payload)
    VALUES (
      'high',
      'lid_contamination_high',
      format('@LID contamination at %s%% (>%s%% threshold). %s of %s conversations affected. %s new in last 7 days.', round(v_pct, 1), v_threshold, v_lid_total, v_total, v_lid_7d),
      v_result
    );
  END IF;

  RETURN v_result;
END;
$function$;
