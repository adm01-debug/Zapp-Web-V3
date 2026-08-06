-- migration: 20260806194000_audio_memes_bucket_policies.sql
-- Ajusta configurações e políticas de acesso do bucket 'audio-memes'.
-- O bucket permanece privado (public=false) com limite de 5 MB.
-- Adiciona política de INSERT/SELECT para usuários autenticados.
-- Aplicado diretamente em produção — este arquivo é stub de documentação.

UPDATE storage.buckets
SET
  public          = false,
  file_size_limit = 5242880,  -- 5 MB
  allowed_mime_types = ARRAY['audio/ogg', 'audio/webm', 'audio/mpeg', 'audio/mp3',
                              'audio/aac', 'audio/mp4', 'audio/x-wav', 'audio/wav']
WHERE id = 'audio-memes';

-- Política de leitura: apenas usuários autenticados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'audio_memes_authenticated_read'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY audio_memes_authenticated_read
        ON storage.objects FOR SELECT
        TO authenticated
        USING (bucket_id = 'audio-memes')
    $pol$;
  END IF;
END $$;

-- Política de upload: apenas usuários autenticados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'audio_memes_authenticated_insert'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY audio_memes_authenticated_insert
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (bucket_id = 'audio-memes')
    $pol$;
  END IF;
END $$;
