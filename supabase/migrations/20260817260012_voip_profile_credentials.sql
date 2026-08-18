-- 20260817260000 — VoIP: credenciais SIP por perfil (zapp.voip_profile_credentials)
-- =============================================================================
-- Problema (gap documentado em src/components/calls/__tests__/voip-security-gaps.test.ts):
--   get-sip-password retorna UMA senha compartilhada (env SIP_PASSWORD) para todos
--   os usuários — sem isolamento por perfil; ramal/user vêm de localStorage.
--
-- Solução:
--   1. Tabela zapp.voip_profile_credentials: credenciais SIP (ramal + senha) por
--      profile (1:1 via UNIQUE), com override opcional de servidor/porta WSS.
--   2. Edge function NOVA `zapp-get-sip-credentials` (mesmo PR): resolve o dono via
--      JWT (requireUser) e devolve as credenciais do perfil; se não houver linha
--      ativa, cai no LEGADO (env SIP_PASSWORD) com a flag `legacy: true` — o
--      frontend mantém o fluxo atual (server/user do localStorage).
--
-- Segurança: senhas SIP NÃO saem por PostgREST — SEM GRANT para authenticated;
-- o único caminho de leitura é a edge function (service_role, que bypassa RLS).
-- As policies RLS ficam como defesa em profundidade (caso um GRANT seja adicionado
-- no futuro) e seguem o padrão tenant-based da casa (dono = profiles.user_id =
-- auth.uid(); admin/supervisor via zapp.is_admin_or_supervisor).
--
-- Rollback:
--   DROP TABLE IF EXISTS zapp.voip_profile_credentials;

BEGIN;

CREATE TABLE IF NOT EXISTS zapp.voip_profile_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES zapp.profiles(id) ON DELETE CASCADE,
  sip_user text NOT NULL CHECK (char_length(sip_user) BETWEEN 1 AND 128),
  sip_password text NOT NULL CHECK (char_length(sip_password) BETWEEN 1 AND 256),
  sip_server text CHECK (sip_server IS NULL OR char_length(sip_server) BETWEEN 1 AND 255),
  ws_port integer NOT NULL DEFAULT 8089 CHECK (ws_port BETWEEN 1 AND 65535),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE zapp.voip_profile_credentials IS
  'Credenciais SIP por perfil (VoIP). Leitura SOMENTE via edge function zapp-get-sip-credentials (service_role) — sem GRANT para PostgREST.';

-- ── RLS ativa (idempotente) ────────────────────────────────────────────────
ALTER TABLE zapp.voip_profile_credentials ENABLE ROW LEVEL SECURITY;

-- Dono (perfil do usuário autenticado) ou admin/supervisor.
DROP POLICY IF EXISTS voip_profile_credentials_select ON zapp.voip_profile_credentials;
CREATE POLICY voip_profile_credentials_select ON zapp.voip_profile_credentials
  FOR SELECT TO authenticated
  USING (
    profile_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- Dono pode atualizar a própria linha (ex.: rotação de senha futura pela UI).
DROP POLICY IF EXISTS voip_profile_credentials_update ON zapp.voip_profile_credentials;
CREATE POLICY voip_profile_credentials_update ON zapp.voip_profile_credentials
  FOR UPDATE TO authenticated
  USING (
    profile_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    profile_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- INSERT/DELETE: apenas admin/supervisor (provisionamento).
DROP POLICY IF EXISTS voip_profile_credentials_insert ON zapp.voip_profile_credentials;
CREATE POLICY voip_profile_credentials_insert ON zapp.voip_profile_credentials
  FOR INSERT TO authenticated
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS voip_profile_credentials_delete ON zapp.voip_profile_credentials;
CREATE POLICY voip_profile_credentials_delete ON zapp.voip_profile_credentials
  FOR DELETE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

-- SEM GRANT: credenciais não saem via PostgREST (edge function é o único caminho).

-- ── Trigger updated_at (padrão da casa) ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_voip_profile_credentials_updated_at
  ON zapp.voip_profile_credentials;
CREATE TRIGGER trg_voip_profile_credentials_updated_at
  BEFORE UPDATE ON zapp.voip_profile_credentials
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_set_updated_at();

COMMIT;
