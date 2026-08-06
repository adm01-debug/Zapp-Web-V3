-- =============================================================================
-- Migration: whatsapp-media bucket public access (BUG-MEDIA-20260806)
--
-- Root cause (incidente 2026-08-06, console F12 do ZAPP):
--   A migration LGPD P0-4 (etapa 6, 20260801060001, aplicada em 04/08) tornou
--   os buckets whatsapp-media E audio-messages PRIVADOS (public=false).
--   O BUG-38 (20260727000000 / re-aplicado em 20260804000000) restaurou
--   audio-messages para public=true, MAS whatsapp-media ficou privado.
--
--   Efeito em produção:
--     - 18.494 objetos (imagens/vídeos/documentos do WhatsApp) inacessíveis:
--       GET /storage/v1/object/public/whatsapp-media/* retorna
--       {"statusCode":404,"error":"Bucket not found"} (HTTP 400 no path raiz).
--     - Toda a stack (edge functions `_shared/evolution-media.ts` via
--       `getStoragePublicUrl` + frontend) gera/consome URLs PÚBLICAS desse
--       bucket — nenhum produtor usa signed URLs.
--     - <img>/<video> com onError em massa -> storm de refresh
--       `evolution-api/get-media-base64` -> 400 do upstream (mídia expirada
--       no WhatsApp) -> WARN "media refresh failed ... unknown".
--
-- Fix (alinhado ao BUG-38):
--   1. public=true (unconditional UPDATE) + file_size_limit 50 MB
--   2. Public SELECT para anon (defense-in-depth junto do flag public)
--   3. Authenticated INSERT preservado (idempotente)
--   allowed_mime_types permanece NULL (sem restrição — como antes do P0-4).
--
-- Rollback: UPDATE storage.buckets SET public=false WHERE name='whatsapp-media';
--           DROP POLICY IF EXISTS public_read_whatsapp_media ON storage.objects;
--           DROP POLICY IF EXISTS auth_write_whatsapp_media ON storage.objects;
-- =============================================================================

BEGIN;

-- 1. Make whatsapp-media bucket publicly readable (unconditional UPDATE)
UPDATE storage.buckets
SET
  public          = true,
  file_size_limit = 52428800  -- 50 MB
WHERE name = 'whatsapp-media';

-- 2. Public SELECT for anon (defense-in-depth alongside public=true flag)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'storage'
      AND  tablename  = 'objects'
      AND  policyname = 'public_read_whatsapp_media'
  ) THEN
    CREATE POLICY public_read_whatsapp_media ON storage.objects
      FOR SELECT TO anon
      USING (bucket_id = 'whatsapp-media');
  END IF;
END $$;

-- 3. Authenticated INSERT stays locked (create if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'storage'
      AND  tablename  = 'objects'
      AND  policyname = 'auth_write_whatsapp_media'
  ) THEN
    CREATE POLICY auth_write_whatsapp_media ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'whatsapp-media');
  END IF;
END $$;

-- Log (must be inside a DO block — bare RAISE outside PL/pgSQL context is a syntax error)
DO $$
BEGIN
  RAISE NOTICE 'BUG-MEDIA: whatsapp-media bucket set to public=true (50MB limit). INSERT still requires authenticated.';
END $$;

COMMIT;

-- Verification:
-- SELECT name, public, file_size_limit FROM storage.buckets WHERE name = 'whatsapp-media';
-- curl -I "https://supabase.atomicabr.com.br/storage/v1/object/public/whatsapp-media/video/3A5FF65C29C771B14CC7_1783713237642.mp4"
-- Expected: HTTP 200, Content-Type: video/mp4
