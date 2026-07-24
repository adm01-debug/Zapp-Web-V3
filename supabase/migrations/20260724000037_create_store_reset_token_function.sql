-- Migration: create zapp.store_reset_token and isolated token table
-- Called from supabase/functions/approve-password-reset/index.ts:164
-- The reset_token column was dropped from password_reset_requests in migration
-- 20260411111454 (intentional security hardening). The approve-password-reset Edge
-- Function calls store_reset_token(p_request_id, p_token, p_expires_at) to persist
-- the Supabase Auth hashed_token in an isolated table accessible only through this
-- SECURITY DEFINER function. Without this the RPC returns PGRST202 and the entire
-- password-reset approval flow fails with HTTP 500.

-- ---------------------------------------------------------------------------
-- 1. Isolated token storage table (only reachable via SECURITY DEFINER function)
--    Physical table; never exposed to authenticated role directly.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zapp.password_reset_tokens (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id     UUID        NOT NULL,
  hashed_token   TEXT        NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure uniqueness per request (upsert-safe)
CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_request_id_idx
  ON zapp.password_reset_tokens (request_id);

-- TTL index for cleanup crons
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx
  ON zapp.password_reset_tokens (expires_at);

-- Enable RLS; no direct grants — only accessible via SECURITY DEFINER function.
ALTER TABLE zapp.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Deny all direct access (service_role bypasses RLS, which is fine for admin tasks)
REVOKE ALL ON TABLE zapp.password_reset_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE zapp.password_reset_tokens TO service_role;

-- ---------------------------------------------------------------------------
-- 2. zapp.store_reset_token(UUID, TEXT, TIMESTAMPTZ) — SECURITY DEFINER
--    Upserts the hashed_token for a given request_id.
--    Called exclusively by the approve-password-reset Edge Function using the
--    service-role admin client (createZappAdminClient).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.store_reset_token(
  p_request_id  UUID,
  p_token       TEXT,
  p_expires_at  TIMESTAMPTZ
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  INSERT INTO zapp.password_reset_tokens (request_id, hashed_token, expires_at)
  VALUES (p_request_id, p_token, p_expires_at)
  ON CONFLICT (request_id) DO UPDATE
    SET hashed_token = EXCLUDED.hashed_token,
        expires_at   = EXCLUDED.expires_at;
$$;

-- Only service_role (used by admin client) can call this
REVOKE EXECUTE ON FUNCTION zapp.store_reset_token(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION zapp.store_reset_token(UUID, TEXT, TIMESTAMPTZ) TO service_role;
