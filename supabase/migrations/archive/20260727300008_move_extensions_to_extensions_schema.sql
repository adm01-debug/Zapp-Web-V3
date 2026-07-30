-- Migration: 20260727300008_move_extensions_to_extensions_schema
-- Purpose: Move 9 extensions from public to extensions schema.
-- Risk: !!!! HIGH RISK !!!! — DO NOT APPLY WITHOUT STAGING
--       Read ADR-DB-003 before executing.
--       All function search_paths referencing pg_trgm/vector/unaccent must include `extensions`.
-- Staging required: YES — mandatory benchmark before/after for:
--   - similarity() queries (pg_trgm)
--   - vector embedding queries (vector)
--   - text search with accent removal (unaccent)
-- Rollback: ALTER EXTENSION <name> SET SCHEMA public; (for each extension)
-- Pre-requisites:
--   1. Staging with prod data snapshot
--   2. All non-qualified function references mapped (run reference audit below first)
--   3. search_path updated in all affected functions

-- ============================================================
-- REFERENCE AUDIT (run this in READ-ONLY mode before applying)
-- ============================================================
/*
-- Find all functions using pg_trgm operators/functions (non-qualified)
SELECT n.nspname, p.proname, p.prosrc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('zapp','evo','ops','public','bpm','email_app','ai','financeiro','vendas')
  AND (
       p.prosrc ILIKE '%similarity%'
    OR p.prosrc ILIKE '%word_similarity%'
    OR p.prosrc ILIKE '%gin_trgm%'
    OR p.prosrc ILIKE '%gist_trgm%'
  );

-- Find all functions using vector operators (non-qualified)
SELECT n.nspname, p.proname, p.prosrc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('zapp','evo','ops','public','ai')
  AND (
       p.prosrc ILIKE '%<=>%'
    OR p.prosrc ILIKE '%<->%'
    OR p.prosrc ILIKE '%cosine_distance%'
    OR p.prosrc ILIKE '%l2_distance%'
  );

-- Find all functions using unaccent (non-qualified)
SELECT n.nspname, p.proname, p.prosrc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('zapp','evo','ops','public')
  AND p.prosrc ILIKE '%unaccent%';
*/

-- ============================================================
-- PHASE 1: Low-risk extensions (no SQL functions in app code)
-- ============================================================
-- These extensions are only called by DBA/ops, not by app queries:

-- !!! APPLY ONLY AFTER STAGING VALIDATION !!!
-- ALTER EXTENSION amcheck       SET SCHEMA extensions;
-- ALTER EXTENSION hypopg        SET SCHEMA extensions;
-- ALTER EXTENSION pg_buffercache SET SCHEMA extensions;
-- ALTER EXTENSION index_advisor SET SCHEMA extensions;

-- ============================================================
-- PHASE 2: Medium-risk extensions
-- ============================================================
-- ALTER EXTENSION btree_gin SET SCHEMA extensions;
-- ALTER EXTENSION dblink    SET SCHEMA extensions;
-- After: update search_path in all ops functions that use dblink.

-- ============================================================
-- PHASE 3: HIGH-RISK extensions (run last, with full staging)
-- ============================================================
-- After mapping + fixing all non-qualified references:
-- ALTER EXTENSION pg_trgm  SET SCHEMA extensions;
-- ALTER EXTENSION unaccent SET SCHEMA extensions;
-- ALTER EXTENSION vector   SET SCHEMA extensions;

-- ============================================================
-- POST-MIGRATION: Update search_path in all affected functions
-- ============================================================
-- For each schema that uses pg_trgm/unaccent/vector, update its
-- function search_paths to include 'extensions':
-- Example: SET search_path = zapp, extensions, pg_catalog

-- ============================================================
-- VALIDATION QUERIES (run after each phase)
-- ============================================================
/*
-- Verify extension moved:
SELECT extname, n.nspname FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE extname IN ('pg_trgm','unaccent','vector','amcheck','hypopg',
                  'pg_buffercache','index_advisor','btree_gin','dblink');

-- Test pg_trgm still works:
SELECT similarity('hello', 'helo');

-- Test vector still works:
SELECT '[1,2,3]'::vector <=> '[1,2,4]'::vector;

-- Test unaccent still works:
SELECT unaccent('Ação Comunicação');
*/

-- This migration is intentionally left as comments/documentation only.
-- It must be filled in and executed only after staging validation.
-- Remove this notice and uncomment the ALTER EXTENSION lines when ready.

SELECT 'Migration 20260727300008 loaded as documentation. '
       'Apply Phase 1-3 sequentially after staging validation. '
       'Read ADR-DB-003 first.' AS status;
