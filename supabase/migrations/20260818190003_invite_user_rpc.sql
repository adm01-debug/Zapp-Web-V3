-- 20260818190000 — Auth: convites de usuário (invite_user) — Etapa 57 do plano 100 etapas
-- Rollback:
--   DROP FUNCTION IF EXISTS zapp.invite_user(text, text, text);
--   DROP TABLE IF EXISTS zapp.invites;
--
-- Convite com token e TTL: o admin cria o convite (tabela zapp.invites); o
-- convidado usa o token em fluxo próprio (Etapa 57.4). RPC SECURITY DEFINER
-- com search_path fixo e grants mínimos (authenticated) — a edge function
-- revalida a autorização (requireAdminOrSupervisor) antes de chamar.
--
-- Erros:
--   409 (unique_violation): email já convidado com convite ATIVO
--   400 (invalid_parameter_value): email/role inválidos
--   anon (auth.uid() nulo): negado (42501)

CREATE TABLE IF NOT EXISTS zapp.invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'agent',
  message     text,
  token       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);

ALTER TABLE zapp.invites ENABLE ROW LEVEL SECURITY;


CREATE OR REPLACE FUNCTION zapp.invite_user(
  p_email   text,
  p_role    text DEFAULT 'agent',
  p_message text DEFAULT NULL
)
RETURNS TABLE (invite_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO zapp, pg_catalog
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_id     uuid;
  v_token  text;
  v_exp    timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'permission denied for invite_user' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR p_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
  END IF;
  IF p_role NOT IN ('admin', 'supervisor', 'agent') THEN
    RAISE EXCEPTION 'invalid role' USING ERRCODE = '22023';
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_exp := now() + interval '7 days';

  BEGIN
    INSERT INTO zapp.invites (email, role, message, token, expires_at, created_by)
    VALUES (lower(p_email), p_role, p_message, v_token, v_exp, v_caller)
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'email already invited' USING ERRCODE = '23505';
  END;

  RETURN QUERY SELECT v_id, v_token, v_exp;
END;
$function$;

GRANT EXECUTE ON FUNCTION zapp.invite_user(text, text, text) TO authenticated;
