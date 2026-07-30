-- ============================================================
-- Migration: 20260630000000_move_tables_to_zapp_and_evo
-- Purpose  : Replay the manual schema moves that occurred in production
--            before 2026-07-01. Migration 20260701120000 does
--            ALTER TABLE zapp.instance_registry, zapp.conversation_transfers,
--            zapp.transfer_comments, and evo.evolution_health_logs —
--            all requiring these tables to already be in their target schemas.
-- Idempotent: YES (IF NOT EXISTS / IF EXISTS guards throughout)
-- ============================================================

-- Step 1: Move public.instance_registry → zapp
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'instance_registry' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'instance_registry' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.instance_registry SET SCHEMA zapp';
  END IF;
END $$;

-- Step 2: Create public proxy view for instance_registry
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'instance_registry' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'instance_registry' AND c.relkind = 'v'
  ) THEN
    EXECUTE $v$
      CREATE VIEW public.instance_registry
        WITH (security_invoker = on)
      AS SELECT * FROM zapp.instance_registry
    $v$;
  END IF;
END $$;

-- Step 3: Move public.conversation_transfers → zapp
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'conversation_transfers' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'conversation_transfers' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.conversation_transfers SET SCHEMA zapp';
  END IF;
END $$;

-- Step 4: Create public proxy view for conversation_transfers
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'conversation_transfers' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'conversation_transfers' AND c.relkind = 'v'
  ) THEN
    EXECUTE $v$
      CREATE VIEW public.conversation_transfers
        WITH (security_invoker = on)
      AS SELECT * FROM zapp.conversation_transfers
    $v$;
  END IF;
END $$;

-- Step 5: Move public.transfer_comments → zapp
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'transfer_comments' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'transfer_comments' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.transfer_comments SET SCHEMA zapp';
  END IF;
END $$;

-- Step 6: Create public proxy view for transfer_comments
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'transfer_comments' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'transfer_comments' AND c.relkind = 'v'
  ) THEN
    EXECUTE $v$
      CREATE VIEW public.transfer_comments
        WITH (security_invoker = on)
      AS SELECT * FROM zapp.transfer_comments
    $v$;
  END IF;
END $$;

-- Step 7: Move public.evolution_health_logs → evo
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'evolution_health_logs' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_health_logs' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.evolution_health_logs SET SCHEMA evo';
  END IF;
END $$;

-- Step 8: Create public proxy view for evolution_health_logs
-- (20260701120000 will later CREATE OR REPLACE this view with specific columns)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_health_logs'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'evolution_health_logs' AND c.relkind = 'v'
  ) THEN
    EXECUTE $v$
      CREATE VIEW public.evolution_health_logs
        WITH (security_invoker = on)
      AS SELECT * FROM evo.evolution_health_logs
    $v$;
  END IF;
END $$;
