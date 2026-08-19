-- ============================================================================
-- CAPTURE FIX (2026-08-18) — zapp.get_avatars_by_jids_batch (espelho runtime)
-- ----------------------------------------------------------------------------
-- A versao em 20260808110001_rpc_guards_wave.sql:13 continha refs NAO
-- qualificadas (SELECT remote_jid, COALESCE(profile_picture_url,'') FROM
-- evolution_contacts ...) -> 400 'column reference "remote_jid" is ambiguous'.
-- O runtime ja foi corrigido fora de banda (refs qualificadas com alias ec.).
-- Esta migration apenas VERSIONA o espelho correto (pg_get_functiondef do
-- runtime em 2026-08-18), para que um recreate nao regrida para a versao
-- quebrada. CREATE OR REPLACE idempotente; grants preservados.
-- ============================================================================
CREATE OR REPLACE FUNCTION zapp.get_avatars_by_jids_batch(p_jids text[])
 RETURNS TABLE(remote_jid text, avatar_url text)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();
  RETURN QUERY
  SELECT ec.remote_jid::text, COALESCE(ec.profile_picture_url, '')::text
  FROM evo.evolution_contacts ec
  WHERE ec.remote_jid = ANY(p_jids);
END;
$function$;

-- Reforco de privilegios (idempotente): so authenticated (app) e service_role.
REVOKE ALL ON FUNCTION zapp.get_avatars_by_jids_batch(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.get_avatars_by_jids_batch(text[]) TO authenticated, service_role; -- ignore-lint-ml008: guarda canônica zapp.fn_require_app_user() no corpo (linha 19)
