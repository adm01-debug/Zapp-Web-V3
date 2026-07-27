-- Migration: 20260727300019_domain_jid
-- Purpose: Create DOMAIN zapp.jid for WhatsApp JID format validation.
--          JID = "number@s.whatsapp.net" or "number@g.us" (groups).
--          Prevents malformed JIDs from entering the database.
-- Risk: LOW — additive only; does not change existing columns
-- Staging required: NO
-- Note: Applying DOMAIN to existing columns requires ALTER COLUMN — do that in a separate migration
--       after testing the DOMAIN in staging with real data samples.

SET search_path = zapp, evo, public, pg_catalog;

-- ============================================================
-- Create JID domain in evo (where JID data lives)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'evo' AND t.typname = 'jid'
    ) THEN
        -- JID format: digits@s.whatsapp.net or digits@g.us (groups)
        -- Also allow JIDs with country code format: +55XXXXXXXXXXX@s.whatsapp.net
        EXECUTE $sql$
            CREATE DOMAIN evo.jid AS TEXT
            CHECK (
                VALUE ~ '^[0-9\+\-@a-zA-Z\.\_\:]+$'  -- basic char whitelist
                AND VALUE LIKE '%@%'                    -- must have @ separator
                AND LENGTH(VALUE) BETWEEN 5 AND 100     -- reasonable length bounds
                AND VALUE NOT LIKE '% %'                -- no spaces
            )
        $sql$;

        COMMENT ON DOMAIN evo.jid IS
            'WhatsApp JID (Jabber ID) format. '
            'Examples: 5511999999999@s.whatsapp.net, 5511999999999-1234567890@g.us. '
            'Must contain @, no spaces, 5-100 chars. '
            'Created: etapa 19 (2026-07-27). '
            'Apply to columns: evo.evolution_contacts.remote_jid, '
            'evo.evolution_messages.remote_jid, evo.evolution_conversations.remote_jid.';

        RAISE NOTICE '✓ Domain evo.jid created.';
    ELSE
        RAISE NOTICE 'Domain evo.jid already exists, skipping.';
    END IF;
END; $$;

-- ============================================================
-- Create alias in zapp for cross-schema use
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'zapp' AND t.typname = 'jid'
    ) THEN
        -- Create as simple domain pointing to the same constraint
        EXECUTE $sql$
            CREATE DOMAIN zapp.jid AS TEXT
            CHECK (
                VALUE ~ '^[0-9\+\-@a-zA-Z\.\_\:]+$'
                AND VALUE LIKE '%@%'
                AND LENGTH(VALUE) BETWEEN 5 AND 100
                AND VALUE NOT LIKE '% %'
            )
        $sql$;

        COMMENT ON DOMAIN zapp.jid IS
            'Alias para evo.jid — WhatsApp JID format. '
            'Use este domain em tabelas zapp que armazenam JIDs. '
            'Created: etapa 19 (2026-07-27).';

        RAISE NOTICE '✓ Domain zapp.jid created.';
    ELSE
        RAISE NOTICE 'Domain zapp.jid already exists, skipping.';
    END IF;
END; $$;

-- ============================================================
-- Apply domain to new columns (example — uncomment for actual use)
-- ============================================================
/*
-- Before applying to existing columns, test with:
SELECT remote_jid FROM evo.evolution_contacts
WHERE remote_jid IS NOT NULL
  AND NOT (
    remote_jid ~ '^[0-9\+\-@a-zA-Z\.\_\:]+$'
    AND remote_jid LIKE '%@%'
    AND LENGTH(remote_jid) BETWEEN 5 AND 100
    AND remote_jid NOT LIKE '% %'
  )
LIMIT 20;

-- If 0 rows returned, safe to apply:
-- ALTER TABLE evo.evolution_contacts ALTER COLUMN remote_jid TYPE evo.jid;
-- ALTER TABLE evo.evolution_messages ALTER COLUMN remote_jid TYPE evo.jid;
-- ALTER TABLE evo.evolution_conversations ALTER COLUMN remote_jid TYPE evo.jid;
*/

-- ============================================================
-- Validation function
-- ============================================================
CREATE OR REPLACE FUNCTION evo.fn_is_valid_jid(p_jid text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = evo, pg_catalog
AS $$
    SELECT p_jid IS NOT NULL
       AND p_jid ~ '^[0-9\+\-@a-zA-Z\.\_\:]+$'
       AND p_jid LIKE '%@%'
       AND LENGTH(p_jid) BETWEEN 5 AND 100
       AND p_jid NOT LIKE '% %'
$$;

COMMENT ON FUNCTION evo.fn_is_valid_jid(text) IS
    'Validates a WhatsApp JID format without raising exception. '
    'Returns true for valid JIDs, false for invalid. '
    'Use fn_normalize_remote_jid() to normalize before validation.';

REVOKE EXECUTE ON FUNCTION evo.fn_is_valid_jid(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_is_valid_jid(text) TO authenticated, service_role;

SELECT 'Migration 20260727300019 complete. '
       'Domains evo.jid and zapp.jid created. '
       'evo.fn_is_valid_jid() created. '
       'Apply domains to existing columns after staging validation.' AS status;
