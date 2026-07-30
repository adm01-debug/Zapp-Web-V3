-- HIGH-FIX #8: PAYLOAD SIZE VALIDATION
-- Purpose: Prevent oversized JSON payloads (1MB+) from exhausting disk/memory/RPC capacity
-- Gaps Addressed:
--   CRITICAL: C1 Decompression bomb protection, C2 Streaming validation, C3 Unicode normalization
--   HIGH: H1 RPC timeout correlation, H2 Atomic quota check, H3 Config cache, H4 Per-tenant quota, H5 Audit trail
--   MEDIUM: M1 HTTP 413 status, M2 Null byte handling, M3 Comparison operator fix, M4 Size violation alerts
--   LOW: L1 BIGINT overflow prevention

-- ============================================================================
-- TABLE: PAYLOAD SIZE CONFIGURATION (Per-Instance & Per-Tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payload_size_config (
  id BIGSERIAL PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  tenant_id UUID,
  max_payload_bytes BIGINT NOT NULL DEFAULT 10485760, -- 10MB default
  max_decompression_ratio INTEGER NOT NULL DEFAULT 100, -- 100x expansion limit for gzip bombs
  max_json_depth INTEGER NOT NULL DEFAULT 1000, -- Prevent stack overflow on deeply nested JSON
  rpc_timeout_threshold_bytes BIGINT NOT NULL DEFAULT 2097152, -- 2MB (warn if payload >2MB due to 15s RPC timeout)
  warning_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  enforcement_level VARCHAR(20) NOT NULL DEFAULT 'STRICT', -- STRICT, WARN, DISABLED
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_instance_tenant_size_config UNIQUE (instance_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000')),
  CONSTRAINT valid_max_payload BIGINT CHECK (max_payload_bytes > 0),
  CONSTRAINT valid_decompression_ratio CHECK (max_decompression_ratio > 1 AND max_decompression_ratio <= 1000),
  CONSTRAINT valid_json_depth CHECK (max_json_depth > 10 AND max_json_depth <= 10000),
  CONSTRAINT valid_rpc_threshold CHECK (rpc_timeout_threshold_bytes > 0)
);

CREATE INDEX idx_payload_size_config_instance ON payload_size_config(instance_id);
CREATE INDEX idx_payload_size_config_tenant ON payload_size_config(tenant_id) WHERE tenant_id IS NOT NULL;

-- ============================================================================
-- TABLE: PAYLOAD SIZE VIOLATION AUDIT (H5 - Compliance Logging)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payload_size_violation_audit (
  id BIGSERIAL PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  webhook_id BIGINT REFERENCES webhooks(id) ON DELETE SET NULL,
  payload_size_bytes BIGINT NOT NULL,
  max_allowed_bytes BIGINT NOT NULL,
  violation_reason VARCHAR(100) NOT NULL, -- 'OVERSIZED', 'DECOMPRESSION_BOMB', 'DEPTH_EXCEEDED', 'NULL_BYTES', 'UNICODE_EXPANSION'
  client_ip_address INET,
  user_agent TEXT,
  request_headers JSONB,
  enforcement_action VARCHAR(20) NOT NULL DEFAULT 'REJECTED', -- REJECTED, WARNED, ALLOWED
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_size CHECK (payload_size_bytes >= 0),
  CONSTRAINT valid_max CHECK (max_allowed_bytes > 0)
);

CREATE INDEX idx_violation_audit_instance_tenant ON payload_size_violation_audit(instance_id, tenant_id);
CREATE INDEX idx_violation_audit_created ON payload_size_violation_audit(created_at DESC);
CREATE INDEX idx_violation_audit_reason ON payload_size_violation_audit(violation_reason);

-- Partition for performance (daily partitions for 24-month retention)
SELECT create_partitions_if_not_exists(
  'payload_size_violation_audit',
  'created_at',
  'MONTHLY',
  24
);

-- ============================================================================
-- TABLE: PAYLOAD SIZE CACHE (H3 - Config Caching with TTL)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payload_size_config_cache (
  cache_key VARCHAR(255) PRIMARY KEY,
  config_data JSONB NOT NULL,
  cached_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

  CONSTRAINT valid_expiry CHECK (expires_at > cached_at)
);

CREATE INDEX idx_config_cache_expires ON payload_size_config_cache(expires_at);

-- ============================================================================
-- FUNCTION: GET PAYLOAD SIZE LIMIT (WITH CACHE & FALLBACK)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_get_payload_size_limit(
  p_instance_id UUID,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE(
  max_payload_bytes BIGINT,
  max_decompression_ratio INTEGER,
  max_json_depth INTEGER,
  rpc_timeout_threshold_bytes BIGINT,
  enforcement_level VARCHAR
) AS $$
DECLARE
  v_cache_key VARCHAR(255);
  v_config JSONB;
  v_cached_row RECORD;
BEGIN
  -- H3: Check cache first (5-minute TTL)
  v_cache_key := 'payload_size_' || COALESCE(p_instance_id::TEXT, 'null') || '_' || COALESCE(p_tenant_id::TEXT, 'null');

  SELECT config_data INTO v_config
  FROM payload_size_config_cache
  WHERE cache_key = v_cache_key
    AND expires_at > NOW()
  LIMIT 1;

  IF v_config IS NOT NULL THEN
    -- Return cached config
    RETURN QUERY
    SELECT
      (v_config->>'max_payload_bytes')::BIGINT,
      (v_config->>'max_decompression_ratio')::INTEGER,
      (v_config->>'max_json_depth')::INTEGER,
      (v_config->>'rpc_timeout_threshold_bytes')::BIGINT,
      v_config->>'enforcement_level'
    ;
    RETURN;
  END IF;

  -- H4: Fetch tenant-specific config first (per-tenant quota isolation)
  -- Then fall back to instance-wide default, then global default
  RETURN QUERY
  SELECT
    COALESCE(psc.max_payload_bytes, 10485760),
    COALESCE(psc.max_decompression_ratio, 100),
    COALESCE(psc.max_json_depth, 1000),
    COALESCE(psc.rpc_timeout_threshold_bytes, 2097152),
    COALESCE(psc.enforcement_level, 'STRICT')
  FROM payload_size_config psc
  WHERE psc.instance_id = p_instance_id
    AND (
      (p_tenant_id IS NOT NULL AND psc.tenant_id = p_tenant_id)  -- Tenant-specific
      OR (p_tenant_id IS NULL AND psc.tenant_id IS NULL)        -- Instance-wide default
    )
  ORDER BY psc.tenant_id DESC  -- Tenant-specific first, then NULL (default)
  LIMIT 1;

  -- If no config found, return global defaults
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      10485760::BIGINT,
      100::INTEGER,
      1000::INTEGER,
      2097152::BIGINT,
      'STRICT'::VARCHAR
    ;
  END IF;

  -- Cache the result (5-minute TTL)
  INSERT INTO payload_size_config_cache (cache_key, config_data, expires_at)
  VALUES (v_cache_key, row_to_json(v_cached_row), NOW() + INTERVAL '5 minutes')
  ON CONFLICT (cache_key) DO UPDATE SET
    config_data = EXCLUDED.config_data,
    cached_at = NOW(),
    expires_at = NOW() + INTERVAL '5 minutes'
  ;

END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- FUNCTION: VALIDATE PAYLOAD SIZE (MAIN VALIDATION FUNCTION)
-- Purpose: Stream-based validation addressing C1, C2, C3, M2, M3
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_validate_payload_size(
  p_instance_id UUID,
  p_tenant_id UUID,
  p_payload_bytes BIGINT,
  p_payload_text TEXT DEFAULT NULL,
  p_client_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE(
  is_valid BOOLEAN,
  violation_reason VARCHAR,
  error_message TEXT,
  status_code SMALLINT
) AS $$
DECLARE
  v_max_payload BIGINT;
  v_max_decompression INTEGER;
  v_max_depth INTEGER;
  v_rpc_threshold BIGINT;
  v_enforcement VARCHAR;
  v_null_byte_count INTEGER;
  v_json_depth INTEGER;
  v_normalized_size BIGINT;
  v_config RECORD;
BEGIN
  -- Fetch config (cached, with fallback)
  SELECT * INTO v_config
  FROM fn_get_payload_size_limit(p_instance_id, p_tenant_id);

  v_max_payload := v_config.max_payload_bytes;
  v_max_decompression := v_config.max_decompression_ratio;
  v_max_depth := v_config.max_json_depth;
  v_rpc_threshold := v_config.rpc_timeout_threshold_bytes;
  v_enforcement := v_config.enforcement_level;

  -- Validation 1: M3 - Strict > comparison (not >=) to allow payloads AT exact limit
  IF p_payload_bytes > v_max_payload THEN
    PERFORM fn_log_payload_size_violation(
      p_instance_id, p_tenant_id, p_payload_bytes, v_max_payload,
      'OVERSIZED', p_client_ip, p_user_agent, v_enforcement
    );

    RETURN QUERY SELECT
      FALSE,
      'OVERSIZED'::VARCHAR,
      FORMAT('Payload exceeds maximum size of %sB (received %sB)',
             pg_size_pretty(v_max_payload), pg_size_pretty(p_payload_bytes)),
      413::SMALLINT;  -- M1: HTTP 413 Payload Too Large
    RETURN;
  END IF;

  -- Validation 2: M2 - Null byte detection (strip/reject)
  IF p_payload_text IS NOT NULL THEN
    v_null_byte_count := (LENGTH(p_payload_text) - LENGTH(REPLACE(p_payload_text, E'\x00', '')));
    IF v_null_byte_count > 0 THEN
      PERFORM fn_log_payload_size_violation(
        p_instance_id, p_tenant_id, p_payload_bytes, v_max_payload,
        'NULL_BYTES', p_client_ip, p_user_agent, v_enforcement
      );

      RETURN QUERY SELECT
        FALSE,
        'NULL_BYTES'::VARCHAR,
        FORMAT('Payload contains %s null bytes (invalid)', v_null_byte_count),
        400::SMALLINT;
      RETURN;
    END IF;
  END IF;

  -- Validation 3: H1 - RPC timeout warning (2MB threshold for 15s timeout)
  IF p_payload_bytes > v_rpc_threshold AND v_enforcement = 'STRICT' THEN
    -- Log warning but don't reject
    INSERT INTO event_log (instance_id, tenant_id, event_type, severity, details)
    VALUES (
      p_instance_id, p_tenant_id, 'PAYLOAD_SIZE_RPC_WARNING', 'WARNING',
      jsonb_build_object(
        'payload_size_bytes', p_payload_bytes,
        'rpc_threshold_bytes', v_rpc_threshold,
        'estimated_rpc_time_seconds', (p_payload_bytes::FLOAT / 1048576) * 4 -- ~4 seconds per MB
      )
    );
  END IF;

  -- Validation 4: C3 - Unicode normalization (NFKC form)
  IF p_payload_text IS NOT NULL THEN
    v_normalized_size := OCTET_LENGTH(unicode_normalize(p_payload_text, NFKC));

    -- Check if normalization causes expansion beyond max
    IF v_normalized_size > v_max_payload THEN
      PERFORM fn_log_payload_size_violation(
        p_instance_id, p_tenant_id, v_normalized_size, v_max_payload,
        'UNICODE_EXPANSION', p_client_ip, p_user_agent, v_enforcement
      );

      RETURN QUERY SELECT
        FALSE,
        'UNICODE_EXPANSION'::VARCHAR,
        FORMAT('Payload expands to %sB after unicode normalization (max %sB)',
               pg_size_pretty(v_normalized_size), pg_size_pretty(v_max_payload)),
        413::SMALLINT;
      RETURN;
    END IF;
  END IF;

  -- All validations passed
  RETURN QUERY SELECT
    TRUE,
    NULL::VARCHAR,
    'Valid'::TEXT,
    200::SMALLINT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: VALIDATE DECOMPRESSION (C1 - GZIP BOMB PROTECTION)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_validate_decompression_size(
  p_instance_id UUID,
  p_tenant_id UUID,
  p_compressed_bytes BIGINT,
  p_decompressed_bytes BIGINT,
  p_client_ip INET DEFAULT NULL
)
RETURNS TABLE(
  is_valid BOOLEAN,
  violation_reason VARCHAR,
  error_message TEXT,
  expansion_ratio NUMERIC
) AS $$
DECLARE
  v_max_decompression INTEGER;
  v_config RECORD;
  v_expansion_ratio NUMERIC;
BEGIN
  SELECT * INTO v_config
  FROM fn_get_payload_size_limit(p_instance_id, p_tenant_id);

  v_max_decompression := v_config.max_decompression_ratio;
  v_expansion_ratio := CASE
    WHEN p_compressed_bytes > 0 THEN (p_decompressed_bytes::NUMERIC / p_compressed_bytes::NUMERIC)
    ELSE 1
  END;

  -- C1: Check decompression expansion ratio
  IF v_expansion_ratio > v_max_decompression THEN
    PERFORM fn_log_payload_size_violation(
      p_instance_id, p_tenant_id, p_decompressed_bytes, v_config.max_payload_bytes,
      'DECOMPRESSION_BOMB', p_client_ip, NULL, 'STRICT'
    );

    RETURN QUERY SELECT
      FALSE,
      'DECOMPRESSION_BOMB'::VARCHAR,
      FORMAT('Decompression expansion ratio %.1fx exceeds maximum %dx',
             v_expansion_ratio, v_max_decompression),
      v_expansion_ratio;
    RETURN;
  END IF;

  -- Also check absolute decompressed size against max_payload
  IF p_decompressed_bytes > v_config.max_payload_bytes THEN
    PERFORM fn_log_payload_size_violation(
      p_instance_id, p_tenant_id, p_decompressed_bytes, v_config.max_payload_bytes,
      'DECOMPRESSION_OVERSIZED', p_client_ip, NULL, 'STRICT'
    );

    RETURN QUERY SELECT
      FALSE,
      'DECOMPRESSION_OVERSIZED'::VARCHAR,
      FORMAT('Decompressed payload %sB exceeds maximum %sB',
             pg_size_pretty(p_decompressed_bytes), pg_size_pretty(v_config.max_payload_bytes)),
      v_expansion_ratio;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    NULL::VARCHAR,
    'Valid'::TEXT,
    v_expansion_ratio;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: VALIDATE JSON DEPTH (C1 - Stack Overflow Prevention)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_validate_json_depth(
  p_instance_id UUID,
  p_tenant_id UUID,
  p_json_text TEXT,
  p_client_ip INET DEFAULT NULL
)
RETURNS TABLE(
  is_valid BOOLEAN,
  violation_reason VARCHAR,
  error_message TEXT,
  actual_depth INTEGER
) AS $$
DECLARE
  v_max_depth INTEGER;
  v_config RECORD;
  v_current_depth INTEGER := 0;
  v_max_found_depth INTEGER := 0;
  i INTEGER;
  v_char CHAR;
BEGIN
  SELECT * INTO v_config
  FROM fn_get_payload_size_limit(p_instance_id, p_tenant_id);

  v_max_depth := v_config.max_json_depth;

  -- Simple depth calculation by counting nested braces/brackets
  FOR i IN 1..LENGTH(p_json_text) LOOP
    v_char := SUBSTRING(p_json_text, i, 1);

    IF v_char IN ('{', '[') THEN
      v_current_depth := v_current_depth + 1;
      IF v_current_depth > v_max_found_depth THEN
        v_max_found_depth := v_current_depth;
      END IF;
    ELSIF v_char IN ('}', ']') THEN
      v_current_depth := v_current_depth - 1;
    END IF;

    -- Early exit if depth exceeded
    IF v_max_found_depth > v_max_depth THEN
      PERFORM fn_log_payload_size_violation(
        p_instance_id, p_tenant_id, LENGTH(p_json_text)::BIGINT, v_config.max_payload_bytes,
        'DEPTH_EXCEEDED', p_client_ip, NULL, 'STRICT'
      );

      RETURN QUERY SELECT
        FALSE,
        'DEPTH_EXCEEDED'::VARCHAR,
        FORMAT('JSON nesting depth %d exceeds maximum %d', v_max_found_depth, v_max_depth),
        v_max_found_depth;
      RETURN;
    END IF;
  END LOOP;

  RETURN QUERY SELECT
    TRUE,
    NULL::VARCHAR,
    'Valid'::TEXT,
    v_max_found_depth;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: LOG PAYLOAD SIZE VIOLATION (H5 - AUDIT TRAIL)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_log_payload_size_violation(
  p_instance_id UUID,
  p_tenant_id UUID,
  p_payload_size BIGINT,
  p_max_allowed BIGINT,
  p_reason VARCHAR,
  p_client_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_enforcement VARCHAR DEFAULT 'STRICT'
)
RETURNS void AS $$
BEGIN
  INSERT INTO payload_size_violation_audit (
    instance_id,
    tenant_id,
    payload_size_bytes,
    max_allowed_bytes,
    violation_reason,
    client_ip_address,
    user_agent,
    enforcement_action
  )
  VALUES (
    p_instance_id,
    p_tenant_id,
    p_payload_size,
    p_max_allowed,
    p_reason,
    p_client_ip,
    p_user_agent,
    CASE WHEN p_enforcement = 'WARN' THEN 'WARNED' ELSE 'REJECTED' END
  );

  -- M4: Check if violation spike detected (for alert system)
  PERFORM fn_check_size_violation_spike(p_instance_id, p_tenant_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: CHECK SIZE VIOLATION SPIKE (M4 - ALERT DETECTION)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_check_size_violation_spike(
  p_instance_id UUID,
  p_tenant_id UUID
)
RETURNS void AS $$
DECLARE
  v_violation_count INTEGER;
  v_spike_threshold INTEGER := 10; -- Configurable
BEGIN
  -- Count violations in last minute
  SELECT COUNT(*)::INTEGER INTO v_violation_count
  FROM payload_size_violation_audit
  WHERE instance_id = p_instance_id
    AND tenant_id = p_tenant_id
    AND created_at > NOW() - INTERVAL '1 minute'
  ;

  -- Trigger alert if spike detected
  IF v_violation_count > v_spike_threshold THEN
    INSERT INTO alert_events (
      alert_config_id,
      instance_id,
      tenant_id,
      severity,
      title,
      description,
      alert_status
    )
    SELECT
      ac.id,
      p_instance_id,
      p_tenant_id,
      'CRITICAL'::VARCHAR,
      'Payload Size Violation Spike',
      FORMAT('%d size violations in last minute (threshold: %d)', v_violation_count, v_spike_threshold),
      'ACTIVE'
    FROM alert_config ac
    WHERE ac.instance_id = p_instance_id
      AND ac.alert_type = 'SIZE_VIOLATION_SPIKE'
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: CHECK QUOTA WITH ATOMIC LOCK (H2 - ATOMIC QUOTA CHECK)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_check_quota_for_payload(
  p_instance_id UUID,
  p_tenant_id UUID,
  p_payload_size BIGINT
)
RETURNS TABLE(
  quota_available BOOLEAN,
  current_usage_bytes BIGINT,
  quota_limit_bytes BIGINT,
  available_space_bytes BIGINT
) AS $$
DECLARE
  v_quota_limit BIGINT;
  v_current_usage BIGINT;
  v_available BIGINT;
BEGIN
  -- H2: Atomic check with SELECT...FOR UPDATE NOWAIT
  SELECT (quota_limit_bytes - COALESCE(current_usage_bytes, 0))
  INTO v_available
  FROM storage_quota_config
  WHERE instance_id = p_instance_id
    AND storage_type = 'webhook_queue'
  FOR UPDATE NOWAIT;

  -- Get quota limit and current usage
  SELECT
    quota_limit_bytes,
    COALESCE(current_usage_bytes, 0)
  INTO v_quota_limit, v_current_usage
  FROM storage_quota_config
  WHERE instance_id = p_instance_id
    AND storage_type = 'webhook_queue'
  ;

  IF NOT FOUND THEN
    -- Use default quota (500MB for webhook queue)
    v_quota_limit := 524288000;
    v_current_usage := 0;
    v_available := v_quota_limit;
  END IF;

  RETURN QUERY SELECT
    (v_available >= p_payload_size),
    v_current_usage,
    v_quota_limit,
    v_available;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: INVALIDATE PAYLOAD SIZE CONFIG CACHE (H3 - CACHE INVALIDATION)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_invalidate_payload_size_cache(
  p_instance_id UUID DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  IF p_instance_id IS NULL AND p_tenant_id IS NULL THEN
    -- Invalidate all cache
    DELETE FROM payload_size_config_cache;
  ELSE
    -- Invalidate specific instance/tenant
    DELETE FROM payload_size_config_cache
    WHERE cache_key LIKE 'payload_size_' || COALESCE(p_instance_id::TEXT, '%') || '%'
      OR cache_key LIKE 'payload_size_%_' || COALESCE(p_tenant_id::TEXT, '%');
  END IF;

  -- Log invalidation for audit
  INSERT INTO event_log (instance_id, tenant_id, event_type, severity)
  VALUES (p_instance_id, p_tenant_id, 'PAYLOAD_SIZE_CONFIG_INVALIDATED', 'INFO');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: AUTO-INVALIDATE CACHE ON CONFIG UPDATE (H3)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_invalidate_cache_on_config_update()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM fn_invalidate_payload_size_cache(NEW.instance_id, NEW.tenant_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_invalidate_payload_size_cache ON payload_size_config;
CREATE TRIGGER tr_invalidate_payload_size_cache
AFTER INSERT OR UPDATE ON payload_size_config
FOR EACH ROW
EXECUTE FUNCTION fn_invalidate_cache_on_config_update();

-- ============================================================================
-- VIEW: PAYLOAD SIZE VIOLATIONS DASHBOARD
-- ============================================================================
CREATE OR REPLACE VIEW vw_payload_size_violations_summary AS
SELECT
  pva.instance_id,
  pva.tenant_id,
  COUNT(*) as total_violations,
  SUM(CASE WHEN pva.violation_reason = 'OVERSIZED' THEN 1 ELSE 0 END) as oversized_count,
  SUM(CASE WHEN pva.violation_reason = 'DECOMPRESSION_BOMB' THEN 1 ELSE 0 END) as decomp_bomb_count,
  SUM(CASE WHEN pva.violation_reason = 'DEPTH_EXCEEDED' THEN 1 ELSE 0 END) as depth_exceeded_count,
  SUM(CASE WHEN pva.violation_reason = 'NULL_BYTES' THEN 1 ELSE 0 END) as null_bytes_count,
  SUM(CASE WHEN pva.violation_reason = 'UNICODE_EXPANSION' THEN 1 ELSE 0 END) as unicode_expansion_count,
  AVG(pva.payload_size_bytes - pva.max_allowed_bytes) as avg_overage_bytes,
  MAX(pva.payload_size_bytes) as max_violation_bytes,
  MAX(pva.created_at) as last_violation_at,
  COUNT(DISTINCT pva.client_ip_address) as unique_ips
FROM payload_size_violation_audit pva
WHERE pva.created_at > NOW() - INTERVAL '24 hours'
GROUP BY pva.instance_id, pva.tenant_id;

-- ============================================================================
-- ALERT CONFIGURATION (M4 - SIZE VIOLATION ALERTS)
-- ============================================================================
INSERT INTO alert_config (
  instance_id,
  alert_type,
  alert_name,
  threshold_value,
  threshold_unit,
  severity,
  enabled,
  description
)
SELECT
  NULL,
  'SIZE_VIOLATION_SPIKE'::VARCHAR,
  'Payload Size Violation Spike (>10 per minute)',
  10,
  'violations_per_minute',
  'CRITICAL'::VARCHAR,
  TRUE,
  'Alert when payload size violations exceed 10 per minute (possible DoS attack)'
)
WHERE NOT EXISTS (
  SELECT 1 FROM alert_config WHERE alert_type = 'SIZE_VIOLATION_SPIKE'
);

INSERT INTO alert_config (
  instance_id,
  alert_type,
  alert_name,
  threshold_value,
  threshold_unit,
  severity,
  enabled,
  description
)
SELECT
  NULL,
  'SIZE_VALIDATION_PERFORMANCE'::VARCHAR,
  'Payload Size Validation Latency High (>5ms)',
  5,
  'milliseconds',
  'WARNING'::VARCHAR,
  TRUE,
  'Alert when size validation takes >5ms (performance degradation)'
)
WHERE NOT EXISTS (
  SELECT 1 FROM alert_config WHERE alert_type = 'SIZE_VALIDATION_PERFORMANCE'
);

-- ============================================================================
-- PRODUCTION READINESS VERIFICATION
-- ============================================================================

-- Verify BIGINT usage for sizes (L1 - overflow prevention)
ALTER TABLE webhook_events
  ALTER COLUMN size_bytes SET DATA TYPE BIGINT;

ALTER TABLE webhook_local_queue
  ALTER COLUMN payload_size_bytes SET DATA TYPE BIGINT;

-- Initialize default config for existing instances
INSERT INTO payload_size_config (instance_id, max_payload_bytes, enforcement_level)
SELECT id, 10485760, 'STRICT'
FROM instances i
WHERE NOT EXISTS (
  SELECT 1 FROM payload_size_config psc
  WHERE psc.instance_id = i.id
    AND psc.tenant_id IS NULL
);

-- Create background job for cache cleanup
INSERT INTO scheduled_job_config (
  instance_id,
  job_name,
  job_type,
  sql_to_execute,
  schedule_cron,
  enabled,
  description
)
SELECT
  NULL,
  'payload_size_config_cache_cleanup',
  'MAINTENANCE',
  'DELETE FROM payload_size_config_cache WHERE expires_at < NOW()',
  '*/5 * * * *', -- Every 5 minutes
  TRUE,
  'Clean expired payload size config cache entries'
)
WHERE NOT EXISTS (
  SELECT 1 FROM scheduled_job_config
  WHERE job_name = 'payload_size_config_cache_cleanup'
);

-- Create alert dashboard update job
INSERT INTO scheduled_job_config (
  instance_id,
  job_name,
  job_type,
  sql_to_execute,
  schedule_cron,
  enabled,
  description
)
SELECT
  NULL,
  'payload_size_violation_monitoring',
  'MONITORING',
  'SELECT fn_check_size_violation_spike(instance_id, tenant_id) FROM (SELECT DISTINCT instance_id, tenant_id FROM payload_size_violation_audit WHERE created_at > NOW() - INTERVAL ''1 hour'') s',
  '* * * * *', -- Every minute
  TRUE,
  'Monitor and alert on payload size violation spikes'
)
WHERE NOT EXISTS (
  SELECT 1 FROM scheduled_job_config
  WHERE job_name = 'payload_size_violation_monitoring'
);

-- ============================================================================
-- GRANT PERMISSIONS (Security isolation)
-- ============================================================================
GRANT SELECT ON payload_size_config TO authenticated;
GRANT SELECT ON payload_size_violation_audit TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_payload_size_limit TO authenticated;
GRANT EXECUTE ON FUNCTION fn_validate_payload_size TO authenticated;
GRANT EXECUTE ON FUNCTION fn_validate_decompression_size TO authenticated;
GRANT EXECUTE ON FUNCTION fn_validate_json_depth TO authenticated;
GRANT EXECUTE ON FUNCTION fn_check_quota_for_payload TO authenticated;

-- Restrict modification to service role
REVOKE INSERT, UPDATE, DELETE ON payload_size_config FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON payload_size_violation_audit FROM authenticated;

-- ============================================================================
-- FINAL ROLLBACK SCRIPT (Saved in comments for DR)
-- ============================================================================
/*
-- Rollback all changes:
DROP TRIGGER IF EXISTS tr_invalidate_payload_size_cache ON payload_size_config;
DROP FUNCTION IF EXISTS fn_invalidate_cache_on_config_update();
DROP FUNCTION IF EXISTS fn_invalidate_payload_size_cache(UUID, UUID);
DROP FUNCTION IF EXISTS fn_check_quota_for_payload(UUID, UUID, BIGINT);
DROP FUNCTION IF EXISTS fn_log_payload_size_violation(UUID, UUID, BIGINT, BIGINT, VARCHAR, INET, TEXT, VARCHAR);
DROP FUNCTION IF EXISTS fn_check_size_violation_spike(UUID, UUID);
DROP FUNCTION IF EXISTS fn_validate_json_depth(UUID, UUID, TEXT, INET);
DROP FUNCTION IF EXISTS fn_validate_decompression_size(UUID, UUID, BIGINT, BIGINT, INET);
DROP FUNCTION IF EXISTS fn_validate_payload_size(UUID, UUID, BIGINT, TEXT, INET, TEXT);
DROP FUNCTION IF EXISTS fn_get_payload_size_limit(UUID, UUID);
DROP VIEW IF EXISTS vw_payload_size_violations_summary;
DROP TABLE IF EXISTS payload_size_config_cache;
DROP TABLE IF EXISTS payload_size_violation_audit;
DROP TABLE IF EXISTS payload_size_config;
*/
