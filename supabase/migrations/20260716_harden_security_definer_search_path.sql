-- Migration: Harden SECURITY DEFINER functions and revoke excess grants
-- Audit date: 2026-07-16
--
-- Findings addressed:
-- 1. SECURITY DEFINER functions without search_path = '' allow search_path injection
--    attacks where objects planted on the caller's search_path could shadow
--    built-ins called inside the function.
-- 2. Overly permissive grants let authenticated users write to audit/config tables
--    (undermines audit integrity) and execute DDL-level admin functions.
-- 3. anon granted SELECT on evolution_instances exposes WhatsApp instance metadata
--    to unauthenticated callers.
--
-- Fix: ALTER FUNCTION ... SET search_path = '' on every SECURITY DEFINER function,
-- then REVOKE the identified excess grants.

BEGIN;

-- ─── 1. Fix search_path on SECURITY DEFINER functions ───────────────────────
-- These functions had no search_path set, or search_path = 'public' (insufficient).
-- Setting search_path = '' forces fully-qualified names inside the function body
-- and prevents search_path injection.

-- From 20260712203000_medium_fix_03_audit_log_partitioning.sql
ALTER FUNCTION IF EXISTS public.create_partitions_if_not_exists()
  SET search_path = '';

ALTER FUNCTION IF EXISTS public.fn_archive_old_audit_partitions(integer)
  SET search_path = '';

ALTER FUNCTION IF EXISTS public.fn_migrate_audit_logs_to_partitioned()
  SET search_path = '';

-- From 20260712204000_low_fix_01_final_optimizations_compliance.sql
ALTER FUNCTION IF EXISTS public.fn_encode_secret(text, character varying)
  SET search_path = '';

ALTER FUNCTION IF EXISTS public.fn_decode_secret(text)
  SET search_path = '';

ALTER FUNCTION IF EXISTS public.fn_validate_production_excellence()
  SET search_path = '';

-- From 20260713_webhook_idempotency.sql
ALTER FUNCTION IF EXISTS public.cleanup_expired_webhook_idempotency()
  SET search_path = '';

-- From 20260712_add_optimistic_locking_user_settings.sql
-- These had SET search_path = public (insufficient — must be empty).
ALTER FUNCTION IF EXISTS public.upsert_user_settings(uuid, jsonb, integer)
  SET search_path = '';

ALTER FUNCTION IF EXISTS public.log_version_conflict()
  SET search_path = '';

-- From 20260712205138 and 20260712_p3 migrations
ALTER FUNCTION IF EXISTS public.rpc_dlq_log_item_action(uuid, text, text)
  SET search_path = '';

ALTER FUNCTION IF EXISTS public.rpc_dlq_bulk_retry_now(uuid[], text)
  SET search_path = '';

-- ─── 2. Revoke DDL/admin functions from all roles ───────────────────────────
-- Partition management and archiving are DBA-level operations; no application
-- user should be able to trigger them via PostgREST.
-- Revoking from PUBLIC covers both anon and authenticated in one statement.
REVOKE EXECUTE ON FUNCTION public.create_partitions_if_not_exists()
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.fn_archive_old_audit_partitions(integer)
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.fn_migrate_audit_logs_to_partitioned()
  FROM PUBLIC;

-- ─── 3. Revoke authenticated write access to audit/config tables ─────────────
-- These tables are audit-trail or security-configuration objects.
-- Allowing authenticated users to INSERT or UPDATE them undermines log integrity.
-- Reads remain permitted (SELECT is not revoked) so UI dashboards still work.
DO $$
BEGIN
  -- secret_encoding_config — only service_role should write
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'secret_encoding_config') THEN
    REVOKE INSERT, UPDATE ON public.secret_encoding_config FROM authenticated;
  END IF;

  -- query_audit_log — application writes via service role only
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'query_audit_log') THEN
    REVOKE INSERT ON public.query_audit_log FROM authenticated;
  END IF;

  -- data_lineage_audit — same reasoning
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'data_lineage_audit') THEN
    REVOKE INSERT ON public.data_lineage_audit FROM authenticated;
  END IF;
END $$;

-- ─── 4. Revoke anon SELECT on evolution_instances ────────────────────────────
-- evolution_instances exposes WhatsApp instance metadata (names, URLs, API keys
-- in some columns). Anonymous (unauthenticated) users have no business need for
-- this data. Authenticated users retain SELECT via the existing grant.
REVOKE SELECT ON zapp.evolution_instances FROM anon;

COMMIT;
