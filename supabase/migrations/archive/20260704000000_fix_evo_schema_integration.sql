-- =============================================================================
-- FIX: evo-schema integration — P0 bugs causing message drop + contact misroute
-- 2026-07-04
--
-- ROOT CAUSE CHAIN:
--   1. public.messages was manually converted to a VIEW of evo.evolution_messages
--      without an INSTEAD OF INSERT trigger → all webhook INSERTs silently dropped.
--   2. public.contacts VIEW functions (insert/update/delete) were defined but
--      no CREATE TRIGGER statements bound them → contacts written with hardcoded
--      instance_name 'wpp_pink_test' (INSERT fallback in fn_contacts_view_insert).
--   3. messages_update_trigger() function existed but no INSTEAD OF UPDATE trigger
--      was bound → all UPDATE calls silently failed.
--   4. whatsapp_connections.instance_name missing from migrations (manually added
--      in prod) → public.contacts VIEW CTE breaks on fresh environments.
--   5. evo.evolution_messages missing Realtime publication entry → no live UI
--      updates for messages.
--   6. evo.evolution_messages missing unique constraint on (message_id,instance_name)
--      → upsert ON CONFLICT DO NOTHING cannot be expressed.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1: whatsapp_connections missing columns
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- instance_name: generated from instance_id; contacts VIEW CTE joins on this
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='whatsapp_connections' AND column_name='instance_name'
  ) THEN
    ALTER TABLE public.whatsapp_connections
      ADD COLUMN instance_name TEXT GENERATED ALWAYS AS (instance_id) STORED;
    CREATE INDEX IF NOT EXISTS idx_wc_instance_name
      ON public.whatsapp_connections (instance_name);
    RAISE NOTICE 'Added instance_name (generated) to whatsapp_connections';
  END IF;

  -- is_active: contacts VIEW CTE filters WHERE is_active = true
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='whatsapp_connections' AND column_name='is_active'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    RAISE NOTICE 'Added is_active to whatsapp_connections';
  END IF;

  -- last_connected_at: contacts VIEW CTE ORDER BY uses this
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='whatsapp_connections' AND column_name='last_connected_at'
  ) THEN
    ALTER TABLE public.whatsapp_connections ADD COLUMN last_connected_at TIMESTAMPTZ;
    RAISE NOTICE 'Added last_connected_at to whatsapp_connections';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Part 2: evo.evolution_messages — add extended columns used by Zapp UI
-- ---------------------------------------------------------------------------

DO $$
DECLARE col text;
        col_type text;
        col_default text;
BEGIN
  FOR col, col_type, col_default IN VALUES
    ('contact_id',         'UUID',         NULL),
    ('direction',          'TEXT',         '''inbound'''),
    ('is_read',            'BOOLEAN',      'false'),
    ('is_starred',         'BOOLEAN',      'false'),
    ('is_important',       'BOOLEAN',      'false'),
    ('follow_up_at',       'TIMESTAMPTZ',  NULL),
    ('follow_up_done',     'BOOLEAN',      'false'),
    ('category',           'TEXT',         NULL),
    ('sentiment',          'TEXT',         NULL),
    ('tags',               'TEXT[]',       'ARRAY[]::text[]'),
    ('notes',              'TEXT',         NULL),
    ('deleted_at',         'TIMESTAMPTZ',  NULL),
    -- is_deleted and is_edited intentionally NOT added as stored columns:
    -- they are derived expressions in the view (deleted_at IS NOT NULL, edited_at IS NOT NULL).
    -- Adding stored columns would create inconsistency with the trigger that writes deleted_at.
    -- status_updated_at intentionally NOT added: the actual column is status_at.
    -- The view aliases em.status_at AS status_updated_at for frontend compatibility.
    ('agent_id',           'UUID',         NULL),
    ('transcription',      'TEXT',         NULL),
    ('transcription_status', 'TEXT',       NULL),
    ('conversation_id',    'UUID',         NULL),
    ('ptt',                'BOOLEAN',      'false'),
    ('media_meta',         'JSONB',        NULL),
    ('reactions',          'JSONB',        '''[]''::jsonb'),
    ('caption',            'TEXT',         NULL),
    ('full_name',          'TEXT',         NULL),
    ('phone_number',       'TEXT',         NULL)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='evo' AND table_name='evolution_messages' AND column_name=col
    ) THEN
      IF col_default IS NOT NULL THEN
        EXECUTE format('ALTER TABLE evo.evolution_messages ADD COLUMN %I %s DEFAULT %s',
                       col, col_type, col_default);
      ELSE
        EXECUTE format('ALTER TABLE evo.evolution_messages ADD COLUMN %I %s', col, col_type);
      END IF;
      RAISE NOTICE 'Added column evo.evolution_messages.%', col;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Part 3: Unique constraint on evo.evolution_messages(message_id, instance_name)
-- Enables ON CONFLICT (message_id, instance_name) DO NOTHING for dedup upserts.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- Check if ANY unique constraint on (message_id, instance_name) exists,
  -- regardless of name. Production may already have 'uq_msg_msgid_instance'.
  -- Creating a second identical unique constraint is redundant and wastes storage.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'evo' AND t.relname = 'evolution_messages'
      AND c.contype = 'u'
      -- Constraint covers exactly (message_id, instance_name) columns
      AND (
        SELECT array_agg(a.attname ORDER BY a.attnum)
        FROM pg_attribute a
        WHERE a.attrelid = t.oid
          AND a.attnum = ANY(c.conkey)
      ) = ARRAY['message_id','instance_name']
  ) THEN
    ALTER TABLE evo.evolution_messages
      ADD CONSTRAINT uq_evo_messages_msg_id_instance
      UNIQUE (message_id, instance_name);
    RAISE NOTICE 'Added UNIQUE (message_id, instance_name) on evo.evolution_messages';
  ELSE
    RAISE NOTICE 'UNIQUE (message_id, instance_name) already exists on evo.evolution_messages — skipped';
  END IF;
END $$;

-- Index to support the constraint + frequent lookups
CREATE INDEX IF NOT EXISTS idx_evo_messages_msg_id_instance
  ON evo.evolution_messages (message_id, instance_name)
  WHERE message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Part 4: public.messages VIEW — expose evo columns with backward-compat aliases
-- The VIEW must expose (external_id, whatsapp_connection_id, sender) so that
-- legacy TypeScript SELECT queries can still filter by those names.
-- NOTE: INSERT/UPDATE go through INSTEAD OF triggers (Parts 5+6).
-- ---------------------------------------------------------------------------

-- IMPORTANT: this CREATE OR REPLACE must maintain the EXACT same column names and
-- types as the pre-existing production view. PostgreSQL forbids renaming/reordering
-- columns via CREATE OR REPLACE VIEW. We update only three columns from NULL/hardcoded
-- to actual column references now that Part 2 has added those columns:
--   agent_id:           NULL::uuid           → em.agent_id
--   transcription:      NULL::text           → em.transcription
--   transcription_status: 'pending'::text    → em.transcription_status
-- All other columns preserve the existing production definitions exactly.
CREATE OR REPLACE VIEW public.messages AS
SELECT
  em.id,
  em.contact_id,
  ( SELECT wc.id
    FROM public.whatsapp_connections wc
    WHERE wc.instance_name = em.instance_name::text
      AND wc.is_active = true
    LIMIT 1)                                                              AS connection_id,
  CASE
    WHEN em.direction::text = 'inbound'::text THEN 'incoming'::text
    ELSE 'outgoing'::text
  END                                                                     AS direction,
  em.content,
  COALESCE(em.message_type, 'text'::character varying)::text             AS message_type,
  em.media_url,
  em.media_mimetype                                                       AS media_mime_type,
  em.media_filename,
  em.media_size,
  em.message_id                                                           AS whatsapp_message_id,
  em.created_at                                                           AS whatsapp_timestamp,
  COALESCE(em.status, 'delivered'::character varying)::text              AS status,
  COALESCE(em.from_me, false)                                            AS is_from_me,
  NULL::uuid                                                              AS sender_id,
  NULL::uuid                                                              AS reply_to_message_id,
  CASE
    WHEN em.quoted_message_id IS NOT NULL
    THEN jsonb_build_object('id', em.quoted_message_id)
    ELSE NULL::jsonb
  END                                                                     AS quoted_message,
  COALESCE(em.payload, '{}'::jsonb)                                      AS metadata,
  (em.deleted_at IS NOT NULL)                                            AS is_deleted,
  (em.edited_at  IS NOT NULL)                                            AS is_edited,
  NULL::text                                                              AS reaction,
  NULL::double precision                                                  AS latitude,
  NULL::double precision                                                  AS longitude,
  em.message_id                                                           AS external_id,
  em.caption,
  em.instance_name,
  em.push_name,
  em.remote_jid,
  em.conversation_id,
  em.created_at,
  em.updated_at,
  ( SELECT wc.id
    FROM public.whatsapp_connections wc
    WHERE wc.instance_name = em.instance_name::text
      AND wc.is_active = true
    LIMIT 1)                                                              AS whatsapp_connection_id,
  CASE
    WHEN COALESCE(em.from_me, false) THEN 'agent'::text
    ELSE 'contact'::text
  END                                                                     AS sender,
  em.is_read,
  em.agent_id,                  -- actual column added by Part 2 above
  em.transcription,             -- actual column added by Part 2 above
  em.transcription_status,      -- actual column added by Part 2 above
  em.status_at                                                            AS status_updated_at,
  'whatsapp'::text                                                        AS channel_type,
  NULL::uuid                                                              AS channel_connection_id,
  NULL::text                                                              AS request_id,
  NULL::text                                                              AS error_code,
  NULL::text                                                              AS error_reason,
  NULL::smallint                                                          AS retry_attempt,
  NULL::smallint                                                          AS retry_total
FROM evo.evolution_messages em
WHERE em.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Part 5: INSTEAD OF INSERT on public.messages
-- Translates old-schema inserts (sender, external_id, whatsapp_connection_id)
-- into evo.evolution_messages inserts (from_me, direction, message_id, instance_name).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_messages_view_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo
AS $$
DECLARE
  v_instance_name TEXT;
  v_new_id        UUID;
BEGIN
  -- Resolve instance_name: prefer NEW.instance_name (set by TypeScript rewrite)
  -- then fall back to lookup from whatsapp_connections by whatsapp_connection_id.
  v_instance_name := NEW.instance_name;

  IF v_instance_name IS NULL AND NEW.whatsapp_connection_id IS NOT NULL THEN
    SELECT instance_name INTO v_instance_name
    FROM public.whatsapp_connections
    WHERE id = NEW.whatsapp_connection_id
    LIMIT 1;
  END IF;

  INSERT INTO evo.evolution_messages (
    id, contact_id, instance_name, message_id,
    from_me, direction,
    content, message_type, media_url, status,
    created_at, updated_at,
    is_read, agent_id, status_at,
    transcription, transcription_status,
    remote_jid, push_name
  )
  VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    NEW.contact_id,
    v_instance_name,
    NEW.external_id,
    CASE WHEN NEW.sender = 'agent' THEN true ELSE false END,
    CASE WHEN NEW.sender = 'agent' THEN 'outbound' ELSE 'inbound' END,
    NEW.content,
    NEW.message_type,
    NEW.media_url,
    COALESCE(NEW.status, 'received'),
    COALESCE(NEW.created_at, now()),
    COALESCE(NEW.updated_at, now()),
    COALESCE(NEW.is_read, false),
    NEW.agent_id,
    NEW.status_updated_at,  -- view alias for status_at; value stored in status_at column
    NEW.transcription,
    NEW.transcription_status,
    NEW.remote_jid,
    NEW.push_name
  )
  ON CONFLICT (message_id, instance_name) DO NOTHING
  RETURNING id INTO v_new_id;

  NEW.id := COALESCE(v_new_id, NEW.id);
  RETURN NEW;
END;
$$;

-- Guard: skip if ANY INSTEAD OF INSERT trigger already exists on public.messages.
-- Production may already have 'trg_messages_view_insert' pointing to fn_messages_view_insert_handler.
-- Creating a second INSERT trigger would cause both to fire, resulting in double inserts.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public' AND c.relname = 'messages'
      AND t.tgtype & 64 = 64  -- INSTEAD OF (bit 6)
      AND t.tgtype & 4  = 4   -- INSERT (bit 2)
  ) THEN
    CREATE TRIGGER messages_instead_of_insert_tg
      INSTEAD OF INSERT ON public.messages
      FOR EACH ROW EXECUTE FUNCTION public.fn_messages_view_insert();
    RAISE NOTICE 'Created messages_instead_of_insert_tg on public.messages';
  ELSE
    RAISE NOTICE 'Skipped messages_instead_of_insert_tg: an INSTEAD OF INSERT trigger already exists on public.messages';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Part 6: INSTEAD OF UPDATE on public.messages (bind existing function)
-- ---------------------------------------------------------------------------

-- Guard: skip if ANY INSTEAD OF UPDATE trigger already exists on public.messages.
-- Production may already have 'messages_instead_of_update'.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'messages'
      AND t.tgtype & 64 = 64  -- INSTEAD OF
      AND t.tgtype & 8  = 8   -- UPDATE (bit 3)
  ) THEN
    CREATE TRIGGER messages_instead_of_update_tg
      INSTEAD OF UPDATE ON public.messages
      FOR EACH ROW EXECUTE FUNCTION public.messages_update_trigger();
    RAISE NOTICE 'Created messages_instead_of_update_tg on public.messages';
  ELSE
    RAISE NOTICE 'Skipped messages_instead_of_update_tg: an INSTEAD OF UPDATE trigger already exists on public.messages';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Part 7: INSTEAD OF triggers on public.contacts (bind existing functions)
-- Functions were defined in 20260703_critical_10_steps_fix.sql but no
-- CREATE TRIGGER statements were ever added.
-- Guard uses tgtype bitmask (same as Parts 5+6) so we detect ANY existing
-- INSTEAD OF INSERT/UPDATE/DELETE trigger, not just one with a specific name.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  -- INSERT (tgtype: bit 64 = INSTEAD OF, bit 4 = INSERT)
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contacts'
      AND t.tgtype & 64 = 64 AND t.tgtype & 4 = 4
  ) THEN
    CREATE TRIGGER contacts_instead_of_insert_tg
      INSTEAD OF INSERT ON public.contacts
      FOR EACH ROW EXECUTE FUNCTION public.fn_contacts_view_insert();
    RAISE NOTICE 'Created contacts_instead_of_insert_tg on public.contacts';
  ELSE
    RAISE NOTICE 'Skipped contacts_instead_of_insert_tg: INSTEAD OF INSERT trigger already exists';
  END IF;

  -- UPDATE (bit 8 = UPDATE)
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contacts'
      AND t.tgtype & 64 = 64 AND t.tgtype & 8 = 8
  ) THEN
    CREATE TRIGGER contacts_instead_of_update_tg
      INSTEAD OF UPDATE ON public.contacts
      FOR EACH ROW EXECUTE FUNCTION public.fn_contacts_view_update();
    RAISE NOTICE 'Created contacts_instead_of_update_tg on public.contacts';
  ELSE
    RAISE NOTICE 'Skipped contacts_instead_of_update_tg: INSTEAD OF UPDATE trigger already exists';
  END IF;

  -- DELETE (bit 16 = DELETE)
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contacts'
      AND t.tgtype & 64 = 64 AND t.tgtype & 16 = 16
  ) THEN
    CREATE TRIGGER contacts_instead_of_delete_tg
      INSTEAD OF DELETE ON public.contacts
      FOR EACH ROW EXECUTE FUNCTION public.fn_contacts_view_delete();
    RAISE NOTICE 'Created contacts_instead_of_delete_tg on public.contacts';
  ELSE
    RAISE NOTICE 'Skipped contacts_instead_of_delete_tg: INSTEAD OF DELETE trigger already exists';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Part 7b: Fix fn_contacts_view_insert — replace hardcoded 'wpp_pink_test' fallback
-- The original function used COALESCE(NEW.instance_name, 'wpp_pink_test') which
-- silently routes contacts to a test instance when no instance_name is supplied.
-- Replace with a dynamic lookup of the first connected+active instance.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_contacts_view_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'evo', 'zapp'
AS $function$
DECLARE
  v_new_id  uuid;
  v_instance text;
BEGIN
  -- Resolve instance_name: explicit > from whatsapp_connection_id > first connected+active instance
  v_instance := NULLIF(TRIM(COALESCE(NEW.instance_name, '')), '');

  IF v_instance IS NULL AND NEW.whatsapp_connection_id IS NOT NULL THEN
    SELECT wc.instance_name INTO v_instance
    FROM public.whatsapp_connections wc
    WHERE wc.id = NEW.whatsapp_connection_id
    LIMIT 1;
  END IF;

  IF v_instance IS NULL THEN
    SELECT wc.instance_name INTO v_instance
    FROM public.whatsapp_connections wc
    WHERE wc.is_active = true AND wc.status = 'connected'
    ORDER BY wc.is_default DESC NULLS LAST, wc.created_at ASC
    LIMIT 1;
  END IF;
  -- Hard last-resort: if no connected instance found, NULL is safer than a hardcoded test instance.
  -- The NOT NULL constraint on evo.evolution_contacts.instance_name will surface the issue
  -- rather than silently inserting into the wrong instance.

  INSERT INTO evo.evolution_contacts (
    id, full_name, phone_number, email, profile_picture_url,
    lead_status, assigned_to, company, role_title, notes,
    lead_source, instance_name, remote_jid, push_name, tags, created_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    NEW.name, NEW.phone, NEW.email, NEW.avatar_url,
    COALESCE(NEW.status, 'open'), NEW.assigned_to, NEW.company, NEW.position, NEW.notes,
    NEW.source,
    v_instance,
    COALESCE(NEW.external_id, NEW.remote_jid, NEW.phone || '@s.whatsapp.net'),
    NEW.push_name, NEW.tags,
    COALESCE(NEW.created_at, now())
  ) RETURNING id INTO v_new_id;

  NEW.id := v_new_id;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Part 8: Realtime publication — evo.evolution_messages + evo.evolution_contacts
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='evo' AND tablename='evolution_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE evo.evolution_messages;
    RAISE NOTICE 'Added evo.evolution_messages to supabase_realtime';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='evo' AND tablename='evolution_contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE evo.evolution_contacts;
    RAISE NOTICE 'Added evo.evolution_contacts to supabase_realtime';
  END IF;
END $$;

-- REPLICA IDENTITY FULL required for Realtime DELETE events
ALTER TABLE evo.evolution_messages REPLICA IDENTITY FULL;
ALTER TABLE evo.evolution_contacts REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- Part 9: Remove the now-contradictory unique constraint migration
-- 20260703220000_add_unique_messages_ext_conn.sql added UNIQUE on public.messages
-- as if it were a base table. After converting to a VIEW the constraint is gone,
-- but the migration file left a DROP + ADD that would fail in fresh envs.
-- The correct constraint is now on evo.evolution_messages (Part 3 above).
-- Guard: drop only if it still exists (shouldn't after view conversion).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname='public' AND t.relname='messages'
      AND c.conname='uq_messages_ext_conn'
  ) THEN
    ALTER TABLE public.messages DROP CONSTRAINT uq_messages_ext_conn;
    RAISE NOTICE 'Dropped stale uq_messages_ext_conn from public.messages base table';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Part 10: Patch messages_update_trigger — add missing field mappings
-- The original function (20260703_critical_10_steps_fix.sql) did not map:
--   • status_updated_at → status_at
--   • is_deleted = TRUE  → deleted_at = now()
--   • agent_id, transcription, transcription_status, media_url, message_type
-- Without this patch, deletes through the VIEW left deleted_at = NULL so the
-- message remained visible (WHERE em.deleted_at IS NULL). Status timestamps
-- were also silently discarded.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.messages_update_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, evo
AS $$
BEGIN
  UPDATE evo.evolution_messages
  SET
    is_read               = COALESCE(NEW.is_read,        OLD.is_read),
    status                = CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN NEW.status ELSE status END,
    -- Map VIEW alias status_updated_at → actual column status_at
    status_at             = COALESCE(NEW.status_updated_at, status_at),
    -- Map VIEW-derived boolean is_deleted → actual column deleted_at
    deleted_at            = CASE
                              WHEN NEW.is_deleted = TRUE AND deleted_at IS NULL THEN now()
                              ELSE deleted_at
                            END,
    -- Map VIEW-derived boolean is_edited → actual column edited_at
    edited_at             = CASE
                              WHEN NEW.is_edited = TRUE AND edited_at IS NULL THEN now()
                              ELSE edited_at
                            END,
    is_starred            = COALESCE(NEW.is_starred,     OLD.is_starred),
    is_important          = COALESCE(NEW.is_important,   OLD.is_important),
    follow_up_at          = NEW.follow_up_at,
    follow_up_done        = COALESCE(NEW.follow_up_done, OLD.follow_up_done),
    category              = COALESCE(NEW.category,       OLD.category),
    sentiment             = COALESCE(NEW.sentiment,      OLD.sentiment),
    tags                  = COALESCE(NEW.tags,           OLD.tags),
    notes                 = NEW.notes,
    content               = CASE WHEN NEW.content IS DISTINCT FROM OLD.content THEN NEW.content ELSE content END,
    media_url             = COALESCE(NEW.media_url,      media_url),
    message_type          = COALESCE(NEW.message_type,   message_type),
    agent_id              = COALESCE(NEW.agent_id,       agent_id),
    transcription         = COALESCE(NEW.transcription,  transcription),
    transcription_status  = COALESCE(NEW.transcription_status, transcription_status),
    push_name             = COALESCE(NEW.push_name,      push_name),
    updated_at            = now()
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;

-- Verification
-- NOTE: checks for ANY INSTEAD OF trigger of each event type (not a specific name)
-- so this correctly detects both pre-existing production triggers and those created above.
DO $$
DECLARE
  v_insert_tg boolean;
  v_update_tg boolean;
  v_delete_tg boolean;
  v_contacts_insert boolean;
  v_instance_name boolean;
BEGIN
  -- Detect ANY INSTEAD OF INSERT trigger on public.messages (tgtype bit 4 = INSERT, bit 64 = INSTEAD OF)
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'messages'
      AND t.tgtype & 64 = 64 AND t.tgtype & 4 = 4
  ) INTO v_insert_tg;

  -- Detect ANY INSTEAD OF UPDATE trigger on public.messages (bit 8 = UPDATE)
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'messages'
      AND t.tgtype & 64 = 64 AND t.tgtype & 8 = 8
  ) INTO v_update_tg;

  -- Detect ANY INSTEAD OF DELETE trigger on public.messages (bit 16 = DELETE)
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'messages'
      AND t.tgtype & 64 = 64 AND t.tgtype & 16 = 16
  ) INTO v_delete_tg;

  -- Detect ANY INSTEAD OF INSERT trigger on public.contacts
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contacts'
      AND t.tgtype & 64 = 64 AND t.tgtype & 4 = 4
  ) INTO v_contacts_insert;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='whatsapp_connections' AND column_name='instance_name'
  ) INTO v_instance_name;

  IF v_insert_tg AND v_update_tg AND v_contacts_insert AND v_instance_name THEN
    RAISE NOTICE 'PASS: All critical triggers and columns in place (delete_tg=%)', v_delete_tg;
  ELSE
    RAISE WARNING 'PARTIAL: messages_insert=% messages_update=% messages_delete=% contacts_insert=% instance_name=%',
      v_insert_tg, v_update_tg, v_delete_tg, v_contacts_insert, v_instance_name;
  END IF;
END $$;
