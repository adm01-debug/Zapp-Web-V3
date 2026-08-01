-- ============================================================================
-- R25 P1-5 — pk_integrity: adiciona PK nas 6 tabelas sem PK (RT12 FAIL → PASS)
-- ----------------------------------------------------------------------------
-- Medido ao vivo 2026-08-01 15:00 UTC: todas têm coluna(s) natural(is) ÚNICA(s)
-- (verificado: uniq == total em todas). public._grant_backup_20260730 está
-- vazia (0 rows) → identity id. Idempotente: guard por catálogo (B2 R25).
--
-- Nota: tabelas de backup (prefixo _*_backup_*) existem SOMENTE no servidor de
-- produção (criadas por operação manual na data indicada), não em ambientes CI
-- ou instâncias fresh. Por isso usamos to_regclass() (retorna NULL para tabelas
-- ausentes) em vez de ::regclass (lança exceção se ausente).
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('evo._evolution_contacts_backup_20260801') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = to_regclass('evo._evolution_contacts_backup_20260801')
                       AND contype = 'p') THEN
    ALTER TABLE evo._evolution_contacts_backup_20260801 ADD PRIMARY KEY (id);
  END IF;

  IF to_regclass('zapp._bucket_backup_20260801') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = to_regclass('zapp._bucket_backup_20260801')
                       AND contype = 'p') THEN
    ALTER TABLE zapp._bucket_backup_20260801 ADD PRIMARY KEY (id);
  END IF;

  IF to_regclass('zapp._cron_backup_20260801') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = to_regclass('zapp._cron_backup_20260801')
                       AND contype = 'p') THEN
    ALTER TABLE zapp._cron_backup_20260801 ADD PRIMARY KEY (jobid);
  END IF;

  IF to_regclass('zapp._policy_backup_20260801') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = to_regclass('zapp._policy_backup_20260801')
                       AND contype = 'p') THEN
    ALTER TABLE zapp._policy_backup_20260801 ADD PRIMARY KEY (schemaname, tablename, policyname);
  END IF;

  IF to_regclass('zapp._warroom_alerts_backup_20260801') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = to_regclass('zapp._warroom_alerts_backup_20260801')
                       AND contype = 'p') THEN
    ALTER TABLE zapp._warroom_alerts_backup_20260801 ADD PRIMARY KEY (id);
  END IF;

  IF to_regclass('public._grant_backup_20260730') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = to_regclass('public._grant_backup_20260730')
                       AND contype = 'p') THEN
    ALTER TABLE public._grant_backup_20260730
      ADD COLUMN IF NOT EXISTS id bigint GENERATED ALWAYS AS IDENTITY;
    ALTER TABLE public._grant_backup_20260730 ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Validação:
--   SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n
--     ON n.oid=c.relnamespace WHERE n.nspname IN ('evo','zapp','public')
--     AND c.relkind IN ('r','p')
--     AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='p');
--   -- deve retornar 0 linhas (tabelas de backup ausentes em CI são ignoradas)

-- Rollback:
--   ALTER TABLE evo._evolution_contacts_backup_20260801 DROP CONSTRAINT _evolution_contacts_backup_20260801_pkey;
--   ... (idem para as demais, se existirem)
