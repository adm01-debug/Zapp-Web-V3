-- Adiciona ownership guard à fn_toggle_user_meme_favorite(uuid, uuid) e restaura grant.
--
-- Contexto:
--   Migration 20260805105900 concedeu EXECUTE à role authenticated na sobrecarga 2-arg.
--   Migration 20260805180000 revogou o grant por ausência de guard de propriedade
--   (escalada horizontal: qualquer authenticated podia favoritar/desfavoritar em nome
--   de outro usuário sem ser admin/supervisor).
--
--   Esta migration reescreve a função adicionando a guarda:
--     IF p_user_id <> auth.uid() AND NOT zapp.is_admin_or_supervisor() THEN
--       RAISE EXCEPTION 'permission_denied';
--     END IF;
--
--   Após o fix, o EXECUTE é restaurado para a role authenticated.
--   A sobrecarga 1-arg (p_meme_id uuid) já estava correta — sem alteração.
--
-- Rollback:
--   REVOKE EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) FROM authenticated;
--   (e substituir o corpo pela versão anterior sem o guard)

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
  -- Ownership guard: authenticated só pode operar no próprio user_id.
  -- Admins/supervisores podem agir em nome de outros.
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_argument: p_user_id nao pode ser NULL';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF p_user_id <> auth.uid() AND NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'permission_denied: nao e permitido alterar favoritos de outro usuario'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Toggle: delete se existir, insert se nao existir
  DELETE FROM audio_meme_favorites
  WHERE user_id = p_user_id AND meme_id = p_meme_id;
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
    INSERT INTO audio_meme_favorites (user_id, meme_id)
    VALUES (p_user_id, p_meme_id);
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

-- Restaura o grant agora que a função tem o guard.
GRANT EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) IS
  'Toggle de favorito de meme por user_id + meme_id. '
  'Ownership guard: caller deve ser o próprio user_id ou ter role admin/supervisor. '
  'A sobrecarga 1-arg (p_meme_id uuid) usa auth.uid() internamente e é preferida no cliente.';
