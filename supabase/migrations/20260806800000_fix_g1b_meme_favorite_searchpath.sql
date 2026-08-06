-- ============================================================================
-- FIX G1-B — Versão definitiva de fn_toggle_user_meme_favorite(uuid, uuid)
-- ============================================================================
-- Tipo: FIX DE SEGURANÇA (search_path + IDOR guard — OWASP A01:2021)
--
-- CONTEXTO:
--   A migration 20260806300000_fix_idor_toggle_meme_favorite.sql adicionou o
--   guard IDOR (auth.uid() == p_user_id) mas usou a sintaxe incorreta de
--   search_path:
--     SET search_path = 'zapp, auth, extensions'  ← todos numa string só
--   PostgreSQL interpreta isso como schema ÚNICO chamado "zapp, auth, extensions".
--   Auth.uid() e extensões ficam inacessíveis por nome não-qualificado.
--
--   A migration 20260806800000_fix_g1_meme_favorite_searchpath.sql corrigiu
--   apenas o search_path via ALTER FUNCTION. Este arquivo (executado depois,
--   ordem alfabética: _fix_g1_ < _fix_g1b_) é a versão definitiva completa
--   que consolida: search_path correto + guard IDOR + tabela correta.
--
-- BUGS CORRIGIDOS AQUI (em relação à primeira versão deste arquivo):
--   1. Tabela errada: 'zapp.user_meme_favorites' não existe — corrigida para
--      'audio_meme_favorites' (no schema 'zapp' do search_path).
--   2. Ausência do guard IDOR: auth.uid() == p_user_id estava ausente, o que
--      permitia a qualquer usuário autenticado manipular favoritos alheios.
--   3. Lógica simplificada: DELETE + FOUND (em vez de SELECT EXISTS + condicional)
--      para atomicidade e clareza.
--
-- AUDITORIA QUE DETECTOU:
--   Agente 2 — 2026-08-06 (auditoria exaustiva pós-PR #892)
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
'Versão definitiva (2026-08-06, FIX G1-B + GAP-IDOR-01):
  - Guard IDOR: p_user_id IS DISTINCT FROM auth.uid() → ERRCODE 42501.
  - search_path correto: TO ''zapp'', ''auth'', ''extensions'' (schemas individuais).
  - Tabela correta: audio_meme_favorites (zapp schema).
  - Lógica: DELETE + FOUND (atômico, sem race condition).';
