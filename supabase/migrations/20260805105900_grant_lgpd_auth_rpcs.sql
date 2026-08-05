-- ============================================================================
-- Migration: grant_lgpd_auth_rpcs
-- Data:      2026-08-05
-- Objetivo:  GRANT EXECUTE para authenticated em RPCs usadas pelo front.
--
-- GAP ENCONTRADO NA AUDITORIA 10 AGENTES (2026-08-05) + CONFIRMADO PELO CI
-- audit-contract (workflow ci.yml que estava 100% quebrado e passou a rodar
-- após o fix do P0 'secrets em if:' — PR #835):
--   Front chama zapp.grant_lgpd_consent / zapp.revoke_lgpd_consent
--   (ContactConsentManager.tsx — consentimento LGPD do cliente), zapp.store_reset_token
--   (fluxo de password reset) e zapp.fn_toggle_user_meme_favorite(uuid, uuid)
--   (overload com p_user_id) — TODAS sem EXECUTE para authenticated → 404 real
--   em produção (PostgREST PGRST202).
--
-- Todas são SECURITY DEFINER com search_path fixado + guard interno fail-closed
-- (verificadas) — conceder EXECUTE não abre bypass.
--
-- Aplicada em produção como 20260805105924 (transactional).
-- Idempotente: GRANT EXECUTE é naturalmente idempotente.
-- ============================================================================
GRANT EXECUTE ON FUNCTION zapp.grant_lgpd_consent(uuid, text, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.revoke_lgpd_consent(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.store_reset_token(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) TO authenticated;
-- ============================================================================
-- FIM — RPCs de LGPD/reset/memes com EXECUTE para authenticated (2026-08-05).
-- ============================================================================
