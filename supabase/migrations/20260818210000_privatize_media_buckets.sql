-- 20260818210000 — Privatização dos buckets de mídia de conversas
-- =============================================================================
-- Decisão do dono 2026-08-18 (autorização explícita): whatsapp-media e
-- audio-messages voltam a PRIVADOS (o guard anterior, de 06/08, bloqueava a
-- privatização; o front JÁ suporta buckets privados — PUBLIC_BUCKETS canônica
-- não os inclui e o fluxo usa signed URLs — getSignedMediaUrl/
-- useSignedMediaUrlBatch; resolveMessageMediaUrl retorna null p/ bucket
-- privado → fallback autenticado).
--
-- Aplicado em produção 2026-08-18 com verificação:
--   - UPDATE storage.buckets SET public=false (whatsapp-media, audio-messages)
--   - DROP POLICY public_read_whatsapp_media (anon SELECT em storage.objects)
--   - Guard INVERTIDO: fn_guard_media_buckets_private + trigger
--     trg_guard_media_buckets_private — bloqueia tornar público (regressão)
--     — testado: UPDATE public=true → MEDIA_BUCKET_GUARD_PRIVATE
--   - Buckets públicos intencionais mantidos: audio-memes, avatars, stickers,
--     custom-emojis, recibos-entrega (lista canônica LGPD)
--
-- Rollback: DROP TRIGGER privado; UPDATE public=true; CREATE POLICY anon;
-- recriar guard antigo (06/08).

BEGIN;

DROP TRIGGER IF EXISTS trg_guard_media_buckets_public ON storage.buckets;
UPDATE storage.buckets SET public = false WHERE name IN ('whatsapp-media', 'audio-messages');
DROP POLICY IF EXISTS public_read_whatsapp_media ON storage.objects;

CREATE OR REPLACE FUNCTION storage.fn_guard_media_buckets_private()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.public = true AND NEW.name IN ('whatsapp-media', 'audio-messages') THEN
    RAISE EXCEPTION 'MEDIA_BUCKET_GUARD_PRIVATE: bucket % nao pode voltar a ser publico (decisao 2026-08-18: privado com signed URLs)', NEW.name;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_guard_media_buckets_private ON storage.buckets;
CREATE TRIGGER trg_guard_media_buckets_private
  BEFORE UPDATE OF public ON storage.buckets
  FOR EACH ROW EXECUTE FUNCTION storage.fn_guard_media_buckets_private();

COMMIT;
