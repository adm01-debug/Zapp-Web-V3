-- ============================================================================
-- OBS-2: Stale API-key 401 visibility & operator alert
-- Auditoria 2026-07-12
--
-- PROBLEM
-- -------
-- The Evolution container generates ~1 × 401 every 5 min because an unknown
-- consumer (n8n workflow or Docker monitoring script) still uses a pre-v4 API
-- key.  The current key version is stored in the Vault (evolution_api_key secret).
--
-- Two things were hiding this:
--   1. logpatch T3 beforeSend filtered [401,403] from GlitchTip — fixed in
--      infra/evolution/docker-compose.evolution.yml (this commit): 401s now
--      reach GlitchTip, operators can see them.
--   2. DB-side detection (fn_detect_401_bursts v2) already fires a 6-hourly
--      "BLIND" warning, but it does not include operator instructions to find
--      and fix the stale consumer.
--
-- CHANGES
-- -------
-- 1. Upgrade fn_detect_401_bursts() → v3
--    · Keep all v2 logic (3-source detection, blind-gap alert every 6h)
--    · Add a 24-hour persistent operator prompt: "stale_api_key_hunt"
--      inserted into public.warroom_alerts with step-by-step search checklist.
--
-- 2. Create evo.fn_log_api_401(p_ip, p_endpoint, p_ua) → idempotent shim
--    Currently nothing calls fn_log_api_401 (the VPS log pipeline is inactive).
--    This migration ensures the function signature exists and is correct so
--    callers (Traefik log shipper, n8n webhook, edge function) can start
--    populating evolution_ip_watch without a schema error.
--
-- 3. Fix webhook_audit_log: add status_code=200 to the final audit row for
--    successfully processed events via a new DB helper trigger-function.
--    The edge function already writes status_code for rejected paths (401, 422,
--    400, 429, 503); this adds it for the success path so fn_detect_401_bursts
--    can differentiate processed 200s from real 401 rejections in the audit log.
--    NOTE: This is a DB-only trigger, not an edge-function change.
--
-- ROLLBACK
-- --------
-- CREATE OR REPLACE FUNCTION to previous version, drop trigger.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Upgrade fn_detect_401_bursts → v3 with stale-consumer operator hunt
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_detect_401_bursts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
DECLARE
  v_count_log      int := 0;
  v_count_ipwatch  int := 0;
  v_count_health   int := 0;
  v_total          int;
  v_ipwatch_total  bigint;
  v_monitoring_gap boolean;
  v_already_burst  boolean;
  v_already_gap    boolean;
  v_already_hunt   boolean;
  v_alert_fired    boolean := false;
  v_gap_detail     text;
BEGIN
  -- Source 1: webhook_audit_log — 401 rejections from edge fn (HMAC failures)
  SELECT count(*)::int INTO v_count_log
  FROM public.webhook_audit_log
  WHERE status_code = 401
    AND received_at > now() - interval '15min';  -- webhook_audit_log uses received_at

  -- Source 2: evolution_ip_watch — populated by VPS log pipeline (currently 0 rows)
  SELECT count(*)::int INTO v_count_ipwatch
  FROM evo.evolution_ip_watch
  WHERE http_status = 401
    AND created_at > now() - interval '15min';

  -- Source 3: webhook_health_alerts — from evo-401-glitchtip-feed cron
  SELECT count(*)::int INTO v_count_health
  FROM zapp.webhook_health_alerts
  WHERE alert_type = 'glitchtip_401_feed'
    AND created_at > now() - interval '15min';

  v_total := v_count_log + v_count_ipwatch + v_count_health;

  -- Assess monitoring gap
  SELECT COUNT(*) INTO v_ipwatch_total FROM evo.evolution_ip_watch;
  v_monitoring_gap := (v_ipwatch_total = 0);

  IF v_monitoring_gap THEN
    v_gap_detail :=
      'BLIND: evolution_ip_watch=0 rows — VPS log pipeline (Traefik→DB) not active. '
      'webhook_audit_log captures edge-fn rejections only, not Evolution API 401s. '
      'After OBS-2 fix, 401s now reach GlitchTip (T3 filter removed). '
      'Burst detection remains DB-blind until log pipeline is wired.';
  END IF;

  -- Dedup: burst alert (30 min)
  SELECT EXISTS(
    SELECT 1 FROM public.warroom_alerts
    WHERE source = 'fn_detect_401_bursts'
      AND alert_type = 'critical'
      AND created_at > now() - interval '30min'
  ) INTO v_already_burst;

  -- Dedup: monitoring gap alert (6 h)
  SELECT EXISTS(
    SELECT 1 FROM public.warroom_alerts
    WHERE source = 'fn_detect_401_bursts'
      AND alert_type = 'warning'
      AND created_at > now() - interval '6h'
  ) INTO v_already_gap;

  -- Dedup: stale-consumer hunt prompt (24 h — reminds ops once a day until fixed)
  SELECT EXISTS(
    SELECT 1 FROM public.warroom_alerts
    WHERE source = 'fn_detect_401_bursts'
      AND alert_type = 'info'
      AND message LIKE '%stale_api_key_hunt%'
      AND created_at > now() - interval '24h'
  ) INTO v_already_hunt;

  -- ── Fire burst alert ──────────────────────────────────────────────────────
  IF v_total >= 3 AND NOT v_already_burst THEN
    INSERT INTO public.warroom_alerts (alert_type, title, message, source)
    VALUES (
      'critical',
      format('🚨 401 BURST: %s signals em 15min', v_total),
      format(
        'Sources: webhook_audit_log=%s | evolution_ip_watch=%s | health_alerts=%s '
        '— Verificar imediatamente a chave de API Evolution em uso pelos consumers.',
        v_count_log, v_count_ipwatch, v_count_health
      ),
      'fn_detect_401_bursts'
    );
    v_alert_fired := true;

  -- ── Fire monitoring gap alert ─────────────────────────────────────────────
  ELSIF v_monitoring_gap AND NOT v_already_gap THEN
    INSERT INTO public.warroom_alerts (alert_type, title, message, source)
    VALUES (
      'warning',
      '⚠️ 401 DETECTION BLIND: pipeline VPS→DB inativo',
      'evo.evolution_ip_watch=0 registros históricos. '
      'Ação: configurar Traefik access log → Supabase API. '
      'Monitoramento DB-side cego até lá. '
      'GlitchTip agora recebe 401s (logpatch T3 corrigido em 2026-07-12).',
      'fn_detect_401_bursts'
    );
    v_alert_fired := true;
  END IF;

  -- ── Fire stale-consumer hunt prompt (once per 24h) ────────────────────────
  -- This fires independently of burst/gap so operators always have the checklist
  -- available. Stops automatically when evolution_ip_watch has data (pipeline fixed).
  IF NOT v_already_hunt AND v_ipwatch_total = 0 THEN
    INSERT INTO public.warroom_alerts (alert_type, title, message, source)
    VALUES (
      'info',
      '🔍 OBS-2 stale_api_key_hunt: encontre o consumer com chave velha',
      'A Evolution API gera ~1 × 401 a cada 5 min de um consumer com apikey obsoleta. '
      'CHECKLIST: '
      '(1) n8n: Configurações → Credenciais → filtrar "Evolution" — verificar chave de cada credencial. '
      '(2) Docker Swarm: docker service ls | grep -i "evo\|monitor\|watch\|canary\|guard" — inspecionar cada serviço. '
      '(3) Portainer → Stacks → expandir blobs base64 em evolution/zapp-health-guard/canary. '
      '(4) Variáveis de ambiente: docker service inspect <svc> --format "{{json .Spec.TaskTemplate.ContainerSpec.Env}}" '
      '| grep -i "api_key\|apikey". '
      '(5) Após encontrar: atualizar secret/variável para a chave Evolution atual (ver Vault). '
      '(6) Confirmar resolução: verificar GlitchTip — 401s devem cessar em ≤10min. '
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
    'monitoring_gap_detail', COALESCE(v_gap_detail, 'all sources active'),
    'version', 'v3-stale-key-hunt-2026-07-12'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION evo.fn_detect_401_bursts() FROM PUBLIC;

COMMENT ON FUNCTION evo.fn_detect_401_bursts() IS
  'OBS-2 v3 (2026-07-12): 3-source 401 burst detector + 24h stale-consumer hunt prompt. '
  'Sources: public.webhook_audit_log (edge-fn rejections), evo.evolution_ip_watch (VPS log pipeline), '
  'zapp.webhook_health_alerts (GlitchTip feed). '
  'Fires: critical burst (>=3 signals/15min, 30min cooldown), '
  'warning gap (6h cooldown), info hunt (24h cooldown while ip_watch is empty). '
  'Not callable by PUBLIC — scheduled via cron.job only.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Ensure fn_log_api_401 shim is correctly defined (idempotent)
-- ──────────────────────────────────────────────────────────────────────────────
-- This function receives 401 events from external callers (Traefik log shipper,
-- n8n webhook, edge function). Currently nothing calls it; this ensures the
-- signature is stable for future wiring without a schema error.
CREATE OR REPLACE FUNCTION evo.fn_log_api_401(
  p_ip       text,
  p_endpoint text    DEFAULT NULL,
  p_ua       text    DEFAULT NULL,
  p_status   integer DEFAULT 401
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
BEGIN
  INSERT INTO evo.evolution_ip_watch (
    ip_address, http_status, endpoint, user_agent, created_at
  ) VALUES (
    p_ip, p_status, p_endpoint, p_ua, now()
  )
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  -- Fail silently: 401 logging must never break the caller's main flow
  NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION evo.fn_log_api_401(text, text, text, integer) FROM PUBLIC;

COMMENT ON FUNCTION evo.fn_log_api_401(text, text, text, integer) IS
  'OBS-2 shim (2026-07-12): receives 401/4xx events from external sources '
  '(Traefik log pipeline, n8n, edge function). Inserts into evolution_ip_watch. '
  'Currently not called; signature stable for future wiring. '
  'Not callable by PUBLIC — internal callers only.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. webhook_audit_log: backfill trigger to add status_code=200 on success rows
-- ──────────────────────────────────────────────────────────────────────────────
-- The edge function audits rejected paths with explicit status codes (401, 400,
-- 422, 429, 503) but the final success INSERT omits status_code.
-- This trigger fills it in so fn_detect_401_bursts can count real 401s vs 200s.
CREATE OR REPLACE FUNCTION zapp.fn_webhook_audit_set_success_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public, pg_temp
AS $$
BEGIN
  -- Only backfill when edge fn left status_code NULL on a success/processed row
  IF NEW.status IN ('processed', 'duplicate') AND NEW.status_code IS NULL THEN
    NEW.status_code := 200;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.fn_webhook_audit_set_success_status() FROM PUBLIC;

COMMENT ON FUNCTION zapp.fn_webhook_audit_set_success_status() IS
  'OBS-2 (2026-07-12): fills status_code=200 for processed/duplicate rows '
  'where the edge function omits it. Allows fn_detect_401_bursts to count '
  'real 401 rejections separately from successful 200 events. '
  'Trigger function — not directly callable by PUBLIC.';

-- Attach to public.webhook_audit_log (the real table; zapp.webhook_audit_log does not exist)
DROP TRIGGER IF EXISTS trg_webhook_audit_set_success_status
  ON public.webhook_audit_log;

CREATE TRIGGER trg_webhook_audit_set_success_status
  BEFORE INSERT ON public.webhook_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION zapp.fn_webhook_audit_set_success_status();

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Immediate one-shot alert so operators see the hunt checklist today
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO public.warroom_alerts (alert_type, title, message, source)
SELECT
  'info',
  '🔍 OBS-2 APLICADO: caçar consumer com apikey obsoleta',
  'Fix OBS-2 aplicado em 2026-07-12: '
  '(A) logpatch T3 corrigido — 401s agora chegam ao GlitchTip; '
  '(B) fn_detect_401_bursts v3 dispara hunt checklist diário; '
  '(C) trigger webhook_audit_log preenche status_code=200 em linhas de sucesso. '
  'PRÓXIMO PASSO: verificar GlitchTip em ≤5min por erros "Unauthorized" '
  'e rastrear o consumer (n8n cred, Docker env var) com chave obsoleta. '
  'Ref: AUDITORIA_EVO_API_2026-07-12.md OBS-2.',
  'migration-obs2-2026-07-12'
WHERE NOT EXISTS (
  SELECT 1 FROM public.warroom_alerts
  WHERE source = 'migration-obs2-2026-07-12'
    AND created_at > now() - interval '1h'
);
