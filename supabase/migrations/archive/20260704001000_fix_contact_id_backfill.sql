-- =============================================================================
-- Backfill contact_id on evo.evolution_messages where NULL
-- 2026-07-04
--
-- WHY: When the webhook handler inserts a message it may not have resolved
--      the contact_id yet (race between contact-upsert and message-insert).
--      This migration retroactively links messages → contacts via the
--      shared (remote_jid, instance_name) key pair so UI queries that join
--      on contact_id return historical messages correctly.
-- =============================================================================

DO $$
DECLARE
  v_updated bigint;
BEGIN
  -- Use DISTINCT ON to pick one deterministic contact per (remote_jid, instance_name)
  -- when duplicates exist, preventing messages from being linked to a random contact.
  -- Most-recently-created non-deleted contact wins.
  UPDATE evo.evolution_messages em
  SET contact_id = ec.id,
      updated_at = now()
  FROM (
    SELECT DISTINCT ON (remote_jid, instance_name)
           id, remote_jid, instance_name
    FROM evo.evolution_contacts
    WHERE deleted_at IS NULL
    ORDER BY remote_jid, instance_name, created_at DESC NULLS LAST, id DESC
  ) ec
  WHERE em.contact_id IS NULL
    AND em.remote_jid    IS NOT NULL
    AND em.instance_name IS NOT NULL
    AND ec.remote_jid    = em.remote_jid
    AND ec.instance_name = em.instance_name;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Backfilled contact_id on % evolution_messages rows', v_updated;
END $$;

-- Also populate full_name / phone_number denormalised columns from contacts
-- (handy for the Zapp UI message list which displays sender name inline)
DO $$
DECLARE
  v_updated bigint;
BEGIN
  -- DISTINCT ON prevents non-deterministic selection when a jid maps to multiple contacts;
  -- most-recently-created non-deleted contact wins (same ordering as the contact_id backfill above).
  -- COALESCE on the SET side preserves existing message data when the contact has no value.
  UPDATE evo.evolution_messages em
  SET full_name    = COALESCE(COALESCE(ec.full_name, ec.push_name), em.full_name),
      phone_number = COALESCE(ec.phone_number, em.phone_number),
      updated_at   = now()
  FROM (
    SELECT DISTINCT ON (remote_jid, instance_name)
           remote_jid, instance_name, full_name, push_name, phone_number
    FROM evo.evolution_contacts
    WHERE deleted_at IS NULL
    ORDER BY remote_jid, instance_name, created_at DESC NULLS LAST, id DESC
  ) ec
  WHERE em.remote_jid    = ec.remote_jid
    AND em.instance_name = ec.instance_name
    AND (
      COALESCE(ec.full_name, ec.push_name) IS NOT NULL
        AND COALESCE(ec.full_name, ec.push_name) IS DISTINCT FROM em.full_name
      OR ec.phone_number IS NOT NULL
        AND ec.phone_number IS DISTINCT FROM em.phone_number
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Updated full_name/phone_number on % evolution_messages rows', v_updated;
END $$;

-- Index to make the backfill and future ON CONFLICT lookups fast
CREATE INDEX IF NOT EXISTS idx_evo_messages_contact_id
  ON evo.evolution_messages (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_evo_messages_jid_instance
  ON evo.evolution_messages (remote_jid, instance_name)
  WHERE remote_jid IS NOT NULL AND instance_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_evo_contacts_jid_instance
  ON evo.evolution_contacts (remote_jid, instance_name)
  WHERE remote_jid IS NOT NULL AND instance_name IS NOT NULL;
