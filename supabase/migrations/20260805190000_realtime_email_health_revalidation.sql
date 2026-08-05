-- Garante email_health_summary e email_revalidation_jobs na publicação realtime.
--
-- Achado da auditoria anti-schema 2026-08-05 (onda de fechamento do plano 100):
-- useEmailHealthStatus.ts:84/:108 assinava postgres_changes em
-- `email_app.email_health_summary` / `email_app.email_revalidation_jobs` —
-- objetos INEXISTENTES nesse schema (as tabelas físicas são zapp.*; em
-- email_app não há nada, em public há apenas views proxy que não emitem WAL).
-- O front foi corrigido para schema 'zapp' (mesmo PR).
--
-- Verificação real (pg_publication_tables, 2026-08-05): as tabelas JÁ estão na
-- publicação supabase_realtime — esta migration é idempotente (no-op quando
-- presentes) para não quebrar o "Apply migrations from scratch" do CI nem
-- ambientes onde outra migration já tenha publicado.
--
-- Ambas têm RLS ativa (2 e 3 policies) — o realtime respeita RLS por assinante.
--
-- Rollback:
--   ALTER PUBLICATION supabase_realtime DROP TABLE zapp.email_health_summary,
--     zapp.email_revalidation_jobs;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename IN ('email_health_summary', 'email_revalidation_jobs')
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE
      zapp.email_health_summary,
      zapp.email_revalidation_jobs;
  END IF;
END
$$;
