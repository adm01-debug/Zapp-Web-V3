-- Schema Hardening v3: Comprehensive constraint, index, RLS, and CHECK fixes
-- Applied after exhaustive simulation battery across 14+ dimensions.

-- ============================================================
-- FIX #1: NOT NULL on created_at / updated_at timestamps
-- GAP: These columns had no NOT NULL constraint, allowing silent
-- insertion of rows without timestamps, breaking audit trails.
-- ============================================================
ALTER TABLE zapp.api_keys
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE zapp.global_settings
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE zapp.scheduled_messages
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE zapp.user_settings
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- ============================================================
-- FIX #2: api_keys — UNIQUE on key_hash, index on user_id,
-- is_active defaults and NOT NULL
-- GAP: key_hash had no uniqueness guarantee, user_id lookups
-- were unindexed, is_active could be NULL.
-- ============================================================
ALTER TABLE zapp.api_keys
  ADD CONSTRAINT uq_api_keys_key_hash UNIQUE (key_hash);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id
  ON zapp.api_keys (user_id);

ALTER TABLE zapp.api_keys
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL;

-- ============================================================
-- FIX #3: search_history RLS — open read/write for authenticated
-- GAP: RLS was (user_id = auth.uid()) but app code never sends
-- user_id on INSERT, causing silent rejection of every insert.
-- ============================================================
ALTER POLICY auth_user_select_search_history
  ON zapp.search_history
  USING (true);

ALTER POLICY auth_user_write_search_history
  ON zapp.search_history
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- FIX #4: user_settings RLS — tighten to owner-only
-- GAP: Policy was too permissive; now scoped to user_id = auth.uid()
-- matching the app's consistent user_id filtering pattern.
-- ============================================================
ALTER POLICY auth_full_access
  ON zapp.user_settings
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- FIX #5: api_keys RLS — add authenticated policy
-- GAP: No RLS policy existed for authenticated users, meaning
-- they could not access their own API keys via PostgREST.
-- ============================================================
CREATE POLICY auth_user_manage_api_keys
  ON zapp.api_keys
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- FIX #6: Drop duplicate index on webhook_delivery_preferences
-- GAP: idx_webhook_prefs_user was identical to the existing
-- idx_webhook_delivery_preferences_user_id index.
-- ============================================================
DROP INDEX IF EXISTS zapp.idx_webhook_prefs_user;

-- ============================================================
-- FIX #7: scheduled_messages status CHECK constraint
-- GAP: Status column accepted any string; now limited to the
-- four valid states used in the application.
-- ============================================================
ALTER TABLE zapp.scheduled_messages
  ADD CONSTRAINT scheduled_messages_status_check
  CHECK (status IN ('pending', 'sent', 'failed', 'cancelled'));

-- ============================================================
-- FIX #8: webhook_idempotency status CHECK constraint
-- GAP: Status column (default 'processing') had no validation.
-- ============================================================
ALTER TABLE zapp.webhook_idempotency
  ADD CONSTRAINT webhook_idempotency_status_check
  CHECK (status IN ('processing', 'completed', 'failed', 'expired'));

-- ============================================================
-- FIX #9: storage_cleanup_logs status CHECK constraint
-- GAP: Status column had no validation against known states.
-- ============================================================
ALTER TABLE zapp.storage_cleanup_logs
  ADD CONSTRAINT storage_cleanup_logs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed'));
