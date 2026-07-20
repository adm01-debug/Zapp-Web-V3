-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260720000005_fix_realtime_missing_publications.sql
-- Purpose  : Add zapp.sentiment_alerts to supabase_realtime publication
--
-- Bug: zapp.sentiment_alerts is in logflare_pub but NOT in supabase_realtime.
-- Any Realtime subscription on this table is a silent no-op (zero events).
-- Fix: Add the table to supabase_realtime so CDC events are emitted.
--
-- Note: phantom tables (goal_notifications, transcription_notifications) are
-- NOT created here — those hooks are redirected to zapp.app_notifications
-- (with client-side type filtering) in the corresponding TypeScript fix.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE zapp.sentiment_alerts;

-- ── VERIFICATION ─────────────────────────────────────────────────────────────
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'zapp'
    AND tablename = 'sentiment_alerts';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: zapp.sentiment_alerts not found in supabase_realtime';
  END IF;

  RAISE NOTICE 'OK: zapp.sentiment_alerts is now in supabase_realtime publication';
END;
$$;
