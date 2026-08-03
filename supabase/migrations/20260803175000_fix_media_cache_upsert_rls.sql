-- Migration: Fix media_cache upsert RLS (403 Forbidden)
-- Data: 2026-08-03
-- Contexto: POST /rest/v1/media_cache?on_conflict=file_hash retornava 403
-- Causa raiz: ON CONFLICT DO UPDATE no upsert disparava política auth_secure_77
-- (command: ALL, with_check: is_admin_or_supervisor()), que exigia role admin.
-- A política media_cache_insert só cobria INSERT, não UPDATE.
--
-- Solução: Criar política media_cache_upsert para UPDATE, permitindo que
-- usuários autenticados façam upsert de cache de mídia.

-- Verificar políticas existentes
-- SELECT tablename, policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'zapp' AND tablename = 'media_cache'
-- ORDER BY policyname;

-- Criar política de UPDATE para cobrir o ramo ON CONFLICT DO UPDATE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'media_cache' AND policyname = 'media_cache_upsert'
  ) THEN
    CREATE POLICY media_cache_upsert ON zapp.media_cache
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END;
$$;

-- Recrear política de INSERT para garantir consistência
DROP POLICY IF EXISTS media_cache_insert ON zapp.media_cache;

CREATE POLICY media_cache_insert ON zapp.media_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Verificar resultado
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'zapp' AND tablename = 'media_cache'
ORDER BY policyname;
