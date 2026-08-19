-- GAP-03: fn_detect_401_bursts disparava alerta 'stale_api_key_hunt' a cada 15min.
-- Causa: v_already_hunt usava message LIKE '%stale_api_key_hunt%' mas a string
-- está no TITLE, não na mensagem. Dedup sempre retornava false → INSERT em todo run.
-- Fix: mudar o check para title LIKE '%stale_api_key_hunt%'.

CREATE OR REPLACE FUNCTION evo.fn_detect_401_bursts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'evo', 'zapp'
AS $function$
DECLARE
  v_count_log      int := 0;
  v_count_ipwatch  int := 0;
  v_count_health   int := 0;
  v_total          int;
  v_ipwatch_total  bigint := 0;
  v_monitoring_gap boolean := true;
  v_already_burst  boolean;
  v_already_gap    boolean;
  v_already_hunt   boolean;
  v_alert_fired    boolean := false;
  v_gap_detail     text;
BEGIN
  SELECT count(*)::int INTO v_count_log
  FROM zapp.webhook_audit_log
  WHERE status_code = 401 AND created_at > now() - interval '15min';

  SELECT count(*)::int INTO v_count_health
  FROM zapp.webhook_health_alerts
  WHERE alert_type = 'sentry_401_feed' AND created_at > now() - interval '15min';

  v_total := v_count_log + v_count_ipwatch + v_count_health;

  v_gap_detail :=
    'BLIND: evolution_ip_watch removida em 2026-08-06 (fantasma, 0 linhas, sem trigger). ' ||
    'webhook_audit_log captures edge-fn rejections only, not Evolution API 401s. ' ||
    'Burst detection remains DB-blind until log pipeline is wired.';

  SELECT EXISTS(
    SELECT 1 FROM zapp.warroom_alerts
    WHERE source = 'fn_detect_401_bursts' AND alert_type = 'critical'
      AND created_at > now() - interval '30min'
  ) INTO v_already_burst;

  SELECT EXISTS(
    SELECT 1 FROM zapp.warroom_alerts
    WHERE source = 'fn_detect_401_bursts' AND alert_type = 'warning'
      AND created_at > now() - interval '6h'
  ) INTO v_already_gap;

  -- FIX GAP-03: dedup por TITLE (não message — string 'stale_api_key_hunt' está no título)
  SELECT EXISTS(
    SELECT 1 FROM zapp.warroom_alerts
    WHERE source = 'fn_detect_401_bursts' AND alert_type = 'info'
      AND title LIKE '%stale_api_key_hunt%'
      AND created_at > now() - interval '24h'
  ) INTO v_already_hunt;

  IF v_total >= 3 AND NOT v_already_burst THEN
    INSERT INTO zapp.warroom_alerts (alert_type, title, message, source)
    VALUES (
      'critical',
      format('🚨 401 BURST: %s signals em 15min', v_total),
      format(
        'Sources: webhook_audit_log=%s | evolution_ip_watch=%s (removida 2026-08-06) | health_alerts=%s '
        '— Verificar imediatamente. Chave atual: vault evolution_api_key (md5 0d658c199f7945a2b960a0a22ab5efa6).',
        v_count_log, v_count_ipwatch, v_count_health
      ),
      'fn_detect_401_bursts'
    );
    v_alert_fired := true;

  ELSIF v_monitoring_gap AND NOT v_already_gap THEN
    INSERT INTO zapp.warroom_alerts (alert_type, title, message, source)
    VALUES (
      'warning',
      '⚠️ 401 DETECTION BLIND: pipeline VPS→DB inativo',
      'evo.evolution_ip_watch removida em 2026-08-06 (era fantasma: 0 linhas). ' ||
      'Ação: configurar Traefik access log → Supabase API. ' ||
      'Sentry recebe 401s (logpatch T3 corrigido em 2026-07-12).',
      'fn_detect_401_bursts'
    );
    v_alert_fired := true;
  END IF;

  IF NOT v_already_hunt THEN
    INSERT INTO zapp.warroom_alerts (alert_type, title, message, source)
    VALUES (
      'info',
      '🔍 OBS-2 stale_api_key_hunt: encontre o consumer com chave velha',
      'A Evolution API gera ~1 × 401 a cada 5 min de um consumer com apikey obsoleta. ' ||
      'Chave atual: vault evolution_api_key (md5 0d658c199f7945a2b960a0a22ab5efa6). ' ||
      'CHECKLIST: n8n credenciais → docker service env → secrets swarm → Sentry 401s. ' ||
      'Ref: AUDITORIA_EVO_API_2026-07-12.md OBS-2.',
      'fn_detect_401_bursts'
    );
    v_alert_fired := true;
  END IF;

  RETURN jsonb_build_object(
    'ok',             true,
    'count_15min',    v_total,
    'alert_fired',    v_alert_fired,
    'sources', jsonb_build_object(
      'webhook_audit_log_401',  v_count_log,
      'evolution_ip_watch_401', v_count_ipwatch,
      'health_alerts_401',      v_count_health
    ),
    'monitoring_gap',        v_monitoring_gap,
    'monitoring_gap_detail', v_gap_detail,
    'version', 'v5-fix-dedup-title-2026-08-14'
  );
END;
$function$;

-- Limpa alertas info duplicados (mantém 1 — o mais recente)
DELETE FROM zapp.warroom_alerts
WHERE id IN (
  SELECT id FROM zapp.warroom_alerts
  WHERE source = 'fn_detect_401_bursts'
    AND alert_type = 'info'
    AND title LIKE '%stale_api_key_hunt%'
  ORDER BY created_at DESC
  OFFSET 1
);
