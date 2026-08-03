-- M55: Fix Cubic review finding for M49 — deterministic ROW_NUMBER tiebreaker
--
-- M49's dedup step used ROW_NUMBER() OVER (...ORDER BY is_active, api_key, health_status,
-- updated_at DESC NULLS LAST) without a final tiebreaker column.
-- When two rows tie on all four criteria, PostgreSQL may keep either one non-deterministically,
-- causing production vs staging to diverge after restores.
--
-- Fix: Re-run the dedup with the same business-priority ordering but append `id` (stable
-- surrogate) as the final tiebreaker so the result is fully deterministic.
-- Guarded: only runs if evo.evolution_instance_credentials exists.

DO $$
DECLARE
  v_tbl_exists BOOLEAN;
  v_deleted    INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'evo'
       AND c.relname = 'evolution_instance_credentials'
       AND c.relkind IN ('r','p')
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M55: evo.evolution_instance_credentials not found — skipping';
    RETURN;
  END IF;

  -- Re-dedup with deterministic id tiebreaker
  DELETE FROM evo.evolution_instance_credentials
   WHERE id IN (
     SELECT id FROM (
       SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY instance_name
                ORDER BY
                  CASE WHEN is_active THEN 0 ELSE 1 END,
                  CASE WHEN api_key IS NOT NULL AND api_key != '' THEN 0 ELSE 1 END,
                  CASE health_status
                    WHEN 'healthy'  THEN 0
                    WHEN 'degraded' THEN 1
                    ELSE 2
                  END,
                  updated_at DESC NULLS LAST,
                  id                                    -- deterministic tiebreaker
              ) AS rn
         FROM evo.evolution_instance_credentials
        WHERE instance_name IS NOT NULL
     ) ranked
      WHERE rn > 1
   );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    RAISE NOTICE 'M55: % residual duplicate instance_credentials row(s) removed', v_deleted;
  ELSE
    RAISE NOTICE 'M55: no residual duplicates found — table already clean';
  END IF;
END $$;

-- Ensure the UNIQUE constraint exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class     t ON t.oid = c.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'evo'
       AND t.relname = 'evolution_instance_credentials'
       AND c.conname = 'uq_evo_instance_creds_instance_name'
  ) THEN
    ALTER TABLE evo.evolution_instance_credentials
      ADD CONSTRAINT uq_evo_instance_creds_instance_name UNIQUE (instance_name);
    RAISE NOTICE 'M55: UNIQUE constraint uq_evo_instance_creds_instance_name added';
  ELSE
    RAISE NOTICE 'M55: UNIQUE constraint already present — no action needed';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'M55: could not add UNIQUE constraint: %', SQLERRM;
END $$;
