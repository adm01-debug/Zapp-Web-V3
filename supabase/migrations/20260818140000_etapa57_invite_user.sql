-- 20260818140000 — Etapa 57 (A29+B30): convites de usuário (invite-user)
-- =============================================================================
-- Backend do convite por email: tabela zapp.invites + RPC zapp.invite_user
-- (token com TTL, duplicado honesto). Consumido pela EF invite-user
-- (supabase/functions/invite-user/index.ts, contrato invite-user@v1).
--
-- Verificação prévia AO VIVO (2026-08-18): NENHUMA tabela/RPC de convite
-- existia (information_schema + pg_proc) — migration aditiva, sem drift.
--
-- Regras (Etapa 57.3/57.4):
--   * Criação: apenas admin/supervisor (a EF exige requireAdminOrSupervisor;
--     o RPC é SECURITY DEFINER executado só com service_role — nenhuma role
--     authenticated tem EXECUTE direto).
--   * Leitura via RLS: admin/supervisor lêem todos; o dono do email lê o
--     próprio convite (token) após criar conta (auth.jwt() ->> 'email').
--   * Tokens expirados inválidos: validade checada em quem consome o token
--     (aceite — Etapa 57.6) via token_expires_at; TTL 7 dias na criação.
--   * Duplicado: UNIQUE(email) + pré-checagem de auth.users dentro do RPC →
--     exceção honesta (nunca 500).
--
-- Rollback (documentado):
--   DROP FUNCTION IF EXISTS zapp.invite_user(text, text, text, uuid);
--   DROP TABLE IF EXISTS zapp.invites;

BEGIN;

-- ── Tabela ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.invites (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL UNIQUE,
  role             text NOT NULL DEFAULT 'agent'
                   CHECK (role IN ('admin', 'supervisor', 'agent')),
  token            text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  invited_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message          text CHECK (char_length(message) <= 500),
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  accepted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_invites_token ON zapp.invites (token);

-- ── RLS (Etapa 57.4: não-admin não cria; convidado só lê o próprio token) ───
ALTER TABLE zapp.invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invites_admin_select ON zapp.invites;
CREATE POLICY invites_admin_select ON zapp.invites
  FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS invites_self_select ON zapp.invites;
CREATE POLICY invites_self_select ON zapp.invites
  FOR SELECT TO authenticated
  USING (email = lower(auth.jwt() ->> 'email'));

-- Sem policies de INSERT/UPDATE/DELETE para authenticated → escrita direta
-- bloqueada (só service_role, que bypassa RLS, escreve via RPC).

-- ── RPC zapp.invite_user (token com TTL + duplicado honesto) ────────────────
CREATE OR REPLACE FUNCTION zapp.invite_user(
  p_email text,
  p_role text DEFAULT 'agent',
  p_message text DEFAULT NULL,
  p_invited_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'pg_catalog'
AS $fn$
DECLARE
  v_clean_email text;
  v_token text;
  v_id uuid;
BEGIN
  v_clean_email := lower(btrim(coalesce(p_email, '')));

  IF v_clean_email = '' OR v_clean_email !~ '@' THEN
    RAISE EXCEPTION 'Email inválido' USING ERRCODE = '22023';
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('admin', 'supervisor', 'agent') THEN
    RAISE EXCEPTION 'Role inválida' USING ERRCODE = '22023';
  END IF;

  -- Duplicado honesto: conta auth já existente para o email.
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email) THEN
    RAISE EXCEPTION 'Email already registered' USING ERRCODE = 'P0001';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO zapp.invites (email, role, token, token_expires_at, invited_by, message)
  VALUES (v_clean_email, p_role, v_token, now() + interval '7 days', p_invited_by, p_message)
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Email already invited' USING ERRCODE = 'P0001';
END;
$fn$;

-- ── Grants mínimos ──────────────────────────────────────────────────────────
GRANT SELECT ON zapp.invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.invites TO service_role;
REVOKE ALL ON FUNCTION zapp.invite_user(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zapp.invite_user(text, text, text, uuid) TO service_role;

COMMIT;
