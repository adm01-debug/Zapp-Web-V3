-- Migration: Block internal kong:8000 / localhost URLs at DB level
-- Context: Evolution API saved profile_picture_url as http://kong:8000/... (internal
-- Docker hostname). The backfill was applied via psql directly in production on 2026-07-11
-- (outside Supabase CLI tracking). This migration adds a CHECK constraint so that new
-- INSERT/UPDATE operations cannot store internal hostnames in URL columns.
--
-- The frontend already sanitizes via src/lib/mediaUrl.ts:sanitizeMediaUrl().
-- This is the backend defense-in-depth layer.

-- ============================================================
-- Function: validate_public_url (reusable)
-- ============================================================
CREATE OR REPLACE FUNCTION zapp.is_public_url(url TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = zapp
AS $$
BEGIN
  IF url IS NULL OR url = '' THEN
    RETURN TRUE; -- NULL/empty is OK (field optional)
  END IF;

  -- Block internal Docker/dev hostnames
  IF url ~* '^https?://(kong|localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?' THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION zapp.is_public_url IS
  'Returns FALSE for internal Docker/dev URLs (kong:8000, localhost:*). Used in CHECK constraints to prevent internal hostnames from being persisted to the DB.';

-- ============================================================
-- Add CHECK constraint to evolution_contacts.profile_pic_url
-- ============================================================
DO $$
BEGIN
  -- Check if column exists before adding constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'evo'
      AND table_name = 'evolution_contacts'
      AND column_name = 'profile_pic_url'
  ) THEN
    ALTER TABLE evo.evolution_contacts
      DROP CONSTRAINT IF EXISTS chk_profile_pic_url_public,
      ADD CONSTRAINT chk_profile_pic_url_public
        CHECK (zapp.is_public_url(profile_pic_url));
    RAISE NOTICE 'CHECK constraint added to evo.evolution_contacts.profile_pic_url';
  ELSE
    RAISE NOTICE 'Column evo.evolution_contacts.profile_pic_url not found — skipping constraint';
  END IF;
END $$;

-- ============================================================
-- Add CHECK constraint to zapp.contatos.profile_picture_url
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp'
      AND table_name = 'contatos'
      AND column_name = 'profile_picture_url'
  ) THEN
    ALTER TABLE zapp.contatos
      DROP CONSTRAINT IF EXISTS chk_contatos_profile_pic_url_public,
      ADD CONSTRAINT chk_contatos_profile_pic_url_public
        CHECK (zapp.is_public_url(profile_picture_url));
    RAISE NOTICE 'CHECK constraint added to zapp.contatos.profile_picture_url';
  ELSE
    RAISE NOTICE 'Column zapp.contatos.profile_picture_url not found — skipping constraint';
  END IF;
END $$;

-- ============================================================
-- Backfill: replace any remaining kong:8000 / localhost URLs
-- (idempotent — safe to re-run; no-op if already backfilled)
-- ============================================================
DO $$
DECLARE
  updated_contacts INTEGER := 0;
  updated_evo INTEGER := 0;
BEGIN
  -- zapp.contatos
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp'
      AND table_name = 'contatos'
      AND column_name = 'profile_picture_url'
  ) THEN
    UPDATE zapp.contatos
    SET profile_picture_url = regexp_replace(
      profile_picture_url,
      '^https?://(kong|localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?',
      'https://supabase.atomicabr.com.br',
      'i'
    )
    WHERE profile_picture_url ~* '^https?://(kong|localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?';
    GET DIAGNOSTICS updated_contacts = ROW_COUNT;
  END IF;

  -- evo.evolution_contacts
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'evo'
      AND table_name = 'evolution_contacts'
      AND column_name = 'profile_pic_url'
  ) THEN
    UPDATE evo.evolution_contacts
    SET profile_pic_url = regexp_replace(
      profile_pic_url,
      '^https?://(kong|localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?',
      'https://supabase.atomicabr.com.br',
      'i'
    )
    WHERE profile_pic_url ~* '^https?://(kong|localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?';
    GET DIAGNOSTICS updated_evo = ROW_COUNT;
  END IF;

  RAISE NOTICE 'Backfill complete: % zapp.contatos rows, % evo.evolution_contacts rows updated',
    updated_contacts, updated_evo;
END $$;
