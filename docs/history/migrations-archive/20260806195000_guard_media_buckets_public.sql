-- =============================================================================
-- Migration: guard de buckets de midia publicos (decisao do dono 2026-08-06)
--
-- Contexto: o dono decidiu que whatsapp-media, audio-messages e audio-memes
-- sao PUBLICOS (midias de WhatsApp, audios PTT e memes — nao contem PII).
-- A onda de seguranca paralela reverteu audio-memes para public=false UMA vez
-- (sem migration versionada), reincidindo o padrao do incidente BUG-MEDIA
-- (URL publica x bucket privado = 18k midias quebradas).
--
-- Este guard torna a reversao IMPOSSIVEL via UPDATE comum: qualquer tentativa
-- de setar public=false nestes buckets falha com erro claro (a migration que
-- tentar faz rollback transactional e exige coordenacao explicita).
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_guard_media_buckets_public ON storage.buckets;
--   DROP FUNCTION IF EXISTS storage.fn_guard_media_buckets_public();
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION storage.fn_guard_media_buckets_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.public = false AND OLD.public = true
     AND NEW.name IN ('whatsapp-media', 'audio-messages', 'audio-memes') THEN
    RAISE EXCEPTION 'MEDIA_BUCKET_GUARD: bucket % nao pode voltar a ser privado (decisao do dono 2026-08-06)',
      NEW.name;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_media_buckets_public ON storage.buckets;
CREATE TRIGGER trg_guard_media_buckets_public
  BEFORE UPDATE OF public ON storage.buckets
  FOR EACH ROW
  EXECUTE FUNCTION storage.fn_guard_media_buckets_public();

COMMIT;

-- Verification:
-- SELECT public FROM storage.buckets WHERE name = 'audio-memes';  -- true
-- UPDATE storage.buckets SET public = false WHERE name = 'audio-memes';
--   -> deve falhar: MEDIA_BUCKET_GUARD
