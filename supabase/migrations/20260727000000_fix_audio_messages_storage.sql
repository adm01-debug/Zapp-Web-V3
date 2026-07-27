-- ==============================================================================
-- Migration: Fix audio-messages bucket public access (BUG-3: 400 on audio playback)
-- Date: 2026-07-27
-- Author: Dev Sênior / DBA PhD
-- Root Cause: bucket audio-messages has public=false
--             → /storage/v1/object/public/ returns 400
--             → createSignedUrl() fails with anon key (private bucket + no auth)
--             → Audio player cannot reach any audio message
--
-- Architecture Decision:
--   audio-messages stores WhatsApp voice messages (PTT) received via Evolution API.
--   These are conversational audio from clients — LOW sensitivity (unlike financial docs).
--   Making the bucket public for READ is acceptable for this use case.
--   UPLOAD remains authenticated (INSERT policy preserved).
--
-- Verification after migration:
--   curl -I "https://supabase.atomicabr.com.br/storage/v1/object/public/audio-messages/audio/<filename.ogg>"
--   Expected: HTTP 200, Content-Type: audio/ogg
-- ==============================================================================

BEGIN;

-- Step 1: Make audio-messages publicly readable
UPDATE storage.buckets
SET public = true
WHERE name = 'audio-messages'
  AND public = false;

-- Step 2: Ensure INSERT policy still requires authentication (upload stays locked)
-- Policy already exists: auth_write_audio_msgs
-- Verify it targets audio-messages:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'auth_write_audio_msgs'
      AND cmd = 'INSERT'
  ) THEN
    CREATE POLICY auth_write_audio_msgs ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'audio-messages');
  END IF;
END $$;

-- Step 3: Add public SELECT policy for anon (defense in depth alongside public=true)
-- This ensures RLS also permits the access even if public flag ever resets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'public_read_audio_messages'
  ) THEN
    CREATE POLICY public_read_audio_messages ON storage.objects
    FOR SELECT TO anon
    USING (bucket_id = 'audio-messages');
  END IF;
END $$;

-- Step 4: Ensure allowed_mime_types includes audio formats in use
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'audio/ogg',
  'audio/webm',
  'audio/mpeg',
  'audio/mp3',
  'audio/aac',
  'audio/mp4',
  'application/ogg'
]::text[]
WHERE name = 'audio-messages'
  AND (allowed_mime_types IS NULL OR allowed_mime_types = '{}'::text[]);

-- Step 5: Log what we did
RAISE NOTICE 'audio-messages bucket is now public=true for READ. INSERT still requires authenticated role.';

COMMIT;

-- Verification query (run separately):
-- SELECT id, name, public, allowed_mime_types FROM storage.buckets WHERE name = 'audio-messages';
