-- MELHORIA #4 — GAP-1: add_contacts_to_campaign RPC (corrected for zapp schema)
--
-- Original migration 20260712140000 targeted public.campaign_contacts (a VIEW).
-- Real table is zapp.campaign_contacts; is_admin_or_supervisor is in zapp schema.
-- PostgREST client uses schema='zapp', so RPC must be in zapp schema.
--
-- Fixes:
--   P0 – auth guard via zapp.is_admin_or_supervisor(auth.uid())
--   P1 – SELECT ... FOR UPDATE on campaigns row to serialise concurrent callers
--   P1 – UNIQUE (campaign_id, contact_id) + ON CONFLICT DO NOTHING

BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE zapp.campaign_contacts IN SHARE ROW EXCLUSIVE MODE;

-- ── 1. Archive full table state before any destructive operation ─────────────
CREATE SCHEMA IF NOT EXISTS _backups;
CREATE TABLE IF NOT EXISTS _backups._backup_campaign_contacts_20260712
  (LIKE zapp.campaign_contacts INCLUDING ALL);
-- Idempotent: skip if backup table already has rows
INSERT INTO _backups._backup_campaign_contacts_20260712
  SELECT * FROM zapp.campaign_contacts
  WHERE NOT EXISTS (
    SELECT 1 FROM _backups._backup_campaign_contacts_20260712
  );

-- ── 2. De-duplicate existing rows ────────────────────────────────────────────
DELETE FROM zapp.campaign_contacts
WHERE ctid NOT IN (
  SELECT min(ctid)
  FROM   zapp.campaign_contacts
  GROUP  BY campaign_id, contact_id
);

-- ── 3. Recount total_contacts — only for campaigns that had duplicate rows ───
UPDATE zapp.campaigns c
SET    total_contacts = (
  SELECT COUNT(*)
  FROM   zapp.campaign_contacts cc
  WHERE  cc.campaign_id = c.id
)
WHERE  c.id IN (
  SELECT campaign_id
  FROM   _backups._backup_campaign_contacts_20260712
  GROUP  BY campaign_id, contact_id
  HAVING COUNT(*) > 1
);

-- ── 4. Add UNIQUE constraint (idempotent) ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conrelid = 'zapp.campaign_contacts'::regclass
      AND  contype  = 'u'
      AND  conname  = 'uq_campaign_contacts_campaign_contact'
  ) THEN
    ALTER TABLE zapp.campaign_contacts
      ADD CONSTRAINT uq_campaign_contacts_campaign_contact
      UNIQUE (campaign_id, contact_id);
  END IF;
END;
$$;

-- ── 5. Create/replace secured, race-free function ────────────────────────────
CREATE OR REPLACE FUNCTION zapp.add_contacts_to_campaign(
  p_campaign_id uuid,
  p_contact_ids uuid[]
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = zapp, pg_catalog
AS $$
BEGIN
  -- P0 guard: only admins and supervisors may add contacts to a campaign
  IF NOT zapp.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied: admin or supervisor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- P1 serialisation: lock the campaigns row so concurrent callers queue up
  PERFORM id FROM zapp.campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign % not found', p_campaign_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- UNIQUE constraint + ON CONFLICT make this idempotent under concurrent calls
  INSERT INTO zapp.campaign_contacts (campaign_id, contact_id, status)
  SELECT p_campaign_id, cid, 'pending'
  FROM   unnest(p_contact_ids) AS cid
  ON CONFLICT (campaign_id, contact_id) DO NOTHING;

  -- Recount after the lock ensures all committed inserts are visible
  UPDATE zapp.campaigns
  SET    total_contacts = (
    SELECT COUNT(*) FROM zapp.campaign_contacts
    WHERE  campaign_id = p_campaign_id
  )
  WHERE  id = p_campaign_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.add_contacts_to_campaign(uuid, uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION zapp.add_contacts_to_campaign(uuid, uuid[]) TO authenticated;
COMMIT;
