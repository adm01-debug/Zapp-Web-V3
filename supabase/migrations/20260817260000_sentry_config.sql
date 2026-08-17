-- =============================================================================
-- 20260817260000 — Contrato Sentry real (desligado por padrão): zapp.sentry_config
-- =============================================================================
-- G3: substitui o stub da UI (SentryIntegrationView com mockErrors hardcoded)
-- por um contrato REAL: a config do Sentry fica persistida nesta tabela (linha
-- única), lida/atualizada EXCLUSIVAMENTE pela edge function `zapp-sentry-sync`
-- (que valida DSN, mascara a chave e exige admin/supervisor para escrita).
--
-- Estado inicial: DESLIGADO (dsn = '', enabled = false) — a UI mostra o estado
-- honesto ("Inativo") até um admin configurar o DSN de verdade.
--
-- Segurança (defesa em profundidade):
--  1. Coluna `dsn` SEM GRANT de SELECT para authenticated — o PostgREST
--     devolve 403 se o front tentar ler a chave direto; só a edge (service_role)
--     lê e devolve mascarada (`dsn_masked`).
--  2. NENHUM GRANT de INSERT/UPDATE/DELETE para authenticated — a edge é o
--     único caminho de escrita (admin-only via requireAdminOrSupervisor +
--     validação de formato do DSN). As policies UPDATE existem prontas para um
--     grant futuro, mas hoje são inalcançáveis via PostgREST.
--  3. RLS ativa; SELECT liberado a autenticados (estado/rates não são segredo).
--
-- Rollback: DROP TABLE zapp.sentry_config;
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS zapp.sentry_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), -- linha única (singleton)
  enabled boolean NOT NULL DEFAULT false,         -- desligado por padrão
  dsn text NOT NULL DEFAULT '',                   -- vazio = não configurado
  environment text NOT NULL DEFAULT 'production',
  traces_sample_rate numeric(3,2) NOT NULL DEFAULT 0.10
    CHECK (traces_sample_rate BETWEEN 0 AND 1),
  replays_session_sample_rate numeric(3,2) NOT NULL DEFAULT 0.01
    CHECK (replays_session_sample_rate BETWEEN 0 AND 1),
  replays_on_error_sample_rate numeric(3,2) NOT NULL DEFAULT 1.00
    CHECK (replays_on_error_sample_rate BETWEEN 0 AND 1),
  last_test_sent_at timestamptz,                  -- evento de teste real (edge action=test)
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid                                 -- auth.uid() do último editor (via edge)
);

-- Singleton: a linha é criada pela migration; ninguém mais insere.
INSERT INTO zapp.sentry_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE zapp.sentry_config ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer autenticado vê o estado (sem dsn — coluna sem grant).
DROP POLICY IF EXISTS sentry_config_select ON zapp.sentry_config;
CREATE POLICY sentry_config_select ON zapp.sentry_config
  FOR SELECT TO authenticated
  USING (true);

-- UPDATE/DELETE (inalcançável hoje — sem grant; pronta para grant futuro):
-- apenas admin/supervisor pode alterar a config.
DROP POLICY IF EXISTS sentry_config_update ON zapp.sentry_config;
CREATE POLICY sentry_config_update ON zapp.sentry_config
  FOR UPDATE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS sentry_config_delete ON zapp.sentry_config;
CREATE POLICY sentry_config_delete ON zapp.sentry_config
  FOR DELETE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

-- Grants:
--  - authenticated: SELECT apenas nas colunas não-secretas (dsn fica fora).
--  - service_role: ALL (é quem a edge usa para ler/escrever).
GRANT SELECT (id, enabled, environment, traces_sample_rate,
              replays_session_sample_rate, replays_on_error_sample_rate,
              last_test_sent_at, updated_at, updated_by)
  ON zapp.sentry_config TO authenticated;
GRANT ALL ON zapp.sentry_config TO service_role;

-- ── Canário RLS/grants ──────────────────────────────────────────────────────
-- 1. SELECT como authenticated funciona (estado visível).
-- 2. SELECT da coluna dsn como authenticated FALHA (coluna sem grant).
-- 3. UPDATE como authenticated FALHA (sem grant — escrita só via edge).
DO $$
DECLARE v_user uuid := '00000000-0000-0000-0000-00000000c001';
DECLARE v_state boolean;
DECLARE v_dsn text;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = json_build_object('sub', v_user, 'role', 'authenticated');

  SELECT enabled INTO v_state FROM zapp.sentry_config WHERE id = true;
  IF v_state IS NULL THEN
    RAISE EXCEPTION 'canary-falhou: SELECT do estado falhou';
  END IF;

  BEGIN
    SELECT dsn INTO v_dsn FROM zapp.sentry_config WHERE id = true;
    RAISE EXCEPTION 'canary-falhou: coluna dsn legível por authenticated';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- esperado: dsn é coluna protegida
  END;

  BEGIN
    UPDATE zapp.sentry_config SET enabled = true WHERE id = true;
    RAISE EXCEPTION 'canary-falhou: UPDATE permitido sem grant';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- esperado: escrita só via edge (service_role)
  END;

  RESET ROLE;
END $$;

COMMIT;
