-- Add external_message_id TEXT to evolution_sentiment_analysis
--
-- Evolution API message IDs (e.g. "3EB0C767D360A23D02C3") are NOT UUIDs.
-- The edge function uses toUuid() to null-guard the message_id UUID column,
-- which discards the original ID. This column preserves it for traceability.
--
-- The column is added to whichever schema the table was created in
-- (evo if it pre-existed as a physical table, zapp otherwise — see 000007).

DO $$
DECLARE
  v_schema TEXT;
BEGIN
  -- Detect whether the physical table is in evo or zapp (same logic as 000007)
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_sentiment_analysis'
      AND c.relkind = 'r'
  ) THEN
    v_schema := 'evo';
  ELSE
    v_schema := 'zapp';
  END IF;

  -- Add column only if it doesn't exist yet
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema
      AND table_name   = 'evolution_sentiment_analysis'
      AND column_name  = 'external_message_id'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.evolution_sentiment_analysis ADD COLUMN external_message_id TEXT',
      v_schema
    );
    RAISE NOTICE 'Added external_message_id to %.evolution_sentiment_analysis', v_schema;
  ELSE
    RAISE NOTICE 'external_message_id already exists on %.evolution_sentiment_analysis — skipped', v_schema;
  END IF;
END $$;
