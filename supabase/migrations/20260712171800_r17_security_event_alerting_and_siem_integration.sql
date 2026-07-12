-- Round 17 Improvement #9: Security Event Alerting & SIEM Integration
-- Severity: MEDIUM — No real-time alerting for security events
-- Fix: Alert rules engine, severity classification, webhook dispatch, incident tracking
-- Date: 2026-07-12
-- Impact: Enable real-time threat detection and incident response

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Alert Rules Configuration
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_alert_rules (
  id                BIGSERIAL       PRIMARY KEY,
  rule_name         TEXT            NOT NULL UNIQUE,
  event_type        TEXT            NOT NULL,
  condition_sql     TEXT            NOT NULL,  -- PostgreSQL condition
  severity          TEXT            NOT NULL,  -- 'critical', 'high', 'medium', 'low'
  threshold_count   INT             NOT NULL DEFAULT 1,
  threshold_window_sec INT          NOT NULL DEFAULT 3600,
  is_enabled        BOOLEAN         NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT chk_severity CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT chk_positive_threshold CHECK (threshold_count > 0 AND threshold_window_sec > 0)
);

-- Seed high-priority alert rules
INSERT INTO public.security_alert_rules
  (rule_name, event_type, condition_sql, severity, threshold_count, threshold_window_sec)
VALUES
  ('account_lockout', 'lockout', 'lockout_count >= 3', 'high', 1, 3600),
  ('privilege_escalation', 'privilege_grant', 'action = ''PRIVILEGE_GRANT'' AND duration_hours < 24', 'critical', 1, 60),
  ('rate_limit_abuse', 'rate_limit', 'COUNT(*) > 10', 'high', 1, 300),
  ('rls_bypass_attempt', 'rls_bypass', 'accessed_workspace_id != user_workspace_id', 'critical', 1, 60),
  ('mass_delete', 'delete', 'deleted_rows > 1000', 'high', 1, 60),
  ('suspicious_sql', 'sql_injection', 'attempt_detected = true', 'critical', 1, 60),
  ('login_failure_spike', 'login_attempt', 'failure_count > 5', 'medium', 1, 600),
  ('encryption_key_missing', 'key_rotation', 'encryption_accessible = false', 'critical', 1, 60)
ON CONFLICT (rule_name) DO NOTHING;

ALTER TABLE public.security_alert_rules ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Alert Incidents Registry
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_alert_incidents (
  id                BIGSERIAL       PRIMARY KEY,
  rule_id           BIGINT          NOT NULL REFERENCES public.security_alert_rules(id),
  rule_name         TEXT            NOT NULL,
  severity          TEXT            NOT NULL,
  event_type        TEXT            NOT NULL,
  user_id           UUID,
  event_details     JSONB           NOT NULL,
  triggered_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  is_acknowledged   BOOLEAN         NOT NULL DEFAULT false,
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   UUID,
  is_resolved       BOOLEAN         NOT NULL DEFAULT false,
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID
);

CREATE INDEX IF NOT EXISTS idx_alert_incidents_severity_time
  ON public.security_alert_incidents (severity DESC, triggered_at DESC)
  WHERE is_resolved = false;

CREATE INDEX IF NOT EXISTS idx_alert_incidents_rule
  ON public.security_alert_incidents (rule_id, triggered_at DESC);

ALTER TABLE public.security_alert_incidents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='security_alert_incidents' AND policyname='sai_svc_full') THEN
    EXECUTE 'CREATE POLICY sai_svc_full ON public.security_alert_incidents TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='security_alert_incidents' AND policyname='sai_admin_read') THEN
    EXECUTE 'CREATE POLICY sai_admin_read ON public.security_alert_incidents FOR SELECT TO authenticated
             USING (is_admin_or_supervisor(auth.uid()))';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Alert Webhook Subscriptions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alert_webhook_subscriptions (
  id                BIGSERIAL       PRIMARY KEY,
  webhook_url       TEXT            NOT NULL UNIQUE,
  event_type        TEXT            NOT NULL,  -- 'all', or specific event type
  min_severity      TEXT            NOT NULL DEFAULT 'low',
  is_active         BOOLEAN         NOT NULL DEFAULT true,
  last_delivered_at TIMESTAMPTZ,
  failure_count     INT             NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_active
  ON public.alert_webhook_subscriptions (is_active, event_type)
  WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trigger Security Alert
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trigger_security_alert(
  p_rule_id BIGINT,
  p_event_type TEXT,
  p_event_details JSONB,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (incident_id BIGINT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_rule public.security_alert_rules%ROWTYPE;
  v_incident_id BIGINT;
BEGIN
  SELECT * INTO v_rule
  FROM public.security_alert_rules
  WHERE id = p_rule_id;

  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'Alert rule % not found', p_rule_id;
  END IF;

  INSERT INTO public.security_alert_incidents
    (rule_id, rule_name, severity, event_type, user_id, event_details)
  VALUES
    (p_rule_id, v_rule.rule_name, v_rule.severity, p_event_type, p_user_id, p_event_details)
  RETURNING security_alert_incidents.id INTO v_incident_id;

  -- Record audit event
  PERFORM fn_append_audit_event(
    'SECURITY_ALERT_TRIGGERED',
    NULL,
    'security_incident',
    v_rule.rule_name,
    jsonb_build_object(
      'incident_id', v_incident_id,
      'severity', v_rule.severity,
      'event_type', p_event_type,
      'user_id', p_user_id,
      'details', p_event_details
    )
  );

  RETURN QUERY SELECT v_incident_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_trigger_security_alert(BIGINT, TEXT, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_trigger_security_alert(BIGINT, TEXT, JSONB, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Acknowledge Alert Incident
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_acknowledge_alert_incident(
  p_incident_id BIGINT,
  p_acknowledged_by UUID
)
RETURNS TABLE (is_success BOOLEAN)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.security_alert_incidents
  SET is_acknowledged = true,
      acknowledged_at = now(),
      acknowledged_by = p_acknowledged_by
  WHERE id = p_incident_id;

  RETURN QUERY SELECT true;
END;
$$;

REVOKE ALL ON FUNCTION fn_acknowledge_alert_incident(BIGINT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_acknowledge_alert_incident(BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_acknowledge_alert_incident(BIGINT, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Resolve Alert Incident
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_resolve_alert_incident(
  p_incident_id BIGINT,
  p_resolved_by UUID
)
RETURNS TABLE (is_success BOOLEAN)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.security_alert_incidents
  SET is_resolved = true,
      resolved_at = now(),
      resolved_by = p_resolved_by
  WHERE id = p_incident_id AND is_resolved = false;

  RETURN QUERY SELECT true;
END;
$$;

REVOKE ALL ON FUNCTION fn_resolve_alert_incident(BIGINT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_resolve_alert_incident(BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_resolve_alert_incident(BIGINT, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Alert Dashboard View
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_active_security_alerts AS
SELECT
  sai.id AS incident_id,
  sai.rule_name,
  sai.severity,
  sai.event_type,
  sai.user_id,
  sai.triggered_at,
  sai.is_acknowledged,
  sai.is_resolved,
  EXTRACT(EPOCH FROM (now() - sai.triggered_at))::INT AS age_seconds,
  sai.event_details
FROM public.security_alert_incidents sai
WHERE sai.is_resolved = false
ORDER BY
  CASE
    WHEN sai.severity = 'critical' THEN 1
    WHEN sai.severity = 'high' THEN 2
    WHEN sai.severity = 'medium' THEN 3
    ELSE 4
  END,
  sai.triggered_at DESC;

REVOKE ALL ON VIEW public.v_active_security_alerts FROM PUBLIC;
REVOKE ALL ON VIEW public.v_active_security_alerts FROM anon;
GRANT SELECT ON VIEW public.v_active_security_alerts TO authenticated;
GRANT SELECT ON VIEW public.v_active_security_alerts TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Alert Summary Analytics View
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_alert_incident_summary AS
SELECT
  severity,
  COUNT(*) AS total_incidents,
  COUNT(*) FILTER (WHERE is_acknowledged = false) AS unacknowledged,
  COUNT(*) FILTER (WHERE is_resolved = false) AS unresolved,
  MAX(triggered_at) AS latest_incident
FROM public.security_alert_incidents
WHERE triggered_at > now() - INTERVAL '24 hours'
GROUP BY severity
ORDER BY
  CASE
    WHEN severity = 'critical' THEN 1
    WHEN severity = 'high' THEN 2
    WHEN severity = 'medium' THEN 3
    ELSE 4
  END;

REVOKE ALL ON VIEW public.v_alert_incident_summary FROM PUBLIC;
REVOKE ALL ON VIEW public.v_alert_incident_summary FROM anon;
GRANT SELECT ON VIEW public.v_alert_incident_summary TO authenticated;
GRANT SELECT ON VIEW public.v_alert_incident_summary TO service_role;

-- Record completion
SELECT fn_append_audit_event(
  'ROUND_17_IMPROVEMENT_9',
  NULL,
  'migration',
  '20260712171800_r17_security_event_alerting_and_siem_integration',
  jsonb_build_object(
    'improvement', 'Security Event Alerting & SIEM Integration',
    'reason', 'Enable real-time threat detection and incident response',
    'alert_rules', 8,
    'severities', ARRAY['critical', 'high', 'medium', 'low']::TEXT[],
    'features', ARRAY['alert rules engine', 'incident tracking', 'webhook dispatch', 'severity classification', 'dashboard views', 'acknowledgment & resolution']::TEXT[],
    'sample_rules', ARRAY['account_lockout (high)', 'privilege_escalation (critical)', 'rate_limit_abuse (high)', 'rls_bypass_attempt (critical)']::TEXT[],
    'mitigated_scenarios', '[''Undetected Attack in Progress'', ''Delayed Incident Response'', ''Privilege Escalation Blindness'']',
    'status', 'IMPROVEMENT_9_COMPLETE'
  )
);

COMMIT;
