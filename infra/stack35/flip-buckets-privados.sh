#!/bin/bash
# ============================================================
# FLIP DOS BUCKETS PRIVADOS — Etapa 6 da auditoria 2026-08-01
# ============================================================
# ATENCAO: NAO EXECUTAR ate o front com signed URLs (PR #665) estar
# DEPLOYADO em producao (zapp-web-prod). O deploy depende dos secrets
# do GH Actions (Preflight Secrets Validation) — verificar antes.
#
# Pre-flight checks:
#   1. ghcr.io/adm01-debug/zapp-web-v3/zapp-web:<tag-nova> em producao
#   2. Testar renderizacao de midia no front (audio/imagem/doc)
#   3. curl -s https://supabase.atomicabr.com.br/storage/v1/object/public/whatsapp-media/<file> → 400/404
#
# Uso (via psql no container supabase_db):
#   psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f flip-buckets.sql
# ============================================================

cat > /tmp/flip-buckets.sql <<'SQL_EOF'
BEGIN;
-- Remove o trigger que FORCA whatsapp-media a publico (decisao da auditoria: regressao LGPD)
DROP TRIGGER IF EXISTS trg_enforce_whatsapp_media_public ON storage.objects;
-- Torna os buckets privados
UPDATE storage.buckets SET public = false WHERE name IN ('whatsapp-media', 'audio-messages');
-- Polices de acesso: signed URLs (TTL 1h via createSignedUrl) cobrem o acesso;
-- garantir que anon NAO leia objetos desses buckets
DROP POLICY IF EXISTS "Give users authenticated access to folder 1fxkg9_1" ON storage.objects;
COMMIT;
SQL_EOF
echo "SQL gerado. Verificar pre-flight antes de rodar!"
