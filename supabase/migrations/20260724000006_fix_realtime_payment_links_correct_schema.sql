-- Fix: Add financeiro.payment_links and email_app.email_accounts to supabase_realtime.
--
-- Context: Migration 20260724000004 contained two bugs:
--   (a) Tried to add zapp.payment_links (a VIEW proxy) instead of the physical table
--       financeiro.payment_links. Views cannot emit WAL events; adding them to the
--       publication is a no-op and the migration would fail when applying.
--   (b) The verification DO block declared `t TEXT` (scalar) but used
--       `FOREACH t SLICE 1 IN ARRAY pairs` which requires TEXT[] — causing the
--       entire migration transaction to rollback, leaving neither table in the publication.
--
-- This migration supersedes 20260724000004:
--   - Adds financeiro.payment_links (physical table; used by PaymentLinksView.tsx)
--   - Re-adds email_app.email_accounts (idempotent in case 20260724000004 rolled back)
--   - Correct verification block with t TEXT[]
--
-- Physical table mapping (from docs/cutover/2026-07-15_schema_audit.md):
--   public.payment_links (VIEW) → financeiro.payment_links (physical)
--   public.email_accounts (VIEW) → email_app.email_accounts (physical)

DO $$
DECLARE
  t         TEXT[];
  v_schema  TEXT;
  v_table   TEXT;
  targets   TEXT[][] := ARRAY[
    ARRAY['financeiro', 'payment_links'],
    ARRAY['email_app',  'email_accounts']
  ];
BEGIN
  FOREACH t SLICE 1 IN ARRAY targets
  LOOP
    v_schema := t[1];
    v_table  := t[2];

    -- Skip if already in publication
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname    = 'supabase_realtime'
        AND schemaname = v_schema
        AND tablename  = v_table
    ) THEN
      RAISE NOTICE 'SKIP %.% — already in supabase_realtime', v_schema, v_table;
      CONTINUE;
    END IF;

    -- Skip if the physical table does not exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname  = v_schema
        AND c.relname  = v_table
        AND c.relkind IN ('r', 'p')
    ) THEN
      RAISE NOTICE 'SKIP %.% — table does not exist', v_schema, v_table;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I',
      v_schema, v_table
    );
    RAISE NOTICE 'ADDED %.% to supabase_realtime', v_schema, v_table;
  END LOOP;
END $$;

-- Verification
DO $$
DECLARE
  missing  TEXT[] := ARRAY[]::TEXT[];
  t        TEXT[];
  targets  TEXT[][] := ARRAY[
    ARRAY['financeiro', 'payment_links'],
    ARRAY['email_app',  'email_accounts']
  ];
BEGIN
  FOREACH t SLICE 1 IN ARRAY targets
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = t[1] AND c.relname = t[2] AND c.relkind IN ('r', 'p')
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname    = 'supabase_realtime'
        AND schemaname = t[1]
        AND tablename  = t[2]
    ) THEN
      missing := missing || (t[1] || '.' || t[2]);
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: tables exist but not in supabase_realtime: %',
      array_to_string(missing, ', ');
  END IF;

  RAISE NOTICE 'OK: financeiro.payment_links and email_app.email_accounts verified in supabase_realtime';
END $$;
