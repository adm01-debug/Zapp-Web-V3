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
  UPDATE evo.evolution_messages em
  SET full_name    = COALESCE(ec.full_name, ec.push_name),
      phone_number = ec.phone_number,
      updated_at   = now()
  FROM evo.evolution_contacts ec
  WHERE em.remote_jid    = ec.remote_jid
    AND em.instance_name = ec.instance_name
    AND ec.deleted_at IS NULL
    AND (
      em.full_name    IS DISTINCT FROM COALESCE(ec.full_name, ec.push_name)
      OR em.phone_number IS DISTINCT FROM ec.phone_number
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
