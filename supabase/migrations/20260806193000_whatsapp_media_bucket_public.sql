-- migration: 20260806193000_whatsapp_media_bucket_public.sql
-- Torna o bucket 'whatsapp-media' público (public=true) com limite de 50 MB.
-- Contexto: mídias do WhatsApp precisam ser acessíveis sem autenticação para
-- pré-visualização inline no frontend (imagens, vídeos, documentos recebidos).
-- Aplicado diretamente em produção — este arquivo é stub de documentação.

UPDATE storage.buckets
SET
  public        = true,
  file_size_limit = 52428800  -- 50 MB
WHERE id = 'whatsapp-media';
