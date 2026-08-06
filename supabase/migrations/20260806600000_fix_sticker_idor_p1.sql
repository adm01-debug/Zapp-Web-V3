-- ============================================================================
-- FIX P1 — IDOR em zapp.fn_toggle_user_sticker_favorite(uuid, uuid)
-- ============================================================================
-- Tipo: FIX CRÍTICO DE SEGURANÇA (IDOR — Insecure Direct Object Reference)
--
-- PROBLEMA (GAP-01):
--   O overload fn_toggle_user_sticker_favorite(p_user_id uuid, p_sticker_id uuid)
--   não valida se auth.uid() == p_user_id. Qualquer chamada com service_role
--   podendo repassar UUID arbitrário conseguia manipular stickers alheios.
--   Idêntico ao GAP-IDOR-01 corrigido em fn_toggle_user_meme_favorite (P1).
--
-- IMPACTO:
--   - Função não está GRANT'd a authenticated (mitigação parcial existente),
--     mas é acessível via service_role e Edge Functions que passem p_user_id
--     arbitrário, permitindo adicionar/remover stickers favoritos de qualquer
--     usuário sem autorização.
--   - Gravidade OWASP A01:2021 (Broken Access Control)
--
-- CORREÇÃO:
--   Re-criar o overload (uuid, uuid) com guard auth.uid() == p_user_id.
--   Mantém signature, return type (jsonb) e search_path intactos.
--   Guard bloqueia com ERRCODE 42501 (insufficient_privilege).
--   NÃO adiciona GRANT TO authenticated (mantido intencional — acesso via
--   service_role controlado internamente).
--
-- Detectado em: auditoria exaustiva 5 agentes — 2026-08-06
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_toggle_user_sticker_favorite(
  p_user_id  uuid,
  p_sticker_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'auth', 'extensions'
AS $$
DECLARE
  v_existed boolean;
BEGIN
  -- Guard IDOR: impede manipulação de stickers favoritos de outros usuários.
  -- Qualquer divergência entre p_user_id e auth.uid() lança 42501.
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Acesso negado: não é possível modificar favoritos de outro usuário'
      USING ERRCODE = '42501';
  END IF;

  -- Tenta deletar (se existe = desfavoritar)
  DELETE FROM sticker_favorites WHERE user_id = p_user_id AND sticker_id = p_sticker_id;
  v_existed := FOUND;

  IF v_existed THEN
    RETURN jsonb_build_object(
      'ok',          true,
      'user_id',     p_user_id,
      'sticker_id',  p_sticker_id,
      'is_favorite', false,
      'action',      'removed'
    );
  ELSE
    INSERT INTO sticker_favorites (user_id, sticker_id) VALUES (p_user_id, p_sticker_id);
    RETURN jsonb_build_object(
      'ok',          true,
      'user_id',     p_user_id,
      'sticker_id',  p_sticker_id,
      'is_favorite', true,
      'action',      'added'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION zapp.fn_toggle_user_sticker_favorite(uuid, uuid) IS
'FIX P1 (2026-08-06, GAP-01): guard auth.uid() adicionado — chamador só pode '
'operar sobre seus próprios stickers favoritos. IDOR eliminado: qualquer '
'divergência entre p_user_id e auth.uid() lança ERRCODE 42501 '
'(insufficient_privilege). Sem GRANT TO authenticated (mantido intencional): '
'acesso somente via service_role / Edge Functions internas.';
