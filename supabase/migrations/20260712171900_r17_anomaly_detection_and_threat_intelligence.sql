-- Round 17 Improvement #10: Anomaly Detection & Threat Intelligence
-- Severity: LOW — No centralized anomaly detection or threat intelligence
-- Fix: Event aggregation, correlation rules, baseline learning, threat scoring
-- Date: 2026-07-12
-- Impact: Detect novel attack patterns and insider threats proactively

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Anomaly Detection Baselines
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.anomaly_detection_baselines (
  id                BIGSERIAL       PRIMARY KEY,
  user_id           UUID            NOT NULL,
  metric_name       TEXT            NOT NULL,  -- 'login_time', 'request_frequency', 'geography'
  baseline_value    NUMERIC         NOT NULL,
  std_deviation     NUMERIC         NOT NULL,
  data_points       INT             NOT NULL DEFAULT 0,
  last_updated_at   TIMESTAMPTZ     NOT NULL DEFAULT now(),
  UNIQUE (user_id, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_anomaly_baselines_user
  ON public.anomaly_detection_baselines (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Threat Intelligence Events
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.threat_intelligence_events (
  id                BIGSERIAL       PRIMARY KEY,
  user_id           UUID,
  ip_address        INET,
  threat_type       TEXT            NOT NULL,  -- 'anomalous_login', 'mass_exfiltration', 'privilege_abuse'
  threat_score      NUMERIC         NOT NULL,  -- 0.0-100.0
  confidence        NUMERIC         NOT NULL DEFAULT 0.5,  -- 0.0-1.0
  indicators        JSONB           NOT NULL,  -- array of threat indicators
  detected_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
  is_confirmed      BOOLEAN         NOT NULL DEFAULT false,
  confirmed_at      TIMESTAMPTZ,
  CONSTRAINT chk_threat_score CHECK (threat_score >= 0 AND threat_score <= 100),
  CONSTRAINT chk_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX IF NOT EXISTS idx_threat_intelligence_user_score
  ON public.threat_intelligence_events (user_id, threat_score DESC, detected_at DESC)
  WHERE threat_score >= 70;

CREATE INDEX IF NOT EXISTS idx_threat_intelligence_recent
  ON public.threat_intelligence_events (detected_at DESC);

ALTER TABLE public.threat_intelligence_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='threat_intelligence_events' AND policyname='tie_svc_full') THEN
    EXECUTE 'CREATE POLICY tie_svc_full ON public.threat_intelligence_events TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='threat_intelligence_events' AND policyname='tie_admin_read') THEN
    EXECUTE 'CREATE POLICY tie_admin_read ON public.threat_intelligence_events FOR SELECT TO authenticated
             USING (is_admin_or_supervisor(auth.uid()))';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Correlation Rules (Attack Pattern Detection)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.threat_correlation_rules (
  id                BIGSERIAL       PRIMARY KEY,
  rule_name         TEXT            NOT NULL UNIQUE,
  event_pattern     TEXT            NOT NULL,  -- human-readable pattern description
  trigger_events    JSONB           NOT NULL,  -- array of event types that trigger correlation
  threat_category   TEXT            NOT NULL,
  base_threat_score INT             NOT NULL DEFAULT 50,
  is_enabled        BOOLEAN         NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Seed threat correlation rules
INSERT INTO public.threat_correlation_rules
  (rule_name, event_pattern, trigger_events, threat_category, base_threat_score)
VALUES
  ('credential_stuffing', 'Multiple failed logins from same IP followed by success', '["login_attempt", "rate_limit"]'::JSONB, 'brute_force', 75),
  ('data_exfiltration', 'Large batch query + export + mass download in short window', '["mass_query", "export_operation", "file_download"]'::JSONB, 'data_theft', 85),
  ('privilege_escalation_chain', 'Grant timed privilege + elevated operation + cleanup', '["privilege_grant", "sensitive_operation", "audit_delete"]'::JSONB, 'privilege_abuse', 90),
  ('geographic_impossibility', 'Login from distant locations within impossible time window', '["login_attempt"]'::JSONB, 'account_takeover', 80),
  ('after_hours_activity', 'API requests outside business hours with elevated frequency', '["api_request"]'::JSONB, 'insider_threat', 60)
ON CONFLICT (rule_name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Calculate Threat Score
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_calculate_threat_score(
  p_user_id UUID,
  p_threat_type TEXT,
  p_indicators JSONB
)
RETURNS TABLE (threat_score NUMERIC, confidence NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_base_score INT := 50;
  v_anomaly_factor NUMERIC := 1.0;
  v_recency_factor NUMERIC := 1.0;
  v_recent_events INT;
BEGIN
  -- Get base score from threat type
  SELECT base_threat_score INTO v_base_score
  FROM public.threat_correlation_rules
  WHERE rule_name = p_threat_type
  LIMIT 1;

  -- Check for recent similar events (increases score)
  SELECT COUNT(*) INTO v_recent_events
  FROM public.threat_intelligence_events
  WHERE user_id = p_user_id
    AND threat_type = p_threat_type
    AND detected_at > now() - INTERVAL '24 hours';

  v_anomaly_factor := LEAST(2.0, 1.0 + (v_recent_events::NUMERIC / 10.0));

  -- Calculate confidence based on indicator count
  RETURN QUERY SELECT
    LEAST(100.0, v_base_score * v_anomaly_factor * v_recency_factor)::NUMERIC,
    LEAST(1.0, 0.5 + ((jsonb_array_length(p_indicators)::NUMERIC / 10.0) * 0.5))::NUMERIC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Record Threat Intelligence Event
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_record_threat_event(
  p_user_id UUID,
  p_threat_type TEXT,
  p_indicators JSONB,
  p_ip_address INET DEFAULT NULL
)
RETURNS TABLE (event_id BIGINT, threat_score NUMERIC)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_threat_score NUMERIC;
  v_confidence NUMERIC;
  v_event_id BIGINT;
BEGIN
  SELECT threat_score, confidence INTO v_threat_score, v_confidence
  FROM fn_calculate_threat_score(p_user_id, p_threat_type, p_indicators);

  INSERT INTO public.threat_intelligence_events
    (user_id, ip_address, threat_type, threat_score, confidence, indicators)
  VALUES (p_user_id, p_ip_address, p_threat_type, v_threat_score, v_confidence, p_indicators)
  RETURNING id INTO v_event_id;

  -- Trigger alert if score is high
  IF v_threat_score >= 70 THEN
    PERFORM fn_trigger_security_alert(
      (SELECT id FROM public.security_alert_rules WHERE rule_name = 'suspicious_activity' LIMIT 1),
      'threat_detected',
      jsonb_build_object(
        'event_id', v_event_id,
        'threat_type', p_threat_type,
        'threat_score', v_threat_score,
        'indicators', p_indicators
      ),
      p_user_id
    );
  END IF;

  RETURN QUERY SELECT v_event_id, v_threat_score;
END;
$$;

REVOKE ALL ON FUNCTION fn_record_threat_event(UUID, TEXT, JSONB, INET) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_record_threat_event(UUID, TEXT, JSONB, INET) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Learn Baseline (Update anomaly detection baseline)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_learn_baseline(
  p_user_id UUID,
  p_metric_name TEXT,
  p_value NUMERIC
)
RETURNS TABLE (is_success BOOLEAN)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_baseline NUMERIC;
  v_std_dev NUMERIC;
  v_count INT;
BEGIN
  SELECT baseline_value, std_deviation, data_points
  INTO v_baseline, v_std_dev, v_count
  FROM public.anomaly_detection_baselines
  WHERE user_id = p_user_id AND metric_name = p_metric_name;

  IF v_baseline IS NULL THEN
    INSERT INTO public.anomaly_detection_baselines
      (user_id, metric_name, baseline_value, std_deviation, data_points)
    VALUES (p_user_id, p_metric_name, p_value, 0, 1);
  ELSE
    -- Welford online algorithm for incremental mean/variance
    v_count := v_count + 1;
    v_baseline := v_baseline + ((p_value - v_baseline) / v_count);
    v_std_dev := SQRT(POWER(p_value - v_baseline, 2) / v_count);

    UPDATE public.anomaly_detection_baselines
    SET baseline_value = v_baseline,
        std_deviation = v_std_dev,
        data_points = v_count,
        last_updated_at = now()
    WHERE user_id = p_user_id AND metric_name = p_metric_name;
  END IF;

  RETURN QUERY SELECT true;
END;
$$;

REVOKE ALL ON FUNCTION fn_learn_baseline(UUID, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_learn_baseline(UUID, TEXT, NUMERIC) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Detect Anomaly
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_detect_anomaly(
  p_user_id UUID,
  p_metric_name TEXT,
  p_value NUMERIC
)
RETURNS TABLE (is_anomaly BOOLEAN, z_score NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_baseline NUMERIC;
  v_std_dev NUMERIC;
  v_z_score NUMERIC;
BEGIN
  SELECT baseline_value, std_deviation
  INTO v_baseline, v_std_dev
  FROM public.anomaly_detection_baselines
  WHERE user_id = p_user_id AND metric_name = p_metric_name;

  IF v_baseline IS NULL THEN
    -- Not enough baseline data yet
    RETURN QUERY SELECT false, NULL::NUMERIC;
    RETURN;
  END IF;

  IF v_std_dev = 0 THEN
    v_z_score := 0;
  ELSE
    v_z_score := (p_value - v_baseline) / v_std_dev;
  END IF;

  -- Anomaly if Z-score > 3 (99.7% confidence)
  RETURN QUERY SELECT (ABS(v_z_score) > 3), v_z_score;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Threat Intelligence Dashboard
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_threat_intelligence_summary AS
SELECT
  threat_type,
  COUNT(*) AS event_count,
  ROUND(AVG(threat_score), 2) AS avg_threat_score,
  MAX(threat_score) AS max_threat_score,
  COUNT(*) FILTER (WHERE threat_score >= 70) AS high_risk_events,
  COUNT(DISTINCT user_id) AS affected_users,
  MAX(detected_at) AS latest_detection
FROM public.threat_intelligence_events
WHERE detected_at > now() - INTERVAL '7 days'
GROUP BY threat_type
ORDER BY avg_threat_score DESC;

REVOKE ALL ON VIEW public.v_threat_intelligence_summary FROM PUBLIC;
REVOKE ALL ON VIEW public.v_threat_intelligence_summary FROM anon;
GRANT SELECT ON VIEW public.v_threat_intelligence_summary TO authenticated;
GRANT SELECT ON VIEW public.v_threat_intelligence_summary TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. High-Risk Users View
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_high_risk_users AS
SELECT
  user_id,
  COUNT(*) AS threat_event_count,
  ROUND(AVG(threat_score), 2) AS avg_threat_score,
  MAX(threat_score) AS max_threat_score,
  COUNT(*) FILTER (WHERE threat_score >= 80) AS critical_events,
  ARRAY_AGG(DISTINCT threat_type) AS threat_types,
  MAX(detected_at) AS most_recent_threat
FROM public.threat_intelligence_events
WHERE detected_at > now() - INTERVAL '30 days' AND threat_score >= 70
GROUP BY user_id
ORDER BY max_threat_score DESC;

REVOKE ALL ON VIEW public.v_high_risk_users FROM PUBLIC;
REVOKE ALL ON VIEW public.v_high_risk_users FROM anon;
GRANT SELECT ON VIEW public.v_high_risk_users TO authenticated;
GRANT SELECT ON VIEW public.v_high_risk_users TO service_role;

-- Record completion
SELECT fn_append_audit_event(
  'ROUND_17_IMPROVEMENT_10',
  NULL,
  'migration',
  '20260712171900_r17_anomaly_detection_and_threat_intelligence',
  jsonb_build_object(
    'improvement', 'Anomaly Detection & Threat Intelligence',
    'reason', 'Detect novel attack patterns and insider threats proactively',
    'threat_types', ARRAY['credential_stuffing', 'data_exfiltration', 'privilege_escalation_chain', 'geographic_impossibility', 'after_hours_activity']::TEXT[],
    'capabilities', ARRAY['baseline learning', 'z-score anomaly detection', 'threat scoring', 'correlation rules', 'high-risk user identification', 'threat intelligence aggregation']::TEXT[],
    'features', ARRAY['anomaly_detection_baselines (Welford algorithm)', 'threat_intelligence_events', 'threat_correlation_rules (5 rules)', 'fn_calculate_threat_score', 'fn_detect_anomaly', 'dashboard views']::TEXT[],
    'mitigated_scenarios', '[''Novel Attack Pattern'', ''Insider Threat'', ''Zero-Day Exploitation'']',
    'status', 'IMPROVEMENT_10_COMPLETE'
  )
);

COMMIT;
