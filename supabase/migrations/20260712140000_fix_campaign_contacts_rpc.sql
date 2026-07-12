-- Fix add_contacts_to_campaign: auth guard, unique constraint, serialised recount
--
-- Addresses three findings from cubic security review:
--   P0 – any authenticated user (incl. agents) could call the function; needs
--        is_admin_or_supervisor() check.
--   P1 – NOT EXISTS does not prevent duplicate inserts under concurrent calls;
--        needs UNIQUE (campaign_id, contact_id) + ON CONFLICT DO NOTHING.
--   P1 – total_contacts recount races with concurrent inserts because the
--        campaigns row is not locked before the INSERT; needs SELECT … FOR UPDATE.

-- ── 1. De-duplicate existing rows before adding the constraint ──────────────
--
-- If dupes already exist we remove the older copy (lowest ctid).
DELETE FROM public.campaign_contacts
WHERE ctid NOT IN (
  SELECT min(ctid)
  FROM   public.campaign_contacts
  GROUP  BY campaign_id, contact_id
);

-- ── 2. Add UNIQUE constraint (idempotent via IF NOT EXISTS on the index) ────
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

-- ── 3. Replace function with secured, race-free version ─────────────────────
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
