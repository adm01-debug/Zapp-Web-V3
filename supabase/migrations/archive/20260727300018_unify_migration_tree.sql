-- Migration: 20260727300018_unify_migration_tree
-- Purpose: Define canonical migration source and document the infra/migrations/ tree.
--          Create index of what exists in infra/migrations/ vs supabase/migrations/.
-- Risk: LOW — documentation only
-- Staging required: NO

SET search_path = ops, public, pg_catalog;

-- ============================================================
-- Document migration tree structure
-- ============================================================
COMMENT ON SCHEMA ops IS
    'Schema de infra e observabilidade. '
    'MIGRATION TREE CANONICAL SOURCE: supabase/migrations/ '
    'infra/migrations/ is SECONDARY (infra-only, deployment scripts). '
    'All business migrations go to supabase/migrations/. '
    'See docs/db/MIGRATIONS.md for policy.';

-- ============================================================
-- Create migration source registry
-- ============================================================
CREATE TABLE IF NOT EXISTS ops.migration_source_registry (
    id              bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_dir      text    NOT NULL UNIQUE,
    is_canonical    boolean NOT NULL DEFAULT false,
    purpose         text    NOT NULL,
    registered_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ops.migration_source_registry (source_dir, is_canonical, purpose) VALUES
    ('supabase/migrations/', true,
     'CANONICAL — business logic, schema changes, RLS, functions. Tracked in supabase_migrations.schema_migrations. Applied to prod via Supabase CLI.'),
    ('infra/migrations/', false,
     'SECONDARY — infra scripts, deployment helpers, config. NOT tracked in supabase_migrations. Applied manually via psql/DBA.')
ON CONFLICT (source_dir) DO NOTHING;

COMMENT ON TABLE ops.migration_source_registry IS
    'Registro de diretórios de migration e suas funções. '
    'Criado: etapa 18 (2026-07-27).';

ALTER TABLE ops.migration_source_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.migration_source_registry FROM PUBLIC, anon;
GRANT SELECT ON ops.migration_source_registry TO authenticated;
GRANT ALL    ON ops.migration_source_registry TO service_role;

SELECT 'Migration 20260727300018 complete. '
       'Migration tree unified: supabase/migrations/ is canonical. '
       'infra/migrations/ is secondary (infra-only).' AS status;
