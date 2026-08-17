-- [PATCH 23] evo.ingest_ledger: suporte a outcome='rejected' + reject_reason.
-- DDL do ledger não é versionado no repo — aplicar via MCP (idempotente).
ALTER TABLE evo.ingest_ledger ADD COLUMN IF NOT EXISTS reject_reason text;
-- Defensivo: se existir CHECK em outcome, estender (nomes prováveis):
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ingest_ledger_outcome_check') THEN
    ALTER TABLE evo.ingest_ledger DROP CONSTRAINT ingest_ledger_outcome_check;
    ALTER TABLE evo.ingest_ledger ADD CONSTRAINT ingest_ledger_outcome_check
      CHECK (outcome IN ('processed','processed_reaction','rejected'));
  END IF;
END $$;
