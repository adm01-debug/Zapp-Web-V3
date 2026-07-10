-- ============================================================================
-- Alert Column Fix — zapp.webhook_health_alerts uses title/details
-- Auditoria 2026-07-10
--
-- Bug: All monitoring functions written in batch-2 (PR #264) used non-existent
--   columns `message` and `metadata` when inserting into zapp.webhook_health_alerts.
--   The actual schema has `title TEXT` and `details JSONB`.
--   The INSERT errors were silently swallowed by EXCEPTION WHEN OTHERS THEN NULL,
--   so alerts were never delivered to the table.
--
-- Fix: Re-create all 5 affected SECURITY DEFINER functions with correct columns.
--   Also fixes fn_detect_external_401_bursts() from migration 20260710210000
--   (E3-03) which had the same column-name bug.
--
-- Functions fixed:
--   1. evo.fn_flag_poison_messages()
--   2. evo.fn_burnin_disconnection_check()
--   3. evo.fn_burnin_critical_alert_check()
--   4. public.fn_restore_integrity_check()   ← also fixes EXISTS vs COUNT(*) bug
--   5. evo.fn_detect_external_401_bursts()
--
-- Idempotente: CREATE OR REPLACE FUNCTION (all), REVOKE/GRANT (all).
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. evo.fn_flag_poison_messages
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_flag_poison_messages()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, zapp, pg_temp
AS $$
DECLARE
  v_flagged  int := 0;
  v_alerted  int := 0;
  r          record;
BEGIN
  FOR r IN
    SELECT
      id,
      instance_name,
      message_type,
      error_message,
      retry_count,
      created_at
    FROM evo.evolution_webhook_dlq
    WHERE flagged_poison IS NOT DISTINCT FROM false
      AND retry_count >= 3
    ORDER BY retry_count DESC, created_at ASC
    LIMIT 100
  LOOP
    UPDATE evo.evolution_webhook_dlq
      SET flagged_poison = true,
          updated_at     = now()
    WHERE id = r.id;

    v_flagged := v_flagged + 1;

    IF r.retry_count >= 5 THEN
      BEGIN
        INSERT INTO zapp.webhook_health_alerts
          (alert_type, severity, title, details, created_at)
        VALUES (
          'poison_message',
          CASE WHEN r.retry_count >= 10 THEN 'critical' ELSE 'high' END,
          format('E2-07: Poison message on instance %s — %s retries (%s)',
            r.instance_name, r.retry_count, r.message_type),
          jsonb_build_object(
            'dlq_id',        r.id,
            'instance',      r.instance_name,
            'message_type',  r.message_type,
            'retry_count',   r.retry_count,
            'first_seen',    r.created_at,
            'error_preview', left(r.error_message, 200)
          ),
          now()
        );
        v_alerted := v_alerted + 1;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'checked_at',   now(),
    'flagged',      v_flagged,
    'alerted',      v_alerted,
    'status',       CASE WHEN v_flagged > 0 THEN 'WARN' ELSE 'PASS' END
  );
END;
$$;

COMMENT ON FUNCTION evo.fn_flag_poison_messages() IS
  'E2-07: Flags DLQ messages with >= 3 retries as poison; creates high/critical '
  'alerts in zapp.webhook_health_alerts for >= 5 retries. '
  'Scheduled every 5 minutes via pg_cron.';

REVOKE EXECUTE ON FUNCTION evo.fn_flag_poison_messages() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_flag_poison_messages() TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. evo.fn_burnin_disconnection_check
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_burnin_disconnection_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, zapp, pg_temp
AS $$
DECLARE
  v_tracker  record;
  v_gap_secs numeric;
  v_result   jsonb;
BEGIN
  SELECT * INTO v_tracker
  FROM evo.evolution_burnin_tracker
  WHERE id = 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_tracker', 'checked_at', now());
  END IF;

  IF v_tracker.last_seen_at IS NULL THEN
    RETURN jsonb_build_object('status', 'no_heartbeat_yet', 'checked_at', now());
  END IF;

  v_gap_secs := EXTRACT(EPOCH FROM (now() - v_tracker.last_seen_at));

  -- >120s gap: reset burn-in counter (true disconnection)
  IF v_gap_secs > 120 THEN
    UPDATE evo.evolution_burnin_tracker
    SET burnin_start       = now(),
        burnin_ok          = false,
        last_disconnection = now(),
        disconnection_count = disconnection_count + 1,
        updated_at         = now()
    WHERE id = 1;

    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'burnin_disconnection',
        'critical',
        format('E1-05: Burn-in RESET — gap %.0fs exceeds 120s threshold', v_gap_secs),
        jsonb_build_object(
          'gap_seconds',        v_gap_secs,
          'last_seen_at',       v_tracker.last_seen_at,
          'burnin_start_reset', now(),
          'prior_burnin_start', v_tracker.burnin_start
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;

    v_result := jsonb_build_object(
      'status',      'RESET',
      'gap_seconds', v_gap_secs,
      'checked_at',  now()
    );

  -- 30-120s gap: warn but don't reset
  ELSIF v_gap_secs > 30 THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'burnin_disconnection',
        'warn',
        format('E1-05: Burn-in gap %.0fs (30-120s range, counter preserved)', v_gap_secs),
        jsonb_build_object(
          'gap_seconds',  v_gap_secs,
          'last_seen_at', v_tracker.last_seen_at
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;

    v_result := jsonb_build_object(
      'status',      'WARN',
      'gap_seconds', v_gap_secs,
      'checked_at',  now()
    );

  ELSE
    v_result := jsonb_build_object(
      'status',      'OK',
      'gap_seconds', v_gap_secs,
      'checked_at',  now()
    );
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION evo.fn_burnin_disconnection_check() IS
  'E1-05: Checks heartbeat gap against evolution_burnin_tracker. '
  '>120s resets burn-in counter (true disconnection). '
  '30-120s emits WARN alert but preserves counter. '
  'Scheduled every minute via pg_cron.';

REVOKE EXECUTE ON FUNCTION evo.fn_burnin_disconnection_check() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_burnin_disconnection_check() TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. evo.fn_burnin_critical_alert_check
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_burnin_critical_alert_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, zapp, pg_temp
AS $$
DECLARE
  v_tracker      record;
  v_hours_elapsed numeric;
  v_target_hours  CONSTANT numeric := 72;
  v_result        jsonb;
BEGIN
  SELECT * INTO v_tracker
  FROM evo.evolution_burnin_tracker
  WHERE id = 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_tracker', 'checked_at', now());
  END IF;

  v_hours_elapsed := EXTRACT(EPOCH FROM (now() - v_tracker.burnin_start)) / 3600;

  -- Already completed burn-in
  IF v_tracker.burnin_ok THEN
    RETURN jsonb_build_object(
      'status',        'BURNIN_COMPLETE',
      'hours_elapsed', round(v_hours_elapsed::numeric, 1),
      'checked_at',    now()
    );
  END IF;

  -- Alert at 24h and 48h milestones
  IF v_hours_elapsed >= 48 AND v_hours_elapsed < 60 THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'burnin_progress',
        'info',
        format('E1-05: Burn-in %.1fh/72h — 48h milestone reached', v_hours_elapsed),
        jsonb_build_object(
          'hours_elapsed',    round(v_hours_elapsed::numeric, 1),
          'burnin_start',     v_tracker.burnin_start,
          'hours_remaining',  round((v_target_hours - v_hours_elapsed)::numeric, 1)
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;

  ELSIF v_hours_elapsed >= 24 AND v_hours_elapsed < 36 THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'burnin_progress',
        'info',
        format('E1-05: Burn-in %.1fh/72h — 24h milestone reached', v_hours_elapsed),
        jsonb_build_object(
          'hours_elapsed',    round(v_hours_elapsed::numeric, 1),
          'burnin_start',     v_tracker.burnin_start,
          'hours_remaining',  round((v_target_hours - v_hours_elapsed)::numeric, 1)
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Mark complete if >= 72h
  IF v_hours_elapsed >= v_target_hours THEN
    UPDATE evo.evolution_burnin_tracker
    SET burnin_ok  = true,
        updated_at = now()
    WHERE id = 1;

    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'burnin_complete',
        'info',
        format('E1-05: Burn-in COMPLETE — %.1fh stable (target: %sh)', v_hours_elapsed, v_target_hours),
        jsonb_build_object(
          'hours_elapsed',       round(v_hours_elapsed::numeric, 1),
          'burnin_start',        v_tracker.burnin_start,
          'disconnection_count', v_tracker.disconnection_count
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;

    v_result := jsonb_build_object(
      'status',        'BURNIN_JUST_COMPLETED',
      'hours_elapsed', round(v_hours_elapsed::numeric, 1),
      'checked_at',    now()
    );
  ELSE
    v_result := jsonb_build_object(
      'status',           'IN_PROGRESS',
      'hours_elapsed',    round(v_hours_elapsed::numeric, 1),
      'hours_remaining',  round((v_target_hours - v_hours_elapsed)::numeric, 1),
      'checked_at',       now()
    );
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION evo.fn_burnin_critical_alert_check() IS
  'E1-05: Monitors 72h burn-in progress. Emits info alerts at 24h/48h milestones, '
  'marks burnin_ok=true at 72h. Scheduled every hour via pg_cron.';

REVOKE EXECUTE ON FUNCTION evo.fn_burnin_critical_alert_check() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_burnin_critical_alert_check() TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. public.fn_restore_integrity_check
--    Also fixes: EXISTS instead of COUNT(*) LIMIT 1 (Copilot finding)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_restore_integrity_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, zapp, pg_temp
AS $$
DECLARE
  v_result     jsonb;
  v_step       int    := 0;
  v_issues     int    := 0;
  v_cron_count int;
  v_dlq_count  int;
  v_tracker    record;
BEGIN
  -- Step 1: pg_cron jobs healthy?
  v_step := 1;
  SELECT COUNT(*) INTO v_cron_count
  FROM cron.job
  WHERE jobname LIKE 'evo-%' OR jobname LIKE 'burnin-%' OR jobname LIKE 'external-%' OR jobname LIKE 'purge-%';

  IF v_cron_count < 5 THEN
    v_issues := v_issues + 1;
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'restore_integrity',
        'high',
        format('E9-05: pg_cron job count low — only %s evo-related jobs active', v_cron_count),
        jsonb_build_object('cron_count', v_cron_count, 'step', 1),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Step 2: evolution_messages_wpp2 has data? (EXISTS is faster than COUNT LIMIT 1)
  v_step := 2;
  IF NOT EXISTS (SELECT 1 FROM evo.evolution_messages_wpp2 LIMIT 1) THEN
    v_issues := v_issues + 1;
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'restore_integrity',
        'critical',
        'E9-05: evolution_messages_wpp2 is empty — possible restore failure',
        jsonb_build_object('table', 'evo.evolution_messages_wpp2', 'step', 2),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Step 3: burn-in tracker present?
  v_step := 3;
  SELECT * INTO v_tracker FROM evo.evolution_burnin_tracker WHERE id = 1;
  IF NOT FOUND THEN
    v_issues := v_issues + 1;
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'restore_integrity',
        'critical',
        'E9-05: evolution_burnin_tracker row id=1 missing — burn-in monitoring offline',
        jsonb_build_object('step', 3),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Step 4: DLQ backlog?
  v_step := 4;
  SELECT COUNT(*) INTO v_dlq_count
  FROM evo.evolution_webhook_dlq
  WHERE created_at >= now() - interval '1 hour'
    AND flagged_poison IS NOT TRUE;

  IF v_dlq_count > 50 THEN
    v_issues := v_issues + 1;
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'restore_integrity',
        'high',
        format('E9-05: DLQ backlog — %s unprocessed messages in last hour', v_dlq_count),
        jsonb_build_object('dlq_count_1h', v_dlq_count, 'step', 4),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  v_result := jsonb_build_object(
    'checked_at',   now(),
    'steps_run',    4,
    'issues_found', v_issues,
    'cron_jobs',    v_cron_count,
    'dlq_1h',       v_dlq_count,
    'burnin_ok',    CASE WHEN v_tracker IS NOT NULL THEN v_tracker.burnin_ok ELSE NULL END,
    'status',       CASE WHEN v_issues = 0 THEN 'PASS' WHEN v_issues <= 1 THEN 'WARN' ELSE 'CRITICAL' END
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'status',     'ERROR',
      'step',       v_step,
      'error',      SQLERRM,
      'checked_at', now()
    );
END;
$$;

COMMENT ON FUNCTION public.fn_restore_integrity_check() IS
  'E9-05: Post-restore integrity check. Verifies: pg_cron job count, '
  'evolution_messages_wpp2 non-empty (via EXISTS), burnin_tracker present, '
  'DLQ backlog < 50/1h. Emits zapp.webhook_health_alerts on findings. '
  'Returns PASS/WARN/CRITICAL summary.';

REVOKE EXECUTE ON FUNCTION public.fn_restore_integrity_check() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_restore_integrity_check() TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. evo.fn_detect_external_401_bursts
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

      BEGIN
        INSERT INTO zapp.webhook_health_alerts
          (alert_type, severity, title, details, created_at)
        VALUES (
          'external_401_burst',
          'high',
          format('E3-03: IP %s auto-blocked — %s hits in 1h (threshold: %s)', r.ip_address, r.total_hits, v_block_threshold),
          jsonb_build_object('ip', r.ip_address, 'hits_1h', r.total_hits, 'action', 'auto_blocklisted'),
          now()
        );
      EXCEPTION WHEN OTHERS THEN NULL; END;

    ELSE
      BEGIN
        INSERT INTO zapp.webhook_health_alerts
          (alert_type, severity, title, details, created_at)
        VALUES (
          'external_401_burst',
          'medium',
          format('E3-03: IP %s — %s 401 hits in 1h (burst detected, not yet blocked at %s)', r.ip_address, r.total_hits, v_block_threshold),
          jsonb_build_object('ip', r.ip_address, 'hits_1h', r.total_hits, 'action', 'alert_only'),
          now()
        );
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END LOOP;

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

REVOKE EXECUTE ON FUNCTION evo.fn_detect_external_401_bursts() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_detect_external_401_bursts() TO service_role;
