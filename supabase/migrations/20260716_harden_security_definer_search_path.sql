-- Migration: Harden SECURITY DEFINER functions and revoke excess grants
-- Audit date: 2026-07-16
--
-- Findings addressed:
-- 1. SECURITY DEFINER functions without search_path = '' allow search_path injection
-- 2. Overly permissive grants let authenticated users write to audit/config tables
-- 3. anon granted SELECT on evolution_instances exposes WhatsApp instance metadata

-- ─── 1. Fix search_path on SECURITY DEFINER functions ───────────────────────
-- NOTE: ALTER FUNCTION does not support IF EXISTS; each ALTER is guarded with
-- a nested BEGIN...EXCEPTION...END block instead.
DO $harden_sp$ BEGIN
  -- From 20260712203000_medium_fix_03_audit_log_partitioning.sql
  BEGIN
    ALTER FUNCTION public.create_partitions_if_not_exists() SET search_path = '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP create_partitions_if_not_exists SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_archive_old_audit_partitions(integer) SET search_path = '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_archive_old_audit_partitions SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_migrate_audit_logs_to_partitioned() SET search_path = '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_migrate_audit_logs_to_partitioned SET search_path: %', SQLERRM;
  END;
  -- From 20260712204000_low_fix_01_final_optimizations_compliance.sql
  BEGIN
    ALTER FUNCTION public.fn_encode_secret(text, character varying) SET search_path = '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_encode_secret SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_decode_secret(text) SET search_path = '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_decode_secret SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_validate_production_excellence() SET search_path = '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_validate_production_excellence SET search_path: %', SQLERRM;
  END;
  -- From 20260713_webhook_idempotency.sql
  BEGIN
    ALTER FUNCTION public.cleanup_expired_webhook_idempotency() SET search_path = '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP cleanup_expired_webhook_idempotency SET search_path: %', SQLERRM;
  END;
  -- From 20260712_add_optimistic_locking_user_settings.sql
  BEGIN
    ALTER FUNCTION public.upsert_user_settings(uuid, jsonb, integer) SET search_path = '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP upsert_user_settings SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.log_version_conflict() SET search_path = '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP log_version_conflict SET search_path: %', SQLERRM;
  END;
  -- From 20260712205138 and 20260712_p3 migrations
  BEGIN
    ALTER FUNCTION public.rpc_dlq_log_item_action(uuid, text, text) SET search_path = '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_dlq_log_item_action SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.rpc_dlq_bulk_retry_now(uuid[], text) SET search_path = '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_dlq_bulk_retry_now SET search_path: %', SQLERRM;
  END;
END $harden_sp$;

-- ─── 2. Revoke DDL/admin functions from all roles ───────────────────────────
DO $harden_revoke$ BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.create_partitions_if_not_exists() FROM PUBLIC;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP REVOKE create_partitions_if_not_exists: %', SQLERRM;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.fn_archive_old_audit_partitions(integer) FROM PUBLIC;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP REVOKE fn_archive_old_audit_partitions: %', SQLERRM;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.fn_migrate_audit_logs_to_partitioned() FROM PUBLIC;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP REVOKE fn_migrate_audit_logs_to_partitioned: %', SQLERRM;
  END;
END $harden_revoke$;

-- ─── 3. Revoke authenticated write access to audit/config tables ─────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'secret_encoding_config') THEN
    REVOKE INSERT, UPDATE ON public.secret_encoding_config FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'query_audit_log') THEN
    REVOKE INSERT ON public.query_audit_log FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'data_lineage_audit') THEN
    REVOKE INSERT ON public.data_lineage_audit FROM authenticated;
  END IF;
END $$;

-- ─── 4. Revoke anon SELECT on evolution_instances ────────────────────────────
DO $evo_inst$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'zapp' AND c.relname = 'evolution_instances') THEN
    EXECUTE 'REVOKE SELECT ON zapp.evolution_instances FROM anon';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SKIP REVOKE zapp.evolution_instances: %', SQLERRM;
END $evo_inst$;
