-- =============================================================================
-- 20260806160000_revoke_anon_public_read_etiquetas_remessa.sql
-- =============================================================================
-- LGPD: eliminar leitura anônima/pública de etiquetas de remessa (shipping
-- labels — PDFs com dados de endereço do cliente) SEM quebrar consumidores.
--
-- Evidências (2026-08-06, AG-EX2-05-extra):
--   * Buraco provado end-to-end (padrão do áudio, AG-EX-09/A.4): com a chave
--     ANON (sem login), POST /storage/v1/object/list/etiquetas-remessa -> 200
--     (lista 12 PDFs) e POST /storage/v1/object/sign/etiquetas-remessa/<obj>
--     -> 200 (gera signed URL de download de etiqueta).
--   * Bucket JÁ está com public=false (GET /object/public/... -> 400): nenhum
--     consumidor de URL pública é possível hoje; repo não referencia o bucket
--     (grep 'etiquetas-remessa' em src/ supabase/ docs/ infra/ = 0 hits).
--   * Único acesso legítimo: policy etiquetas_service_all (service_role,
--     INSERT/SELECT/UPDATE/DELETE) — mantida intacta; signed URLs geradas por
--     service_role continuam funcionando.
--   * NÃO cria policy de leitura para authenticated de propósito: não existe
--     consumidor autenticado no repo (diferente do áudio, onde o player
--     exigia auth_read_audio_msgs ANTES do drop). Criar SELECT para
--     authenticated aqui só ampliaria superfície sem necessidade.
--
-- Policies prod (antes): etiquetas_public_read (PUBLIC = anon+authenticated,
-- SELECT), etiquetas_service_all (service_role, ALL). Nomes não existem no
-- repo (bucket criado fora do repo — nenhuma migration o referencia), por isso
-- o DROP usa IF EXISTS e o rollback recria a policy pelo nome original.
--
-- Rollback:
--   CREATE POLICY etiquetas_public_read ON storage.objects FOR SELECT
--     USING (bucket_id = 'etiquetas-remessa');
--   (e, se alterado, UPDATE storage.buckets SET public = true
--    WHERE name = 'etiquetas-remessa';)
-- =============================================================================

BEGIN;

-- 1. Remover leitura pública (PUBLIC cobre anon E authenticated)
DROP POLICY IF EXISTS etiquetas_public_read ON storage.objects;

-- 2. Reforço idempotente: bucket permanece privado (já está public=false)
UPDATE storage.buckets SET public = false WHERE name = 'etiquetas-remessa';

-- 3. Guarda contra ressurgimento de nome divergente em prod
DROP POLICY IF EXISTS public_read_etiquetas_remessa ON storage.objects;

COMMIT;
