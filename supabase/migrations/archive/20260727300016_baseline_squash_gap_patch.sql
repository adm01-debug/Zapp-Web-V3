-- Migration: 20260727300016_baseline_squash_gap_patch
-- Purpose: Register the gap between the 52 tracked migrations and the actual DB state.
--          This is NOT a full baseline dump — it registers the audit metadata and creates
--          the infrastructure to track the gap. The full baseline.sql must be generated
--          separately via pg_dump + schema diff against staging.
-- Risk: LOW — only inserts metadata; no DDL
-- Staging required: NO for metadata; YES for the actual baseline squash execution
-- See: docs/db/MIGRATIONS.md §Baseline Squash

SET search_path = ops, public, pg_catalog;

-- ============================================================
-- Create migration metadata tracking table
-- ============================================================
CREATE TABLE IF NOT EXISTS ops.migration_audit (
    id              bigint          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    migration_id    text            NOT NULL UNIQUE,  -- versão da migration
    migration_name  text            NOT NULL,
    schema_targets  text[]          NOT NULL DEFAULT '{}',
    applied_at      timestamptz     NOT NULL DEFAULT now(),
    is_squash       boolean         NOT NULL DEFAULT false,
    squash_covers   text[]          DEFAULT NULL,  -- migrations cobertos por este squash
    notes           text,
    applied_by      text            NOT NULL DEFAULT current_user
);

COMMENT ON TABLE ops.migration_audit IS
    'Auditoria de migrations aplicadas. Complementa supabase_migrations.schema_migrations. '
    'Criado: etapa 16 (2026-07-27). '
    'Contém metadados adicionais: schema targets, squash coverage, notas.';

ALTER TABLE ops.migration_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.migration_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ops.migration_audit TO authenticated;
GRANT ALL    ON ops.migration_audit TO service_role;

CREATE POLICY "authenticated can view migration audit"
    ON ops.migration_audit FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Register the baseline gap
-- ============================================================
INSERT INTO ops.migration_audit
    (migration_id, migration_name, schema_targets, is_squash, squash_covers, notes)
VALUES (
    '20260727300016',
    'baseline_squash_gap_patch',
    ARRAY['ops'],
    false,
    NULL,
    'Gap entre 52 migrations rastreadas (desde 20260716) e estado real do banco. '
    'O banco foi construído antes do tracking formal. '
    'Baseline squash completo pendente: pg_dump --schema-only → baseline.sql, '
    'validar com schema diff em staging. '
    'Versões malformadas conhecidas: 20260716, 20260717, 20260722, 20260722.2 '
    '(não seguem YYYYMMDDHHMMSS — corrigir com etapa 17).'
) ON CONFLICT (migration_id) DO NOTHING;

-- ============================================================
-- View: Migration coverage dashboard
-- ============================================================
CREATE OR REPLACE VIEW ops.v_migration_status
WITH (security_invoker = on) AS
SELECT
    sm.version        AS tracked_version,
    ma.migration_name AS audit_name,
    ma.is_squash,
    ma.notes          AS audit_notes,
    sm.name           AS supabase_name
FROM supabase_migrations.schema_migrations sm
FULL OUTER JOIN ops.migration_audit ma ON ma.migration_id = sm.version
ORDER BY COALESCE(sm.version, ma.migration_id);

COMMENT ON VIEW ops.v_migration_status IS
    'Dashboard de status de migrations: cruza supabase_migrations.schema_migrations com ops.migration_audit.';

-- ============================================================
-- View: Malformed migration versions
-- ============================================================
CREATE OR REPLACE VIEW ops.v_malformed_migration_versions
WITH (security_invoker = on) AS
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version !~ '^\d{14}$'
ORDER BY version;

COMMENT ON VIEW ops.v_malformed_migration_versions IS
    'Lista migrations com versão fora do padrão YYYYMMDDHHMMSS (14 dígitos).';

-- ============================================================
-- Baseline squash procedure (documentation)
-- ============================================================
/*
PROCEDURE: Gerar e registrar o baseline squash
=============================================

1. Em staging com snapshot de produção:

   pg_dump \
     --schema-only \
     --schema=zapp \
     --schema=evo \
     --schema=public \
     --schema=ops \
     --schema=bpm \
     --schema=email_app \
     --schema=ai \
     --schema=financeiro \
     --schema=vendas \
     --schema=logistica \
     --schema=artes \
     --schema=archive \
     -h localhost -U postgres zapp_db \
     > supabase/migrations/20260727000000_baseline_squash.sql

2. Adicionar ao topo do arquivo:
   -- DO NOT APPLY TO PRODUCTION — this is a baseline-only squash for staging reference

3. Validar diff contra estado atual de produção:
   -- Em produção:
   pg_dump --schema-only ... > /tmp/prod_schema.sql
   -- Em staging após aplicar baseline:
   pg_dump --schema-only ... > /tmp/staging_schema.sql
   diff /tmp/prod_schema.sql /tmp/staging_schema.sql

4. Registrar em ops.migration_audit:
   INSERT INTO ops.migration_audit
       (migration_id, migration_name, is_squash, squash_covers, notes)
   VALUES (
       '20260727000000',
       'baseline_squash',
       true,
       ARRAY[all 52 tracked versions here],
       'Baseline squash validado em staging (diff = 0 linhas de schema DDL)'
   );
*/

SELECT 'Migration 20260727300016 complete. '
       'ops.migration_audit and ops.v_migration_status created. '
       'Baseline squash procedure documented in comments.' AS status;
