-- =============================================================================
-- Migration: audio-memes bucket public access (BUG-MEDIA-2, follow-up auditoria
-- media-producers 2026-08-06)
--
-- Contexto: auditoria de produtores de media_url (docs/auditoria-media-producers-
-- 20260806.md) encontrou GAP ALTO: a cadeia de áudios de memes trata o bucket
-- `audio-memes` como PÚBLICO em 4 pontos (edge fn voice-changer/index.ts grava
-- output_audio_url com getStoragePublicUrl; src/hooks/useAudioManagement.ts e
-- src/lib/mediaUrl.ts PUBLIC_BUCKETS montam URLs públicas), mas o bucket é
-- privado em produção → uploads bloqueados (0 objetos) e URLs quebradas.
-- Alinhado ao padrão dos buckets de mídia compartilhada da equipe
-- (stickers, custom-emojis, audio-messages, whatsapp-media: todos public=true).
--
-- Fix (mesmo modelo do BUG-MEDIA 20260806193000):
--   1. public=true (unconditional UPDATE)
--   2. Public SELECT para anon (defense-in-depth junto do flag public)
--   3. Authenticated INSERT preservado (idempotente)
--
-- Rollback: UPDATE storage.buckets SET public=false WHERE name='audio-memes';
--           DROP POLICY IF EXISTS public_read_audio_memes ON storage.objects;
--           DROP POLICY IF EXISTS auth_write_audio_memes ON storage.objects;
-- =============================================================================

BEGIN;

-- 1. Make audio-memes bucket publicly readable (unconditional UPDATE)
UPDATE storage.buckets
SET    public = true
WHERE  name = 'audio-memes';

-- 2. Public SELECT for anon (defense-in-depth alongside public=true flag)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'storage'
      AND  tablename  = 'objects'
      AND  policyname = 'public_read_audio_memes'
  ) THEN
    CREATE POLICY public_read_audio_memes ON storage.objects
      FOR SELECT TO anon
      USING (bucket_id = 'audio-memes');
  END IF;
END $$;

-- 3. Authenticated INSERT stays locked (create if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'storage'
      AND  tablename  = 'objects'
      AND  policyname = 'auth_write_audio_memes'
  ) THEN
    CREATE POLICY auth_write_audio_memes ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'audio-memes');
  END IF;
END $$;

-- Log (must be inside a DO block — bare RAISE outside PL/pgSQL context is a syntax error)
DO $$
BEGIN
  RAISE NOTICE 'BUG-MEDIA-2: audio-memes bucket set to public=true. INSERT still requires authenticated.';
END $$;

COMMIT;

-- Verification:
-- SELECT name, public FROM storage.buckets WHERE name = 'audio-memes';
-- Expected: public = true
