-- ============================================================================
-- FIX REALTIME (2026-08-18) — zapp.whisper_messages + zapp.calls na publication
-- ----------------------------------------------------------------------------
-- CHANNEL_ERROR recorrente nos canais whisper-count (useRealtimeInbox.ts:285,
-- WhisperMode.tsx:103) e incoming-calls (useIncomingCallListener.ts:37):
-- o front assina postgres_changes nessas tabelas mas elas NAO estavam na
-- publication supabase_realtime -> Realtime v2 rejeita a subscription.
-- Ambas tem REPLICA IDENTITY 'd' e pubviaroot=true (verificado 2026-08-18).
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'zapp' AND tablename = 'whisper_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.whisper_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'zapp' AND tablename = 'calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.calls;
  END IF;
END $$;
