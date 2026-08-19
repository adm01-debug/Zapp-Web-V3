-- ============================================================================
-- FIX CRÍTICO — fn_toggle_user_meme_favorite(uuid, uuid): tabela errada + IDOR
-- ============================================================================
-- Tipo: FIX CRÍTICO DE SEGURANÇA (Broken Access Control — OWASP A01:2021)
--
-- PROBLEMA (detectado 2026-08-06, auditoria exaustiva):
--   A versão de 20260806800000_fix_g1b_meme_favorite_searchpath.sql que chegou
--   à produção via PR #904 introduziu dois bugs críticos no overload (uuid, uuid)
--   de fn_toggle_user_meme_favorite:
--
--   1. TABELA ERRADA: referenciava 'zapp.user_meme_favorites' (inexistente).
--      Qualquer chamada à função falhava com 'relation does not exist'.
--
--   2. GUARD IDOR REMOVIDO: a verificação 'p_user_id IS DISTINCT FROM auth.uid()'
--      foi omitida, o que — caso a tabela existisse — permitiria a qualquer
--      usuário autenticado manipular favoritos alheios.
--
-- ESTADO EM PRODUÇÃO (antes desta migration):
--   - fn_toggle_user_meme_favorite(uuid, uuid) está QUEBRADA — falha em runtime.
--   - O overload de 1 argumento (p_meme_id uuid) não foi afetado e funciona.
--
-- CORREÇÃO:
--   Recriar a função com a tabela correta ('audio_meme_favorites') e o guard
--   IDOR restaurado. Esta é a versão canônica definitiva.
--
-- IMPACTO NO FRONTEND:
--   O overload 2-argumento é chamado quando o caller passa p_user_id explícito.
--   Com a função quebrada, chamadas via RPC via PostgREST retornavam 500.
--   Após esta migration, chamadas passam a funcionar com validação IDOR.
--
-- Detectado em: auditoria exaustiva 5 agentes — 2026-08-06
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_toggle_user_meme_favorite(
  p_user_id uuid,
  p_meme_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'auth', 'extensions'
AS $$
DECLARE
  v_existed boolean;
BEGIN
  -- Guard IDOR: impede manipulação de favoritos de outros usuários.
  -- auth.uid() IS NULL (não autenticado) também é bloqueado pelo IS DISTINCT FROM.
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Acesso negado: não é possível modificar favoritos de outro usuário'
      USING ERRCODE = '42501';
  END IF;

  -- Tenta deletar (se existe = desfavoritar)
  DELETE FROM audio_meme_favorites WHERE user_id = p_user_id AND meme_id = p_meme_id;
  v_existed := FOUND;

  IF v_existed THEN
    RETURN jsonb_build_object(
      'ok',          true,
      'user_id',     p_user_id,
      'meme_id',     p_meme_id,
      'is_favorite', false,
      'action',      'removed'
    );
  ELSE
    INSERT INTO audio_meme_favorites (user_id, meme_id) VALUES (p_user_id, p_meme_id);
    RETURN jsonb_build_object(
      'ok',          true,
      'user_id',     p_user_id,
      'meme_id',     p_meme_id,
      'is_favorite', true,
      'action',      'added'
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) IS
'FIX CRÍTICO (2026-08-06):
  - FIX 1: tabela corrigida de user_meme_favorites (inexistente) para audio_meme_favorites.
  - FIX 2: guard IDOR restaurado (p_user_id IS DISTINCT FROM auth.uid() → ERRCODE 42501).
  - search_path correto: TO ''zapp'', ''auth'', ''extensions'' (schemas individuais).
  Histórico: 20260806300000 (IDOR guard inicial) → 20260806800000_g1_ (ALTER search_path)
    → 20260806800000_g1b_ (regressão com tabela errada + sem guard)
    → 20260806980000 (esta migration — restaura estado correto).';
