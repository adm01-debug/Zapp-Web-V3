-- 20260817190000 — Auth: RPCs de sessões ativas (listagem/revogação) — Etapa 56 do plano 100 etapas
-- Rollback:
--   DROP FUNCTION IF EXISTS zapp.sessions_list(uuid, boolean);
--   DROP FUNCTION IF EXISTS zapp.sessions_revoke(uuid, uuid[], boolean);
--   DROP FUNCTION IF EXISTS zapp.sessions_revoke_all(uuid, boolean);
--
-- Contexto: GoTrue self-hosted NÃO expõe admin list/delete de sessões (roteiro
-- admin de internal/api/api.go não tem /sessions). A revogação real exige SQL em
-- auth.sessions + auth.refresh_tokens — exposto aqui como RPCs SECURITY DEFINER
-- com search_path fixo e grants mínimos (authenticated).
--
-- Autorização (defesa em profundidade — a edge function revalida antes):
--   * p_admin = false → somente o próprio usuário (auth.uid() = p_target_user_id)
--   * p_admin = true  → somente admin/supervisor (zapp.is_admin_or_supervisor)
--   * anon (auth.uid() nulo) → negado (errcode 42501 = insufficient_privilege)
-- Fail-closed: qualquer falha de autorização lança exceção (nunca lista vazia
-- silenciosa nem no-op sem erro).
--
-- Revogação real: DELETE em auth.sessions + revoked=true nos refresh tokens
-- órfãos (auth.refresh_tokens.session_id) — a sessão morre no próximo refresh e
-- o access token expira no TTL normal (~1h).

-- Listagem segura (nunca expõe refresh_token_hmac_key / refresh_token_counter).
CREATE OR REPLACE FUNCTION zapp.sessions_list(
  p_target_user_id uuid,
  p_admin boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  last_active timestamptz,
  user_agent text,
  ip text,
  aal text,
  tag text,
  factor_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO zapp, pg_catalog
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'permission denied for sessions_list' USING ERRCODE = '42501';
  END IF;
  IF NOT p_admin AND v_caller <> p_target_user_id THEN
    RAISE EXCEPTION 'permission denied for sessions_list' USING ERRCODE = '42501';
  END IF;
  IF p_admin AND NOT zapp.is_admin_or_supervisor(v_caller) THEN
    RAISE EXCEPTION 'permission denied for sessions_list' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.user_id,
         s.created_at,
         s.updated_at,
         COALESCE(s.refreshed_at, s.created_at)::timestamptz AS last_active,
         s.user_agent,
         s.ip::text AS ip,
         s.aal::text AS aal,
         s.tag,
         s.factor_id
    FROM auth.sessions s
   WHERE s.user_id = p_target_user_id
   ORDER BY last_active DESC NULLS LAST;
END;
$function$;

-- Revogação individual (idempotente: ids já revogados/inexistentes → 0, sem erro).
CREATE OR REPLACE FUNCTION zapp.sessions_revoke(
  p_target_user_id uuid,
  p_session_ids uuid[],
  p_admin boolean DEFAULT false
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO zapp, pg_catalog
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_revoked int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'permission denied for sessions_revoke' USING ERRCODE = '42501';
  END IF;
  IF NOT p_admin AND v_caller <> p_target_user_id THEN
    RAISE EXCEPTION 'permission denied for sessions_revoke' USING ERRCODE = '42501';
  END IF;
  IF p_admin AND NOT zapp.is_admin_or_supervisor(v_caller) THEN
    RAISE EXCEPTION 'permission denied for sessions_revoke' USING ERRCODE = '42501';
  END IF;
  IF p_session_ids IS NULL OR cardinality(p_session_ids) = 0 THEN
    RETURN 0;
  END IF;

  -- Revoga os refresh tokens da sessão antes de remover a sessão (GoTrue
  -- consulta refresh_tokens por session_id no refresh — revoked=true mata).
  UPDATE auth.refresh_tokens rt
     SET revoked = true, updated_at = now()
   WHERE rt.session_id = ANY(p_session_ids)
     AND rt.user_id = p_target_user_id
     AND rt.revoked = false;

  DELETE FROM auth.sessions s
   WHERE s.user_id = p_target_user_id
     AND s.id = ANY(p_session_ids);

  GET DIAGNOSTICS v_revoked = ROW_COUNT;
  RETURN v_revoked;
END;
$function$;

-- Revogação total (todas as sessões do usuário — inclui a atual, força re-login).
CREATE OR REPLACE FUNCTION zapp.sessions_revoke_all(
  p_target_user_id uuid,
  p_admin boolean DEFAULT false
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO zapp, pg_catalog
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_revoked int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'permission denied for sessions_revoke_all' USING ERRCODE = '42501';
  END IF;
  IF NOT p_admin AND v_caller <> p_target_user_id THEN
    RAISE EXCEPTION 'permission denied for sessions_revoke_all' USING ERRCODE = '42501';
  END IF;
  IF p_admin AND NOT zapp.is_admin_or_supervisor(v_caller) THEN
    RAISE EXCEPTION 'permission denied for sessions_revoke_all' USING ERRCODE = '42501';
  END IF;

  UPDATE auth.refresh_tokens rt
     SET revoked = true, updated_at = now()
   WHERE rt.user_id = p_target_user_id
     AND rt.revoked = false;

  DELETE FROM auth.sessions s
   WHERE s.user_id = p_target_user_id;

  GET DIAGNOSTICS v_revoked = ROW_COUNT;
  RETURN v_revoked;
END;
$function$;

-- Grants mínimos: authenticated executa; PUBLIC/anon negado.
REVOKE ALL ON FUNCTION zapp.sessions_list(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION zapp.sessions_revoke(uuid, uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION zapp.sessions_revoke_all(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.sessions_list(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.sessions_revoke(uuid, uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.sessions_revoke_all(uuid, boolean) TO authenticated;
