-- Migration: 20260727300022_storage_bucket_policy
-- Purpose: Make whatsapp-media and recibos-entrega buckets private.
--          These buckets contain PII (WhatsApp media, delivery receipts).
--          Currently public — must use signed URLs.
-- Risk: MEDIUM — changes to bucket policies affect ALL existing/future URLs
--       Any hardcoded public URL in the app will break.
-- Staging required: YES — audit all URL usage in code first
-- See: SCHEMA-CONTRACT.md §Storage

SET search_path = storage, public, pg_catalog;

-- ============================================================
-- PRE-FLIGHT: Audit public URL usage before changing buckets
-- ============================================================
/*
-- Check current bucket states:
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE name IN ('whatsapp-media', 'recibos-entrega')
ORDER BY name;

-- Find all storage.objects for these buckets (for signed URL migration):
SELECT COUNT(*) FROM storage.objects WHERE bucket_id = 'whatsapp-media';
SELECT COUNT(*) FROM storage.objects WHERE bucket_id = 'recibos-entrega';
*/

-- ============================================================
-- PHASE 1: Make whatsapp-media PRIVATE (9.56 GB — urgente, contém PII)
-- ============================================================
/*
-- ONLY after auditing that no frontend uses supabase.storage.getPublicUrl('whatsapp-media/...')
-- Replace all public URL usage with supabase.storage.createSignedUrl()

UPDATE storage.buckets
SET public = false
WHERE name = 'whatsapp-media';

-- Create download policy (authenticated + signed URL):
-- Supabase storage uses RLS on storage.objects for private buckets
-- Policy: allow service_role full access, authenticated can read their workspace media

INSERT INTO storage.policies (name, bucket_id, definition)
VALUES (
    'whatsapp-media-authenticated-read',
    'whatsapp-media',
    '{"action":"SELECT","resource":"OBJECTS","condition":"auth.role() = ''authenticated''"}'
) ON CONFLICT DO NOTHING;
*/

-- ============================================================
-- PHASE 2: Make recibos-entrega PRIVATE (evaluate PII)
-- ============================================================
/*
UPDATE storage.buckets
SET public = false
WHERE name = 'recibos-entrega';
*/

-- ============================================================
-- DOCUMENTATION: Create policy document in ops
-- ============================================================
CREATE TABLE IF NOT EXISTS ops.storage_bucket_policy (
    bucket_name         text        NOT NULL PRIMARY KEY,
    visibility          text        NOT NULL CHECK (visibility IN ('public', 'private')),
    target_visibility   text        NOT NULL CHECK (target_visibility IN ('public', 'private')),
    has_pii             boolean     NOT NULL DEFAULT false,
    requires_signed_url boolean     NOT NULL DEFAULT false,
    notes               text,
    last_audited        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ops.storage_bucket_policy IS
    'Governance document for storage bucket visibility policies. '
    'Source of truth for which buckets should be public vs private. '
    'target_visibility is the desired state; visibility is current. '
    'Created: etapa 22 (2026-07-27).';

INSERT INTO ops.storage_bucket_policy
    (bucket_name, visibility, target_visibility, has_pii, requires_signed_url, notes)
VALUES
    ('whatsapp-media',          'public',  'private', true,  true,  'URGENTE: 9.56 GB de mídia de WhatsApp (PII). Buckets privado com signed URLs. Auditoria de código necessária.'),
    ('recibos-entrega',         'public',  'private', true,  true,  'Recibos de entrega (avaliar PII). Tornar privado após auditoria.'),
    ('comprovantes-financeiro', 'private', 'private', true,  true,  'OK — já privado.'),
    ('email-attachments',       'private', 'private', true,  true,  'OK — já privado.'),
    ('etiquetas-remessa',       'private', 'private', false, true,  'OK — já privado.'),
    ('fechamentos',             'private', 'private', false, true,  'OK — já privado.'),
    ('audio-messages',          'private', 'private', false, true,  'OK — já privado.'),
    ('team-chat-files',         'private', 'private', false, true,  'OK — já privado.'),
    ('quarantine',              'private', 'private', false, true,  'OK — já privado.'),
    ('avatars',                 'public',  'public',  false, false, 'OK — público aceitável (sem PII).'),
    ('audio-memes',             'public',  'public',  false, false, 'OK — público aceitável.'),
    ('custom-emojis',           'public',  'public',  false, false, 'OK — público aceitável.'),
    ('stickers',                'public',  'public',  false, false, 'OK — público aceitável.')
ON CONFLICT (bucket_name) DO UPDATE SET
    notes = EXCLUDED.notes,
    last_audited = now();

ALTER TABLE ops.storage_bucket_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.storage_bucket_policy FROM PUBLIC, anon;
GRANT SELECT ON ops.storage_bucket_policy TO authenticated;
GRANT ALL    ON ops.storage_bucket_policy TO service_role;

CREATE POLICY "authenticated can view storage policy"
    ON ops.storage_bucket_policy FOR SELECT TO authenticated USING (true);

-- View: Buckets needing action
CREATE OR REPLACE VIEW ops.v_storage_policy_gaps
WITH (security_invoker = on) AS
SELECT bucket_name, visibility AS current, target_visibility AS target, has_pii, notes
FROM ops.storage_bucket_policy
WHERE visibility != target_visibility
ORDER BY has_pii DESC, bucket_name;

SELECT 'Migration 20260727300022 complete. '
       'ops.storage_bucket_policy created with 13 entries. '
       'whatsapp-media and recibos-entrega marked for action (pending code audit).' AS status;
