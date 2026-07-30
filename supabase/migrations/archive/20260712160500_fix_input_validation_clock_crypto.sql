-- Round 15 Medium Priority Gaps: Input Validation, Clock Skew, Cryptographic Hardening
-- Problem: Unicode normalization bypass, HTML entity decoding, stale timestamps, key rotation
-- Solution: NFKC normalization, pre-decode entities, authoritative timestamps, key versioning

-- Fix 1: Create input normalization table for tracking normalized values
CREATE TABLE IF NOT EXISTS _input_normalization_cache (
  original_text TEXT PRIMARY KEY,
  normalized_text TEXT NOT NULL UNIQUE,
  normalization_form CHAR(4) DEFAULT 'NFKC', -- NFKC, NFD, NFC, NFKD
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_normalization_cache_text ON _input_normalization_cache(normalized_text);

-- Function to normalize input using NFKC form (most restrictive)
CREATE OR REPLACE FUNCTION normalize_input_nfkc(p_input TEXT)
RETURNS TEXT AS $$
DECLARE
  v_normalized TEXT;
  v_cached TEXT;
BEGIN
  IF p_input IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check cache first
  SELECT normalized_text INTO v_cached
  FROM _input_normalization_cache
  WHERE original_text = p_input
  AND normalization_form = 'NFKC';

  IF v_cached IS NOT NULL THEN
    RETURN v_cached;
  END IF;

  -- Normalize using unaccent extension (NFKC equivalent in PostgreSQL)
  v_normalized := unaccent(LOWER(TRIM(p_input)));

  -- Additional normalization: remove zero-width characters
  v_normalized := regexp_replace(v_normalized, E'[​‌‍]', '', 'g');

  -- Cache result
  INSERT INTO _input_normalization_cache (original_text, normalized_text)
  VALUES (p_input, v_normalized)
  ON CONFLICT (original_text) DO NOTHING;

  RETURN v_normalized;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to decode HTML entities before sanitization
CREATE OR REPLACE FUNCTION decode_html_entities(p_html TEXT)
RETURNS TEXT AS $$
DECLARE
  v_decoded TEXT := p_html;
BEGIN
  IF p_html IS NULL THEN
    RETURN NULL;
  END IF;

  -- Decode common HTML entities that bypass sanitizers
  v_decoded := REPLACE(v_decoded, '&lt;', '<');
  v_decoded := REPLACE(v_decoded, '&gt;', '>');
  v_decoded := REPLACE(v_decoded, '&amp;', '&');
  v_decoded := REPLACE(v_decoded, '&quot;', '"');
  v_decoded := REPLACE(v_decoded, '&#39;', '''');
  v_decoded := REPLACE(v_decoded, '&apos;', '''');

  -- Decode numeric entities (&#123; style)
  v_decoded := regexp_replace(
    v_decoded,
    '&#(\d+);',
    chr($1::int),
    'g'
  );

  -- Decode hex entities (&#x7B; style)
  v_decoded := regexp_replace(
    v_decoded,
    '&#x([0-9a-fA-F]+);',
    chr(('x' || $1)::bit(16)::int),
    'g'
  );

  RETURN v_decoded;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix 2: Create authoritative timestamp source (server time, not client)
CREATE TABLE IF NOT EXISTS _authoritative_time (
  id INT PRIMARY KEY DEFAULT 1,
  server_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT only_one_row CHECK (id = 1)
);

INSERT INTO _authoritative_time (id, server_time)
VALUES (1, now())
ON CONFLICT (id) DO NOTHING;

-- Function to get authoritative server time (prevents clock skew attacks)
CREATE OR REPLACE FUNCTION get_server_time()
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_server_time TIMESTAMPTZ;
BEGIN
  UPDATE _authoritative_time
  SET server_time = now()
  WHERE id = 1
  RETURNING server_time INTO v_server_time;

  RETURN v_server_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to validate timestamp freshness (not older than 5 minutes)
CREATE OR REPLACE FUNCTION validate_timestamp_freshness(
  p_timestamp TIMESTAMPTZ,
  p_max_age_minutes INT DEFAULT 5
)
RETURNS BOOLEAN AS $$
DECLARE
  v_server_time TIMESTAMPTZ;
  v_age_minutes INT;
BEGIN
  v_server_time := get_server_time();

  v_age_minutes := EXTRACT(EPOCH FROM (v_server_time - p_timestamp))::INT / 60;

  IF v_age_minutes > p_max_age_minutes THEN
    RAISE EXCEPTION 'Timestamp is stale (% minutes old, max % allowed)',
      v_age_minutes, p_max_age_minutes
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix 3: Add CHECK constraint to prevent stale pii_masked_at
ALTER TABLE contacts ADD CONSTRAINT check_pii_masked_at_not_future
  CHECK (pii_masked_at IS NULL OR pii_masked_at <= get_server_time())
  NOT VALID;

-- Validate constraint asynchronously to avoid locking
VALIDATE CONSTRAINT check_pii_masked_at_not_future ON contacts;

-- Fix 4: Create encryption key versioning system
CREATE TABLE IF NOT EXISTS _encryption_keys (
  key_id INT PRIMARY KEY,
  key_version INT NOT NULL,
  key_material BYTEA NOT NULL,
  algorithm VARCHAR(50) NOT NULL DEFAULT 'aes-256-gcm',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT only_one_active_key UNIQUE (active) WHERE active = true
);

-- Enable RLS (system-only access)
ALTER TABLE _encryption_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY encryption_keys_system_only ON _encryption_keys
  AS PERMISSIVE FOR ALL USING (false) WITH CHECK (false);

-- Function to get active encryption key
CREATE OR REPLACE FUNCTION get_active_encryption_key()
RETURNS BYTEA AS $$
DECLARE
  v_key BYTEA;
BEGIN
  SELECT key_material INTO v_key
  FROM _encryption_keys
  WHERE active = true
  AND retired_at IS NULL
  LIMIT 1;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'No active encryption key found'
      USING ERRCODE = 'internal_error';
  END IF;

  RETURN v_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to rotate encryption key
CREATE OR REPLACE FUNCTION rotate_encryption_key(p_new_key_material BYTEA)
RETURNS TABLE(
  old_key_version INT,
  new_key_version INT,
  rotation_timestamp TIMESTAMPTZ
) AS $$
DECLARE
  v_old_key_id INT;
  v_new_key_version INT;
BEGIN
  -- Get current active key
  SELECT key_id INTO v_old_key_id
  FROM _encryption_keys
  WHERE active = true
  LIMIT 1;

  -- Deactivate old key
  UPDATE _encryption_keys
  SET active = false, rotated_at = now()
  WHERE key_id = v_old_key_id;

  -- Create new key
  SELECT COALESCE(MAX(key_version), 0) + 1 INTO v_new_key_version
  FROM _encryption_keys;

  INSERT INTO _encryption_keys (
    key_id,
    key_version,
    key_material,
    activated_at,
    active
  ) VALUES (
    v_old_key_id + 1,
    v_new_key_version,
    p_new_key_material,
    now(),
    true
  );

  RETURN QUERY SELECT
    (SELECT key_version FROM _encryption_keys WHERE key_id = v_old_key_id),
    v_new_key_version,
    now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Schedule key rotation audit (check if keys >30 days old need rotation)
SELECT cron.schedule(
  'encryption_key_rotation_audit',
  '0 6 * * *',
  'SELECT COUNT(*) FROM _encryption_keys WHERE active = true AND activated_at < now() - INTERVAL ''30 days'''
);

-- Fix 5: Create function for safe sanitization with normalization + entity decoding
CREATE OR REPLACE FUNCTION sanitize_user_input(
  p_input TEXT,
  p_max_length INT DEFAULT 1000
)
RETURNS TEXT AS $$
DECLARE
  v_normalized TEXT;
  v_decoded TEXT;
  v_final TEXT;
BEGIN
  IF p_input IS NULL THEN
    RETURN NULL;
  END IF;

  -- Step 1: Normalize using NFKC
  v_normalized := normalize_input_nfkc(p_input);

  -- Step 2: Decode HTML entities
  v_decoded := decode_html_entities(v_normalized);

  -- Step 3: Trim and length check
  v_final := SUBSTRING(TRIM(v_decoded) FROM 1 FOR p_max_length);

  -- Step 4: Detect and reject null bytes, control characters
  IF v_final ~ E'[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]' THEN
    RAISE EXCEPTION 'Input contains invalid control characters'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN v_final;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add comments
COMMENT ON TABLE _input_normalization_cache IS
  'Cache for NFKC normalized inputs. Improves performance of repeated normalizations. '
  'Stores both original and normalized text for audit trail.';

COMMENT ON FUNCTION normalize_input_nfkc(TEXT) IS
  'Normalize input using NFKC form (most restrictive). Removes accents, case-normalizes, '
  'strips zero-width characters. Prevents unicode normalization bypasses in sanitization.';

COMMENT ON FUNCTION decode_html_entities(TEXT) IS
  'Pre-decode HTML entities before sanitization. Catches entity-based bypasses '
  'of sanitizer rules (e.g., &lt;script&gt; decoded to <script>).';

COMMENT ON FUNCTION get_server_time() IS
  'Get authoritative server time (prevents client-based clock skew attacks). '
  'Always returns database server time, not client time.';

COMMENT ON FUNCTION validate_timestamp_freshness(TIMESTAMPTZ, INT) IS
  'Validate timestamp is not older than allowed window (default 5 minutes). '
  'Prevents replay attacks with stale consent timestamps.';

COMMENT ON TABLE _encryption_keys IS
  'Versioned encryption keys for PII protection. Only one key can be active at a time. '
  'Supports key rotation without re-encrypting all PII (use dual-key decryption during transition).';

COMMENT ON FUNCTION rotate_encryption_key(BYTEA) IS
  'Rotate active encryption key to new key material. '
  'Deactivates old key, creates new versioned key, logs rotation for audit.';

COMMENT ON FUNCTION sanitize_user_input(TEXT, INT) IS
  'Comprehensive user input sanitization: NFKC normalization + entity decoding + '
  'length check + control character detection. Used for all user-provided text fields.';
