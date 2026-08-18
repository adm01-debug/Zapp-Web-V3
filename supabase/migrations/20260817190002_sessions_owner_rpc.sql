-- 20260817190002 — Auth: RPC sessions_owner (resolução de dono por session id) — Etapa 56
-- Rollback:
--   DROP FUNCTION IF EXISTS zapp.sessions_owner(uuid);
--
-- Contexto: a edge function `revoke-session` precisa saber a QUAL usuário uma
-- sessão pertence antes de decidir o caminho de revogação (dono vs admin):
--   * dono  → zapp.sessions_revoke(p_target_user_id = próprio, p_admin = false)
--   * admin → zapp.sessions_revoke(p_target_user_id = dono, p_admin = true)
-- PostgREST direto em auth.sessions (schema switching .schema('auth')) NÃO
-- funciona no self-hosted (ver evolution-credentials/index.ts) — a resolução
-- precisa passar por RPC SECURITY DEFINER.
--
-- Autorização (defesa em profundidade — a edge revalida antes):
--   * anon (auth.uid() nulo) → negado (errcode 42501 = insufficient_privilege)
--   * Retorna NULL para sessão inexistente (idempotente — a edge responde 404).
-- Informação mínima exposta: uuid do dono (NUNCA tokens, IPs ou user_agent).

CREATE OR REPLACE FUNCTION zapp.sessions_owner(p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO zapp, pg_catalog
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'permission denied for sessions_owner' USING ERRCODE = '42501';
  END IF;

  SELECT s.user_id INTO v_owner
    FROM auth.sessions s
   WHERE s.id = p_session_id;

  RETURN v_owner; -- NULL = inexistente (idempotente)
END;
$function$;

-- Grants mínimos: authenticated executa; PUBLIC/anon negado.
REVOKE ALL ON FUNCTION zapp.sessions_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.sessions_owner(uuid) TO authenticated;
