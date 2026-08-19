-- ═══════════════════════════════════════════════════════════════════════════
-- 20260819020000_login_attempts_table.sql
-- AGENTE A3 — criação canônica de zapp.login_attempts (pré-requisito da RPC
-- 20260819000000_login_attempts_atomic_counter, que faz INSERT ... ON CONFLICT
-- (email) na tabela).
--
-- POR QUE EXISTE: a cadeia de migrations do repo NÃO continha o CREATE TABLE
-- de zapp.login_attempts (a tabela existia só ad-hoc em prod; o squash canônico
-- 20260804000000 referenciava-a apenas em POLICIES). Em banco limpo (staging/
-- clone), a RPC zapp.fn_login_attempt_record_failed quebraria em runtime com
-- "relation zapp.login_attempts does not exist".
--
-- Shape derivado de evidências do repo (edge supabase/functions/login-attempts/
-- index.ts: INSERT/UPDATE columns, SELECT attempt_count/locked_until/
-- last_attempt_at, DELETE by email) e docs (docs/audits/RELATORIO_EXECUCAO_
-- ANALISE.md:282 — PK + idx_login_attempts_locked + idx_login_attempts_email_
-- locked + login_attempts_email_unique UNIQUE).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS + DO
-- block que adiciona UNIQUE(email) apenas se a tabela pré-existente não tiver
-- (garante ON CONFLICT (email) da RPC em qualquer estado do DB).
--
-- RLS deny-all: tabela de segurança (PII/telemetria de login); sem policies
-- para authenticated (nem SELECT) — acesso exclusivo service_role (edge) e
-- admin/dev via funções/rotas internas. A policy login_attempts_admin_select
-- do squash canônico (admin/dev SELECT) é aplicada por ele em DBs existentes;
-- em DB limpo quem roda o squash aplica a policy normalmente.
--
-- Rollback:
--   DROP TABLE IF EXISTS zapp.login_attempts;  -- ⚠ remove dados de lockout
--   (reverter sem dropar a tabela: DROP INDEX ... / DROP CONSTRAINT ...)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS zapp.login_attempts (
  email           text        NOT NULL,
  ip_address      text,
  user_agent      text,
  success         boolean     NOT NULL DEFAULT false,
  attempt_count   integer     NOT NULL DEFAULT 1,
  locked_until    timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT login_attempts_email_unique UNIQUE (email)
);

-- Tabela pré-existente SEM UNIQUE(email): adiciona (pré-requisito do
-- ON CONFLICT (email) da RPC 20260819000000). Idempotente via pg_constraint.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'zapp.login_attempts'::regclass
      AND contype = 'u'
      AND conname = 'login_attempts_email_unique'
  ) THEN
    ALTER TABLE zapp.login_attempts
      ADD CONSTRAINT login_attempts_email_unique UNIQUE (email);
  END IF;
END;
$guard$;

-- Índices espelhando produção (docs/audits/RELATORIO_EXECUCAO_ANALISE.md:282)
CREATE INDEX IF NOT EXISTS idx_login_attempts_locked
  ON zapp.login_attempts (locked_until)
  WHERE locked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_locked
  ON zapp.login_attempts (email, locked_until);

-- RLS deny-all + grants mínimos (edge usa client service_role, que bypassa RLS
-- mas precisa de GRANTs em nível de tabela; authenticated/anon/PUBLIC: nada).
ALTER TABLE zapp.login_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE zapp.login_attempts FROM PUBLIC;
REVOKE ALL ON TABLE zapp.login_attempts FROM anon;
REVOKE ALL ON TABLE zapp.login_attempts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.login_attempts TO service_role;
