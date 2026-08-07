-- VALD 2026-08-07: versiona zapp.email_revalidation_jobs (criada via DDL
-- não-versionado — padrão DB-as-source). Espelho exato do schema real:
-- colunas/defaults/índices obtidos via information_schema + pg_indexes.
-- Aditiva e idempotente: CREATE/INDEX IF NOT EXISTS.

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

-- GRANTs espelho (padrão da casa: authenticated/anon leem via public view)
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_revalidation_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_revalidation_jobs TO service_role;

-- Rollback: DROP TABLE zapp.email_revalidation_jobs; (NÃO executar — produção usa)
