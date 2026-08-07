-- ESPELHO repo×DB — migration aplicada via MCP (supabase_apply_migration) na auditoria Hermes 2026-08-06/07.
-- Registro em supabase_migrations.schema_migrations; este arquivo é o registro histórico (DB-as-source).
-- QA-10-05: fix de check constraint de status (idempotente).
-- Estado efetivo: constraint de status em zapp.audit_logs validada; ver pg_constraint.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_status_check' AND conrelid = 'zapp.audit_logs'::regclass AND NOT convalidated) THEN
    ALTER TABLE zapp.audit_logs VALIDATE CONSTRAINT audit_logs_status_check;
  END IF;
END $$;
