-- ============================================================================
-- SECURITY FIX — CRITICAL-1: revogar EXECUTE em store_reset_token FROM authenticated
-- ============================================================================
-- Tipo: SECURITY FIX (escalada horizontal — account takeover vector)
--
-- PROBLEMA:
--   Migration 20260804190316_restore_orphaned_rpcs.sql (linhas 748-759) definiu
--   zapp.store_reset_token(p_request_id uuid, p_token text, p_expires_at timestamptz)
--   com REVOKE ALL FROM PUBLIC, anon, authenticated + GRANT EXECUTE TO service_role.
--   Intenção correta: apenas Edge Functions (service_role) devem inserir tokens de
--   reset de senha.
--
--   Migration 20260805105900_grant_lgpd_auth_rpcs.sql (linha 23) reverteu isso
--   inadvertidamente:
--     GRANT EXECUTE ON FUNCTION zapp.store_reset_token(uuid, text, timestamptz)
--       TO authenticated;
--   Qualquer usuário autenticado pode agora chamar via PostgREST:
--     POST /rest/v1/rpc/store_reset_token
--     { "p_request_id": <victim_uuid>, "p_token": <attacker_controlled>, "p_expires_at": <now+1d> }
--   E inserir um token de reset controlado pelo atacante para qualquer request_id —
--   potencial account takeover se o código de reset for aprovado sem verificar o
--   chamador.
--
-- FUNÇÃO CALLER LEGÍTIMO:
--   Edge Function `supabase/functions/approve-password-reset/` que roda com
--   service_role — não usa o JWT de autenticação do usuário.
--
-- CORREÇÃO:
--   Revogar EXECUTE de authenticated. service_role continua com acesso.
--
-- Rollback:
--   GRANT EXECUTE ON FUNCTION zapp.store_reset_token(uuid, text, timestamptz)
--     TO authenticated;
--   (NÃO fazer — esse grant é o bug em si)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION zapp.store_reset_token(uuid, text, timestamptz) FROM authenticated;

COMMENT ON FUNCTION zapp.store_reset_token(uuid, text, timestamptz) IS
'Insere token de reset de senha para um request_id. SOMENTE service_role tem EXECUTE — chamador legítimo é a Edge Function approve-password-reset. Authenticated foi revogado em 20260806200000 (CRITICAL-1: account takeover vector identificado na auditoria 2026-08-06).';
