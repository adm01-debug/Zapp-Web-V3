-- Migration: Compound index on evolution_contacts (instance_name, phone_number)
--
-- Rationale: the upsertContact() lookup in backfill functions and webhook handlers
-- queries `.eq('instance_name', ...).or('phone_number.eq.X,remote_jid.eq.Y')`.
-- The existing idx_ec_phone_number_active covers (phone_number) alone; adding a
-- compound (instance_name, phone_number) index eliminates the full-instance scan
-- when the planner can't push the instance_name filter into the phone index.
--
-- A corresponding partial unique index prevents duplicate contacts per instance
-- when the same phone registers twice (race condition in concurrent upserts).

-- Compound lookup index: instance_name + phone_number
CREATE INDEX IF NOT EXISTS idx_ec_instance_phone
  ON evo.evolution_contacts (instance_name, phone_number)
  WHERE phone_number IS NOT NULL
    AND deleted_at IS NULL;

-- NOTE: A partial unique on (instance_name, phone_number) was considered but ruled out:
-- the same phone number legitimately appears with both @s.whatsapp.net and @lid remote_jids
-- for the same contact (WhatsApp multi-device / business accounts), so duplicates are expected.

-- Compound lookup index: instance_name + remote_jid (complement to the phone one)
-- The existing remote_jid UNIQUE index covers single-column lookups;
-- this compound one serves multi-tenant scans filtered by instance first.
CREATE INDEX IF NOT EXISTS idx_ec_instance_remote_jid
  ON evo.evolution_contacts (instance_name, remote_jid)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX evo.idx_ec_instance_phone IS
  'Compound index for upsertContact() lookup: instance_name + phone_number';

COMMENT ON INDEX evo.idx_ec_instance_remote_jid IS
  'Compound index for multi-tenant lookups by instance + remote_jid';
