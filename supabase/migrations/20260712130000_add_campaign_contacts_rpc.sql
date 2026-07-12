-- RPC: add_contacts_to_campaign
-- Atomically inserts campaign_contacts and recalculates total_contacts in one
-- transaction, replacing the two-step INSERT + UPDATE in useCampaigns.ts that
-- left total_contacts stale on partial failure and was also setting it to the
-- batch size rather than the cumulative total.

CREATE OR REPLACE FUNCTION public.add_contacts_to_campaign(
  p_campaign_id uuid,
  p_contact_ids uuid[]
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- Skip contacts already enrolled to avoid duplicates (no unique constraint exists)
  INSERT INTO public.campaign_contacts (campaign_id, contact_id, status)
  SELECT p_campaign_id, cid, 'pending'
  FROM unnest(p_contact_ids) AS cid
  WHERE NOT EXISTS (
    SELECT 1 FROM public.campaign_contacts cc
    WHERE cc.campaign_id = p_campaign_id AND cc.contact_id = cid
  );

  -- Recount to accurate total (not just batch size)
  UPDATE public.campaigns
  SET total_contacts = (
    SELECT COUNT(*) FROM public.campaign_contacts
    WHERE campaign_id = p_campaign_id
  )
  WHERE id = p_campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_contacts_to_campaign(uuid, uuid[]) TO authenticated;
