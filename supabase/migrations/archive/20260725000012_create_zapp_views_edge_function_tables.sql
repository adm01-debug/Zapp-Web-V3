-- Migration: Create zapp VIEW proxies for tables used by Edge Functions (BUG-B1, BUG-B2)
--
-- Edge functions use createZappAdminClient() / createZappClient() which hardcode
-- db.schema='zapp'. Tables accessed via .from() must exist in the zapp schema
-- (physical table or VIEW proxy) or PostgREST returns PGRST205.
--
-- BUG-B1 — zapp.evolution_messages missing:
--   The physical root table evo.evolution_messages (partitioned, 25 partitions)
--   has no VIEW proxy in zapp. Affected edge functions:
--     evolution-chatbot/index.ts:63
--     evolution-followup/index.ts:67
--     cleanup-storage-orphans/index.ts:57
--     e2e-webhook-fixture/index.ts:310
--
-- BUG-B2 — zapp.contact_notes missing (defensive):
--   public.contact_notes exists physically; no tracked migration creates or moves
--   it to zapp. Migration 20260702181000 creates an INDEX on zapp.contact_notes
--   (implies it may exist untracked on production). Affected edge functions:
--     ai-router/index.ts:3369
--     voice-copilot-action/index.ts:189
--     _shared/evolution-sync-actions.ts:230,250
--   Guard: DO block skips if zapp.contact_notes already exists.
--
-- All DDL is idempotent.

-- ── 1. zapp.evolution_messages → evo.evolution_messages ──────────────────────
-- evo.evolution_messages is a partitioned root table (relkind='p').
-- A VIEW on a partitioned table is fully supported in PostgreSQL — queries
-- fan out to all partitions automatically. security_invoker=on is set so
-- the caller's permissions are checked against evo.evolution_messages.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'evolution_messages' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.evolution_messages already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'evolution_messages' AND n.nspname = 'evo'
  ) THEN
    RAISE NOTICE 'source evo.evolution_messages not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.evolution_messages
        WITH (security_invoker = on)
      AS SELECT * FROM evo.evolution_messages
    $ddl$;
    RAISE NOTICE 'created zapp.evolution_messages → evo.evolution_messages';
  END IF;
END;
$$;

REVOKE ALL ON zapp.evolution_messages FROM PUBLIC, anon;
GRANT ALL    ON zapp.evolution_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.evolution_messages TO authenticated;

-- ── 2. zapp.contact_notes → public.contact_notes (defensive) ─────────────────
-- Guards: skip if zapp.contact_notes already exists (may have been created
-- untracked on production). Only creates VIEW if source is found in public.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'contact_notes' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.contact_notes already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'contact_notes' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.contact_notes not found in public — skipping (may be in zapp already)';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.contact_notes
        WITH (security_invoker = on)
      AS SELECT * FROM public.contact_notes
    $ddl$;
    RAISE NOTICE 'created zapp.contact_notes → public.contact_notes';
  END IF;
END;
$$;

REVOKE ALL ON zapp.contact_notes FROM PUBLIC, anon;
GRANT ALL    ON zapp.contact_notes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.contact_notes TO authenticated;
