-- VALD 2026-08-07: versiona zapp.email_revalidation_jobs (criada via DDL
-- não-versionado — padrão DB-as-source). Espelho exato do schema real:
-- colunas/defaults/índices obtidos via information_schema + pg_indexes.
-- Aditiva e idempotente: CREATE/INDEX IF NOT EXISTS.
--
-- RLS + policies (espelho do DB canônico, simulação byte-exact 2026-08-07):
--   relrowsecurity = true; 3 policies para role public:
--     email_reval_all  (FOR ALL)    — dono da conta OU admin
--     reval_admin      (FOR ALL)    — idem (espelho da onda de restrição, PR #962)
--     reval_select     (FOR SELECT) — escopada por conta; USING = EXISTS puro
--                                     (SEM admin, SEM alias — byte-exact via
--                                     pg_policies, conferido 2026-08-07)

CREATE TABLE IF NOT EXISTS zapp.email_revalidation_jobs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      uuid NOT NULL,
    status          text NOT NULL DEFAULT 'pending',
    triggered_by    text DEFAULT 'system',
    scheduled_at    timestamptz NOT NULL DEFAULT now(),
    started_at      timestamptz,
    completed_at    timestamptz,
    error_message   text,
    result          jsonb,
    retry_count     integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_reval_account
    ON zapp.email_revalidation_jobs (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_reval_status
    ON zapp.email_revalidation_jobs (status, scheduled_at)
    WHERE status = ANY (ARRAY['pending'::text, 'running'::text]);

CREATE INDEX IF NOT EXISTS idx_email_reval_created
    ON zapp.email_revalidation_jobs (created_at DESC);

ALTER TABLE zapp.email_revalidation_jobs ENABLE ROW LEVEL SECURITY;

-- Policies RLS (padrão da casa: DROP IF EXISTS + CREATE = no-op idempotente).
-- Escopo: dono da conta de e-mail (email_app.email_accounts.user_id = auth.uid())
-- OU admin (zapp.is_admin_or_supervisor()). Definições byte-exact da onda de
-- restrição 2026-08-07 (migration 20260808110003, PR #962).
DROP POLICY IF EXISTS "email_reval_all" ON zapp.email_revalidation_jobs;
CREATE POLICY "email_reval_all" ON zapp.email_revalidation_jobs
    FOR ALL TO public
    USING ((EXISTS (SELECT 1 FROM email_app.email_accounts ea WHERE ea.id = email_revalidation_jobs.account_id AND ea.user_id = auth.uid())) OR zapp.is_admin_or_supervisor())
    WITH CHECK ((EXISTS (SELECT 1 FROM email_app.email_accounts ea WHERE ea.id = email_revalidation_jobs.account_id AND ea.user_id = auth.uid())) OR zapp.is_admin_or_supervisor());

DROP POLICY IF EXISTS "reval_admin" ON zapp.email_revalidation_jobs;
CREATE POLICY "reval_admin" ON zapp.email_revalidation_jobs
    FOR ALL TO public
    USING ((EXISTS (SELECT 1 FROM email_app.email_accounts ea WHERE ea.id = email_revalidation_jobs.account_id AND ea.user_id = auth.uid())) OR zapp.is_admin_or_supervisor())
    WITH CHECK ((EXISTS (SELECT 1 FROM email_app.email_accounts ea WHERE ea.id = email_revalidation_jobs.account_id AND ea.user_id = auth.uid())) OR zapp.is_admin_or_supervisor());

DROP POLICY IF EXISTS "reval_select" ON zapp.email_revalidation_jobs;
CREATE POLICY "reval_select" ON zapp.email_revalidation_jobs
    FOR SELECT TO public
    USING (EXISTS (SELECT 1 FROM email_app.email_accounts WHERE email_accounts.id = email_revalidation_jobs.account_id AND email_accounts.user_id = auth.uid()));

-- GRANTs espelho (padrão da casa: authenticated/anon leem via public view)
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_revalidation_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_revalidation_jobs TO service_role;

-- Rollback: DROP TABLE zapp.email_revalidation_jobs; (NÃO executar — produção usa)
