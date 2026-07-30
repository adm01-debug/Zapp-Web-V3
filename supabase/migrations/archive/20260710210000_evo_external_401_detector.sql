-- ============================================================================
-- External 401 Burst Detector (E3-03)
-- Auditoria 2026-07-10
--
-- E3-03 — IP externo nos 401 (possível ataque/scan externo)
--   IPs externos estão atingindo endpoints da Evolution API com keys
--   inválidas/ausentes e acumulando 401s. Sem detecção no DB, esses scans
--   passam despercebidos até causar degradação (rate-limit no WhatsApp,
--   vazamento de paths via Sentry/GlitchTip).
--
--   Infraestrutura criada:
--   • evo.evolution_ip_watch — log de 401s externos (ip, endpoint, ua, ts)
--     populado por fn_log_api_401() chamada pelo consumer ou webhook sidecar
--   • evo.evolution_ip_blocklist — IPs auto-flagged por burst detection
--     (Traefik/nginx pode consultar via REST API Supabase)
--   • fn_log_api_401(ip, endpoint, ua) — registra um 401 individual;
--     idempotente, seguro para chamada de alta-frequência
--   • fn_detect_external_401_bursts() — analisa janela de 1h em ip_watch +
--     rate_limit_logs + security_audit_logs; flags IPs com > 10 hits/1h;
--     cria alerta em zapp.webhook_health_alerts (severity=high) por IP
--   • Scheduled: */10 * * * * (a cada 10 min)
--
-- Thresholds:
--   burst_threshold = 10 hits/1h → flag + alert
--   block_threshold = 50 hits/1h → auto-blocklist entry
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE + cron.unschedule.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 401 watch log — populated by fn_log_api_401()
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evo.evolution_ip_watch (
  id          BIGSERIAL    PRIMARY KEY,
  ip_address  TEXT         NOT NULL,
  endpoint    TEXT,
  user_agent  TEXT,
  http_status INT          NOT NULL DEFAULT 401,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE evo.evolution_ip_watch IS
  'E3-03: Log of external 401/403 hits on Evolution API endpoints. '
  'Populated by fn_log_api_401() called from consumer or sidecar webhook. '
  'Analysed hourly by fn_detect_external_401_bursts().';

CREATE INDEX IF NOT EXISTS idx_evo_ip_watch_ip_ts
  ON evo.evolution_ip_watch (ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evo_ip_watch_ts
  ON evo.evolution_ip_watch (created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- IP blocklist — auto-populated by burst detection
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evo.evolution_ip_blocklist (
  ip_address   TEXT         PRIMARY KEY,
  reason       TEXT         NOT NULL,
  hit_count    INT          NOT NULL DEFAULT 0,
  first_seen   TIMESTAMPTZ  NOT NULL,
  last_seen    TIMESTAMPTZ  NOT NULL,
  auto_blocked BOOLEAN      NOT NULL DEFAULT true,
  unblocked_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE evo.evolution_ip_blocklist IS
  'E3-03: IPs auto-flagged by fn_detect_external_401_bursts() when hit count '
  'exceeds block_threshold (50/1h). Traefik/nginx can query via REST API. '
  'Entries with unblocked_at IS NOT NULL are manually cleared.';

CREATE INDEX IF NOT EXISTS idx_evo_ip_blocklist_active
  ON evo.evolution_ip_blocklist (ip_address)
  WHERE unblocked_at IS NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- fn_log_api_401: lightweight ingestion point (called per-request from consumer)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_log_api_401(
  p_ip       text,
  p_endpoint text DEFAULT NULL,
  p_ua       text DEFAULT NULL,
  p_status   int  DEFAULT 401
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
BEGIN
  -- Sanity check: don't log private RFC1918 or loopback IPs
  IF p_ip IS NULL
     OR p_ip = ''
     OR p_ip LIKE '10.%'
     OR p_ip LIKE '192.168.%'
     OR p_ip LIKE '172.1_.%'
     OR p_ip LIKE '172.2_.%'
     OR p_ip LIKE '172.3_.%'
     OR p_ip LIKE '127.%'
     OR p_ip = '::1'
  THEN
    RETURN;
  END IF;

  INSERT INTO evo.evolution_ip_watch (ip_address, endpoint, user_agent, http_status)
  VALUES (p_ip, p_endpoint, p_ua, p_status);
END;
$$;

COMMENT ON FUNCTION evo.fn_log_api_401(text, text, text, int) IS
  'E3-03: Log a single external 401/403 hit. Skips private/loopback IPs. '
  'Caller: consumer webhook handler or Traefik ForwardAuth sidecar. '
  'Usage: SELECT evo.fn_log_api_401(''203.0.113.42'', ''/message/sendText'', ''curl/7.x'');';

-- ──────────────────────────────────────────────────────────────────────────────
-- fn_detect_external_401_bursts: analysis + alerting
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_detect_external_401_bursts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, zapp, pg_temp
AS $$
DECLARE
  v_burst_threshold  CONSTANT int := 10;
  v_block_threshold  CONSTANT int := 50;
  v_window           CONSTANT interval := '1 hour';
  v_result           jsonb := '{}';
  v_burst_count      int   := 0;
  v_block_count      int   := 0;
  v_total_401s       bigint;
  r                  record;
BEGIN
  -- ── Source 1: evo.evolution_ip_watch ──────────────────────────────────────
  -- ── Source 2: public.rate_limit_logs (was_blocked=true) ──────────────────
  -- ── Source 3: public.security_audit_logs (status=unauthorized) ───────────
  -- Unified via UNION ALL, grouped by IP

  FOR r IN
    WITH combined AS (
      SELECT ip_address, COUNT(*) AS hits
      FROM evo.evolution_ip_watch
      WHERE created_at >= now() - v_window
        AND ip_address IS NOT NULL
      GROUP BY ip_address

      UNION ALL

      SELECT ip_address, COUNT(*) AS hits
      FROM public.rate_limit_logs
      WHERE created_at >= now() - v_window
        AND was_blocked = true
        AND ip_address IS NOT NULL
      GROUP BY ip_address

      UNION ALL

      SELECT ip_address, COUNT(*) AS hits
      FROM public.security_audit_logs
      WHERE created_at >= now() - v_window
        AND status IN ('unauthorized', 'failed', 'blocked')
        AND ip_address IS NOT NULL
      GROUP BY ip_address
    ),
    aggregated AS (
      SELECT ip_address, SUM(hits)::int AS total_hits
      FROM combined
      GROUP BY ip_address
      HAVING SUM(hits) >= v_burst_threshold
    )
    SELECT ip_address, total_hits FROM aggregated ORDER BY total_hits DESC
  LOOP
    v_burst_count := v_burst_count + 1;

    -- Auto-blocklist if above block_threshold
    IF r.total_hits >= v_block_threshold THEN
      v_block_count := v_block_count + 1;

      INSERT INTO evo.evolution_ip_blocklist
        (ip_address, reason, hit_count, first_seen, last_seen)
      VALUES (
        r.ip_address,
        format('E3-03: %s 401/rate-limit hits in 1h (threshold: %s)', r.total_hits, v_block_threshold),
        r.total_hits,
        now() - v_window,
        now()
      )
      ON CONFLICT (ip_address) DO UPDATE
        SET hit_count  = GREATEST(evo.evolution_ip_blocklist.hit_count, EXCLUDED.hit_count),
            last_seen  = now(),
            reason     = EXCLUDED.reason,
            updated_at = now()
      WHERE evo.evolution_ip_blocklist.unblocked_at IS NULL;

      -- Critical alert for auto-blocked IP
      BEGIN
        INSERT INTO zapp.webhook_health_alerts
          (alert_type, severity, message, metadata, created_at)
        VALUES (
          'external_401_burst',
          'high',
          format('E3-03: IP %s auto-blocked — %s hits in 1h (threshold: %s)', r.ip_address, r.total_hits, v_block_threshold),
          jsonb_build_object('ip', r.ip_address, 'hits_1h', r.total_hits, 'action', 'auto_blocklisted'),
          now()
        );
      EXCEPTION WHEN OTHERS THEN NULL; END;

    ELSE
      -- Burst alert only (not yet auto-blocked)
      BEGIN
        INSERT INTO zapp.webhook_health_alerts
          (alert_type, severity, message, metadata, created_at)
        VALUES (
          'external_401_burst',
          'medium',
          format('E3-03: IP %s — %s 401 hits in 1h (burst detected, not yet blocked at %s)', r.ip_address, r.total_hits, v_block_threshold),
          jsonb_build_object('ip', r.ip_address, 'hits_1h', r.total_hits, 'action', 'alert_only'),
          now()
        )
        -- Deduplicate: skip if same IP alerted in last 2h
        ON CONFLICT DO NOTHING;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END LOOP;

  -- ── Total 401s in window (all sources) ────────────────────────────────────
  SELECT COALESCE(
    (SELECT COUNT(*) FROM evo.evolution_ip_watch WHERE created_at >= now() - v_window), 0
  ) +
  COALESCE(
    (SELECT COUNT(*) FROM public.rate_limit_logs WHERE created_at >= now() - v_window AND was_blocked = true), 0
  ) +
  COALESCE(
    (SELECT COUNT(*) FROM public.security_audit_logs WHERE created_at >= now() - v_window AND status IN ('unauthorized','failed','blocked')), 0
  )
  INTO v_total_401s;

  v_result := jsonb_build_object(
    'checked_at',       now(),
    'window',           '1h',
    'total_401s_1h',    v_total_401s,
    'burst_ips_found',  v_burst_count,
    'auto_blocked',     v_block_count,
    'thresholds',       jsonb_build_object('burst', v_burst_threshold, 'block', v_block_threshold),
    'blocklist_size',   (SELECT COUNT(*) FROM evo.evolution_ip_blocklist WHERE unblocked_at IS NULL),
    'status',           CASE WHEN v_burst_count > 0 THEN 'WARN' ELSE 'PASS' END
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION evo.fn_detect_external_401_bursts() IS
  'E3-03: Detects external IPs with burst 401 activity (> 10/1h = WARN alert, '
  '>50/1h = auto-blocklist + high alert). Sources: evo.evolution_ip_watch, '
  'public.rate_limit_logs (blocked), public.security_audit_logs (unauthorized). '
  'Scheduled every 10 minutes via pg_cron.';

-- ──────────────────────────────────────────────────────────────────────────────
-- pg_cron: every 10 minutes
-- ──────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule('external-401-detector')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'external-401-detector');

SELECT cron.schedule(
  'external-401-detector',
  '*/10 * * * *',
  'SELECT evo.fn_detect_external_401_bursts()'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Retention: purge ip_watch entries older than 7 days (keep blocklist forever)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_purge_ip_watch()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, pg_temp
AS $$
DECLARE
  v_deleted bigint;
BEGIN
  DELETE FROM evo.evolution_ip_watch WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

SELECT cron.unschedule('purge-ip-watch')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-ip-watch');

SELECT cron.schedule(
  'purge-ip-watch',
  '0 3 * * *',
  'SELECT evo.fn_purge_ip_watch()'
);
