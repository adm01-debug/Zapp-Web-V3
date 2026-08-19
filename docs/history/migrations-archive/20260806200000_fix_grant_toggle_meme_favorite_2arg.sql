-- ============================================================================
-- FIX — GRANT EXECUTE em fn_toggle_user_meme_favorite(uuid, uuid) para authenticated
-- ============================================================================
-- Tipo: FIX (gap de permissão detectado na auditoria interna DB, 2026-08-06).
--
-- PROBLEMA:
--   zapp.fn_toggle_user_meme_favorite tem DOIS overloads:
--     (1) fn_toggle_user_meme_favorite(p_user_id uuid, p_meme_id uuid)  -- OID 634544
--     (2) fn_toggle_user_meme_favorite(p_user_id uuid, p_meme_id bigint) -- OID distinto
--
--   O overload (1) — assinatura com p_meme_id uuid — não possuía GRANT EXECUTE
--   para o role 'authenticated'. A ausência faz com que chamadas PostgREST com
--   parâmetros UUID falhem com "permission denied", enquanto chamadas com bigint
--   funcionam normalmente.
--
-- CAUSA:
--   O GRANT foi aplicado apenas ao overload (2) durante a criação original.
--   Omissão detectada via auditoria de segurança (etapa 24 do plano de 50 etapas).
--
-- DECISÃO:
--   Conceder GRANT EXECUTE ao role 'authenticated' no overload (1).
--   Sem alteração de lógica, sem alteração de SECURITY DEFINER/search_path.
-- ============================================================================

GRANT EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) IS
'FIX (2026-08-06, AUDIT-GRANT-24): GRANT EXECUTE adicionado para role authenticated — overload (uuid,uuid) estava sem permissão enquanto overload (uuid,bigint) já possuía.';
