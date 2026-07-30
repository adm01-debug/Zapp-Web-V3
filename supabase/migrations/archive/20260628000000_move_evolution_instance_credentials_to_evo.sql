-- ============================================================
-- Migration: 20260628000000_move_evolution_instance_credentials_to_evo
-- Purpose  : Replay the manual schema move of evolution_instance_credentials
--            from public → evo that occurred between 2026-06-27 and 2026-07-05
--            in production. Also adds columns that were present in production
--            but missing from earlier CREATE TABLE migrations.
-- Idempotent: YES (IF NOT EXISTS / IF EXISTS guards throughout)
-- ============================================================

-- Step 1: Add missing columns to public.evolution_instance_credentials
-- (these were added manually in production before the schema move)
ALTER TABLE public.evolution_instance_credentials
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS online_instances INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_instances INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS connection_id UUID,
  ADD COLUMN IF NOT EXISTS instance_token TEXT,
  ADD COLUMN IF NOT EXISTS webhook_url TEXT;

-- Step 2: Move the table from public to evo (if still in public as a base table)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'evolution_instance_credentials' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_instance_credentials' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.evolution_instance_credentials SET SCHEMA evo';
  END IF;
END $$;

-- Step 3: Create a public proxy view so existing policies/revokes on
-- public.evolution_instance_credentials continue to work until
-- migration 20260716200500 replaces this view with a narrower safe-view.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_instance_credentials'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'evolution_instance_credentials' AND c.relkind = 'v'
  ) THEN
    EXECUTE $v$
      CREATE VIEW public.evolution_instance_credentials
        WITH (security_invoker = on)
      AS SELECT * FROM evo.evolution_instance_credentials
    $v$;
  END IF;
END $$;
