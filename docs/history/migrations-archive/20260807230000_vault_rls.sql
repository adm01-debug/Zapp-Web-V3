-- EX-02 (2026-08-06): P0 — habilita RLS em vault.secrets e na snapshot
-- vault.secrets_snapshot_pre_fix_20260509 (se existir), com policy
-- FOR ALL TO supabase_admin. Snapshot NÃO é dropada (zero perda).
--
-- Executado como supabase_admin (owner de vault.secrets) via SET ROLE
-- dentro do bloco — postgres é membro de supabase_admin neste self-hosted.
-- Rollback: DROP POLICY vault_secrets_admin_all ON vault.secrets;
--           ALTER TABLE vault.secrets DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  SET ROLE supabase_admin;

  -- vault.secrets
  EXECUTE 'ALTER TABLE vault.secrets ENABLE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'vault' AND c.relname = 'secrets'
      AND p.polname = 'vault_secrets_admin_all'
  ) THEN
    EXECUTE 'CREATE POLICY vault_secrets_admin_all ON vault.secrets
             FOR ALL TO supabase_admin USING (true) WITH CHECK (true)';
  END IF;

  -- snapshot (se existir) — mesma transação, mesmo bloco
  IF to_regclass('vault.secrets_snapshot_pre_fix_20260509') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE vault.secrets_snapshot_pre_fix_20260509 ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'vault' AND c.relname = 'secrets_snapshot_pre_fix_20260509'
        AND p.polname = 'vault_secrets_snapshot_admin_all'
    ) THEN
      EXECUTE 'CREATE POLICY vault_secrets_snapshot_admin_all
               ON vault.secrets_snapshot_pre_fix_20260509
               FOR ALL TO supabase_admin USING (true) WITH CHECK (true)';
    END IF;
  END IF;

  RESET ROLE;
END
$$;
