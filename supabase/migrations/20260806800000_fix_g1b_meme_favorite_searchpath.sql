-- migration: 20260806800000_fix_g1b_meme_favorite_searchpath.sql
-- Garante SET search_path seguro em zapp.fn_toggle_user_meme_favorite(uuid, uuid).
-- Contexto (G1B): a versão 2-argumento da função herdou search_path aberto nas
-- versões anteriores. Este patch adiciona proconfig explícito para evitar
-- search_path hijacking conforme exigido pelo guardrail de segurança DB05.
-- Aplicado diretamente em produção — este arquivo é stub de documentação.

CREATE OR REPLACE FUNCTION zapp.fn_toggle_user_meme_favorite(
  p_user_id uuid,
  p_meme_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'auth', 'extensions'
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM zapp.user_meme_favorites
    WHERE user_id = p_user_id AND meme_id = p_meme_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM zapp.user_meme_favorites
    WHERE user_id = p_user_id AND meme_id = p_meme_id;
    RETURN jsonb_build_object('action', 'removed', 'meme_id', p_meme_id);
  ELSE
    INSERT INTO zapp.user_meme_favorites(user_id, meme_id)
    VALUES (p_user_id, p_meme_id)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('action', 'added', 'meme_id', p_meme_id);
  END IF;
END;
$function$;

-- Revoga execução pública (hardening complementar — ver também 20260806100001)
REVOKE EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) TO authenticated;
