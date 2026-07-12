CREATE OR REPLACE FUNCTION public.rpc_get_contacts(
  p_remote_jids text[],
  p_instance_name text
)
RETURNS TABLE (
  remote_jid text,
  tags text[],
  company text,
  ai_sentiment text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ec.remote_jid, ec.tags, ec.company, ec.ai_sentiment
  FROM public.evolution_contacts ec
  WHERE ec.remote_jid = ANY(p_remote_jids)
    AND ec.instance_name = p_instance_name
    AND ec.deleted_at IS NULL;
END;
$$;