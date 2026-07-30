-- Addresses Codex review findings from PR #499.
--
-- Fix 1 (P2 — Realtime old payload): Set REPLICA IDENTITY FULL on
--   zapp.whatsapp_connections so UPDATE events expose old.status to Realtime
--   subscribers. Fixes useEvolutionAutoReconnect.ts (checks
--   oldConnection.status === 'connected') and useConnectionsRealtime.ts
--   (avoids treating every update as a fresh connection).
--   Migration 000005 was already applied before this was added to it, so
--   this migration applies the state change on live instances.
--
-- Fix 2 (P1 — sentiment/index.ts): Edge function fix (code-only, no DB change).
--   Contact and conversation lookups now filter by instance_name when provided,
--   preventing cross-instance matches when the same remote_jid exists on
--   multiple WhatsApp connections. Deployed separately via edge function update.
--
-- Fix 3 (P1 — 000007 index ordering): Migration 000007 now guards instance_name
--   ADD COLUMN before creating idx_esa_instance_name; safe on live because
--   000010 already added the column. No additional DB change required here.
--
-- Fix 4 (P2 — evolution_deals trigger duplicate): Migration 000008 now checks
--   BOTH trigger names (trg_* and set_*) before creating the updated_at trigger.
--   No additional DB change required on live (trigger already exists).
--
-- All changes in this migration are idempotent.

-- ─── Fix 1: REPLICA IDENTITY FULL on whatsapp_connections ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whatsapp_connections' AND n.nspname = 'zapp'
      AND c.relkind = 'r'
      AND c.relreplident = 'f'   -- 'f' = FULL already set
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'whatsapp_connections' AND n.nspname = 'zapp'
        AND c.relkind = 'r'
    ) THEN
      ALTER TABLE zapp.whatsapp_connections REPLICA IDENTITY FULL;
      RAISE NOTICE 'SET REPLICA IDENTITY FULL on zapp.whatsapp_connections';
    ELSE
      RAISE NOTICE 'SKIP — zapp.whatsapp_connections not found';
    END IF;
  ELSE
    RAISE NOTICE 'SKIP — zapp.whatsapp_connections already has REPLICA IDENTITY FULL';
  END IF;
END $$;
