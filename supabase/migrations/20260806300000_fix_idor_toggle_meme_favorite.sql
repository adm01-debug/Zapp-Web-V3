-- ============================================================================
-- FIX P1 — IDOR em zapp.fn_toggle_user_meme_favorite(uuid, uuid)
-- ============================================================================
-- Tipo: FIX CRÍTICO DE SEGURANÇA (IDOR — Insecure Direct Object Reference)
--
-- PROBLEMA (GAP-IDOR-01):
--   O overload legado fn_toggle_user_meme_favorite(p_user_id uuid, p_meme_id uuid)
--   não valida se auth.uid() == p_user_id. Qualquer usuário autenticado podia
--   chamar a função com o UUID de outro usuário e manipular os favoritos de meme
--   alheios. O overload moderno de 1 argumento (p_meme_id uuid) já estava correto
--   pois usa auth.uid() diretamente.
--
-- IMPACTO:
--   - Qualquer sessão autenticada podia adicionar/remover favoritos de qualquer
--     outro usuário via PostgREST RPC: rpc/fn_toggle_user_meme_favorite com
--     body {"p_user_id": "<outro uuid>", "p_meme_id": "..."}
--   - Gravidade OWASP A01:2021 (Broken Access Control)
--
-- CORREÇÃO:
--   Re-criar o overload (uuid, uuid) com guard auth.uid() == p_user_id no início.
--   Mantém signature, return type (jsonb) e search_path intactos.
--   Guard bloqueia com ERRCODE 42501 (insufficient_privilege) caso chamador
--   tente operar sobre user_id diferente do próprio — incluindo auth.uid() NULL
--   (acesso não autenticado), que também é bloqueado.
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
SET search_path = 'zapp, auth, extensions'
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
    -- Era favorito, removeu
    RETURN jsonb_build_object(
      'ok',         true,
      'user_id',    p_user_id,
      'meme_id',    p_meme_id,
      'is_favorite', false,
      'action',     'removed'
    );
  ELSE
    -- Não era favorito, adiciona
    INSERT INTO audio_meme_favorites (user_id, meme_id) VALUES (p_user_id, p_meme_id);
    RETURN jsonb_build_object(
      'ok',         true,
      'user_id',    p_user_id,
      'meme_id',    p_meme_id,
      'is_favorite', true,
      'action',     'added'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) IS
'FIX P1 (2026-08-06, GAP-IDOR-01): guard auth.uid() adicionado — chamador só pode '
'operar sobre seus próprios favoritos. IDOR eliminado: qualquer divergência entre '
'p_user_id e auth.uid() lança ERRCODE 42501 (insufficient_privilege).';

-- Garantir GRANT continua presente (foi aplicado em 20260806200000, mantido aqui)
GRANT EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) TO authenticated;
