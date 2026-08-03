-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000024_m24_f5_09_contact_notes_enrich.sql
-- Purpose  : F5-09 CRÍTICO — Enrich zapp.contact_notes with note_type,
--            is_pinned, updated_by; fix add_contact_note RPC to use them;
--            add update_contact_note RPC for audit-complete edits.
--
--   Step 1  ADD COLUMN IF NOT EXISTS:
--           • note_type  text NOT NULL DEFAULT 'general'
--             CHECK IN ('general','call','email','meeting','task','internal')
--           • is_pinned  boolean NOT NULL DEFAULT false
--           • updated_by uuid REFERENCES zapp.profiles(id) ON DELETE SET NULL
--
--   Step 2  Performance indexes:
--           • idx_contact_notes_pinned  (contact_id, is_pinned DESC, created_at DESC)
--           • idx_contact_notes_type    (contact_id, note_type, created_at DESC)
--
--   Step 3  CREATE OR REPLACE FUNCTION zapp.add_contact_note(uuid, text, text, boolean)
--           Fixes body: now inserts note_type + is_pinned;
--           returns enriched jsonb with all new fields.
--
--   Step 4  CREATE OR REPLACE FUNCTION zapp.update_contact_note(uuid, text, text, boolean)
--           New RPC: visibility-checked UPDATE with updated_by tracking.
--           SECURITY DEFINER, fixed search_path.
--
--   Step 5  REVOKE / GRANT.
--
--   Step 6  Verification.
--
-- Idempotência: ADD COLUMN IF NOT EXISTS; DROP CONSTRAINT IF EXISTS + ADD;
--               CREATE OR REPLACE FUNCTION.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: ADD COLUMNS to zapp.contact_notes
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE zapp.contact_notes
  ADD COLUMN IF NOT EXISTS note_type  text    NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS is_pinned  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- FK for updated_by → zapp.profiles (SET NULL if profile deleted)
-- Guard: only add if the FK doesn't already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    JOIN pg_catalog.pg_class c   ON c.oid  = conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'contact_notes'
      AND contype = 'f' AND conname = 'fk_contact_notes_updated_by'
  ) THEN
    ALTER TABLE zapp.contact_notes
      ADD CONSTRAINT fk_contact_notes_updated_by
        FOREIGN KEY (updated_by) REFERENCES zapp.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- CHECK constraint for allowed note_type values (idempotent)
ALTER TABLE zapp.contact_notes
  DROP CONSTRAINT IF EXISTS ck_contact_notes_type;

ALTER TABLE zapp.contact_notes
  ADD CONSTRAINT ck_contact_notes_type
    CHECK (note_type IN ('general','call','email','meeting','task','internal'));

COMMENT ON COLUMN zapp.contact_notes.note_type
  IS 'Category of note. Allowed: general, call, email, meeting, task, internal.';
COMMENT ON COLUMN zapp.contact_notes.is_pinned
  IS 'When true the note appears at the top of the list regardless of created_at.';
COMMENT ON COLUMN zapp.contact_notes.updated_by
  IS 'Profile ID of the last user who edited the note content (NULL = never updated).';


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contact_notes_pinned
  ON zapp.contact_notes (contact_id, is_pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_notes_type
  ON zapp.contact_notes (contact_id, note_type, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Fix zapp.add_contact_note — now inserts note_type + is_pinned
--   Signature unchanged (same 4 params, same defaults) — backwards-compatible.
--   Fixed: body now includes note_type + is_pinned in the INSERT; returns all
--          relevant fields.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.add_contact_note(uuid, text, text, boolean);

CREATE FUNCTION zapp.add_contact_note(
  p_contact_id uuid,
  p_content    text,
  p_note_type  text    DEFAULT 'general',
  p_is_pinned  boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $fn$
DECLARE
  v_profile_id uuid;
  v_id         uuid;
  v_norm_type  text;
BEGIN
  -- Resolve caller's profile
  v_profile_id := zapp.get_profile_id_for_user(auth.uid());
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'add_contact_note: perfil nao encontrado para uid=%', auth.uid()
      USING ERRCODE = '42501';
  END IF;

  -- Visibility guard
  IF NOT (
    zapp.is_admin_or_supervisor()
    OR (p_contact_id IS NOT NULL AND zapp.is_contact_visible_to_user(p_contact_id, auth.uid()))
  ) THEN
    RAISE EXCEPTION 'forbidden: contato nao visivel' USING ERRCODE = '42501';
  END IF;

  -- Normalize + validate note_type (silently coerce unknowns to 'general')
  v_norm_type := pg_catalog.lower(pg_catalog.coalesce(p_note_type, 'general'));
  IF v_norm_type NOT IN ('general','call','email','meeting','task','internal') THEN
    v_norm_type := 'general';
  END IF;

  INSERT INTO zapp.contact_notes (
    contact_id, author_id, content, note_type, is_pinned
  ) VALUES (
    p_contact_id, v_profile_id, p_content, v_norm_type, COALESCE(p_is_pinned, false)
  ) RETURNING id INTO v_id;

  RETURN pg_catalog.jsonb_build_object(
    'id',         v_id,
    'contact_id', p_contact_id,
    'author_id',  v_profile_id,
    'note_type',  v_norm_type,
    'is_pinned',  COALESCE(p_is_pinned, false)
  );
END;
$fn$;

COMMENT ON FUNCTION zapp.add_contact_note(uuid, text, text, boolean)
  IS 'Inserts a note on a contact. Enforces visibility; normalizes note_type; '
     'returns {id, contact_id, author_id, note_type, is_pinned}.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: NEW — zapp.update_contact_note(note_id, content, note_type, is_pinned)
--   Ownership guard: only the author or admin/supervisor may edit.
--   Sets updated_by to caller's profile_id and triggers updated_at via trigger.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.update_contact_note(uuid, text, text, boolean);

CREATE FUNCTION zapp.update_contact_note(
  p_note_id   uuid,
  p_content   text    DEFAULT NULL,
  p_note_type text    DEFAULT NULL,
  p_is_pinned boolean DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $fn$
DECLARE
  v_profile_id  uuid;
  v_author_id   uuid;
  v_norm_type   text;
BEGIN
  v_profile_id := zapp.get_profile_id_for_user(auth.uid());
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'update_contact_note: perfil nao encontrado para uid=%', auth.uid()
      USING ERRCODE = '42501';
  END IF;

  -- Fetch existing note's author
  SELECT author_id INTO v_author_id
    FROM zapp.contact_notes
   WHERE id = p_note_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_contact_note: nota % nao encontrada', p_note_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Ownership / role guard
  IF v_profile_id <> v_author_id AND NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'forbidden: somente o autor ou admin pode editar esta nota'
      USING ERRCODE = '42501';
  END IF;

  -- Normalize note_type when provided
  IF p_note_type IS NOT NULL THEN
    v_norm_type := pg_catalog.lower(p_note_type);
    IF v_norm_type NOT IN ('general','call','email','meeting','task','internal') THEN
      v_norm_type := 'general';
    END IF;
  END IF;

  UPDATE zapp.contact_notes SET
    content    = CASE WHEN p_content   IS NOT NULL THEN p_content   ELSE content    END,
    note_type  = CASE WHEN p_note_type IS NOT NULL THEN v_norm_type ELSE note_type  END,
    is_pinned  = CASE WHEN p_is_pinned IS NOT NULL THEN p_is_pinned ELSE is_pinned  END,
    updated_by = v_profile_id,
    updated_at = pg_catalog.now()
  WHERE id = p_note_id;

  RETURN pg_catalog.jsonb_build_object(
    'id',         p_note_id,
    'updated_by', v_profile_id,
    'updated_at', pg_catalog.now()
  );
END;
$fn$;

COMMENT ON FUNCTION zapp.update_contact_note(uuid, text, text, boolean)
  IS 'Updates a contact note. Only the author or admin/supervisor may edit. '
     'Sets updated_by to the caller''s profile_id. NULL params = keep existing value.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5: REVOKE / GRANT
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION zapp.add_contact_note(uuid, text, text, boolean)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION zapp.update_contact_note(uuid, text, text, boolean) FROM PUBLIC, anon;

-- service_role excluded: both functions require auth.uid() → zapp.profiles lookup.
-- Service-role callers must use a dedicated RPC that accepts an explicit author_id.
GRANT  EXECUTE ON FUNCTION zapp.add_contact_note(uuid, text, text, boolean)    TO authenticated;
GRANT  EXECUTE ON FUNCTION zapp.update_contact_note(uuid, text, text, boolean) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 6: Verification
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_col_count integer;
  v_ck_count  integer;
  v_fn_count  integer;
  v_ix_count  integer;
BEGIN
  -- New columns exist on zapp.contact_notes
  SELECT COUNT(*) INTO v_col_count
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class     c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'zapp'
     AND c.relname = 'contact_notes'
     AND a.attname IN ('note_type', 'is_pinned', 'updated_by')
     AND a.attnum  > 0
     AND NOT a.attisdropped;

  IF v_col_count < 3 THEN
    RAISE EXCEPTION '[M-24 VER] zapp.contact_notes missing new columns (found %/3)', v_col_count;
  END IF;

  -- CHECK constraint exists
  SELECT COUNT(*) INTO v_ck_count
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class      t ON t.oid = c.conrelid
    JOIN pg_catalog.pg_namespace  n ON n.oid = t.relnamespace
   WHERE n.nspname = 'zapp'
     AND t.relname = 'contact_notes'
     AND c.contype = 'c'
     AND c.conname = 'ck_contact_notes_type';

  IF v_ck_count < 1 THEN
    RAISE EXCEPTION '[M-24 VER] CHECK constraint ck_contact_notes_type not found';
  END IF;

  -- Both RPCs exist in zapp schema
  SELECT COUNT(*) INTO v_fn_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname IN ('add_contact_note', 'update_contact_note');

  IF v_fn_count < 2 THEN
    RAISE EXCEPTION '[M-24 VER] add_contact_note / update_contact_note not found in zapp (found %/2)', v_fn_count;
  END IF;

  -- Both indexes exist
  SELECT COUNT(*) INTO v_ix_count
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'zapp'
     AND tablename  = 'contact_notes'
     AND indexname  IN ('idx_contact_notes_pinned', 'idx_contact_notes_type');

  IF v_ix_count < 2 THEN
    RAISE EXCEPTION '[M-24 VER] performance indexes on contact_notes not found (found %/2)', v_ix_count;
  END IF;

  -- Smoke-test: add_contact_note body mentions 'note_type' and 'is_pinned'
  DECLARE v_body text;
  BEGIN
    SELECT pg_catalog.pg_get_functiondef(p.oid) INTO v_body
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'zapp' AND p.proname = 'add_contact_note';

    IF position('note_type' IN v_body) = 0 THEN
      RAISE EXCEPTION '[M-24 VER] add_contact_note body does not reference note_type column';
    END IF;
    IF position('is_pinned' IN v_body) = 0 THEN
      RAISE EXCEPTION '[M-24 VER] add_contact_note body does not reference is_pinned column';
    END IF;
  END;

  RAISE NOTICE '[M-24 VER] F5-09 OK — columns(%) ✓ check_constraint ✓ functions(%) ✓ indexes(%) ✓ body_smoke ✓',
    v_col_count, v_fn_count, v_ix_count;
END $$;
