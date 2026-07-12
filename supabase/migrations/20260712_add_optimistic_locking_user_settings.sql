/**
 * CRITICAL SECURITY MIGRATION: Optimistic Locking for User Settings
 *
 * Fixes race condition (P0-15) where concurrent user settings updates cause data loss.
 * Previous behavior: Last write wins, earlier updates are silently discarded.
 * New behavior: Updates fail if record was modified since read, client retries.
 *
 * Execution time: ~100ms
 * Rollback: Simple schema change (can revert with ALTER TABLE DROP COLUMN)
 */

-- =====================================================
-- Add version column for optimistic locking
-- =====================================================
-- Version starts at 1, increments on each successful update.
-- UPDATE queries check "WHERE version = ?" to detect conflicts.
-- If update affects 0 rows, version mismatch = concurrent modification.

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- =====================================================
-- Create function for version-aware upserts
-- =====================================================
-- This function implements optimistic locking:
-- 1. If INSERT: version starts at 1
-- 2. If UPDATE: version must match, then increment
-- Returns: (success BOOLEAN, version INT)
-- Client retries with exponential backoff if success=false

CREATE OR REPLACE FUNCTION public.upsert_user_settings(
  _user_id UUID,
  _data JSONB,
  _expected_version INT DEFAULT 1
)
RETURNS TABLE(success BOOLEAN, version INT, error_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_version INT;
BEGIN
  -- Attempt to update if record exists
  UPDATE public.user_settings
  SET
    business_hours_enabled = (_data->>'business_hours_enabled')::BOOLEAN,
    business_hours_start = _data->>'business_hours_start',
    business_hours_end = _data->>'business_hours_end',
    work_days = string_to_array(_data->>'work_days', ',')::INT[],
    welcome_message = _data->>'welcome_message',
    away_message = _data->>'away_message',
    closing_message = _data->>'closing_message',
    auto_assignment_enabled = (_data->>'auto_assignment_enabled')::BOOLEAN,
    auto_assignment_method = _data->>'auto_assignment_method',
    inactivity_timeout = (_data->>'inactivity_timeout')::INT,
    auto_transcription_enabled = (_data->>'auto_transcription_enabled')::BOOLEAN,
    sound_enabled = (_data->>'sound_enabled')::BOOLEAN,
    browser_notifications_enabled = (_data->>'browser_notifications_enabled')::BOOLEAN,
    quiet_hours_enabled = (_data->>'quiet_hours_enabled')::BOOLEAN,
    quiet_hours_start = _data->>'quiet_hours_start',
    quiet_hours_end = _data->>'quiet_hours_end',
    theme = _data->>'theme',
    language = _data->>'language',
    compact_mode = (_data->>'compact_mode')::BOOLEAN,
    tts_voice_id = _data->>'tts_voice_id',
    tts_speed = (_data->>'tts_speed')::FLOAT,
    simulation_mode_enabled = (_data->>'simulation_mode_enabled')::BOOLEAN,
    global_sla_warning_minutes = (_data->>'global_sla_warning_minutes')::INT,
    global_sla_critical_minutes = (_data->>'global_sla_critical_minutes')::INT,
    global_sla_notification_message = _data->>'global_sla_notification_message',
    updated_at = NOW(),
    version = version + 1
  WHERE
    user_id = _user_id
    AND version = _expected_version
  RETURNING version INTO _current_version;

  -- If update succeeded (1 row affected)
  IF FOUND THEN
    RETURN QUERY SELECT TRUE, _current_version, NULL::TEXT;
    RETURN;
  END IF;

  -- Update failed - check if record exists at all
  SELECT version INTO _current_version FROM public.user_settings WHERE user_id = _user_id;

  IF _current_version IS NOT NULL THEN
    -- Record exists but version mismatch: concurrent modification detected
    RETURN QUERY SELECT FALSE, _current_version, 'CONFLICT'::TEXT;
    RETURN;
  END IF;

  -- Record doesn't exist - insert new
  INSERT INTO public.user_settings (
    user_id,
    business_hours_enabled,
    business_hours_start,
    business_hours_end,
    work_days,
    welcome_message,
    away_message,
    closing_message,
    auto_assignment_enabled,
    auto_assignment_method,
    inactivity_timeout,
    auto_transcription_enabled,
    sound_enabled,
    browser_notifications_enabled,
    quiet_hours_enabled,
    quiet_hours_start,
    quiet_hours_end,
    theme,
    language,
    compact_mode,
    tts_voice_id,
    tts_speed,
    simulation_mode_enabled,
    global_sla_warning_minutes,
    global_sla_critical_minutes,
    global_sla_notification_message,
    version
  ) VALUES (
    _user_id,
    (_data->>'business_hours_enabled')::BOOLEAN,
    _data->>'business_hours_start',
    _data->>'business_hours_end',
    string_to_array(_data->>'work_days', ',')::INT[],
    _data->>'welcome_message',
    _data->>'away_message',
    _data->>'closing_message',
    (_data->>'auto_assignment_enabled')::BOOLEAN,
    _data->>'auto_assignment_method',
    (_data->>'inactivity_timeout')::INT,
    (_data->>'auto_transcription_enabled')::BOOLEAN,
    (_data->>'sound_enabled')::BOOLEAN,
    (_data->>'browser_notifications_enabled')::BOOLEAN,
    (_data->>'quiet_hours_enabled')::BOOLEAN,
    _data->>'quiet_hours_start',
    _data->>'quiet_hours_end',
    _data->>'theme',
    _data->>'language',
    (_data->>'compact_mode')::BOOLEAN,
    _data->>'tts_voice_id',
    (_data->>'tts_speed')::FLOAT,
    (_data->>'simulation_mode_enabled')::BOOLEAN,
    (_data->>'global_sla_warning_minutes')::INT,
    (_data->>'global_sla_critical_minutes')::INT,
    _data->>'global_sla_notification_message',
    1
  ) ON CONFLICT (user_id) DO NOTHING;

  -- Check if insert succeeded
  SELECT version INTO _current_version FROM public.user_settings WHERE user_id = _user_id;
  
  IF _current_version IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, _current_version, NULL::TEXT;
  ELSE
    -- This shouldn't happen, but handle it gracefully
    RETURN QUERY SELECT FALSE, NULL::INT, 'UNKNOWN_ERROR'::TEXT;
  END IF;
END $$;

-- =====================================================
-- Add audit logging for version conflicts
-- =====================================================
-- Helps identify patterns of concurrent updates
CREATE OR REPLACE FUNCTION public.log_version_conflict()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.version != NEW.version THEN
    INSERT INTO public.rls_audit_log (
      user_id,
      table_name,
      operation,
      details,
      created_at
    ) VALUES (
      NEW.user_id,
      'user_settings',
      'version_increment',
      jsonb_build_object(
        'old_version', OLD.version,
        'new_version', NEW.version,
        'timestamp', NOW()
      ),
      NOW()
    );
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit trigger if not exists
DROP TRIGGER IF EXISTS user_settings_version_audit ON public.user_settings;
CREATE TRIGGER user_settings_version_audit
  AFTER UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.log_version_conflict();

-- =====================================================
-- Verification Queries
-- =====================================================
-- Run these after migration to verify optimistic locking is working

DO $$
BEGIN
  -- Verify version column exists
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_settings'
      AND column_name = 'version'
  ), 'Version column not created on user_settings';

  -- Verify function exists
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'upsert_user_settings'
      AND pronamespace = 'public'::regnamespace
  ), 'upsert_user_settings function not created';

  -- Verify all existing records have version = 1
  ASSERT (
    SELECT COUNT(*) FROM public.user_settings WHERE version IS NULL OR version < 1
  ) = 0, 'Found user_settings records with invalid version';

  RAISE NOTICE 'Optimistic locking migration verified: version column exists, upsert function created, all records have valid versions';
END $$;
