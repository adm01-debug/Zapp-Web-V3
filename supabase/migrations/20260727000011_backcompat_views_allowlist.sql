-- ============================================================
-- Migration: 20260727000011_backcompat_views_allowlist
-- Objetivo: Governar quais views o cron evo.fn_ensure_evolution_backcompat_views pode criar
-- Criado: 2026-07-27
--参阅: Step 11
-- ============================================================

-- Tabela de allowlist
CREATE TABLE IF NOT EXISTS ops.backcompat_view_allowlist (
    view_schema    TEXT NOT NULL,
    view_name      TEXT NOT NULL,
    source_schema  TEXT NOT NULL,
    source_table   TEXT NOT NULL,
    is_active      BOOLEAN DEFAULT true,
    notes          TEXT,
    created_at     TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (view_schema, view_name)
);

-- Seed de views canonicas
INSERT INTO ops.backcompat_view_allowlist (view_schema, view_name, source_schema, source_table, is_active, notes)
VALUES
    -- public schema (PostgREST)
    ('public', 'evolution_messages',         'evo', 'evolution_messages',         true, 'API de mensagens WhatsApp'),
    ('public', 'evolution_conversations',   'evo', 'evolution_conversations',    true, 'API de conversas'),
    ('public', 'evolution_contacts',        'evo', 'evolution_contacts',           true, 'API de contatos'),
    ('public', 'evolution_media',           'evo', 'evolution_media',              true, 'API de mídia'),
    ('public', 'evolution_whatsapp_status', 'evo', 'evolution_whatsapp_status',   true, 'API de status WhatsApp'),
    -- zapp schema (backward compat)
    ('zapp',  'evolution_messages',         'evo', 'evolution_messages',         true, 'Compatibilidade zapp→evo'),
    ('zapp',  'evolution_conversations',   'evo', 'evolution_conversations',    true, 'Compatibilidade zapp→evo'),
    ('zapp',  'evolution_contacts',        'evo', 'evolution_contacts',          true, 'Compatibilidade zapp→evo'),
    ('zapp',  'evolution_media',           'evo', 'evolution_media',              true, 'Compatibilidade zapp→evo'),
    ('zapp',  'evolution_whatsapp_status', 'evo', 'evolution_whatsapp_status',  true, 'Compatibilidade zapp→evo'),
    ('zapp',  'contact_id_graveyard',       'evo', 'contact_id_graveyard',        true, 'Reconciliação de JID')
ON CONFLICT (view_schema, view_name) DO NOTHING;

-- Visão de cobertura
CREATE OR REPLACE VIEW ops.v_backcompat_view_coverage AS
SELECT
    w.view_schema,
    w.view_name,
    w.is_active,
    EXISTS (SELECT 1 FROM pg_views v WHERE v.schemaname = w.view_schema AND v.viewname = w.view_name) AS exists_in_db,
    w.notes
FROM ops.backcompat_view_allowlist w
ORDER BY w.view_schema, w.view_name;

-- Grants
GRANT SELECT ON ops.backcompat_view_allowlist TO authenticated;
GRANT SELECT ON ops.v_backcompat_view_coverage TO authenticated;
GRANT ALL ON ops.backcompat_view_allowlist TO service_role;
