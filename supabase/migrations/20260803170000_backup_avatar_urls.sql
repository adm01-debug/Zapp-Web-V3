-- Migration: backup de avatar URLs antigas (Lovable → Self-Hosted)
-- Contexto: PR #738 + commit 00babce
-- 1066 contatos em evo.evolution_contacts ainda referenciam
-- allrjhkpuscmgbsnmjlv.supabase.co para profile_picture_url.
-- Storage migration física é inviável (Lovable storage inacessível,
-- 0/1066 avatars têm correspondência no self-hosted).
-- CSP band-aid (nginx + vercel + cspNonce) permite carregamento.
-- Esta tabela serve como backup para rollback futuro.

CREATE TABLE IF NOT EXISTS zapp._backup_avatar_urls_20260803 AS
SELECT id, remote_jid, instance_name, profile_picture_url, updated_at
FROM evo.evolution_contacts
WHERE profile_picture_url LIKE '%allrjhkpuscmgbsnmjlv%';

-- Verificação
-- SELECT count(*) FROM zapp._backup_avatar_urls_20260803; -- 1066

-- Rollback (se necessário):
-- UPDATE evo.evolution_contacts ec
-- SET profile_picture_url = bk.profile_picture_url
-- FROM zapp._backup_avatar_urls_20260803 bk
-- WHERE ec.id = bk.id;
