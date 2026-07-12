-- Fix add_contacts_to_campaign: auth guard, unique constraint, serialised recount
--
-- Addresses three findings from cubic security review:
--   P0 – any authenticated user (incl. agents) could call the function; needs
--        is_admin_or_supervisor() check.
--   P1 – NOT EXISTS does not prevent duplicate inserts under concurrent calls;
--        needs UNIQUE (campaign_id, contact_id) + ON CONFLICT DO NOTHING.
--   P1 – total_contacts recount races with concurrent inserts because the
--        campaigns row is not locked before the INSERT; needs SELECT … FOR UPDATE.
--
-- Round-3 cubic fixes:
--   P2 – Hold SHARE ROW EXCLUSIVE lock on campaign_contacts through dedup +
--        ADD CONSTRAINT to prevent concurrent writers recreating a duplicate
--        in the window between DELETE and the constraint going live.
--   P2 – Archive full table state to _backup_campaign_contacts_20260712 before
--        any destructive DELETE so rows can be restored if needed.
--   P1 – total_contacts stays inflated for campaigns that had duplicate rows;
--        recounted for every affected campaign right after the DELETE.

-- ── 1. Lock against concurrent writers ─────────────────────────────────────
-- SHARE ROW EXCLUSIVE blocks concurrent INSERT/UPDATE/DELETE on campaign_contacts
-- but allows reads. Held for the entire migration transaction, so no concurrent
-- writer can slip in a duplicate between the DELETE and ADD CONSTRAINT.
LOCK TABLE public.campaign_contacts IN SHARE ROW EXCLUSIVE MODE;

-- ── 2. Archive full table state before any destructive operation ────────────
-- Creates a point-in-time snapshot. If a rollback is needed post-migration the
-- DBA can restore from this table. IF NOT EXISTS makes the step idempotent on
-- re-runs after a partial failure.
CREATE TABLE IF NOT EXISTS public._backup_campaign_contacts_20260712
  AS SELECT * FROM public.campaign_contacts;

-- ── 3. De-duplicate existing rows ───────────────────────────────────────────
-- Keep the oldest copy (min ctid) of each (campaign_id, contact_id) pair and
-- remove all others. The lock above ensures no new duplicates arrive during this.
DELETE FROM public.campaign_contacts
WHERE ctid NOT IN (
  SELECT min(ctid)
  FROM   public.campaign_contacts
  GROUP  BY campaign_id, contact_id
);

-- ── 4. Recount total_contacts — only for campaigns that had duplicate rows ───
-- Filter to campaigns where at least one (campaign_id, contact_id) pair
-- appeared more than once in the backup. This prevents touching updated_at on
-- campaigns whose data was already clean (no duplicates existed for them).
UPDATE public.campaigns c
SET    total_contacts = (
  SELECT COUNT(*)
  FROM   public.campaign_contacts cc
  WHERE  cc.campaign_id = c.id
)
WHERE  c.id IN (
  SELECT campaign_id
  FROM   public._backup_campaign_contacts_20260712
  GROUP  BY campaign_id, contact_id
  HAVING COUNT(*) > 1
);

-- ── 5. Add UNIQUE constraint (idempotent) ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.campaign_contacts'::regclass
      AND contype   = 'u'
      AND conname   = 'uq_campaign_contacts_campaign_contact'
  ) THEN
    ALTER TABLE public.campaign_contacts
      ADD CONSTRAINT uq_campaign_contacts_campaign_contact
      UNIQUE (campaign_id, contact_id);
  END IF;
END;
$$;

-- ── 6. Replace function with secured, race-free version ─────────────────────
CREATE OR REPLACE FUNCTION public.add_contacts_to_campaign(
  p_campaign_id uuid,
  p_contact_ids uuid[]
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- P0 guard: only admins and supervisors may add contacts to a campaign.
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied: admin or supervisor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- P1 serialisation: lock the campaigns row so concurrent callers queue up
  -- instead of racing on the recount at the end.
  PERFORM id FROM public.campaigns WHERE id = p_campaign_id FOR UPDATE;

  -- Insert; UNIQUE constraint + ON CONFLICT make this idempotent and safe under
  -- concurrent calls — no more phantom duplicates.
  INSERT INTO public.campaign_contacts (campaign_id, contact_id, status)
  SELECT p_campaign_id, cid, 'pending'
  FROM   unnest(p_contact_ids) AS cid
  ON CONFLICT (campaign_id, contact_id) DO NOTHING;

  -- Recount after the lock ensures we see all inserts committed by others that
  -- queued before us, giving an accurate total.
  UPDATE public.campaigns
  SET    total_contacts = (
    SELECT COUNT(*) FROM public.campaign_contacts
    WHERE  campaign_id = p_campaign_id
  )
  WHERE  id = p_campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_contacts_to_campaign(uuid, uuid[]) TO authenticated;
