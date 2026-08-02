-- =============================================================================
-- Migration: Fix audio-messages bucket public access (BUG-38 re-apply)
--
-- Root cause: The original fix in archive/20260727000000 had two blocking defects:
--   (a) File was placed in archive/ instead of supabase/migrations/ — never deployed
--   (b) Bare `RAISE NOTICE` at top-level SQL (outside DO block) → syntax error →
--       entire BEGIN/COMMIT transaction rolled back silently
--
-- Effect in production: audio-messages bucket remains public=false
-- Every GET /storage/v1/object/public/audio-messages/* returns HTTP 400.
-- PTT voice messages are completely unplayable.
--
-- Fix:
--   1. Set public=true (unconditionally — was conditional on `public=false` only)
--   2. Set correct MIME types (unconditionally — previous had NULL-only guard)
--   3. Ensure anon SELECT policy exists (idempotent)
--   4. Ensure auth INSERT policy exists (idempotent)
-- =============================================================================

BEGIN;

-- 1. Make audio-messages bucket publicly readable (unconditional UPDATE)
UPDATE storage.buckets
SET    public = true
WHERE  name = 'audio-messages';

-- 2. Set allowed MIME types unconditionally (overwrite any stale value)
UPDATE storage.buckets
SET    allowed_mime_types = ARRAY[
         'audio/ogg',
         'audio/webm',
         'audio/mpeg',
         'audio/mp3',
         'audio/aac',
         'audio/mp4',
         'application/ogg'
       ]::text[]
WHERE  name = 'audio-messages';

-- 3. Public SELECT for anon (defense-in-depth alongside public=true flag)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'storage'
      AND  tablename  = 'objects'
      AND  policyname = 'public_read_audio_messages'
  ) THEN
    CREATE POLICY public_read_audio_messages ON storage.objects
      FOR SELECT TO anon
      USING (bucket_id = 'audio-messages');
  END IF;
END $$;

-- 4. Authenticated INSERT stays locked (create if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'storage'
      AND  tablename  = 'objects'
      AND  policyname = 'auth_write_audio_msgs'
      AND  cmd        = 'INSERT'
  ) THEN
    CREATE POLICY auth_write_audio_msgs ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'audio-messages');
  END IF;
END $$;

-- Log (must be inside a DO block — bare RAISE outside PL/pgSQL context is a syntax error)
DO $$
BEGIN
  RAISE NOTICE 'BUG-38: audio-messages bucket set to public=true. INSERT still requires authenticated.';
END $$;

COMMIT;

-- Verification:
-- SELECT name, public, allowed_mime_types FROM storage.buckets WHERE name = 'audio-messages';
-- curl -I "https://supabase.atomicabr.com.br/storage/v1/object/public/audio-messages/<file.ogg>"
-- Expected: HTTP 200, Content-Type: audio/ogg
