-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260720000006_fix_settings_realtime_publication.sql
-- Purpose  : Add user_settings and workspace_settings to supabase_realtime
--
-- Bug: Both tables are physical (relkind='r') in the zapp schema and are
-- subscribed to via Realtime in settingsRepository.ts for live settings sync
-- across browser tabs/devices. Neither table is in supabase_realtime, so
-- all Realtime subscription callbacks are silent no-ops — settings changes
-- made in one tab are never propagated to other open tabs until page refresh.
--
-- Fix: Add both tables to the supabase_realtime publication.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE zapp.user_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE zapp.workspace_settings;

-- ── VERIFICATION ─────────────────────────────────────────────────────────────
DO $$
DECLARE v_user int; v_workspace int;
BEGIN
  SELECT count(*) INTO v_user
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'zapp' AND tablename = 'user_settings';

  SELECT count(*) INTO v_workspace
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'zapp' AND tablename = 'workspace_settings';

  IF v_user = 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: zapp.user_settings not found in supabase_realtime';
  END IF;
  IF v_workspace = 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: zapp.workspace_settings not found in supabase_realtime';
  END IF;

  RAISE NOTICE 'OK: zapp.user_settings and zapp.workspace_settings are now in supabase_realtime';
END;
$$;
