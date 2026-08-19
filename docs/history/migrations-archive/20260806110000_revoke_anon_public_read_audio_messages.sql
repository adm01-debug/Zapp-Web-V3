-- =============================================================================
-- 20260806110000_revoke_anon_public_read_audio_messages.sql
-- =============================================================================
-- LGPD: eliminar leitura anônima/pública de áudios de conversa
-- (bucket storage 'audio-messages', 2.204 objetos) SEM quebrar o player.
--
-- Evidências (2026-08-06, AG-EX-09):
--   * Buraco provado end-to-end: com a chave ANON (sem login), POST
--     /storage/v1/object/list/audio-messages -> 200 (lista áudios) e POST
--     /storage/v1/object/sign/audio-messages -> 200 + GET da signed URL ->
--     HTTP 200 com 595KB de áudio de conversa baixado.
--   * Player NÃO usa URL pública: src/lib/storageSignedUrls.ts
--     (getSignedMediaUrl -> createSignedUrl), src/hooks/useAudioManagement.ts
--     resolveAudioUrl re-assina qualquer URL /storage/v1/ de audio-messages
--     antes de tocar; PUBLIC_BUCKETS (src/lib/mediaUrl.ts) NÃO inclui
--     audio-messages; bucket já está com public=false (GET /object/public -> 400).
--   * Cuidado crítico: NÃO existe policy de SELECT para authenticated em
--     audio-messages — o acesso autenticado atual vem da policy PUBLIC
--     (pub_read_audio_msgs). Derrubá-la sem substituto quebraria o
--     createSignedUrl do player (P0). Por isso a ordem é:
--     1) criar auth_read_audio_msgs (authenticated) -> 2) dropar anon/public.
--
-- Policies prod (antes): anon_read_audio_messages (anon, SELECT),
-- pub_read_audio_msgs (PUBLIC, SELECT), auth_write_audio_msgs (authenticated,
-- INSERT). Nomes divergem do repo (canonical_schema.sql cria
-- public_read_audio_messages/auth_write_audio_msgs) — por isso DROP IF EXISTS
-- de ambos os nomes.
--
-- Rollback: recriar policies anon_read_audio_messages e pub_read_audio_msgs
-- (CREATE POLICY ... FOR SELECT USING (bucket_id='audio-messages')) e dropar
-- auth_read_audio_msgs.
-- =============================================================================

BEGIN;

-- 1. Garantir SELECT para usuários autenticados (o player assina com JWT).
--    Espelha o padrão storage_wamedia_select (whatsapp-media).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'auth_read_audio_msgs'
  ) THEN
    CREATE POLICY auth_read_audio_msgs ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'audio-messages');
  END IF;
END $$;

-- 2. Remover leitura anônima (LGPD)
DROP POLICY IF EXISTS anon_read_audio_messages ON storage.objects;

-- 3. Remover leitura pública (PUBLIC cobre anon E authenticated)
DROP POLICY IF EXISTS pub_read_audio_msgs ON storage.objects;

-- 4. Idempotência: nome divergente do repo (canonical_schema.sql) nunca deve
--    ressurgir em prod.
DROP POLICY IF EXISTS public_read_audio_messages ON storage.objects;

-- 5. Reforço idempotente: bucket permanece privado (já está public=false)
UPDATE storage.buckets SET public = false WHERE name = 'audio-messages';

COMMIT;
