-- Migration: 20260727300011_backcompat_views_allowlist
-- Purpose: Add a versioned allowlist table to control which views
--          evo.fn_ensure_evolution_backcompat_views may create in public/zapp.
--          Makes the cron declarative instead of free-form DDL.
-- Risk: LOW — additive only; does not change existing function behavior immediately
-- Staging required: NO for table creation; YES for function update
-- See: docs/db/BACKCOMPAT-VIEWS.md

SET search_path = ops, evo, public, pg_catalog;

-- ============================================================
-- Create allowlist table in ops
-- ============================================================
CREATE TABLE IF NOT EXISTS ops.backcompat_view_allowlist (
    id            bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schema_name   text          NOT NULL CHECK (schema_name IN ('public','zapp')),
    view_name     text          NOT NULL,
    target_schema text          NOT NULL,
    target_table  text          NOT NULL,
    is_active     boolean       NOT NULL DEFAULT true,
    added_at      timestamptz   NOT NULL DEFAULT now(),
    added_by      text          NOT NULL DEFAULT current_user,
    rationale     text,
    UNIQUE (schema_name, view_name)
);

COMMENT ON TABLE ops.backcompat_view_allowlist IS
    'Versioned allowlist of views that evo.fn_ensure_evolution_backcompat_views '
    'is permitted to create/maintain in public and zapp. '
    'Any view NOT in this table with is_active=true is a candidate for removal. '
    'Updated as part of ADR-DB-002 rationalization. '
    'Created: etapa 11 (2026-07-27).';

COMMENT ON COLUMN ops.backcompat_view_allowlist.is_active IS
    'false = view is being deprecated; cron will stop recreating it; '
    'manual DROP VIEW can proceed once confirmed unused.';

-- RLS
ALTER TABLE ops.backcompat_view_allowlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.backcompat_view_allowlist FROM PUBLIC, anon;
GRANT SELECT ON ops.backcompat_view_allowlist TO authenticated;
GRANT ALL    ON ops.backcompat_view_allowlist TO service_role;

CREATE POLICY "authenticated can view allowlist"
    ON ops.backcompat_view_allowlist
    FOR SELECT TO authenticated
    USING (true);

-- ============================================================
-- Seed: canonical public evolution_* views (always active)
-- ============================================================
-- These are the core backcompat views PostgREST exposes at /rest/v1/evolution_*
-- Managed by cron job 138 (evo.fn_ensure_evolution_backcompat_views, every 6h).
INSERT INTO ops.backcompat_view_allowlist
    (schema_name, view_name, target_schema, target_table, rationale)
VALUES
    ('public','evolution_messages',       'evo','evolution_messages',        'Core WA messages — PostgREST API'),
    ('public','evolution_conversations',  'evo','evolution_conversations',   'Core WA conversations — PostgREST API'),
    ('public','evolution_contacts',       'evo','evolution_contacts',        'Core WA contacts — PostgREST API'),
    ('public','evolution_media',          'evo','evolution_media',           'WA media attachments'),
    ('public','evolution_whatsapp_status','evo','evolution_whatsapp_status', 'WA delivery status'),
    ('zapp',  'evolution_messages',       'evo','evolution_messages',        'zapp curated contract — Realtime root'),
    ('zapp',  'evolution_conversations',  'evo','evolution_conversations',   'zapp curated contract — Realtime root'),
    ('zapp',  'evolution_contacts',       'evo','evolution_contacts',        'zapp curated contract'),
    ('zapp',  'evolution_media',          'evo','evolution_media',           'zapp curated contract'),
    ('zapp',  'evolution_whatsapp_status','evo','evolution_whatsapp_status', 'zapp curated contract'),
    ('zapp',  'contact_id_graveyard',     'evo','contact_id_graveyard',      'Evolution domain — contact dedup')
ON CONFLICT (schema_name, view_name) DO NOTHING;

-- ============================================================
-- NEXT STEP: Update evo.fn_ensure_evolution_backcompat_views
-- ============================================================
-- After the allowlist is populated and validated, update the function to:
-- 1. Read from ops.backcompat_view_allowlist WHERE is_active = true
-- 2. Create/recreate only those views
-- 3. Optionally: DROP views NOT in the allowlist (phase 2 after ADR-DB-002)
--
-- This ensures the cron becomes declarative and auditable.
-- See BACKCOMPAT-VIEWS.md §Versioned Allowlist for implementation guide.

-- ============================================================
-- MONITORING VIEW
-- ============================================================
CREATE OR REPLACE VIEW ops.v_backcompat_view_coverage
WITH (security_invoker = on) AS
SELECT
    a.schema_name,
    a.view_name,
    a.is_active,
    CASE WHEN v.viewname IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS view_state
FROM ops.backcompat_view_allowlist a
LEFT JOIN pg_views v
    ON v.schemaname = a.schema_name
    AND v.viewname  = a.view_name;

COMMENT ON VIEW ops.v_backcompat_view_coverage IS
    'Shows which allowlisted backcompat views actually exist in the DB. '
    'MISSING = cron has not run yet or view was dropped.';

SELECT 'Migration 20260727300011 complete. '
       'ops.backcompat_view_allowlist created with ' ||
       (SELECT COUNT(*)::text FROM ops.backcompat_view_allowlist) || ' seed entries. '
       'Next: update evo.fn_ensure_evolution_backcompat_views to read allowlist.' AS status;
