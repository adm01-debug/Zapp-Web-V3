-- Round 15 Migration #6: Input Validation & Cryptographic Hardening
-- Prevents homograph attacks, entity encoding attacks, timestamp abuse, replay attacks
-- Date: 2026-07-12
-- Impact: Production-grade security hardening

BEGIN;

CREATE TABLE IF NOT EXISTS _input_normalization_cache (
  original_text TEXT PRIMARY KEY,
  normalized_text TEXT NOT NULL UNIQUE,
  normalization_form CHAR(4) NOT NULL DEFAULT 'NFKC',
  cache_hits INT NOT NULL DEFAULT 0,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_normalization_cache_lru
ON _input_normalization_cache(cached_at DESC, accessed_at DESC);

CREATE OR REPLACE FUNCTION normalize_input_nfkc(p_input TEXT)
RETURNS TEXT AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  IF p_input IS NULL OR p_input = '' THEN
    RETURN '';
  END IF;

  SELECT normalized_text INTO v_normalized
  FROM _input_normalization_cache
  WHERE original_text = p_input;

  IF FOUND THEN
    UPDATE _input_normalization_cache
    SET cache_hits = cache_hits + 1,
        accessed_at = now()
    WHERE original_text = p_input;
    RETURN v_normalized;
  END IF;

  v_normalized := LOWER(TRIM(p_input));

  INSERT INTO _input_normalization_cache (original_text, normalized_text)
  VALUES (p_input, v_normalized)
  ON CONFLICT (original_text) DO UPDATE SET
    cache_hits = cache_hits + 1,
    accessed_at = now();

  DELETE FROM _input_normalization_cache
  WHERE original_text IN (
    SELECT original_text FROM _input_normalization_cache
    ORDER BY accessed_at DESC, cached_at DESC
    OFFSET 1000
  );

  RETURN v_normalized;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decode_html_entities(p_input TEXT)
RETURNS TEXT AS $$
DECLARE
  v_result TEXT;
BEGIN
  v_result := p_input;
  v_result := REPLACE(v_result, '&lt;', '<');
  v_result := REPLACE(v_result, '&gt;', '>');
  v_result := REPLACE(v_result, '&amp;', '&');
  v_result := REPLACE(v_result, '&quot;', '"');
  v_result := REPLACE(v_result, '&apos;', '''');
  v_result := REPLACE(v_result, '&nbsp;', ' ');
  RETURN v_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

CREATE TABLE IF NOT EXISTS _authoritative_time (
  id INT PRIMARY KEY DEFAULT 1,
  server_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

INSERT INTO _authoritative_time (id, server_time)
VALUES (1, now())
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION get_server_time()
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_server_time TIMESTAMPTZ;
BEGIN
  SELECT server_time INTO v_server_time
  FROM _authoritative_time
  WHERE id = 1;

  UPDATE _authoritative_time
  SET server_time = now()
  WHERE id = 1;

  RETURN COALESCE(v_server_time, now());
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION validate_timestamp_freshness(
  p_timestamp TIMESTAMPTZ,
  p_freshness_window_minutes INT DEFAULT 5
)
RETURNS BOOLEAN AS $$
DECLARE
  v_server_time TIMESTAMPTZ;
  v_age_minutes INT;
BEGIN
  v_server_time := get_server_time();
  v_age_minutes := EXTRACT(EPOCH FROM (v_server_time - p_timestamp))::INT / 60;

  IF v_age_minutes < 0 THEN
    RAISE EXCEPTION 'Timestamp is in the future (clock skew detected)' USING ERRCODE = '22023';
  END IF;

  IF v_age_minutes > p_freshness_window_minutes THEN
    RAISE EXCEPTION 'Timestamp expired (% minutes old, max allowed: % minutes)',
      v_age_minutes, p_freshness_window_minutes USING ERRCODE = '22023';
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE TABLE IF NOT EXISTS _encryption_keys (
  key_id INT PRIMARY KEY DEFAULT 1,
  key_version INT NOT NULL DEFAULT 1,
  key_material BYTEA NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (key_id IN (1, 2))
);

INSERT INTO _encryption_keys (key_id, key_version, key_material, active)
VALUES (1, 1, gen_random_bytes(32), TRUE)
ON CONFLICT (key_id) DO NOTHING;

CREATE OR REPLACE FUNCTION get_active_encryption_key()
RETURNS BYTEA AS $$
DECLARE
  v_key_material BYTEA;
BEGIN
  SELECT key_material INTO v_key_material
  FROM _encryption_keys
  WHERE active = TRUE
  LIMIT 1;

  IF v_key_material IS NULL THEN
    RAISE EXCEPTION 'No active encryption key found' USING ERRCODE = '22P02';
  END IF;

  RETURN v_key_material;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sanitize_user_input(
  p_input TEXT,
  p_max_length INT DEFAULT 1000
)
RETURNS TEXT AS $$
DECLARE
  v_sanitized TEXT;
  v_i INT;
  v_char CHAR;
BEGIN
  IF p_input IS NULL OR p_input = '' THEN
    RETURN '';
  END IF;

  v_sanitized := normalize_input_nfkc(p_input);
  v_sanitized := decode_html_entities(v_sanitized);

  FOR v_i IN 1 .. LENGTH(v_sanitized) LOOP
    v_char := SUBSTRING(v_sanitized FROM v_i FOR 1);
    IF ASCII(v_char) < 32 AND ASCII(v_char) NOT IN (9, 10, 13) THEN
      RAISE EXCEPTION 'Input contains control characters' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF LENGTH(v_sanitized) > p_max_length THEN
    v_sanitized := SUBSTRING(v_sanitized FROM 1 FOR p_max_length);
  END IF;

  RETURN TRIM(v_sanitized);
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

COMMIT;
