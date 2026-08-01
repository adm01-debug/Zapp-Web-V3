-- 20260801060001 — LGPD: buckets whatsapp-media e audio-messages PRIVADOS (auditoria P0-4 / etapa 6)
-- Aplicado em producao: 2026-08-01 (APOS o deploy do front com signed URLs — PR #665)
-- Antes: public=true forçado pelo trigger storage.trg_enforce_whatsapp_media_public
-- Depois: public=false; acesso via createSignedUrl (TTL) — front usa getSignedMediaUrl()
-- Validacao: GET /object/public/... → 400; GET signed URL → 200
-- Rollback: recriar trigger + UPDATE buckets SET public=true

BEGIN;

DROP TRIGGER IF EXISTS trg_enforce_whatsapp_media_public ON storage.objects;
DROP FUNCTION IF EXISTS storage.fn_enforce_public_buckets CASCADE;
UPDATE storage.buckets SET public = false WHERE name IN ('whatsapp-media', 'audio-messages');

COMMIT;
