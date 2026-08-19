-- Migration: fix_idor_toggle_meme_favorite
-- Applied: 2026-08-06T11:05:06.073Z
-- Recovery: recriado 2026-08-07 via pg_get_functiondef (C-2 AUDIT_REPORT_2026-08-06.md)
-- Correcao IDOR: fn_toggle_user_meme_favorite sem guard permitia alterar
-- favoritos de outro usuario. Adicionado check auth.uid() + is_admin_or_supervisor().

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
  v_inserted boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_argument: p_user_id nao pode ser NULL';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Guard IDOR: usuario so pode alterar seus proprios favoritos
  IF p_user_id <> auth.uid() AND NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'permission_denied: nao e permitido alterar favoritos de outro usuario'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO zapp.audio_meme_favorites (user_id, meme_id)
  VALUES (p_user_id, p_meme_id)
  ON CONFLICT (user_id, meme_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    DELETE FROM zapp.audio_meme_favorites
    WHERE user_id = p_user_id AND meme_id = p_meme_id;
    RETURN jsonb_build_object('ok', true, 'user_id', p_user_id,
      'meme_id', p_meme_id, 'is_favorite', false, 'action', 'removed');
  ELSE
    RETURN jsonb_build_object('ok', true, 'user_id', p_user_id,
      'meme_id', p_meme_id, 'is_favorite', true, 'action', 'added');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) TO authenticated;
